/** Fresh normal physical validation, complete source-index parity and actual
 * route parity. Emits an INERT candidate receipt; never edits app allowlists. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import {
  createImmutableRoutingSession,
  routingCalculationValue,
  routingSnapshot,
} from "../../app/indoor-project/routing-cache";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { nativeCirculationExactIndex } from "../../app/indoor-project/native-circulation";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material";
import {
  type PublishedRoutingHydration,
  materialWire,
  hydratePublishedTopology,
  hydratePublishedMaterials,
  hydratePublishedAccessZones,
} from "../../app/indoor-project/published-routing-hydration";
import {
  collectFreshCandidateRoutingCache,
  writeFreshCandidateRoutingCache,
} from "./candidate-routing-cache";
import {
  writePublishedRouteRuntimeBinding,
  publishedRouteRuntimeBinding,
} from "./published-route-runtime-binding";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { PUBLISHED_ROUTE_RUNTIME_SHA256 } from "../../app/indoor-project/published-route-runtime-binding";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { assertExactRoutingIndexParity } from "./exact-routing-index-proof";
import { preparedRoutingKey } from "../../app/indoor-project/prepared-routing";
import { producePublishedSupportTiles } from "./published-support-tile-producer";
import { nativeRoutingAccessZoneBinding } from "../../app/indoor-project/native-routing-access-zones";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "../../app/indoor-project/native-rational-overlay";
import { parseVerifiedRoutingDataset } from "../../app/indoor-project/verified-routing-dataset";
import { progressiveRouteSummary } from "../../app/indoor-project/progressive-route-summary";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import { projectPlaceDisplayName } from "../../app/indoor-project/visitor-metadata";
import { checkRouteResult, type RouteCase } from "./pathway-candidate-audit";
const [input, expected, output, ...optional] = process.argv.slice(2);
if (
  !input ||
  !/^[a-f0-9]{64}$/.test(expected ?? "") ||
  !output ||
  !(
    optional.length === 0 ||
    (optional.length === 2 &&
      optional[0] === "--cases" &&
      optional[1] &&
      !optional[1].startsWith("--"))
  )
)
  throw new Error(
    "Usage: export-published-route-hydration.ts COMPLETE.json EXPECTED-SHA256 EMPTY-OUTPUT-DIRECTORY [--cases EXTRA-ROUTE-CASES.json]",
  );
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.resolve(output);
await fs.mkdir(out, { recursive: true });
assert.equal((await fs.readdir(out)).length, 0);
const sha = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");
const extraCasesPath =
  optional.length > 0 ? path.resolve(optional[1]!) : undefined;
let extraCasesBytes: Buffer | undefined;
let extraCases: RouteCase[] = [];
if (extraCasesPath) {
  const stat = await fs.stat(extraCasesPath);
  assert(
    stat.isFile() && stat.size > 0 && stat.size <= 1024 * 1024,
    "Extra route cases must be a bounded nonempty JSON file",
  );
  extraCasesBytes = await fs.readFile(extraCasesPath);
  assert(
    extraCasesBytes.length > 0 && extraCasesBytes.length <= 1024 * 1024,
    "Actual extra route case bytes exceed their JSON parse bound",
  );
  extraCases = JSON.parse(extraCasesBytes.toString()) as RouteCase[];
  assert(
    Array.isArray(extraCases) &&
      extraCases.length > 0 &&
      extraCases.length <= 128,
  );
  for (const c of extraCases) {
    assert(c && typeof c === "object" && !Array.isArray(c));
    assert(
      Object.keys(c).every((key) =>
        [
          "name",
          "start",
          "end",
          "mode",
          "expect",
          "intendedEdgeId",
          "forbiddenEdgeIds",
        ].includes(key),
      ),
      "Unknown extra route-case field",
    );
    for (const key of ["name", "start", "end"] as const)
      assert(
        typeof c[key] === "string" &&
          c[key].length > 0 &&
          c[key].length <= 2000,
      );
    assert(c.mode === "public" || c.mode === "accessible");
    assert(
      c.expect === undefined || c.expect === "route" || c.expect === "blocked",
    );
    if (c.intendedEdgeId !== undefined) {
      assert(
        typeof c.intendedEdgeId === "string" && c.intendedEdgeId.length > 0,
      );
      assert.equal(
        c.expect,
        "route",
        "An intended positive edge must require an actual route",
      );
    }
    if (c.forbiddenEdgeIds !== undefined)
      assert(
        Array.isArray(c.forbiddenEdgeIds) &&
          c.forbiddenEdgeIds.every(
            (id) => typeof id === "string" && id.length > 0,
          ) &&
          new Set(c.forbiddenEdgeIds).size === c.forbiddenEdgeIds.length,
      );
  }
}
const binding = writePublishedRouteRuntimeBinding(root);
assert.equal(
  binding.sha256,
  PUBLISHED_ROUTE_RUNTIME_SHA256,
  "Regenerate runtime literal before loading this publisher",
);
assert.equal(
  preparedDisplayEngineBinding(root).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
);
const began = performance.now(),
  log: unknown[] = [];
const phase = (name: string, value?: unknown) => {
  const entry = { name, seconds: (performance.now() - began) / 1000, value };
  log.push(entry);
  console.log(JSON.stringify(entry));
};
const originalBytes = new Uint8Array(await fs.readFile(input));
assert.equal(sha(originalBytes), expected);
const { before, data } = (() => {
  const sourceProjection = routeWorkerDataset(
      JSON.parse(new TextDecoder().decode(originalBytes)) as IndoorDataset,
    ),
    projectedBytes = new TextEncoder().encode(JSON.stringify(sourceProjection)),
    before = sha(projectedBytes);
  return { before, data: parseVerifiedRoutingDataset(projectedBytes, before) };
})();
await initializeNativeExactGeosOverlay();
phase("loaded", { datasetSha256: before });
const run = createImmutableRoutingSession(data),
  calculate = createWorkerRouteCalculator(data);
run(() => {
  validateIndoorDataset(data);
});
phase("normal-validation");
const value = run(() => collectFreshCandidateRoutingCache(data));
phase("complete-normal-physical-graphs-and-supported-cells");
const originalIndex = run(() => nativeCirculationExactIndex(data))!;
const restoredIndex = hydratePublishedTopology(
  data.circulationGeometry!.exactTopology!,
);
assertExactRoutingIndexParity(originalIndex, restoredIndex);
phase("all-original-exact-faces-parity", originalIndex.ids().length);
const hydration: PublishedRoutingHydration = run(() => {
  const query = routingCalculationValue(
    data,
    "native-route-material-query",
    () => createNativeRoutingMaterialQuery(data),
  );
  const heights = [...new Set(data.nodes.map((n) => n.pointFeet[2]))].sort(
    (a, b) => a - b,
  );
  return {
    version: 1 as const,
    runtimeSha256: binding.sha256,
    policySnapshot: routingSnapshot(data),
    preparedRoutingKey: preparedRoutingKey(data),
    materials: heights.map((z) => ({
      z,
      cut: z + 0.1,
      value: materialWire(query(z)),
    })),
  };
});
const hydratedQuery = hydratePublishedMaterials(data, hydration.materials);
run(() => {
  const query = routingCalculationValue(
    data,
    "native-route-material-query",
    () => createNativeRoutingMaterialQuery(data),
  );
  for (const row of hydration.materials)
    assert.deepEqual(
      materialWire(hydratedQuery(row.z, row.cut)),
      materialWire(query(row.z, row.cut)),
    );
});
value.hydration = hydration;
phase("all-native-level-material-cuts-parity", hydration.materials.length);
const cases = [
  ["main-forward", "05-136", "05-173", "public"],
  ["main-reverse", "05-173", "05-136", "public"],
  ["floor1", "09-218", "09-260", "public"],
  ["floor3", "10-3564", "10-3588", "public"],
  ["unavailable", "08-264", "10-2006", "public"],
  ["lift-up", "05-143", "05-242", "public"],
  ["lift-down", "05-242", "05-143", "public"],
  ["ramp-forward", "07-180", "08-S101", "public"],
  ["ramp-reverse", "08-S101", "07-180", "public"],
  ["stepfree-refusal", "07-180", "08-S101", "accessible"],
] as const;
const baseCases: RouteCase[] = cases.map(
  ([name, startNumber, endNumber, mode]) => {
    const resolve = (number: string) => {
      const matches = data.records.filter((r) => r.number === number);
      assert.equal(matches.length, 1, number);
      return matches[0].key;
    };
    return { name, start: resolve(startNumber), end: resolve(endNumber), mode };
  },
);
const resolved = [...baseCases, ...extraCases];
assert.equal(
  new Set(resolved.map((c) => c.name)).size,
  resolved.length,
  "Route case names must be unique, including the unchanged base ten",
);
assert.equal(resolved[0]!.name, "main-forward", "Cold Main must remain first");
for (const c of extraCases) {
  for (const key of [c.start, c.end])
    assert.equal(
      data.records.filter((r) => r.key === key).length,
      1,
      `Extra route case has a missing or duplicate original place: ${c.name}`,
    );
  for (const id of [c.intendedEdgeId, ...(c.forbiddenEdgeIds ?? [])].filter(
    (id): id is string => id !== undefined,
  ))
    assert.equal(
      data.edges.filter((e) => e.id === id).length,
      1,
      `Extra route case has a missing or duplicate intended/forbidden edge: ${c.name}`,
    );
}
const originals = resolved.map((c) => {
  const began = performance.now();
  const result = run(() => calculate(c.start, c.end, c.mode));
  if (extraCases.includes(c))
    assert.deepEqual(
      run(() => checkRouteResult(data, c, result)).errors,
      [],
      `Explicit normal route expectation failed: ${c.name}`,
    );
  phase("normal-route", {
    name: c.name,
    seconds: (performance.now() - began) / 1000,
    available: !!result.route,
  });
  return result;
});
const normalProgressive = resolved.map((c, i) => {
  const value = originals[i],
    name = (key: string) => {
      const room = data.records.find((entry) => entry.key === key);
      return room
        ? [room.number, projectPlaceDisplayName(data, room)]
            .filter(Boolean)
            .join(" · ")
        : key;
    };
  return {
    summary: progressiveRouteSummary(data, value.route, c.start, c.end),
    steps: value.route
      ? projectNavigationSteps(data, value.route, name(c.start), name(c.end))
      : [],
  };
});
const resolvedGeometry = run(() =>
  routingCalculationValue<string>(data, "resolved-route-geometry", () => {
    throw new Error(
      "Normal routes did not produce their original geometry binding",
    );
  }),
);
if (/^native-circulation-sha256-v1:[a-f0-9]{64}$/.test(resolvedGeometry))
  hydration.resolvedRouteGeometryKey = resolvedGeometry;
phase("normal-derived-source-checksums", {
  preparedRoutingKey: hydration.preparedRoutingKey,
  resolvedRouteGeometryKey: hydration.resolvedRouteGeometryKey,
});
const accessZones = run(() => nativeRoutingAccessZoneBinding(data));
hydration.accessZones = {
  zoneIds: accessZones.zones.map((v) => v.zone.id),
  issues: accessZones.issues,
  topology: encodeNativeExactTopology(
    {
      sourceModelSha256: data.source.modelSha256,
      sourceGeometryKey: before,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    accessZones.zones.map((v) => ({ id: v.zone.id, parts: v.parts })),
  ),
};
const restoredZones = hydratePublishedAccessZones(data, hydration.accessZones, {
  sourceModelSha256: data.source.modelSha256,
  sourceGeometryKey: before,
  kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
});
assert.deepEqual(restoredZones.issues, accessZones.issues);
const zonePartsWire = (
  value: import("../../app/indoor-project/native-rational-overlay").NativeRationalParts,
) =>
  value.map((p) =>
    p.map((r) =>
      r.map(([x, y]) => [
        [String(x.n), String(x.d)],
        [String(y.n), String(y.d)],
      ]),
    ),
  );
assert.deepEqual(
  restoredZones.zones.map(({ zone, parts }) => ({
    zone,
    parts: zonePartsWire(parts),
  })),
  accessZones.zones.map(({ zone, parts }) => ({
    zone,
    parts: zonePartsWire(parts),
  })),
);
phase("normal-access-zone-geometry", {
  accepted: accessZones.zones.length,
  issues: accessZones.issues.length,
});
hydration.supportTiles = run(() =>
  producePublishedSupportTiles(
    hydratePublishedTopology(value.topology),
    data.circulationGeometry!.cells.flatMap((cell) => {
      const parts = routingCalculationValue<
        | import("../../app/indoor-project/native-rational-overlay").NativeRationalParts
        | undefined
      >(data, `native-exact-supported-cell:${cell.id}`, () => {
        // eslint-disable-next-line unicorn/no-useless-undefined
        return undefined;
      });
      return parts === undefined
        ? []
        : [{ id: cell.id, z: cell.elevationFeet, parts }];
    }),
    (completed, total) => {
      if (completed % 100 === 0 || completed === total)
        phase("support-tile-geometry", { completed, total });
    },
  ),
);
phase("all-source-cell-support-tiles-parity", {
  parents: hydration.supportTiles.parents.length,
  nonempty: hydration.supportTiles.topology.faces.length,
  empty: hydration.supportTiles.empty.length,
  coordinates: hydration.supportTiles.topology.coordinates.length,
});
assert.equal(
  sha(JSON.stringify(data)),
  before,
  "Fresh publisher mutated source",
);
const written = await writeFreshCandidateRoutingCache(value, out);
written.receipt.runtimeSha256 = binding.sha256;
await fs.writeFile(
  path.join(out, "receipt.json"),
  JSON.stringify(written.receipt, null, 2),
);
assert.equal(sha(JSON.stringify(data)), before);
assert.equal(
  publishedRouteRuntimeBinding(root).sha256,
  binding.sha256,
  "Runtime changed during fresh publisher",
);
assert.equal(sha(new Uint8Array(await fs.readFile(input))), expected);
if (extraCasesPath)
  assert.equal(
    sha(await fs.readFile(extraCasesPath)),
    sha(extraCasesBytes!),
    "Explicit route cases changed during fresh normal validation",
  );
await fs.writeFile(
  path.join(out, "route-cases.json"),
  JSON.stringify(resolved, null, 2),
);
await fs.writeFile(
  path.join(out, "normal-route-results.json"),
  JSON.stringify(originals, (_, item) =>
    item instanceof Set ? [...item] : item,
  ),
);
await fs.writeFile(
  path.join(out, "normal-progressive-route-results.json"),
  JSON.stringify(normalProgressive),
);
await fs.writeFile(
  path.join(out, "runtime-closure.json"),
  JSON.stringify(binding, null, 2),
);
await fs.writeFile(
  path.join(out, "proof.json"),
  JSON.stringify(
    {
      format: "fresh-published-routing-hydration-proof-v1",
      passed: true,
      inputSha256: expected,
      datasetSha256: before,
      runtimeSha256: binding.sha256,
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      receipt: written.receipt,
      sourceDatasetUnchanged: true,
      normalPhysicalValidationRepeated: true,
      originalFacesChecked: originalIndex.ids().length,
      materialCutsChecked: hydration.materials.length,
      freshNormalRouteCases: resolved.length,
      ...(extraCasesPath
        ? {
            extraRouteCases: {
              path: extraCasesPath,
              bytes: extraCasesBytes!.length,
              sha256: sha(extraCasesBytes!),
              count: extraCases.length,
            },
          }
        : {}),
      routeCasesSha256: sha(
        await fs.readFile(path.join(out, "route-cases.json")),
      ),
      normalRouteResultsSha256: sha(
        await fs.readFile(path.join(out, "normal-route-results.json")),
      ),
      normalProgressiveRouteResultsSha256: sha(
        await fs.readFile(
          path.join(out, "normal-progressive-route-results.json"),
        ),
      ),
      actualRouteParityCases: 0,
      compiledTrustRootChanged: false,
      published: false,
      phases: log,
    },
    null,
    2,
  ),
);
phase("passed-inert-candidate");
