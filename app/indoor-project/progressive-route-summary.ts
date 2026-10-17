import type { IndoorDataset } from "./contract";
import type { ProjectRoute } from "./routing";
import { routeTransitRooms } from "./route-review-summary";
import { projectPlaceDisplayName } from "./visitor-metadata";
export type ProgressiveRouteSummary = {
  transitPlaces: { key: string; label: string }[];
};
/** Use the ordinary navigation disclosure policy on the exact worker dataset;
 * the lean search index cannot establish room-transit ownership. */
export function progressiveRouteSummary(
  data: IndoorDataset,
  route: ProjectRoute | null,
  start: string,
  end: string,
): ProgressiveRouteSummary {
  return {
    transitPlaces: route
      ? routeTransitRooms(data, route, start, end).map((room) => ({
          key: room.key,
          label: [room.number, projectPlaceDisplayName(data, room)]
            .filter(Boolean)
            .join(" · "),
        }))
      : [],
  };
}
