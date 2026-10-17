/** Complete-floor graph coverage plus real calculator journeys. Reuses only an
 * exactly pinned, previously browser-imported input; all physical route/policy
 * graphs are computed fresh. No source geometry or permissions are edited. */
import {
  readFile,
  writeFile,
  mkdir,
  appendFile,
  readdir,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { unzipSync, strFromU8, gzipSync } from "fflate";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import {
  projectRoutingGraph,
  isProjectDestination,
  type ProjectRoutingGraph,
} from "../../app/indoor-project/routing-graph";
import { hallwayRouteEndpoints } from "../../app/indoor-project/route-endpoints";
import { createIndoorExclusionQuery } from "../../app/indoor-project/indoor-exclusions";
import { createNativeFloorHoleQuery } from "../../app/indoor-project/walking-support";
import { validatePreparedRouting } from "../../app/indoor-project/prepared-routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";

const [input, proofFile, floorName, output, caseIdsFile] =
  process.argv.slice(2);
if (!input || !proofFile || !floorName || !output)
  throw new Error(
    "Usage: audit-floor-and-multifloor.ts EXACT.zip BROWSER-PROOF.json FLOOR_NAME EMPTY_OUTPUT_DIRECTORY [CASE_IDS.json]",
  );
const existing = await readdir(output).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== "ENOENT") throw error;
  return [];
});
if (existing.length > 0)
  throw new Error(
    "Use an empty audit output directory; existing evidence will not be appended or replaced",
  );
await mkdir(output, { recursive: true });
const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const bytes = await readFile(input),
  proof = JSON.parse(await readFile(proofFile, "utf8"));
assert.equal(proof.status, "passed");
assert.equal(
  sha(bytes),
  proof.archiveSha256,
  "Input must match the previously completely imported browser-tested candidate",
);
assert.equal(
  PREPARED_DISPLAY_ENGINE_SHA256,
  proof.engineSha256,
  "Changed preparation dependencies require fresh import acceptance",
);
const root = path.resolve(import.meta.dirname, "../..");
const productionScope = [
  "app/indoor-project",
  "app/pages/indoor-project-page.tsx",
  "package-lock.json",
  "package.json",
  "scripts/indoor/prepared-display-engine-binding.ts",
];
assert.equal(
  execFileSync("git", ["diff", proof.appCommit, "--", ...productionScope], {
    cwd: root,
    encoding: "utf8",
  }),
  "",
  "Changed runtime inputs/code require fresh import acceptance",
);
assert.equal(
  execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "app/indoor-project"],
    { cwd: root, encoding: "utf8" },
  ),
  "",
);
const files = unzipSync(bytes),
  manifest = JSON.parse(strFromU8(files["manifest.json"]));
for (const descriptor of [
  manifest.indoor,
  manifest.floors,
  manifest.georeference,
]) {
  const member = files[descriptor.path];
  assert.equal(member.length, descriptor.bytes);
  assert.equal(sha(member), descriptor.sha256);
}
const data = JSON.parse(
  strFromU8(files[manifest.indoor.path]),
) as IndoorDataset;
assert.equal(data.source.modelSha256, manifest.model.sha256);
validatePreparedRouting(data);
const sourceBefore = sha(JSON.stringify(data));
const floor = data.floors.find(
  (f) => f.name === floorName || f.id === floorName,
);
assert.ok(floor);
const places = data.records.filter(
  (r) => floor.levelIds.includes(r.levelId) && isProjectDestination(r),
);
assert.ok(places.length > 1);
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const edges = new Map(data.edges.map((e) => [e.id, e]));
const records = new Map(data.records.map((r) => [r.key, r]));
const run = createImmutableRoutingSession(data);
await initializeNativeExactGeosOverlay();
const calculate = createWorkerRouteCalculator(data);
const outside = run(() => createIndoorExclusionQuery(data));
const holes = run(() => createNativeFloorHoleQuery(data));
const nodeIndex = new Map(data.nodes.map((n, i) => [n.id, i]));
const floorNode = data.nodes.map((n) => floor.levelIds.includes(n.levelId));
type Mode = "public" | "accessible";
const graphs = new Map<Mode, ProjectRoutingGraph>();
const endpointCache = new Map<
  string,
  ReturnType<typeof hallwayRouteEndpoints>
