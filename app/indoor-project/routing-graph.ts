import {
  nativeCirculationCells,
  nativeCirculationWalkBlockers,
} from "./native-circulation";
import type { IndoorDataset, IndoorEdge, IndoorRecord } from "./contract";
import { walkPassages, type WalkPassage } from "./route-passages";
import {
  routingSnapshot,
  routingArrays,
  sameRoutingArrays,
  withRoutingCalculation,
} from "./routing-cache";
import type { RouteBlocker } from "./route-policy";

export type ProjectRouteMode = "public" | "accessible";
export type ProjectRoutingLink = {
  to: string;
  edge: IndoorEdge;
  requiredRooms: string[];
  passages: WalkPassage[];
  blockers: RouteBlocker[];
};
export type ProjectRoutingGraph = {
  records: Map<string, IndoorRecord>;
  adjacency: Map<string, ProjectRoutingLink[]>;
  /** Includes excluded links for an honest source-gap/access diagnostic. */
  allAdjacency: Map<string, ProjectRoutingLink[]>;
};
export { isProjectDestination } from "./route-policy";
import { isProjectDestination, projectLinkPolicy } from "./route-policy";

const graphCache = new WeakMap<
  IndoorDataset,
  {
    snapshot: string;
    arrays: ReturnType<typeof routingArrays>;
    profiles: Map<ProjectRouteMode, ProjectRoutingGraph>;
  }
>();
const graphBindings = new WeakMap<
  ProjectRoutingGraph,
  { data: IndoorDataset; mode: ProjectRouteMode }
>();
const coverageCache = new WeakMap<
  ProjectRoutingGraph,
  Map<string, Set<string>>
>();

/** Room types determine preference; explicit access and geometry determine connectivity. The same
 * edge requirements drive shortest paths and the all-destination coverage check. */
export function projectRoutingGraph(
  data: IndoorDataset,
  mode: ProjectRouteMode = "public",
): ProjectRoutingGraph {
  return withRoutingCalculation(data, () =>
    buildProjectRoutingGraph(data, mode),
  );
}
function buildProjectRoutingGraph(
  data: IndoorDataset,
  mode: ProjectRouteMode,
): ProjectRoutingGraph {
  const snapshot = routingSnapshot(data),
    arrays = routingArrays(data);
  let cached = graphCache.get(data);
  if (
    !cached ||
    cached.snapshot !== snapshot ||
    !sameRoutingArrays(cached.arrays, arrays)
  ) {
    cached = { snapshot, arrays, profiles: new Map() };
    graphCache.set(data, cached);
  }
  const existing = cached.profiles.get(mode);
  if (existing) return existing;
  const records = new Map(data.records.map((room) => [room.key, room]));
  const adjacency = new Map<string, ProjectRoutingLink[]>();
  const allAdjacency = new Map<string, ProjectRoutingLink[]>();
  const crossings = walkPassages(data);
  const nativeCellIds = new Set(nativeCirculationCells(data).map((c) => c.id));
  const nativeWalkBlockers = nativeCirculationWalkBlockers(data);
  for (const edge of data.edges) {
    const passages = crossings.get(edge.id) ?? [];
    for (const forward of [true, false]) {
      const { blockers, requiredRooms } = projectLinkPolicy(
        records,
        edge,
        passages,
        forward,
        mode,
        data.source.modelSha256,
        data,
        nativeCellIds,
        nativeWalkBlockers,
      );
      const from = forward ? edge.from : edge.to;
      const to = forward ? edge.to : edge.from;
      const link = { to, edge, requiredRooms, passages, blockers };
      const allLinks = allAdjacency.get(from) ?? [];
      allLinks.push(link);
      allAdjacency.set(from, allLinks);
      if (blockers.length > 0) continue;
      const links = adjacency.get(from) ?? [];
      links.push(link);
      adjacency.set(from, links);
    }
  }
  const graph = { records, adjacency, allAdjacency };
  cached.profiles.set(mode, graph);
  graphBindings.set(graph, { data, mode });
  return graph;
}

/** Reachability follows physical graph links and explicit access rules. Room
 * labels affect route preference, never connectivity. */
export function reachableProjectDestinations(
  graph: ProjectRoutingGraph,
  startKey: string,
): Set<string> {
  const binding = graphBindings.get(graph);
  if (binding) {
    const current = projectRoutingGraph(binding.data, binding.mode);
    if (current !== graph)
      return reachableProjectDestinations(current, startKey);
  }
  const start = graph.records.get(startKey);
  const destinations = new Set<string>();
  if (!start?.arrivalNodeId || !isProjectDestination(start))
    return destinations;
  let coverage = coverageCache.get(graph);
  if (!coverage) {
    coverage = new Map();
    coverageCache.set(graph, coverage);
  }
  const cached = coverage.get(start.arrivalNodeId);
  if (cached) {
    coverage.delete(start.arrivalNodeId);
    coverage.set(start.arrivalNodeId, cached);
    return new Set(cached);
  }
  const queue = [start.arrivalNodeId];
  const reached = new Set(queue);
  for (let i = 0; i < queue.length; i++)
    for (const link of graph.adjacency.get(queue[i]) ?? [])
      if (!reached.has(link.to)) {
        reached.add(link.to);
        queue.push(link.to);
      }
  for (const room of graph.records.values())
    if (
      room.arrivalNodeId &&
      isProjectDestination(room) &&
      reached.has(room.arrivalNodeId)
    )
      destinations.add(room.key);
  coverage.set(start.arrivalNodeId, destinations);
  while (coverage.size > 32) coverage.delete(coverage.keys().next().value!);
  return new Set(destinations);
}

/** Prefer circulation over unreviewed ordinary-room transit, but permit a
 * physically connected route when no useful corridor alternative exists. */
export function projectLinkCost(
  link: { edge: IndoorEdge; requiredRooms: string[] },
  startKey: string,
  endKey: string,
): number {
  const ordinary = link.requiredRooms.filter(
    (key) => key !== startKey && key !== endKey,
  );
  // Costs depend on physical exposure, not how many graph fragments the
  // compiler happened to emit for the same walking leg.
  return link.edge.lengthMetres * (ordinary.length > 0 ? 4 : 1);
}
