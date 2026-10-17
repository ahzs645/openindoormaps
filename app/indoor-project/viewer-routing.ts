/** Viewer route choices over the unchanged source-qualified graph.
 * This module does not validate source data or change any preparation input. */
import * as DMath from "./deterministic-math";
import type { IndoorDataset, IndoorEdge } from "./contract";
import type { ProjectRoute as SourceProjectRoute } from "./routing";
import type { ProjectRouteArrival } from "./route-arrival";
import { nativeCirculationBinding } from "./native-circulation-binding";
import { createIndoorExclusionQuery } from "./indoor-exclusions";
import {
  withRoutingCalculation,
  routingCalculationValue,
} from "./routing-cache";
import { createNativeFloorHoleQuery } from "./walking-support";
import { sourceFallbackBarrierHits } from "./source-fallback-barriers";
import { centeredRoutePaths, type RoutePath } from "./viewer-centered-route";
import { centeredRoutePaths as originalCenteredRoutePaths } from "./centered-route";
import {
  isProjectDestination,
  projectRoutingGraph,
  projectLinkCost,
  type ProjectRoutingGraph,
} from "./routing-graph";
import { hallwayRouteEndpoints, type RouteEndpoint } from "./route-endpoints";
import {
  projectRoutingOptionsKey,
  type ProjectRoutingOptions,
} from "./routing-options";
export { projectRoutingOptionsKey } from "./routing-options";
export type { ProjectRoutingOptions } from "./routing-options";
export type ProjectRoute = SourceProjectRoute & {
  departure?: ProjectRouteArrival;
};
type ResolvedRoutes = {
  geometry: string;
  routes: Map<string, ProjectRoute | null>;
  floorFailures: Map<string, number[]>;
};
const resolvedRouteCache = new WeakMap<ProjectRoutingGraph, ResolvedRoutes>();
const originalCenteringRouteCache = new WeakMap<
  ProjectRoutingGraph,
  ResolvedRoutes
>();
const copyRoute = (route: ProjectRoute): ProjectRoute => ({
  ...route,
  departure: route.departure
    ? { ...route.departure, pointFeet: [...route.departure.pointFeet] }
    : undefined,
  arrival: route.arrival
    ? { ...route.arrival, pointFeet: [...route.arrival.pointFeet] }
    : undefined,
  edges: [...route.edges],
  nodeIds: [...route.nodeIds],
  unknownAccessAreas: [...route.unknownAccessAreas],
  doorEdgeIds: route.doorEdgeIds ? [...route.doorEdgeIds] : undefined,
  paths: route.paths.map((path) => ({
    ...path,
    levelIds: [...path.levelIds],
    edgeIds: [...path.edgeIds],
    pointsFeet: path.pointsFeet.map((p) => [...p] as [number, number, number]),
    curveRanges: path.curveRanges?.map((range) => ({ ...range })),
  })),
});