>();
const endpoints = (mode: Mode, r: IndoorRecord, start: boolean) => {
  const key = JSON.stringify([mode, r.key, start]);
  let value = endpointCache.get(key);
  if (!value) {
    const arrival = r.arrivalNodeId && nodes.get(r.arrivalNodeId);
    value =
      !arrival || run(() => outside([arrival.pointFeet]).length)
        ? []
        : run(() => hallwayRouteEndpoints(data, graphs.get(mode)!, r, start));
    endpointCache.set(key, value);
  }
  return value;
};
const progressFile = path.join(output, "progress.json");
const stage = async (value: unknown) => {
  console.log(JSON.stringify(value));
  await writeFile(progressFile, JSON.stringify(value, null, 2));
};
await stage({
  stage: "fresh-policy-graph",
  floor: floor.name,
  places: places.length,
  inputImportReused: true,
});
const started = performance.now();
for (const mode of ["public", "accessible"] as const)
  graphs.set(
    mode,
    run(() => projectRoutingGraph(data, mode)),
  );
await stage({
  stage: "policy-graphs-ready",
  seconds: (performance.now() - started) / 1000,
});
const held = data.edges.filter((e) => e.kind === "stairs" && !e.enabled);
const heldPolicy = held.map((edge) => ({
  edgeId: edge.id,
  nativeElementId: edge.nativeElementId,
  directions: (["public", "accessible"] as const).flatMap((mode) =>
    [edge.from, edge.to].map((from) => {
      const graph = graphs.get(mode)!;
      assert.ok(
        !(graph.adjacency.get(from) ?? []).some((l) => l.edge.id === edge.id),
        "Held staircase leaked into routing",
      );
      return {
        mode,
        from,
        blockers: (graph.allAdjacency.get(from) ?? []).find(
          (l) => l.edge.id === edge.id,
        )?.blockers,
      };
    }),
  ),
}));
const adjacency = (
  graph: ProjectRoutingGraph,
  floorOnly: boolean,
  hallOnly: boolean,
) =>
  data.nodes.map((n, i) =>
    !floorOnly || floorNode[i]
      ? (graph.adjacency.get(n.id) ?? [])
          .filter(
            (l) =>
              (!hallOnly || l.requiredRooms.length === 0) &&
              (!floorOnly || floorNode[nodeIndex.get(l.to)!]),
          )
          .map((l) => nodeIndex.get(l.to)!)
      : [],
  );
