import type { IndoorDataset } from "./contract";
import { isVisitorHallway } from "./place-discovery";
import { routeSearch } from "../utils/deep-link";

export type ProjectRouteLink = {
  start: string;
  end: string;
  mode: "public" | "accessible";
};

/** Links select existing places; the normal route calculator still checks access. */
export function readProjectRouteLink(
  search: string,
  data: Pick<IndoorDataset, "records">,
): ProjectRouteLink & { notice: string } {
  const params = new URLSearchParams(search);
  const endpoint = (name: string) => {
    const key = params.get(name) ?? "";
    const place = data.records.find((record) => record.key === key);
    return place?.walkable &&
      place.access !== "staff" &&
      !isVisitorHallway(place)
      ? key
      : "";
  };
  const start = endpoint("from");
  const end = endpoint("to");
  return {
    start,
    end,
    mode:
      params.get("profile") === "accessible" || params.get("accessible") === "1"
        ? "accessible"
        : "public",
    notice:
      (params.get("from") && !start) || (params.get("to") && !end)
        ? "A place in this directions link is unavailable. Choose a start and destination on this map."
        : "",
  };
}

/** Preserve the selected map and view in both normal and hash-based hosting. */
export function projectRouteLinkUrl(state: ProjectRouteLink, base: string) {
  const url = new URL(base);
  const hashRoute = url.hash.startsWith("#/");
  const params = hashRoute
    ? new URLSearchParams(routeSearch(base))
    : url.searchParams;
  for (const key of ["from", "to", "profile", "accessible"]) params.delete(key);
  if (state.start) params.set("from", state.start);
  if (state.end) params.set("to", state.end);
  if (state.mode === "accessible") params.set("accessible", "1");
  if (hashRoute)
    url.hash = url.hash.split("?")[0] + (params.size > 0 ? `?${params}` : "");
  return url.toString();
}
