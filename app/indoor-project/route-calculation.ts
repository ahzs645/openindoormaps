import type { IndoorDataset } from "./contract";
import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "./routing-graph";
import { createImmutableRoutingSession } from "./routing-cache";
import { resolveRouteArrival, type ProjectArrivalMode } from "./route-arrival";
import {
  findProjectRoute,
  projectRouteFailure,
  type ProjectRoute,
} from "./routing";
import {
  createProjectRouteDiagnostics,
  type ProjectRouteDiagnostic,
} from "./route-diagnostics";
export type RouteCalculation = {
  route: ProjectRoute | null;
  diagnostic?: ProjectRouteDiagnostic;
  reachable?: Set<string>;
  arrivals?: Partial<
    Record<ProjectArrivalMode, ReturnType<typeof resolveRouteArrival>>
  >;
};
export type RouteRequest = {
  requestId: number;
  data?: IndoorDataset;
  start: string;
  end: string;
  mode: "public" | "accessible";
};
export type RouteResponse = { requestId: number } & (
  | { value: RouteCalculation }
  | { error: string }
);
function pendingBoundaryReview(data: IndoorDataset): boolean {
  return (
    data.boundaryPatchState?.regenerated === false ||
    data.doorAperturePatchState?.regenerated === false
  );
}
function pendingBoundaryResult(
  data: IndoorDataset,
  mode: RouteRequest["mode"],
): RouteCalculation {
  return {
    route: null,
    reachable: new Set(),
    diagnostic: {
      kind: "blocked",
      message: projectRouteFailure(data, "", "", mode),
      blockers: [],
      sourceEdgeIds: [],
    },
  };
}
export function calculateRoute(
  data: IndoorDataset,
  start: string,
  end: string,
  mode: RouteRequest["mode"],
): RouteCalculation {
  if (pendingBoundaryReview(data)) return pendingBoundaryResult(data, mode);
  const route = findProjectRoute(data, start, end, mode);
  return {
    route,
    diagnostic: route
      ? undefined
      : createProjectRouteDiagnostics(data, mode).inspect(start, end),
  };
}

/** This calculator belongs to one private worker snapshot, never the editable UI
 * dataset. Coverage and directions share their graph and exact evidence guards. */
export function createWorkerRouteCalculator(data: IndoorDataset) {
  // A pending source correction must not warm a graph or offer reachability.
  // This also avoids an expensive background audit in review-only previews.
  if (pendingBoundaryReview(data))
    return (_start: string, _end: string, mode: RouteRequest["mode"]) =>
      pendingBoundaryResult(data, mode);
  const run = createImmutableRoutingSession(data);
  const arrivals = new Map<string, RouteCalculation["arrivals"]>();
  return (
    start: string,
    end: string,
    mode: RouteRequest["mode"],
  ): RouteCalculation =>
    run(() => {
      if (!start) {
        projectRoutingGraph(data, mode);
        return { route: null };
      }
      const result = end
        ? calculateRoute(data, start, end, mode)
        : { route: null };
      const key = JSON.stringify([start, end, mode]);
      let choices = arrivals.get(key);
      if (result.route && !choices) {
        choices = {
          doorway: resolveRouteArrival(data, result.route, end, "doorway"),
          hallway: resolveRouteArrival(data, result.route, end, "hallway"),
        };
        arrivals.set(key, choices);
        while (arrivals.size > 16)
          arrivals.delete(arrivals.keys().next().value!);
      }
      return {
        ...result,
        reachable: reachableProjectDestinations(
          projectRoutingGraph(data, mode),
          start,
        ),
        arrivals: choices,
      };
    });
}