export function findProjectRoute(
  data: IndoorDataset,
  startKey: string,
  endKey: string,
  mode: "public" | "accessible" = "public",
  options: ProjectRoutingOptions = {},
): ProjectRoute | null {
  projectRoutingOptionsKey(options);
  if (
    data.boundaryPatchState?.regenerated === false ||
    data.doorAperturePatchState?.regenerated === false
  )
    return null;
  return withRoutingCalculation(data, () => {
    // A budget limits optional refinement, not route availability. Only a
    // complete refusal retries with original centering and fresh link rejects.
    for (const originalCentering of [false, true]) {
      let excluded = new Set<string>();
      for (;;) {
        const result = resolveProjectRoute(
          data,
          startKey,
          endKey,
          mode,
          excluded,
          options,
          originalCentering,
        );
        if (result && "retry" in result) {
          excluded = result.retry;
          continue;
        }
        if (result) return result;
        break;
      }
    }
    return null;
  });
}
export function projectRouteFloorFailure(
  data: IndoorDataset,
  startKey: string,
  endKey: string,
  mode: "public" | "accessible" = "public",
  options: ProjectRoutingOptions = {},
) {
  const graph = projectRoutingGraph(data, mode);
  const key = JSON.stringify([
    startKey,
    endKey,
    projectRoutingOptionsKey(options),
  ]);
  const recovered = originalCenteringRouteCache.get(graph);
  if (recovered?.routes.has(key)) return recovered.floorFailures.get(key) ?? [];
  return resolvedRouteCache.get(graph)?.floorFailures.get(key) ?? [];
}
function resolveProjectRoute(
  data: IndoorDataset,
  startKey: string,
  endKey: string,
  mode: "public" | "accessible",
  excluded: Set<string>,
  options: ProjectRoutingOptions,
  originalCentering: boolean,
): ProjectRoute | null | { retry: Set<string> } {
  const graph = projectRoutingGraph(data, mode);
  const { records, adjacency } = graph;
  const cache = originalCentering
    ? originalCenteringRouteCache
    : resolvedRouteCache;
  const centerPaths = originalCentering
    ? originalCenteredRoutePaths
    : centeredRoutePaths;
  const geometry = routingCalculationValue(
    data,
    "resolved-route-geometry",
    () =>
      nativeCirculationBinding(
        [
          data.walls,
          data.nodes,
          data.alignment,
          data.walkingSupport,
          data.circulationGeometry,
          ...(data.nativeIndoorEnvelopes && data.doorAperturePatchState
            ? [data.doorAperturePatchState]
            : []),
          (data as IndoorDataset & { preparedRouting?: unknown })
            .preparedRouting,
        ],
        !!data.nativeIndoorEnvelopes,
      ),
  );
  let resolved = cache.get(graph);
  if (!resolved || resolved.geometry !== geometry) {
    resolved = { geometry, routes: new Map(), floorFailures: new Map() };
    cache.set(graph, resolved);
  }
  const routeKey = JSON.stringify([
    startKey,
    endKey,
    projectRoutingOptionsKey(options),
  ]);
  const existing = resolved.routes.get(routeKey);
  if (resolved.routes.has(routeKey) && excluded.size === 0) {
    resolved.routes.delete(routeKey);
    resolved.routes.set(routeKey, existing!);
    const floorIds = resolved.floorFailures.get(routeKey);
    if (floorIds) {
      resolved.floorFailures.delete(routeKey);
      resolved.floorFailures.set(routeKey, floorIds);
    }
    return existing ? copyRoute(existing) : null;
  }
  // Failure explanations ask for the same route again. Retain completed
  // failures under the same exact policy/geometry binding as successful routes.
  const remember = (route: ProjectRoute | null) => {
    resolved.routes.set(routeKey, route);
    while (resolved.routes.size > 16)
      resolved.routes.delete(resolved.routes.keys().next().value!);
    return route ? copyRoute(route) : null;
  };
  const start = records.get(startKey),
    end = records.get(endKey);
  const scopeQuery = createIndoorExclusionQuery(data);
  const arrivalPoints = data.nodes
    .filter((n) => n.id === start?.arrivalNodeId || n.id === end?.arrivalNodeId)
    .map((n) => n.pointFeet);
  if (arrivalPoints.some((p) => scopeQuery([p]).length)) return remember(null);
  if (
    !start?.arrivalNodeId ||
    !end?.arrivalNodeId ||
    !isProjectDestination(start) ||
    !isProjectDestination(end)
  )
    return remember(null);
  const starts: RouteEndpoint[] =
      options.endpointMode === "hallway"
        ? hallwayRouteEndpoints(data, graph, start, true)
        : [{ nodeId: start.arrivalNodeId }],
    ends: RouteEndpoint[] =
      options.endpointMode === "hallway"
        ? hallwayRouteEndpoints(data, graph, end, false)
        : [{ nodeId: end.arrivalNodeId }];
  if (starts.length === 0 || ends.length === 0) return remember(null);
  const goals = new Set(ends.map((e) => e.nodeId)),
    roots = new Set(starts.map((e) => e.nodeId)),
    excludedStairs = new Set(options.excludedNativeStairIds ?? []);
  const distances = new Map<string, number>(),
    previous = new Map<string, { from: string; edge: IndoorEdge }>(),
    heap: { id: string; cost: number }[] = [];
  const push = (id: string, cost: number) => {
    heap.push({ id, cost });
    let i = heap.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (heap[p].cost <= cost) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let j = i;
        if (l < heap.length && heap[l].cost < heap[j].cost) j = l;
        if (r < heap.length && heap[r].cost < heap[j].cost) j = r;
        if (j === i) break;
        [heap[j], heap[i]] = [heap[i], heap[j]];
        i = j;
      }
    }
    return first;
  };
  let reached: string | undefined;
  // Try circulation-only transit first. Retain the physically/policy-checked
  // ordinary-room fallback when the map has no hallway-only connection.
  for (const allowOrdinaryTransit of options.preferHallways === false
    ? [true]
    : [false, true]) {
    distances.clear();
    previous.clear();
    heap.length = 0;
    for (const root of roots) {
      distances.set(root, 0);
      push(root, 0);
    }
    while (heap.length > 0) {
      const current = pop()!;
      if (current.cost !== distances.get(current.id)) continue;
      if (goals.has(current.id)) {
        reached = current.id;
        break;
      }
      for (const { to, edge, requiredRooms } of adjacency.get(current.id) ??
        []) {
        if (excluded.has(edge.id)) continue;
        if (
          (edge.kind === "stairs" || edge.kind === "local-steps") &&
          edge.nativeElementId &&
          excludedStairs.has(edge.nativeElementId)
        )
          continue;
        if (
          !allowOrdinaryTransit &&
          requiredRooms.some(
            (key) =>
              options.endpointMode === "hallway" ||
              (key !== startKey && key !== endKey),
          )
        )
          continue;
        const cost =
          current.cost +
          projectLinkCost({ edge, requiredRooms }, startKey, endKey);
        // Floating-point sums of successive lift rises can differ from the
        // direct rise by a fraction of a nanometre. Keep the existing direct
        // connection instead of adding a fictitious intermediate lift stop.
        if (cost < (distances.get(to) ?? Infinity) - 1e-9) {
          distances.set(to, cost);
          previous.set(to, { from: current.id, edge });
          push(to, cost);
        }
      }
    }
    if (reached !== undefined) break;
  }
  if (reached === undefined) return remember(null);
  const edges: IndoorEdge[] = [],
    nodeIds = [reached];
  let at = reached;
  while (!roots.has(at)) {
    const step = previous.get(at);
    if (!step) return remember(null);
    edges.push(step.edge);
    at = step.from;
    nodeIds.push(at);
  }
  edges.reverse();
  nodeIds.reverse();
  const dependencies = new Map(edges.map((e) => [e.id, e]));
  edges.forEach((edge, i) => {
    const link = adjacency
      .get(nodeIds[i])
      ?.find((l) => l.edge.id === edge.id && l.to === nodeIds[i + 1]);
    for (const passage of link?.passages ?? [])
      dependencies.set(passage.edge.id, passage.edge);
  });
  const reviewedEdges = [...dependencies.values()],
    used = [...new Set(reviewedEdges.flatMap((e) => e.roomKeys))];
  const paths = centerPaths(
    data,
    edges,
    nodeIds,
    mode === "public",
    options.useSharedCorridorGuides !== false,
  );
  const outside = createIndoorExclusionQuery(data);
  const pathExclusions = (path: RoutePath) => {
    const edge =
      path.edgeIds.length === 1
        ? dependencies.get(path.edgeIds[0]!)
        : undefined;
    return edge?.kind === "elevator"
      ? outside.forEdge(path.pointsFeet, edge)
      : outside(path.pointsFeet);
  };
  // Refinement must not replace a safe source walk with an exterior shortcut.
  // A safe saved geometry remains usable when a refined guide is rejected.
  for (let i = 0; i < paths.length; i++) {
    if (pathExclusions(paths[i]).length === 0) continue;
    const source = centerPaths(data, edges, nodeIds, false);
    if (source.some((p) => pathExclusions(p).length)) return remember(null);
    paths.splice(0, paths.length, ...source);
    break;
  }
  const nativeFloorHoleCrossings = createNativeFloorHoleQuery(data);
  const unsafe = paths.filter(
    (path) =>
      path.edgeIds.every((id) =>
        ["walk", "door", "opening"].includes(dependencies.get(id)!.kind),
      ) && nativeFloorHoleCrossings(path.pointsFeet).length > 0,
  );
  if (unsafe.length > 0) {
    const floorIds = [
      ...new Set(
        unsafe.flatMap((path) => nativeFloorHoleCrossings(path.pointsFeet)),
      ),
    ];
    resolved.floorFailures.set(routeKey, floorIds);
    while (resolved.floorFailures.size > 32)
      resolved.floorFailures.delete(
        resolved.floorFailures.keys().next().value!,
      );
    const candidateIds = new Set(unsafe.flatMap((path) => path.edgeIds));
    const unsafeEdges = edges.filter(
      (edge) =>
        candidateIds.has(edge.id) &&
        ["walk", "door", "opening"].includes(edge.kind) &&
        nativeFloorHoleCrossings(edge.pointsFeet).length > 0,
    );
    const rejected =
      unsafeEdges.length > 0
        ? unsafeEdges.map((edge) => edge.id)
        : [...candidateIds];
    const next = new Set([...excluded, ...rejected]);
    // Every retry excludes at least one positively unsupported saved link.
    // Iterate rather than recurse, so many bad fragments cannot overflow the
    // stack or impose an arbitrary limit that hides a viable alternative.
    if (next.size > excluded.size) return { retry: next };
    return remember(null);
  }
  const blockedFallbacks = paths.filter(
    (path) => sourceFallbackBarrierHits(data, path, reviewedEdges).length > 0,
  );
  if (blockedFallbacks.length > 0) {
    const candidateIds = new Set(
      blockedFallbacks.flatMap((path) => path.edgeIds),
    );
    const rejected = edges
      .filter((edge) => {
        if (
          !candidateIds.has(edge.id) ||
          !["walk", "door", "opening"].includes(edge.kind)
        )
          return false;
        const path = blockedFallbacks.find((p) => p.edgeIds.includes(edge.id))!;
        return (
          sourceFallbackBarrierHits(
            data,
            { ...path, pointsFeet: edge.pointsFeet },
            reviewedEdges,
          ).length > 0
        );
      })
      .map((edge) => edge.id);
    const next = new Set([
      ...excluded,
      ...(rejected.length > 0 ? rejected : candidateIds),
    ]);
    if (next.size > excluded.size) return { retry: next };
    return remember(null);
  }
  resolved.floorFailures.delete(routeKey);
  const distanceMetres = paths.reduce(
    (sum, path) =>
      sum +
      (path.centered
        ? path.pointsFeet
            .slice(1)
            .reduce(
              (metres, p, i) =>
                metres +
                DMath.hypot(
                  p[0] - path.pointsFeet[i][0],
                  p[1] - path.pointsFeet[i][1],
                ) *
                  data.alignment.horizontalMetresPerFoot,
              0,
            )
        : edges
            .filter((e) => path.edgeIds.includes(e.id))
            .reduce((metres, e) => metres + e.lengthMetres, 0)),
    0,
  );
  const result: ProjectRoute = {
    departure: starts.find((e) => e.nodeId === nodeIds[0])?.entrance,
    arrival: ends.find((e) => e.nodeId === reached)?.entrance,
    edges,
    nodeIds,
    paths,
    sourceDistanceMetres: edges.reduce(
      (sum, edge) => sum + edge.lengthMetres,
      0,
    ),
    distanceMetres,
    preferenceCost: distances.get(reached),
    unknownAccessAreas: used.filter(
      (k) => records.get(k)?.access === "unknown",
    ),
    unknownAccessibilityEdges: reviewedEdges.filter(
      (e) => e.accessible === "unknown",
    ).length,
    doorEdgeIds: reviewedEdges
      .filter((e) => e.kind === "door")
      .map((e) => e.id),
  };
  return remember(result);
}
