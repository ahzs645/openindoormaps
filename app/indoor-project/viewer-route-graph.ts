import type { IndoorDataset } from "./contract";
import { createIndoorExclusionQuery } from "./indoor-exclusions";
import {
  projectRoutingGraph,
  isProjectDestination,
  type ProjectRouteMode,
} from "./routing-graph";
import {
  routingCalculationValue,
  withRoutingCalculation,
} from "./routing-cache";
import { projectRoutingOptionsKey } from "./routing-options";
/** Preference exclusions only remove original approved links. The source graph,
 * outside-arrival checks, direction and access policies remain unchanged. */
export function reachableViewerDestinations(
  data: IndoorDataset,
  mode: ProjectRouteMode,
  startKey: string,
  excludedNativeStairIds: readonly number[] = [],
): Set<string> {
  const optionsKey = projectRoutingOptionsKey({ excludedNativeStairIds });
  return withRoutingCalculation(data, () => {
    const graph = projectRoutingGraph(data, mode),
      start = graph.records.get(startKey),
      destinations = new Set<string>();
    const outside = createIndoorExclusionQuery(data);
    const outsideArrival = (r: typeof start) => {
      const node = data.nodes.find((n) => n.id === r?.arrivalNodeId);
      return node && outside([node.pointFeet]).length > 0;
    };
    if (
      !start?.arrivalNodeId ||
      !isProjectDestination(start) ||
      outsideArrival(start)
    )
      return destinations;
    const coverage = routingCalculationValue<Map<string, Set<string>>>(
      data,
      "viewer-destination-coverage",
      () => new Map(),
    );
    const key = JSON.stringify([mode, start.arrivalNodeId, optionsKey]);
    const cached = coverage.get(key);
    if (cached) return new Set(cached);
    const excluded = new Set(excludedNativeStairIds),
      queue = [start.arrivalNodeId],
      reached = new Set(queue);
    for (let i = 0; i < queue.length; i++)
      for (const link of graph.adjacency.get(queue[i]) ?? []) {
        if (
          reached.has(link.to) ||
          ((link.edge.kind === "stairs" || link.edge.kind === "local-steps") &&
            link.edge.nativeElementId !== undefined &&
            excluded.has(link.edge.nativeElementId))
        )
          continue;
        reached.add(link.to);
        queue.push(link.to);
      }
    for (const room of graph.records.values())
      if (
        room.arrivalNodeId &&
        isProjectDestination(room) &&
        !outsideArrival(room) &&
        reached.has(room.arrivalNodeId)
      )
        destinations.add(room.key);
    coverage.set(key, destinations);
    while (coverage.size > 32) coverage.delete(coverage.keys().next().value!);
    return new Set(destinations);
  });
}