const reach = (
  adj: number[][],
  roots: ReturnType<typeof hallwayRouteEndpoints>,
) => {
  const seen = new Uint8Array(data.nodes.length),
    queue: number[] = [];
  for (const r of roots) {
    const i = nodeIndex.get(r.nodeId)!;
    if (!seen[i]) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++)
    for (const j of adj[queue[head]])
      if (!seen[j]) {
        seen[j] = 1;
        queue.push(j);
      }
  return seen;
};
const reaches = (
  seen: Uint8Array,
  ends: ReturnType<typeof hallwayRouteEndpoints>,
) => ends.some((e) => seen[nodeIndex.get(e.nodeId)!]);
const matrices = new Map<Mode, Uint8Array>();
const fullMatrices = new Map<Mode, Uint8Array>();
const profiles = [];
for (const mode of ["public", "accessible"] as const) {
  const graph = graphs.get(mode)!,
    induced = adjacency(graph, true, false),
    full = adjacency(graph, false, false),
    halls = adjacency(graph, true, true);
  const rowBytes = Math.ceil(places.length / 8),
    matrix = new Uint8Array(rowBytes * places.length),
    fullMatrix = new Uint8Array(matrix.length);
  const rows = [];
  let withinFloor = 0,
    campus = 0,
    hallOnly = 0;
  for (let i = 0; i < places.length; i++) {
    const roots = endpoints(mode, places[i], true),
      seen = reach(induced, roots),
      all = reach(full, roots),
      hall = reach(halls, roots);
    let count = 0,
      fullCount = 0,
      hallCount = 0;
    for (let j = 0; j < places.length; j++)
      if (i !== j) {
        const ends = endpoints(mode, places[j], false);
        if (reaches(seen, ends)) {
          matrix[i * rowBytes + (j >> 3)] |= 1 << (j & 7);
          count++;
        }
        if (reaches(all, ends)) {
          fullMatrix[i * rowBytes + (j >> 3)] |= 1 << (j & 7);
          fullCount++;
        }
        if (reaches(hall, ends)) hallCount++;
      }
    withinFloor += count;
    campus += fullCount;
    hallOnly += hallCount;
    rows.push({
      key: places[i].key,
      number: places[i].number,
      building: places[i].building,
      arrival: !!places[i].arrivalNodeId,
      departureChoices: roots.length,
      arrivalChoices: endpoints(mode, places[i], false).length,
      withinFloor: count,
      viaCampus: fullCount,
      hallwayOnly: hallCount,
    });
  }
  const compressed = gzipSync(matrix, { level: 9, mtime: 0 }),
    name = `floor-${mode}.bits.gz`;
  await writeFile(path.join(output, name), compressed);
  profiles.push({
    mode,
    orderedPairs: places.length * (places.length - 1),
    withinFloorReachable: withinFloor,
    fullCampusReachable: campus,
    hallwayOnlyWithinFloorReachable: hallOnly,
    unreachableWithinFloor: places.length * (places.length - 1) - withinFloor,
    rowBytes,
    matrix: { file: name, bytes: compressed.length, sha256: sha(compressed) },
    rows,
  });
  matrices.set(mode, matrix);
  fullMatrices.set(mode, fullMatrix);
}
await writeFile(
  path.join(output, "floor-matrix.json"),
  JSON.stringify(
    {
      kind: "graph-connectivity-not-every-pair-path-refinement",
      floor,
      places: places.map(({ key, number, name, building, levelId }) => ({
        key,
        number,
        name,
        building,
        levelId,
      })),
      profiles,
      heldPolicy,
    },
    null,
    2,
  ),
);
await stage({
  stage: "floor-matrix-complete",
  profiles: profiles.map(({ rows: _, ...p }) => p),
});
type Case = {
  id: string;
  start: string;
  end: string;
  mode: Mode;
  tags: string[];
  targetEdgeId?: string;
};
const cases: Case[] = [],
  caseKeys = new Map<string, Case>();
const add = (
  start: string,
  end: string,
  mode: Mode,
  tag: string,
  targetEdgeId?: string,
) => {
  if (start === end) return;
  const key = JSON.stringify([start, end, mode]);
  const existing = caseKeys.get(key);
  if (existing) {
    if (!existing.tags.includes(tag)) existing.tags.push(tag);
    return;
  }
  const item = {
    id: `case-${cases.length + 1}`,
    start,
    end,
    mode,
    tags: [tag],
    targetEdgeId,
  };
  cases.push(item);
  caseKeys.set(key, item);
};
const connected = (mode: Mode, i: number, j: number) =>
  !!(
    matrices.get(mode)![i * Math.ceil(places.length / 8) + (j >> 3)] &
    (1 << (j & 7))
  );
const fallback =
  places.find((r) => r.number === "05-411") ??
  places.find((r) => r.arrivalNodeId)!;
for (const mode of ["public", "accessible"] as const)
  for (let i = 0; i < places.length; i++) {
    const p = nodes.get(places[i].arrivalNodeId ?? "")?.pointFeet;
    const peers = places
      .map((r, j) => ({
        r,
        j,
        d:
          p && r.arrivalNodeId
            ? Math.hypot(
                nodes.get(r.arrivalNodeId)!.pointFeet[0] - p[0],
                nodes.get(r.arrivalNodeId)!.pointFeet[1] - p[1],
              )
            : -1,
      }))
      .filter(({ j }) => j !== i && connected(mode, i, j))
      .sort((a, b) => a.d - b.d || a.r.key.localeCompare(b.r.key));
    const end = peers[0]?.r ?? fallback;
    if (places[i].key === end.key) continue;
    add(places[i].key, end.key, mode, "every-floor-origin");
    add(end.key, places[i].key, mode, "every-floor-destination");
  }
