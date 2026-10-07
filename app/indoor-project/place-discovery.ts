import type { IndoorRecord } from "./contract";
import { isHallway, isPassThroughPlace } from "./display-passages";
import { isProjectDestination } from "./route-policy";

/** An open destination keeps its identity when its floor becomes circulation. */
export const isNamedOpenPlace = (room: IndoorRecord) =>
  room.circulation &&
  !room.stair &&
  !/^(?:unnamed area|circulation|corridor|hallway|vestibule|native connection landing|recovered circulation)\b/i.test(
    room.name.trim(),
  );

/** Hallway infrastructure remains routable and editable in authoring views.
 * Named open destinations such as a reception desk keep their identity. */
export const isVisitorHallway = (room: IndoorRecord) =>
  (isHallway(room) ||
    /^(?:corridor|hallway|circulation)\b/i.test(room.name.trim())) &&
  !isNamedOpenPlace(room) &&
  !isPassThroughPlace(room);

export function isPlaceSearchCandidate(
  room: IndoorRecord,
  query: string,
  showPassThroughPlaces: boolean,
) {
  if (!isProjectDestination(room)) return false;
  if (isVisitorHallway(room)) return false;
  if (isPassThroughPlace(room) && !showPassThroughPlaces) return false;
  return (
    !isHallway(room) ||
    isNamedOpenPlace(room) ||
    (showPassThroughPlaces && isPassThroughPlace(room))
  );
}
