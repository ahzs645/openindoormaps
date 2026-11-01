/** Read-only diagnosis of a refused hallway-only journey.
 *
 * Loads a complete visitor JSON (or a master ZIP), builds the unchanged
 * production public/accessible policy graph and reports, for one start/end
 * pair:
 *  - the hallway endpoints chosen by `hallwayRouteEndpoints`;
 *  - the node sets reachable from the starts and co-reachable to the ends over
 *    links with no blocker and no required ordinary room (the exact hallway
 *    rule in viewer-routing.ts);
 *  - every single link that would bridge the two sets, with its blockers and
 *    required rooms;
 *  - the cheapest physically admitted path when ordinary-room transit is
 *    allowed, with each link's policy;
 *  - actual production route results for the case and corridor variants.
 * Nothing is written to the dataset, graph or source.
 *
 * Usage: diagnose-hallway-gap.ts (--visitor INDOOR.json | --master MASTER.zip)
 *          --out OUT.jsonl --from KEY --to KEY [--probe FROMNUM:TONUM ...]
 */
import { readFile, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import {
  projectRoutingGraph,
  projectLinkCost,
  type ProjectRoutingLink,
} from "../../app/indoor-project/routing-graph";
import { hallwayRouteEndpoints } from "../../app/indoor-project/route-endpoints";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf("--" + name);
  return i === -1 ? undefined : args[i + 1];
};
const probes = args.flatMap((a, i) => (args[i - 1] === "--probe" ? [a] : []));
const out = flag("out"),
  startKey = flag("from"),
  endKey = flag("to");
if (!out || !startKey || !endKey || (!flag("visitor") && !flag("master")))
  throw new Error("See usage in the file header.");
const t0 = performance.now();
await writeFile(out, "");
const emit = (kind: string, value: object) => {
  const line = JSON.stringify({
    kind,
    seconds: (performance.now() - t0) / 1000,
    ...value,
  });
  console.log(line.length > 400 ? line.slice(0, 400) + "…" : line);
  appendFileSync(out, line + "\n");
};

await initializeNativeExactGeosOverlay();
let source: IndoorDataset, inputSha: string;
if (flag("visitor")) {
  const raw = await readFile(flag("visitor")!);
  inputSha = createHash("sha256").update(raw).digest("hex");
  source = JSON.parse(raw.toString()) as IndoorDataset;
} else {
  const raw = await readFile(flag("master")!);
  inputSha = createHash("sha256").update(raw).digest("hex");
  const { readIndoorProject } = await import(
    "../../app/indoor-project/package"
  );
  source = (await readIndoorProject(raw)).dataset;
}
const data = routeWorkerDataset(source);
emit("input", {
  inputSha256: inputSha,
  input: flag("visitor") ?? flag("master"),
  modelSha256: data.source.modelSha256,
  edges: data.edges.length,
  nodes: data.nodes.length,
});

const records = new Map(data.records.map((r) => [r.key, r]));
const byNumber = new Map(data.records.map((r) => [r.number, r]));
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const label = (key: string) => {
  const r = records.get(key);
  return r ? `${r.number} ${r.name}${r.circulation ? " [circ]" : ""}` : key;
};
const nodeLabel = (id: string) => {
  const n = nodes.get(id);
  return n ? `${id} (${n.kind}, ${label(n.roomKey)})` : id;
};
const linkSummary = (from: string, link: ProjectRoutingLink) => ({
  edgeId: link.edge.id,
  kind: link.edge.kind,
  from: nodeLabel(from),
  to: nodeLabel(link.to),
  nativeCellId: link.edge.nativeCellId,
  lengthMetres: link.edge.lengthMetres,
  roomKeys: link.edge.roomKeys.map(label),
  requiredRooms: link.requiredRooms.map(label),
  blockers: link.blockers.map((b) => ({
    kind: b.kind,
    edgeId: b.edgeId,
    room: b.roomKey ? label(b.roomKey) : undefined,
  })),
  passages: link.passages.map((p) => p.edge.id),
  reviewedCirculationLinkId:
    (link.edge as IndoorEdge & { reviewedCirculationLinkId?: string })
      .reviewedCirculationLinkId ?? null,
});

