import type { IndoorDataset } from "./contract";
import { findProjectRoute, type ProjectRoute } from "./routing";
import {
  createProjectRouteDiagnostics,
  type ProjectRouteDiagnostic,
} from "./route-diagnostics";
export type RouteCalculation = {
  route: ProjectRoute | null;
  diagnostic?: ProjectRouteDiagnostic;
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
