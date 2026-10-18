import { routeSearch } from "../utils/deep-link";

/** Keep the inspection flag shareable without reloading a prepared floor. */
export function hallwayPathUrl(
  enabled: boolean,
  base: string,
  flag: "paths" | "heldPaths" = "paths",
): string {
  const url = new URL(base);
  const hashRoute = url.hash.startsWith("#/");
  const params = hashRoute
    ? new URLSearchParams(routeSearch(base))
    : url.searchParams;
  if (enabled) params.set(flag, "1");
  else params.delete(flag);
  if (hashRoute)
    url.hash = url.hash.split("?")[0] + (params.size > 0 ? `?${params}` : "");
  return url.toString();
}
