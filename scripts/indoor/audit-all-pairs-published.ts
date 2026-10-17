/** Read-only exhaustive graph audit for an exactly publisher-pinned routing snapshot.
 * Every origin is cross-checked against the original runtime reachability function.
 * The bitsets record graph connectivity, not per-pair path centering or browser QA. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync, gzipSync } from "fflate";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  publishedRouteCellReceipt,
  decodePublishedRouteCells,
  createPublishedRouteCalculator,
} from "../../app/indoor-project/published-route-cells";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import {
  projectRoutingGraph,
  isProjectDestination,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";
import { createIndoorExclusionQuery } from "../../app/indoor-project/indoor-exclusions";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { isVisitorHallway } from "../../app/indoor-project/place-discovery";
import { isPassThroughPlace } from "../../app/indoor-project/display-passages";
const args = process.argv.slice(2),
  input = args[0],
  out = args[args.indexOf("--out") + 1],
  cache = args[args.indexOf("--routing-cache") + 1];
if (!input || !args.includes("--out") || !args.includes("--routing-cache"))
  throw Error(
    "Usage: node --import tsx scripts/indoor/audit-all-pairs-published.ts INPUT.zip --routing-cache CHECKED.json.gz --out DIRECTORY",
  );
await fs.mkdir(out, { recursive: true });
const t = performance.now();
let z: ReturnType<typeof unzipSync> | undefined = unzipSync(
  new Uint8Array(await fs.readFile(input)),
  {
    filter: (e) => e.name === "viewer/indoor.json",
  },
);
let raw = JSON.parse(new TextDecoder().decode(z["viewer/indoor.json"]));
const data = routeWorkerDataset(raw);
z = undefined;
raw = undefined;
globalThis.gc?.();
await initializeNativeExactGeosOverlay();
const receipt = publishedRouteCellReceipt(data);
assert(
  receipt,
  "This routing snapshot has no compiled publisher receipt; use the ordinary source audit.",
);
const entries = decodePublishedRouteCells(
    data,
    receipt,
    new Uint8Array(await fs.readFile(cache)),
  ),
  run = createImmutableRoutingSession(data);
console.log(
  "Checked source and exact cache",
  Math.round(performance.now() - t),
);
type Blocker = import("../../app/indoor-project/route-policy").RouteBlocker & {
  edgeKind?: string;
  enabled?: boolean;
  accessible?: string;
  roomKeys?: string[];
  directions: string[];
};
type Profile = {
  mode: string;
  allDirectedPairs: number;
  reachable: number;
  unreachable: number;
  defaultVisitorDirectedPairs: number;
  defaultVisitorReachable: number;
  crossFloorReachable: number;
  oracleChecks: number;
  rows: { key: string; reachable: number }[];
  blockerCounts: Record<string, number>;
  blockers: Blocker[];
};
const profiles: Profile[] = [],
  bits: {
    mode: string;
    bytes: Uint8Array;
    rowBytes: number;
    logicalBytes: number;
  }[] = [];
let inventory: Array<
  Pick<
    import("../../app/indoor-project/contract").IndoorRecord,
    "key" | "number" | "name" | "building" | "levelId" | "arrivalNodeId"
  > & { validArrival: boolean; defaultVisitor: boolean }
> = [];
run(() => {
  createPublishedRouteCalculator(data, entries);
  const records = data.records.filter(isProjectDestination),
    nodes = new Map(data.nodes.map((n, i) => [n.id, { ...n, index: i }])),
    outside = createIndoorExclusionQuery(data),
    arrivals = records.map((r) => {
      const n = r.arrivalNodeId ? nodes.get(r.arrivalNodeId) : undefined;
      return n && !outside([n.pointFeet]).length ? n.index : -1;
    }),
    visible = records.map(
      (r) => !isVisitorHallway(r) && !isPassThroughPlace(r),
    );
  inventory = records.map((r, i) => ({
    key: r.key,
    number: r.number,
    name: r.name,
    building: r.building,
    levelId: r.levelId,
    arrivalNodeId: r.arrivalNodeId,
    validArrival: arrivals[i] >= 0,
    defaultVisitor: visible[i],
  }));
  console.log(
    "Inventory",
    JSON.stringify({
      places: records.length,
      defaultVisitor: visible.filter(Boolean).length,
      nodes: data.nodes.length,
      edges: data.edges.length,
      ramps: data.rampDisplay?.ramps.length,
    }),
  );
  for (const mode of ["public", "accessible"] as const) {
    const graph = projectRoutingGraph(data, mode),
      n = records.length,
      rowBytes = Math.ceil(n / 8),
      matrix = new Uint8Array(rowBytes * n),
      adj = data.nodes.map((node) =>
        (graph.adjacency.get(node.id) ?? [])
          .map((l) => nodes.get(l.to)?.index)
          .filter((i) => i !== undefined),
      ),
      seen = new Uint32Array(data.nodes.length),
      queue = new Uint32Array(data.nodes.length),
      rows = [];
    let reachable = 0,
      visitorReachable = 0,
      crossFloor = 0,
      oracleChecks = 0;
    const byFloor = new Map(
      data.floors.flatMap((f) => f.levelIds.map((id) => [id, f.id])),
    );
    for (let i = 0; i < n; i++) {
      const origin = arrivals[i],
        tag = i + 1;
      let tail = 0;
      if (origin >= 0) {
        queue[tail++] = origin;
        seen[origin] = tag;
        for (let head = 0; head < tail; head++)
          for (const next of adj[queue[head]])
            if (seen[next] !== tag) {
              seen[next] = tag;
              queue[tail++] = next;
            }
      }
      let count = 0;
      const actual = new Set<string>();
      for (let j = 0; j < n; j++)
        if (arrivals[j] >= 0 && seen[arrivals[j]] === tag && origin >= 0) {
          actual.add(records[j].key);
          if (i === j) continue;
          matrix[i * rowBytes + (j >> 3)] |= 1 << (j & 7);
          count++;
          reachable++;
          if (visible[i] && visible[j]) visitorReachable++;
          if (
            byFloor.get(records[i].levelId) !== byFloor.get(records[j].levelId)
          )
            crossFloor++;
        }
      if (true) {
        assert.deepEqual(
          [...actual].sort(),
          [...reachableProjectDestinations(graph, records[i].key)].sort(),
        );
        oracleChecks++;
      }
      rows.push({ key: records[i].key, reachable: count });
      if (i % 500 === 0) console.log(mode, "origins", i, "/", n);
    }
    const blocked = new Map<string, Blocker>();
    for (const [from, links] of graph.allAdjacency)
      for (const link of links)
        for (const b of link.blockers) {
          const key = JSON.stringify([b.kind, b.edgeId, b.roomKey]);
          const e = data.edges.find((e) => e.id === b.edgeId);
          if (!blocked.has(key))
            blocked.set(key, {
              ...b,
              edgeKind: e?.kind,
              enabled: e?.enabled,
              accessible: e?.accessible,
              roomKeys: e?.roomKeys,
              directions: [],
            });
          blocked.get(key)!.directions.push(from + "→" + link.to);
        }
    const blockers = [...blocked.values()],
      counts: Record<string, number> = {};
    for (const b of blockers) counts[b.kind] = (counts[b.kind] ?? 0) + 1;
    profiles.push({
      mode,
      allDirectedPairs: n * (n - 1),
      reachable,
      unreachable: n * (n - 1) - reachable,
      defaultVisitorDirectedPairs:
        visible.filter(Boolean).length * (visible.filter(Boolean).length - 1),
      defaultVisitorReachable: visitorReachable,
      crossFloorReachable: crossFloor,
      oracleChecks,
      rows,
      blockerCounts: counts,
      blockers,
    });
    bits.push({
      mode,
      bytes: gzipSync(matrix, { level: 9, mtime: 0 }),
      rowBytes,
      logicalBytes: matrix.length,
    });
    console.log(
      "Profile done",
      mode,
      JSON.stringify({
        reachable,
        counts,
        ms: Math.round(performance.now() - t),
      }),
    );
  }
});
assert.equal(
  publishedRouteCellReceipt(data),
  receipt,
  "Audit changed the routing snapshot",
);
for (const b of bits)
  await fs.writeFile(out + "/all-pairs-" + b.mode + ".bitset.gz", b.bytes);
await fs.writeFile(
  out + "/endpoint-inventory.json",
  JSON.stringify(inventory, null, 2),
);
const transitions = data.edges.filter((e) =>
  ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(e.kind),
);
await fs.writeFile(
  out + "/vertical-connections.json",
  JSON.stringify(transitions, null, 2),
);
const result = {
  sourceRoutingDatasetUnchanged: true,
  sourceRoutingDatasetSha256: receipt.datasetSha256,
  engineSha256: receipt.engineSha256,
  source: receipt.source,
  places: inventory.length,
  records: data.records.length,
  nodes: data.nodes.length,
  edges: data.edges.length,
  samePlaceUiCases: inventory.length,
  profiles,
  matrixFiles: bits.map(({ bytes, ...b }) => ({
    ...b,
    storedBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  })),
  elapsedMs: Math.round(performance.now() - t),
  limits:
    "Exhaustive directed graph reachability for every destination and both profiles; not a claim that every pair was individually centred, drawn or browser-tested. Actual original reachability is cross-checked for every origin using the original reachability function.",
};
await fs.writeFile(
  out + "/all-pairs-audit.json",
  JSON.stringify(result, null, 2),
);
console.log(
  "Complete",
  JSON.stringify({
    places: result.places,
    elapsedMs: result.elapsedMs,
    profiles: profiles.map(
      ({ mode, allDirectedPairs, reachable, blockerCounts }) => ({
        mode,
        allDirectedPairs,
        reachable,
        blockerCounts,
      }),
    ),
  }),
);
