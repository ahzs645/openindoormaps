import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readIndoorProject } from "../../app/indoor-project/package";
import { createProjectRouteDiagnostics } from "../../app/indoor-project/route-diagnostics";
import {
  projectRoutingGraph,
  reachableProjectDestinations,
  isProjectDestination,
} from "../../app/indoor-project/routing-graph";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-route-failures.ts project.zip report.json",
  );
const bytes = await readFile(input);
const { dataset: data } = await readIndoorProject(new Uint8Array(bytes));
const before = JSON.stringify(data);
const rooms = data.records.filter(
  (r) => isProjectDestination(r) && r.arrivalNodeId,
);
const graph = projectRoutingGraph(data);
const diagnostics = createProjectRouteDiagnostics(data);
const raw = new Map<string, string[]>();
for (const e of data.edges) {
  if (e.direction !== "to-from")
    raw.set(e.from, [...(raw.get(e.from) ?? []), e.to]);
  if (e.direction !== "from-to")
    raw.set(e.to, [...(raw.get(e.to) ?? []), e.from]);
}
const identify = (key: string) => {
  const r = graph.records.get(key)!;
  return {
    key,
    number: r.number,
    name: r.name,
    building: r.building,
    levelId: r.levelId,
    access: r.access,
    circulation: r.circulation,
    walkable: r.walkable,
  };
};
const excludedPair = (a: string, b: string) =>
  [a, b].sort().join("/") === "07/10";
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const distance = (
  start: (typeof rooms)[number],
  end: (typeof rooms)[number],
) => {
  const a = nodes.get(start.arrivalNodeId!)?.pointFeet,
    b = nodes.get(end.arrivalNodeId!)?.pointFeet;
  return a && b
    ? Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] - b[2]) * 10)
    : Infinity;
};
const cases = [];
let failedPairs = 0,
  ignoredPairs = 0,
  sourceGapPairs = 0;
for (const [i, start] of rooms.entries()) {
  const reached = new Set([start.arrivalNodeId!]);
  const queue = [...reached];
  for (let j = 0; j < queue.length; j++)
    for (const next of raw.get(queue[j]) ?? [])
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
  const publicReachable = reachableProjectDestinations(graph, start.key);
  const failures = [];
  for (const end of rooms) {
    if (start.key === end.key || publicReachable.has(end.key)) continue;
    if (excludedPair(start.building, end.building)) {
      ignoredPairs++;
      continue;
    }
    if (!reached.has(end.arrivalNodeId!)) {
      sourceGapPairs++;
      continue;
    }
    failures.push(end);
  }
  failedPairs += failures.length;
  if (failures.length > 0) {
    failures.sort((a, b) => distance(start, a) - distance(start, b));
    const end = failures[0],
      diagnostic = diagnostics.inspect(start.key, end.key);
    assert.equal(diagnostic.kind, "blocked");
    cases.push({
      start: identify(start.key),
      previouslyMislabeledDestinationCount: failures.length,
      reachableDestinations: publicReachable.size - 1,
      example: { end: identify(end.key), ...diagnostic },
    });
  }
  if (i % 200 === 0)
    process.stdout.write(`Reviewed ${i + 1}/${rooms.length} departures\n`);
}
const exclusions = [
  ...new Map(
    [...diagnostics.adjacency.values()]
      .flat()
      .flatMap((link) => link.blockers)
      .map((b) => [JSON.stringify([b.kind, b.edgeId, b.roomKey]), b]),
  ).values(),
];
const exclusionCounts: Record<string, number> = {},
  exampleCounts: Record<string, number> = {};
for (const b of exclusions)
  exclusionCounts[b.kind] = (exclusionCounts[b.kind] ?? 0) + 1;
for (const c of cases)
  for (const kind of new Set(c.example.blockers.map((b) => b.kind)))
    exampleCounts[kind] = (exampleCounts[kind] ?? 0) + 1;
const blockerRooms = [
  ...new Set(
    [...exclusions, ...cases.flatMap((c) => c.example.blockers)].flatMap((b) =>
      b.roomKey && graph.records.has(b.roomKey) ? [b.roomKey] : [],
    ),
  ),
].map(identify);
assert.equal(JSON.stringify(data), before);
const report = {
  input,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  source: data.source,
  scope:
    "All graph edge policy exclusions and all directed public endpoint pairs that previously received the blanket restricted/disabled warning. One nearest failing destination is diagnosed per affected departure; example reason counts are not exhaustive pair reason counts. Building 07 ↔ Building 10 is excluded by request. Source gaps are counted only, not repaired.",
  summary: {
    records: data.records.length,
    nodes: data.nodes.length,
    edges: data.edges.length,
    eligibleDepartures: rooms.length,
    previouslyMislabeledDirectedPairs: failedPairs,
    affectedDepartures: cases.length,
    ignoredBuilding07Building10Pairs: ignoredPairs,
    otherDirectedSourceGapPairs: sourceGapPairs,
    edgePolicyExclusions: exclusionCounts,
    representativeReasons: exampleCounts,
    exclusiveFailureReason:
      exclusions.length === 0 && failedPairs > 0
        ? "room-transit: endpoint-only room policy is the only difference from raw reachability"
        : undefined,
    datasetUnchanged: true,
  },
  missingArrivals: data.records
    .filter((r) => isProjectDestination(r) && !r.arrivalNodeId)
    .map((r) => identify(r.key)),
  blockerRooms,
  exclusions,
  cases,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report.summary, null, 2) + "\n");