const run = createImmutableRoutingSession(data);
const calculate = createWorkerRouteCalculator(data);
run(() => {
  const graph = projectRoutingGraph(data, "public");
  emit("graph", {
    nodesWithLinks: graph.adjacency.size,
    allNodesWithLinks: graph.allAdjacency.size,
  });
  const start = records.get(startKey)!,
    end = records.get(endKey)!;
  const starts = hallwayRouteEndpoints(data, graph, start, true);
  const ends = hallwayRouteEndpoints(data, graph, end, false);
  emit("endpoints", {
    start: {
      key: start.key,
      label: label(start.key),
      arrival: start.arrivalNodeId,
      circulation: start.circulation,
      access: start.access,
      hallwayStarts: starts.map((s) => nodeLabel(s.nodeId)),
    },
    end: {
      key: end.key,
      label: label(end.key),
      arrival: end.arrivalNodeId,
      circulation: end.circulation,
      access: end.access,
      hallwayEnds: ends.map((s) => nodeLabel(s.nodeId)),
    },
  });

  // Hallway rule: no blockers (adjacency) and no required room at all.
  const hallway = (l: ProjectRoutingLink) => l.requiredRooms.length === 0;
  const reverse = new Map<
    string,
    { from: string; link: ProjectRoutingLink }[]
  >();
  for (const [from, links] of graph.adjacency)
    for (const link of links) {
      const list = reverse.get(link.to) ?? [];
      list.push({ from, link });
      reverse.set(link.to, list);
    }
  const flood = (seeds: string[], forward: boolean) => {
    const seen = new Set(seeds),
      queue = [...seeds];
    for (let i = 0; i < queue.length; i++) {
      const next = forward
        ? (graph.adjacency.get(queue[i]) ?? []).filter(hallway).map((l) => l.to)
        : (reverse.get(queue[i]) ?? [])
            .filter((r) => hallway(r.link))
            .map((r) => r.from);
      for (const id of next)
        if (!seen.has(id)) {
          seen.add(id);
          queue.push(id);
        }
    }
    return seen;
  };
  const fromStart = flood(
    starts.map((s) => s.nodeId),
    true,
  );
  const toEnd = flood(
    ends.map((s) => s.nodeId),
    false,
  );
  const roomsOf = (set: Set<string>) =>
    [...new Set([...set].map((id) => nodes.get(id)?.roomKey ?? "?"))]
      .map(label)
      .sort();
  emit("hallway-sets", {
    reachableFromStart: fromStart.size,
    reachableRoomsFromStart: roomsOf(fromStart),
    coReachableToEnd: toEnd.size,
    coReachableRoomsToEnd: roomsOf(toEnd),
    overlap: [...fromStart].filter((id) => toEnd.has(id)).length,
  });

  // Single links bridging the two sets, from the complete (blocked) graph.
  const bridges: object[] = [];
  for (const [from, links] of graph.allAdjacency)
    if (fromStart.has(from))
      for (const link of links)
        if (
          toEnd.has(link.to) &&
          !(link.blockers.length === 0 && hallway(link))
        )
          bridges.push(linkSummary(from, link));
  emit("single-link-bridges", { count: bridges.length, bridges });

  // Frontier on the start side: links leaving the start set that are blocked
  // only by ordinary-room transit or by a blocker.
  const frontier = (set: Set<string>, forward: boolean) => {
    const result: object[] = [];
    if (forward) {
      for (const from of set)
        for (const link of graph.allAdjacency.get(from) ?? [])
          if (!set.has(link.to)) result.push(linkSummary(from, link));
    } else {
      for (const [from, links] of graph.allAdjacency)
        if (!set.has(from))
          for (const link of links)
            if (set.has(link.to)) result.push(linkSummary(from, link));
    }
    return result;
  };
  const startFrontier = frontier(fromStart, true),
    endFrontier = frontier(toEnd, false);
  emit("start-frontier", { count: startFrontier.length, links: startFrontier });
  emit("end-frontier", { count: endFrontier.length, links: endFrontier });

  // Cheapest admitted path with ordinary-room transit allowed (production cost).
  const dist = new Map<string, number>(),
    prev = new Map<string, { from: string; link: ProjectRoutingLink }>();
  const goals = new Set(ends.map((e) => e.nodeId));
  const queue: { id: string; cost: number }[] = [];
  for (const s of starts) {
    dist.set(s.nodeId, 0);
    queue.push({ id: s.nodeId, cost: 0 });
  }
  let reached: string | undefined;
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    if (cur.cost !== dist.get(cur.id)) continue;
    if (goals.has(cur.id)) {
      reached = cur.id;
      break;
    }
    for (const link of graph.adjacency.get(cur.id) ?? []) {
      const cost = cur.cost + projectLinkCost(link, startKey, endKey);
      if (cost < (dist.get(link.to) ?? Infinity) - 1e-9) {
        dist.set(link.to, cost);
        prev.set(link.to, { from: cur.id, link });
        queue.push({ id: link.to, cost });
      }
    }
    if (queue.length > 200_000) break;
  }
  const path: object[] = [];
  for (let at = reached; at && prev.has(at); at = prev.get(at)!.from)
    path.unshift(linkSummary(prev.get(at)!.from, prev.get(at)!.link));
  emit("transit-allowed-path", {
    reached: reached ? nodeLabel(reached) : null,
    links: path,
    linksWithRequiredRooms: path.filter(
      (l) => (l as { requiredRooms: string[] }).requiredRooms.length > 0,
    ),
  });

  // Production results for the case and variants.
  const cases: [string, string, string, object][] = [
    [
      "case-as-recorded",
      startKey,
      endKey,
      { allowOtherRoomTransit: false, endpointMode: "hallway" },
    ],
    [
      "case-inside-no-transit",
      startKey,
      endKey,
      { allowOtherRoomTransit: false, endpointMode: "inside" },
    ],
    [
      "case-hallway-transit-allowed",
      startKey,
      endKey,
      { allowOtherRoomTransit: true, endpointMode: "hallway" },
    ],
    [
      "case-inside-transit-allowed",
      startKey,
      endKey,
      { allowOtherRoomTransit: true, endpointMode: "inside" },
    ],
  ];
  for (const probe of probes) {
    const [a, b] = probe.split(":");
    const ra = byNumber.get(a),
      rb = byNumber.get(b);
    if (!ra || !rb) {
      emit("probe-missing", { probe });
      continue;
    }
    cases.push([
      `probe:${a}->${b}:hallway`,
      ra.key,
      rb.key,
      { allowOtherRoomTransit: false, endpointMode: "hallway" },
    ]);
  }
  for (const [id, from, to, options] of cases) {
    for (const mode of ["public", "accessible"] as const) {
      const at = performance.now();
      const result = calculate(from, to, mode, options);
      emit("route", {
        id,
        mode,
        from: label(from),
        to: label(to),
        options,
        available: !!result.route,
        distanceMetres: result.route?.distanceMetres,
        seconds: (performance.now() - at) / 1000,
        edgeIds: result.route?.edges.map((e) => e.id),
        diagnostic: result.diagnostic
          ? {
              kind: result.diagnostic.kind,
              message: (result.diagnostic as { message?: string }).message,
              blockers: (result.diagnostic as { blockers?: unknown[] })
                .blockers,
              sourceEdgeIds: (result.diagnostic as { sourceEdgeIds?: string[] })
                .sourceEdgeIds,
            }
          : undefined,
      });
    }
  }
});
emit("done", {});
