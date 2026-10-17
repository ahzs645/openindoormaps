export type ProjectRoutingOptions = {
  endpointMode?: "inside" | "hallway";
  preferHallways?: boolean;
  excludedNativeStairIds?: readonly number[];
};
export function projectRoutingOptionsKey(options: ProjectRoutingOptions = {}) {
  const ids = [...new Set(options.excludedNativeStairIds ?? [])].sort(
    (a, b) => a - b,
  );
  if (
    ids.length > 512 ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new Error("Invalid excluded staircase IDs.");
  if (
    options.endpointMode !== undefined &&
    !["inside", "hallway"].includes(options.endpointMode)
  )
    throw new Error("Invalid route endpoint mode.");
  if (
    options.preferHallways !== undefined &&
    typeof options.preferHallways !== "boolean"
  )
    throw new Error("Invalid hallway preference.");
  return JSON.stringify([
    options.endpointMode ?? "inside",
    options.preferHallways !== false,
    ids,
  ]);
}
/** Legacy requests return all endpoint choices; selected-mode requests return
 * only that choice. Their response caches must remain distinct even when the
 * underlying inside-route geometry is identical. */
export function routeRequestOptionsKey(options: ProjectRoutingOptions = {}) {
  return JSON.stringify([
    options.endpointMode === undefined ? "all-choices" : "selected-choice",
    projectRoutingOptionsKey(options),
  ]);
}