// Exercise long backbones once per mutually connected section, instead of
// recomputing the same diameter from every doorway. Every place still occurs
// as both a real calculator origin and destination in the nearby checks above.
const remaining = new Set(places.map((_p, i) => i));
while (remaining.size > 0) {
  const first = remaining.values().next().value!;
  const group = [...remaining].filter(
    (i) =>
      i === first ||
      (connected("public", first, i) && connected("public", i, first)),
  );
  group.forEach((i) => remaining.delete(i));
  let diameter: { a: number; b: number; distance: number } | undefined;
  for (const a of group)
    for (const b of group) {
      if (a === b || !connected("public", a, b)) continue;
      const p = nodes.get(places[a].arrivalNodeId ?? "")?.pointFeet,
        q = nodes.get(places[b].arrivalNodeId ?? "")?.pointFeet;
      if (!p || !q) continue;
      const distance = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!diameter || distance > diameter.distance)
        diameter = { a, b, distance };
    }
  if (diameter) {
    for (const [a, b] of [
      [diameter.a, diameter.b],
      [diameter.b, diameter.a],
    ])
      add(places[a].key, places[b].key, "public", "section-diameter");
  }
}
// All served floor-pair connections and held stairs are exercised with normal
// owner-to-owner queries. An alternative connector is explicitly recorded.
for (const edge of data.edges.filter((e) =>
  ["elevator", "ramp", "local-steps", "stairs"].includes(e.kind),
)) {
  const [a, b] = edge.roomKeys;
  if (
    !a ||
    !b ||
    !records.has(a) ||
    !records.has(b) ||
    !isProjectDestination(records.get(a)!) ||
    !isProjectDestination(records.get(b)!)
  )
    continue;
  for (const mode of ["public", "accessible"] as const)
    for (const [from, to] of [
      [a, b],
      [b, a],
    ])
      add(
        from,
        to,
        mode,
        edge.enabled ? `connector:${edge.kind}` : "held-stair-alternative",
        edge.id,
      );
}
const room = (n: string) =>
  data.records.find(
    (r) => r.number === n && r.arrivalNodeId && isProjectDestination(r),
  );
for (const [a, b, tag] of [
  ["05-411", "05-143", "four-to-one"],
  ["05-411", "05-341", "four-to-three"],
  ["05-143", "05-242", "library-lift"],
  ["05-S101", "05-S201", "stair-request"],
  ["08-S101", "08-S201", "stair-request"],
]) {
  const start = room(a),
    end = room(b);
  if (!start || !end) continue;
  for (const mode of ["public", "accessible"] as const)
    for (const [from, to] of [
      [start, end],
      [end, start],
    ])
      add(from.key, to.key, mode, tag);
}
cases.sort(
  (a, b) =>
    Number(a.tags.every((t) => t.startsWith("every-floor"))) -
    Number(b.tags.every((t) => t.startsWith("every-floor"))),
);
const requestedIds: string[] | undefined = caseIdsFile
  ? JSON.parse(await readFile(caseIdsFile, "utf8"))
  : undefined;
if (requestedIds)
  assert.ok(
    Array.isArray(requestedIds) &&
      requestedIds.length > 0 &&
      requestedIds.every((id) => cases.some((c) => c.id === id)),
    "Replay IDs must name cases in the unchanged complete plan",
  );
const selectedCases = requestedIds
  ? cases.filter((c) => requestedIds.includes(c.id))
  : cases;
await writeFile(
  path.join(output, "cases.json"),
  JSON.stringify(selectedCases, null, 2),
);
await stage({
  stage: "actual-calculations",
  cases: selectedCases.length,
  completed: 0,
});
const results: (Case & { available?: boolean; error?: string } & Record<
    string,
    unknown
  >)[] = [];
