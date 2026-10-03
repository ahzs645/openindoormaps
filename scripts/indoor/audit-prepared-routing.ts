import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";
import { withRoutingCalculation } from "../../app/indoor-project/routing-cache";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { readIndoorProject } from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { isProjectDestination } from "../../app/indoor-project/route-policy";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import {
  preparedWalkingGuides,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
import { nativeSlabsCoverSegment } from "./native-floor-proof";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error("Usage: audit-prepared-routing.ts prepared.zip report.json");
const { dataset } = await readIndoorProject(await readFile(input));
const baseline = { ...dataset } as IndoorDataset & {
  preparedRouting?: PreparedRouting;
};
delete baseline.preparedRouting;
assert.ok(
  preparedWalkingGuides(dataset).size,
  "Package must contain current prepared walking guides",
);
const records = dataset.records.filter(isProjectDestination);
const cases: { from: string; to: string; mode: "public" | "accessible" }[] = [];
for (const [from, to] of [
  ["05-113", "07-148A"],
  ["06-260", "07-240"],
  ["10-2014", "07-242"],
  ["10-S403", "05-139G"],
]) {
  const a = records.find((r) => r.number === from),
    b = records.find((r) => r.number === to);
  if (a && b)
    for (const [start, end] of [
      [a, b],
      [b, a],
    ])
      for (const mode of ["public", "accessible"] as const)
        cases.push({ from: start.key, to: end.key, mode });
}
let seed = 20_261_003;
const random = () => {
  seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return seed / 2 ** 32;
};
for (let i = 0; i < 16; i++) {
  const a = records[Math.floor(random() * records.length)];
  const otherFloors = records.filter(
    (r) => Math.abs(r.elevationFeet - a.elevationFeet) > 1,
  );
  const b = otherFloors[Math.floor(random() * otherFloors.length)];
  cases.push({
    from: a.key,
    to: b.key,
    mode: i % 4 === 0 ? "accessible" : "public",
  });
}
// Add connected multifloor pairs so the audit exercises complete routes, not
// predominantly isolated destinations. Keep the unconstrained checks above.
withRoutingCalculation(dataset, () => {
  const graph = projectRoutingGraph(dataset, "public");
  let added = 0;
  for (let attempts = 0; added < 32 && attempts < 2000; attempts++) {
    const a = records[Math.floor(random() * records.length)];
    const reached = reachableProjectDestinations(graph, a.key);
    const candidates = records.filter(
      (r) =>
        reached.has(r.key) && Math.abs(r.elevationFeet - a.elevationFeet) > 1,
    );
    if (candidates.length === 0) continue;
    const b = candidates[Math.floor(random() * candidates.length)];
    if (
      cases.some(
        (c) => c.from === a.key && c.to === b.key && c.mode === "public",
      )
    )
      continue;
    cases.push({ from: a.key, to: b.key, mode: "public" });
    added++;
  }
  assert.equal(
    added,
    32,
    "Dataset lacks enough connected multifloor pairs for this campus audit",
  );
});
const floorPolygons = (dataset.walkingSupport?.floors ?? []).flatMap((f) =>
  (f.partsFeet ?? [f.ringsFeet]).map((rings) => ({
    z: f.elevationFeet,
    rings,
    bounds: [
      Math.min(...rings[0].map((p) => p[0])),
      Math.min(...rings[0].map((p) => p[1])),
      Math.max(...rings[0].map((p) => p[0])),
      Math.max(...rings[0].map((p) => p[1])),
    ],
  })),
);
const rows = [],
  geometry = [];
let checkedFloorSegments = 0;
for (const [i, c] of cases.entries()) {
  let t = performance.now();
  const before = findProjectRoute(baseline, c.from, c.to, c.mode),
    beforeMs = performance.now() - t;
  t = performance.now();
  const after = findProjectRoute(dataset, c.from, c.to, c.mode),
    afterMs = performance.now() - t;
  assert.equal(
    !!after,
    !!before,
    `Route availability changed: ${c.from} → ${c.to}`,
  );
  const transitions = (route: NonNullable<typeof after>) =>
    route.edges
      .filter((e) =>
        ["stairs", "elevator", "escalator", "ramp", "local-steps"].includes(
          e.kind,
        ),
      )
      .map((e) => [e.id, e.pointsFeet]);
  if (before && after) {
    assert.deepEqual(
      after.edges.map((e) => e.id),
      before.edges.map((e) => e.id),
      "Prepared geometry changed graph connections",
    );
    assert.deepEqual(
      transitions(after),
      transitions(before),
      "Physical transitions changed",
    );
    assert.deepEqual(
      after.doorEdgeIds,
      before.doorEdgeIds,
      "Door crossings changed",
    );
    assert.deepEqual(
      after.unknownAccessAreas,
      before.unknownAccessAreas,
      "Access review changed",
    );
    if (c.mode === "accessible")
      assert.deepEqual(
        after.paths,
        before.paths,
        "Step-free proofs must retain source geometry",
      );
    for (const path of after.paths.filter(
      (p) => p.centered && p.nativeFloorSupported,
    ))
      for (let j = 1; j < path.pointsFeet.length; j++) {
        const a = path.pointsFeet[j - 1],
          b = path.pointsFeet[j];
        const floors = floorPolygons.filter(
          (f) =>
            Math.abs(f.z - a[2]) <= 0.05 &&
            Math.min(a[0], b[0]) <= f.bounds[2] &&
            Math.max(a[0], b[0]) >= f.bounds[0] &&
            Math.min(a[1], b[1]) <= f.bounds[3] &&
            Math.max(a[1], b[1]) >= f.bounds[1],
        );
        assert.ok(
          nativeSlabsCoverSegment(
            [a[0], a[1]],
            [b[0], b[1]],
            floors.map((f) => f.rings),
          ),
          `Route left exact native slab: ${c.from} → ${c.to}`,
        );
        checkedFloorSegments++;
      }
    geometry.push({
      start: c.from,
      end: c.to,
      edgeIds: after.edges.map((e) => e.id),
      paths: after.paths.filter(
        (p) => p.centered || p.sourceReason === "validated-source",
      ),
    });
  }
  const steps = (r: typeof after) =>
    r ? projectNavigationSteps(dataset, r, c.from, c.to) : [];
  rows.push({
    ...c,
    fromNumber: dataset.records.find((r) => r.key === c.from)?.number,
    toNumber: dataset.records.find((r) => r.key === c.to)?.number,
    routed: !!after,
    beforeMs,
    afterMs,
    beforeMetres: before?.distanceMetres,
    afterMetres: after?.distanceMetres,
    beforeTurns: steps(before).filter((s) => s.type === "turn").length,
    afterTurns: steps(after).filter((s) => s.type === "turn").length,
    floorChanges: steps(after).filter((s) => s.type === "floor-change").length,
    preparedSections:
      after?.paths.filter((p) => p.preparedGuideUsed).length ?? 0,
  });
  console.log(
    `${i + 1}/${cases.length}: ${rows.at(-1)!.fromNumber} → ${rows.at(-1)!.toNumber} ${c.mode} ${Math.round(beforeMs)} → ${Math.round(afterMs)} ms${after ? "" : " (blocked)"}`,
  );
}
const publicRows = rows.filter((r) => r.routed && r.mode === "public");
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const report = {
  input,
  source: dataset.source,
  scope:
    "Seeded local Node audit; ZIP parsing excluded. Same graph, doors, access and transition geometry required; new planar sections independently checked against exact native slabs. Browser/mobile timings measured separately.",
  routesChecked: rows.length,
  routed: rows.filter((r) => r.routed).length,
  blocked: rows.filter((r) => !r.routed).length,
  multifloorRoutes: rows.filter((r) => r.floorChanges > 0).length,
  checkedFloorSegments,
  publicTimingMs: {
    medianBefore: median(publicRows.map((r) => r.beforeMs)),
    medianAfter: median(publicRows.map((r) => r.afterMs)),
    maxBefore: Math.max(...publicRows.map((r) => r.beforeMs)),
    maxAfter: Math.max(...publicRows.map((r) => r.afterMs)),
  },
  rows,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
await writeFile(output + ".geometry.json", JSON.stringify(geometry));
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
