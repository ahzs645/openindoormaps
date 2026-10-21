/** Audits the simplified hallway network against the compiled routing graph.
 *
 *   node --import tsx scripts/indoor/audit-hallway-network.ts routing.json \
 *     report.json [network.json]
 *
 * `routing.json` is a decompressed compiled routing dataset. The report
 * covers, for both profiles:
 * - reachability parity over every pair of rooms with an arrival point (the
 *   network must neither lose nor invent a connection),
 * - route length against the compiled graph's shortest path on sampled pairs,
 * - route time,
 * - every spine edge staying on a walkable cell of its plane.
 * The command exits non-zero when parity fails. */
import { readFileSync, writeFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  buildHallwayNetwork,
  createHallwayRouter,
  EDGE_STAFF,
  EDGE_STEPS,
  type HallwayProfile,
} from "../../app/indoor-project/hallway-network";
import { indexSurface, type XY } from "../../app/indoor-project/hallway-spine";

const [input, output, networkOutput] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "usage: audit-hallway-network.ts routing.json report.json [network.json]",
  );
const data = JSON.parse(readFileSync(input, "utf8")) as IndoorDataset;
const records = new Map(data.records.map((r) => [r.key, r]));
let started = performance.now();
const network = buildHallwayNetwork(data);
const buildMs = performance.now() - started;
const route = createHallwayRouter(network);
if (networkOutput) writeFileSync(networkOutput, JSON.stringify(network));

// The compiled graph under the same policy: staff rooms never, step-free
// without stairs, local steps or escalators; held links are absent.
const nodeIndex = new Map(data.nodes.map((n, i) => [n.id, i]));
const STEPPED = new Set(["stairs", "local-steps", "escalator"]);
const staffEdge = (keys: string[] = []) =>
  keys.some((k) => records.get(k)?.access === "staff");