const invariantFailures: { id: string; message: string }[] = [];
const examples: Record<string, unknown> = {};
let longestFloor = -1;
const heldIds = new Set(held.map((e) => e.id));
// Display clipping can reconstruct the same endpoint with a few Float64 ulps
// of roundoff. Source edge and vertical geometry checks below remain exact.
const sameDisplayedPoint = (
  actual: number[] | undefined,
  expected: number[] | undefined,
) => {
  assert.ok(actual && expected, "Displayed endpoint coordinates are missing");
  assert.ok(
    actual.length === expected.length &&
      Math.hypot(...actual.map((v, i) => v - expected[i])) <= 1e-8,
    "Displayed endpoint differs by more than 1e-8 feet",
  );
};
for (const [index, item] of selectedCases.entries()) {
  const at = performance.now();
  try {
    const value = calculate(item.start, item.end, item.mode, {
      endpointMode: "hallway",
      preferHallways: true,
      useSharedCorridorGuides: true,
    });
    const route = value.route;
    let steps: ReturnType<typeof projectNavigationSteps> = [];
    let baselineAvailable: boolean | undefined;
    if (route) {
      for (const edge of route.edges) {
        assert.ok(edge.enabled && !heldIds.has(edge.id));
        assert.deepEqual(edge.pointsFeet, edges.get(edge.id)!.pointsFeet);
        if (item.mode === "accessible")
          assert.ok(!["stairs", "local-steps"].includes(edge.kind));
      }
      for (const p of route.paths) {
        assert.ok(p.pointsFeet.every((q) => q.every(Number.isFinite)));
        if (
          p.edgeIds.every((id) =>
            ["walk", "door", "opening"].includes(edges.get(id)!.kind),
          )
        )
          assert.equal(
            run(() => holes(p.pointsFeet).length),
            0,
          );
      }
      if (route.departure)
        sameDisplayedPoint(
          route.paths[0].pointsFeet[0],
          route.departure.pointFeet,
        );
      if (route.arrival)
        sameDisplayedPoint(
          route.paths.at(-1)!.pointsFeet.at(-1),
          route.arrival.pointFeet,
        );
      steps = projectNavigationSteps(
        data,
        route,
        records.get(item.start)!.number,
        records.get(item.end)!.number,
      );
      for (const p of route.paths) {
        const e = edges.get(p.edgeIds[0])!;
        if (!["elevator", "ramp", "local-steps", "stairs"].includes(e.kind))
          continue;
        const i = route.edges.findIndex((x) => x.id === e.id);
        assert.deepEqual(
          p.pointsFeet,
          route.nodeIds[i] === e.from
            ? e.pointsFeet
            : e.pointsFeet.toReversed(),
        );
        assert.ok(
          steps.some(
            (s) =>
              s.type === "floor-change" &&
              s.fromLevel === nodes.get(route.nodeIds[i])!.levelId &&
              s.toLevel === nodes.get(route.nodeIds[i + 1])!.levelId,
          ),
        );
      }
    } else {
      baselineAvailable = !!calculate(item.start, item.end, item.mode, {
        endpointMode: "hallway",
        preferHallways: true,
        useSharedCorridorGuides: false,
      }).route;
      if (baselineAvailable)
        invariantFailures.push({
          id: item.id,
          message: "Guide preference lost an available existing route",
        });
    }
    const from = records.get(item.start)!,
      to = records.get(item.end)!;
    const transitions =
      route?.edges.filter((e) =>
        ["elevator", "ramp", "local-steps", "stairs"].includes(e.kind),
      ) ?? [];
    const row = {
      ...item,
      from: {
        number: from.number,
        name: from.name,
        building: from.building,
        levelId: from.levelId,
      },
      to: {
        number: to.number,
        name: to.name,
        building: to.building,
        levelId: to.levelId,
      },
      available: !!route,
      baselineAvailable,
      seconds: (performance.now() - at) / 1000,
      distanceMetres: route?.distanceMetres,
      departure: route?.departure,
      arrival: route?.arrival,
      sharedPaths:
        route?.paths.filter((p) => p.sharedCorridorGuideUsed).length ?? 0,
      sourceEdgeIds: route?.edges.map((e) => e.id),
      transitions: transitions.map(({ id, kind, from, to }) => ({
        id,
        kind,
        fromLevel: nodes.get(from)!.levelId,
        toLevel: nodes.get(to)!.levelId,
      })),
      targetEdgeUsed: !!route?.edges.some((e) => e.id === item.targetEdgeId),
      diagnostic: value.diagnostic,
    };
    results.push(row);
    await appendFile(
      path.join(output, "actual-results.jsonl"),
      JSON.stringify(row) + "\n",
    );
    if (route && item.mode === "public") {
      const allOnFloor = route.paths.every((p) =>
        p.levelIds.every((id) => floor.levelIds.includes(id)),
      );
      if (
        item.tags.some((t) => t.startsWith("every-floor")) &&
        allOnFloor &&
        route.distanceMetres > longestFloor
      ) {
        longestFloor = route.distanceMetres;
        examples.fullFloor = { case: row, route, steps };
      }
      if (item.tags.includes("four-to-one"))
        examples[`fourToOne:${from.levelId}`] = { case: row, route, steps };
      if (item.tags.includes("four-to-three"))
        examples[`fourToThree:${from.levelId}`] = { case: row, route, steps };
      if (item.tags.includes("library-lift"))
        examples[`libraryLift:${from.levelId}`] = { case: row, route, steps };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    invariantFailures.push({ id: item.id, message });
    results.push({ ...item, error: message });
    await appendFile(
      path.join(output, "actual-results.jsonl"),
      JSON.stringify({ ...item, error: message }) + "\n",
    );
  }
  if (index % 10 === 0 || index === selectedCases.length - 1) {
    await stage({
      stage: "actual-calculations",
      completed: index + 1,
      total: selectedCases.length,
      available: results.filter((r) => "available" in r && r.available).length,
      invariantFailures,
    });
    await writeFile(
      path.join(output, "examples.json"),
      JSON.stringify(examples, null, 2),
    );
  }
}
assert.equal(
  sha(JSON.stringify(data)),
  sourceBefore,
  "Audit changed the source dataset",
);
const summarize = (rows: typeof results) => ({
  cases: rows.length,
  available: rows.filter((r) => "available" in r && r.available).length,
  unavailable: rows.filter((r) => "available" in r && !r.available).length,
  errors: rows.filter((r) => "error" in r).length,
});
const report = {
  status: invariantFailures.length > 0 ? "invariant-failures" : "complete",
  archiveSha256: sha(bytes),
  indoorSha256: manifest.indoor.sha256,
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  sourceModelSha256: data.source.modelSha256,
  priorCompleteImport: {
    receipt: path.resolve(proofFile),
    appCommit: proof.appCommit,
    exactInputAndRuntimeVerified: true,
  },
  fullSourceContextRetained: true,
  policyGraphsComputedFresh: true,
  sourceDatasetUnchanged: true,
  caseSelection: requestedIds
    ? {
        kind: "targeted-replay",
        ids: requestedIds,
        fullPlanCases: cases.length,
      }
    : { kind: "complete-plan", fullPlanCases: cases.length },
  floor,
  inventory: {
    places: places.length,
    missingArrivals: places
      .filter((r) => !r.arrivalNodeId)
      .map(({ key, number, name }) => ({ key, number, name })),
  },
  graphCoverage: profiles.map(({ rows: _, ...p }) => p),
  actualCalculations: summarize(results),
  public: summarize(results.filter((r) => r.mode === "public")),
  stepFree: summarize(results.filter((r) => r.mode === "accessible")),
  heldStairs: heldPolicy.length,
  invariantFailures,
  seconds: (performance.now() - started) / 1000,
  results,
};
await writeFile(
  path.join(output, "report.json"),
  JSON.stringify(report, null, 2),
);
await stage({ stage: "complete", ...summarize(results), invariantFailures });
if (invariantFailures.length > 0) process.exitCode = 1;
