import type { IndoorDataset } from "./contract";
import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "./routing-graph";
import { createImmutableRoutingSession } from "./routing-cache";
import { resolveRouteArrival, type ProjectArrivalMode } from "./route-arrival";
import { findProjectRoute, type ProjectRoute } from "./routing";
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
export function calculateRoute(
  data: IndoorDataset,
  start: string,
  end: string,
  mode: RouteRequest["mode"],
): RouteCalculation {
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