function compiledGraph(profile: HallwayProfile) {
  const adjacency: [number, number][][] = data.nodes.map(() => []);
  for (const e of data.edges) {
    if (!e.enabled || staffEdge(e.roomKeys)) continue;
    if (profile === "step-free" && STEPPED.has(e.kind)) continue;
    const a = nodeIndex.get(e.from),
      b = nodeIndex.get(e.to);
    if (a === undefined || b === undefined) continue;
    adjacency[a].push([b, e.lengthMetres ?? 0]);
    adjacency[b].push([a, e.lengthMetres ?? 0]);
  }
  return adjacency;
}
function distances(adjacency: [number, number][][], start: number) {
  const best = new Float64Array(adjacency.length).fill(Infinity);
  best[start] = 0;
  const heap: [number, number][] = [[0, start]];
  const push = (item: [number, number]) => {
    heap.push(item);
    for (let c = heap.length - 1; c > 0; ) {
      const p = (c - 1) >> 1;
      if (heap[p][0] <= heap[c][0]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  while (heap.length > 0) {
    const [d, v] = heap[0],
      last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    if (d > best[v]) continue;
    for (const [w, c] of adjacency[v])
      if (d + c < best[w]) {
        best[w] = d + c;
        push([d + c, w]);
      }
  }
  return best;
}
function components(adjacency: number[][]) {
  const label = new Int32Array(adjacency.length).fill(-1);
  let next = 0;
  for (let s = 0; s < adjacency.length; s++) {
    if (label[s] >= 0) continue;
    const stack = [s];
    label[s] = next;
    while (stack.length > 0) {
      const v = stack.pop()!;
      for (const w of adjacency[v])
        if (label[w] < 0) {
          label[w] = next;
          stack.push(w);
        }
    }
    next++;
  }
  return label;
}
const quantile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const roomName = (key: string) => {
  const r = records.get(key)!;
  return `${r.number || ""} ${r.name}`.trim();
};

const rooms = Object.keys(network.arrivals)
  .filter((k) => nodeIndex.has(records.get(k)?.arrivalNodeId ?? ""))
  .sort();
const arrivalOf = (k: string) => nodeIndex.get(records.get(k)!.arrivalNodeId!)!;
const profiles: Record<string, unknown> = {};
let parityFailures = 0;
for (const profile of ["walking", "step-free"] as const) {
  const blocked =
    profile === "step-free" ? EDGE_STAFF | EDGE_STEPS : EDGE_STAFF;
  const networkAdjacency: number[][] = network.nodes.map(() => []);
  for (const edge of network.edges)
    if (!(edge[4] & blocked)) {
      networkAdjacency[edge[0]].push(edge[1]);
      networkAdjacency[edge[1]].push(edge[0]);
    }
  const compiled = compiledGraph(profile);
  const compiledLabel = components(compiled.map((l) => l.map(([w]) => w)));
  const networkLabel = components(networkAdjacency);
  // Pairs are reachable together exactly when their labels pair up, so count
  // rooms per (compiled, network) label pair instead of visiting every pair.
  const byCompiled = new Map<number, number>(),
    byNetwork = new Map<number, number>(),
    byBoth = new Map<string, number>();
  for (const k of rooms) {
    const c = compiledLabel[arrivalOf(k)],
      n = networkLabel[network.arrivals[k]];
    byCompiled.set(c, (byCompiled.get(c) ?? 0) + 1);
    byNetwork.set(n, (byNetwork.get(n) ?? 0) + 1);
    byBoth.set(`${c}:${n}`, (byBoth.get(`${c}:${n}`) ?? 0) + 1);
  }
  const pairs = (counts: Map<unknown, number>) =>
    [...counts.values()].reduce((t, x) => t + (x * (x - 1)) / 2, 0);
  const together = pairs(byBoth),
    lostPairs = pairs(byCompiled) - together,
    gainedPairs = pairs(byNetwork) - together;
  parityFailures += lostPairs + gainedPairs;

  // Lengths on sampled pairs that the compiled graph connects.
  let seed = 7;
  const random = () =>
    (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  const sources = new Map<string, string[]>();
  for (let s = 0; s < 20_000 && sources.size < 300; s++) {
    const a = rooms[Math.floor(random() * rooms.length)],
      b = rooms[Math.floor(random() * rooms.length)];
    if (a === b) continue;
    sources.set(a, [...(sources.get(a) ?? []), b]);
  }
  const ratios: number[] = [],
    times: number[] = [],
    differences: {
      ratio: number;
      network: number;
      compiled: number;
      pair: string;
    }[] = [];
  for (const [a, targets] of sources) {
    const best = distances(compiled, arrivalOf(a));
    for (const b of targets) {
      started = performance.now();
      const r = route(a, b, profile);
      times.push(performance.now() - started);
      const d = best[arrivalOf(b)];
      if (!r || !Number.isFinite(d) || d < 5) continue;
      ratios.push(r.metres / d);
      differences.push({
        ratio: +(r.metres / d).toFixed(3),
        network: +r.metres.toFixed(1),
        compiled: +d.toFixed(1),
        pair: `${roomName(a)} -> ${roomName(b)}`,
      });
    }
  }
  ratios.sort((x, y) => x - y);
  times.sort((x, y) => x - y);
  differences.sort(
    (x, y) => Math.abs(Math.log(y.ratio)) - Math.abs(Math.log(x.ratio)),
  );
  profiles[profile] = {
    rooms: rooms.length,
    roomPairs: (rooms.length * (rooms.length - 1)) / 2,
    lostPairs,
    gainedPairs,
    lengthRatio: {
      samples: ratios.length,
      p05: +quantile(ratios, 0.05).toFixed(3),
      median: +quantile(ratios, 0.5).toFixed(3),
      p95: +quantile(ratios, 0.95).toFixed(3),
      min: +ratios[0].toFixed(3),
      max: +ratios.at(-1)!.toFixed(3),
    },
    routeMs: {
      median: +quantile(times, 0.5).toFixed(2),
      p95: +quantile(times, 0.95).toFixed(2),
      max: +times.at(-1)!.toFixed(2),
    },
    largestDifferences: differences.slice(0, 8),
  };
}

// Every spine and hop lies on a walkable cell of its plane; a gate's line also
// crosses the door threshold between two cells, so report how far off it is.
const planeOf = (z: number) => Math.round(z * 100);
const levelPlanes = new Map<number, Set<number>>();
for (const c of data.circulationGeometry?.cells ?? [])
  for (const l of c.levelIds) {
    if (!levelPlanes.has(l)) levelPlanes.set(l, new Set());
    levelPlanes.get(l)!.add(planeOf(c.elevationFeet));
  }
const cellsOfLevel = new Map<number, ReturnType<typeof indexSurface>[]>();
for (const c of data.circulationGeometry?.cells ?? []) {
  const index = indexSurface(
    c.ringsFeet.map((r) => r.map((p) => [p[0], p[1]] as XY)),
  );
  for (const [level, planes] of levelPlanes)
    if (planes.has(planeOf(c.elevationFeet))) {
      if (!cellsOfLevel.has(level)) cellsOfLevel.set(level, []);
      cellsOfLevel.get(level)!.push(index);
    }
}
let samples = 0;
const offCell: number[] = [];
for (const [a, b, , kind, , mid = []] of network.edges) {
  if (kind !== "spine" && kind !== "hop") continue;
  const level = network.nodes[a][0],
    line: XY[] = [[network.nodes[a][1], network.nodes[a][2]]];
  for (let k = 0; k < mid.length; k += 2) line.push([mid[k], mid[k + 1]]);
  line.push([network.nodes[b][1], network.nodes[b][2]]);
  const cells = cellsOfLevel.get(level) ?? [];
  for (let k = 1; k < line.length; k++)
    for (let i = 1; i < 10; i++) {
      const [p0, p1] = [line[k - 1], line[k]],
        p: XY = [
          p0[0] + ((p1[0] - p0[0]) * i) / 10,
          p0[1] + ((p1[1] - p0[1]) * i) / 10,
        ];
      samples++;
      if (!cells.some((c) => c.inside(p) || c.distanceToEdge(p) < 0.02))
        offCell.push(Math.min(...cells.map((c) => c.distanceToEdge(p))));
    }
}
offCell.sort((x, y) => x - y);

const json = JSON.stringify(network);
const report = {
  format: "hallway-network-audit-v1",
  sourceModelSha256: network.sourceModelSha256,
  buildMs: Math.round(buildMs),
  network: {
    nodes: network.nodes.length,
    edges: network.edges.length,
    arrivals: rooms.length,
    jsonBytes: json.length,
    edgeKinds: Object.fromEntries(
      [
        ...network.edges.reduce(
          (m, e) => m.set(e[3], (m.get(e[3]) ?? 0) + 1),
          new Map<string, number>(),
        ),
      ].sort(),
    ),
  },
  report: {
    ...network.report,
    spineMetres: Math.round(network.report.spineMetres),
  },
  profiles,
  geometry: {
    spineSamples: samples,
    offWalkableCell: offCell.length,
    maxOffFeet: +(offCell.at(-1) ?? 0).toFixed(2),
    offWithinHalfFoot: offCell.filter((d) => d <= 0.5).length,
  },
};
writeFileSync(output, `${JSON.stringify(report, null, 1)}\n`);
console.log(
  JSON.stringify({
    parityFailures,
    profiles: Object.fromEntries(
      Object.entries(profiles).map(([k, v]) => {
        const p = v as { lostPairs: number; gainedPairs: number };
        return [k, { lost: p.lostPairs, gained: p.gainedPairs }];
      }),
    ),
    geometry: report.geometry,
  }),
);
if (parityFailures > 0) process.exitCode = 1;
