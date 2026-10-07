import type { IndoorDataset } from "./contract";
import type { ProjectRoute } from "./routing";
import { isProjectDestination } from "./route-policy";
import { hasReviewedThroughNavigation } from "./through-navigation";

/** Disclose the ordinary-room transit allowed by the shared routing policy,
 * including physical doors hidden inside a centered walking branch. */
export function routeTransitRooms(
  data: IndoorDataset,
  route: ProjectRoute,
  startKey: string | null,
  endKey: string | null,
) {
  const hiddenDoorIds = new Set(route.doorEdgeIds ?? []);
  const dependencies = [
    ...route.edges,
    ...data.edges.filter((edge) => hiddenDoorIds.has(edge.id)),
  ];
  const keys = new Set(
    dependencies
      .filter((edge) => !["elevator", "escalator"].includes(edge.kind))
      .flatMap((edge) => edge.roomKeys),
  );
  return data.records.filter(
    (room) =>
      keys.has(room.key) &&
      room.key !== startKey &&
      room.key !== endKey &&
      isProjectDestination(room) &&
      !room.circulation &&
      !room.stair &&
      !hasReviewedThroughNavigation(room, data.source.modelSha256),
  );
}
