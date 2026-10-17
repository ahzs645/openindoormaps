import type { IndoorDataset } from "./contract";
import { projectRoutingGraph } from "./routing-graph";
import { reachableViewerDestinations } from "./viewer-route-graph";
import { createImmutableRoutingSession } from "./routing-cache";
import { resolveRouteArrival, type ProjectArrivalMode } from "./route-arrival";
import { routeRequestOptionsKey } from "./routing-options";
import {
  findProjectRoute,
  type ProjectRoute,
  type ProjectRoutingOptions,
} from "./viewer-routing";
import { projectRouteFailure } from "./routing";
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
  options?: ProjectRoutingOptions;
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
  options: RouteRequest["options"] = {},
): RouteCalculation {
  if (pendingBoundaryReview(data)) return pendingBoundaryResult(data, mode);
  const route = findProjectRoute(data, start, end, mode, options);
  const diagnostic = route
    ? undefined
    : createProjectRouteDiagnostics(data, mode).inspect(start, end);
  if (
    diagnostic?.kind === "connected" &&
    options.excludedNativeStairIds?.length
  ) {
    diagnostic.kind = "blocked";
    diagnostic.message =
      "No supported route was found with the current staircase exclusions. You can change them in Excluded stairs.";
  }
  return {
    route,
    diagnostic,
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
    options: RouteRequest["options"] = {},
  ): RouteCalculation =>
    run(() => {
      if (!start) {
        projectRoutingGraph(data, mode);
        return { route: null };
      }
      const result = end
        ? calculateRoute(data, start, end, mode, options)
        : { route: null };
      const key = JSON.stringify([
        start,
        end,
        mode,
        routeRequestOptionsKey(options),
      ]);
      let choices = arrivals.get(key);
      if (end && !choices) {
        choices =
          options.endpointMode === "hallway"
            ? { hallway: { route: result.route } }
            : {
                doorway: resolveRouteArrival(
                  data,
                  result.route,
                  end,
                  "doorway",
                ),
              };
        // Legacy callers can request all choices. The visitor supplies its
        // selected mode, so hallway directions do not also solve an interior
        // route or prepare the unused endpoint variants.
        if (options.endpointMode === undefined)
          choices.hallway = {
            route: findProjectRoute(data, start, end, mode, {
              ...options,
              endpointMode: "hallway",
            }),
          };
        if (choices.hallway && !choices.hallway.route)
          choices.hallway.message =
            "A verified hallway entrance is unavailable at one of these places. Choose Inside room or another entrance.";
        arrivals.set(key, choices);
        while (arrivals.size > 16)
          arrivals.delete(arrivals.keys().next().value!);
      }
      return {
        ...result,
        // Interior-arrival coverage is not hallway-endpoint coverage. Keep it
        // unset for an explicit hallway request instead of disabling a place
        // whose outside doorway is reachable but interior approach is not.
        reachable:
          options.endpointMode === "hallway"
            ? undefined
            : reachableViewerDestinations(
                data,
                mode,
                start,
                options.excludedNativeStairIds,
              ),
        arrivals: choices,
      };
    });
}
