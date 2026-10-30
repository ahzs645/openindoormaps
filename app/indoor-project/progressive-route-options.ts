import {
  routeRequestOptionsKey,
  type ProjectRoutingOptions,
} from "./routing-options";

/** Visitor preferences cannot override source access, stair exclusions or guides. */
export type ProgressiveRouteOptions = Pick<
  ProjectRoutingOptions,
  "endpointMode" | "allowOtherRoomTransit"
>;

/** Validate at both sides of the worker boundary and copy the selected values.
 * An omitted transit preference follows the full viewer's hallway-only default. */
export function progressiveRouteOptions(
  value: unknown = {},
): Required<ProgressiveRouteOptions> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => key !== "endpointMode" && key !== "allowOtherRoomTransit",
    )
  )
    throw new Error("Invalid visitor routing options.");
  const options = value as ProgressiveRouteOptions;
  routeRequestOptionsKey(options);
  return {
    endpointMode: options.endpointMode ?? "inside",
    allowOtherRoomTransit: options.allowOtherRoomTransit ?? false,
  };
}
