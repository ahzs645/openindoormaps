import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import polygonClipping from "polygon-clipping";
import type { IndoorDataset, IndoorRecord } from "./contract";

export const isVestibule = (room: IndoorRecord) =>
  /\bvestibule\b/i.test(room.name);
export const HALLWAY_COLOR = "#d7e2e5";
/** Source access restrictions remain authoritative even when a corridor's
 * circulation flag is missing. This classification affects presentation only. */
export const isHallway = (room: IndoorRecord) =>
  !room.stair &&
  (room.circulation || /\b(?:corridor|hallway)\b/i.test(room.name));
/** Visitor presentation only. Preserve the source room classification and graph. */
export const isDisplayPassage = (room: IndoorRecord) =>
  room.circulation ||
  isHallway(room) ||
  isVestibule(room) ||
  /^rotunda$/i.test(room.name.trim());
export const isPassThroughPlace = (room: IndoorRecord) =>
  !room.stair && (isVestibule(room) || /^rotunda$/i.test(room.name.trim()));

export function vestibuleDoorIds(data: IndoorDataset): Set<string> {
  const rooms = data.records.filter(isVestibule);
  const keys = new Set(rooms.map((r) => r.key));
  return new Set(
    (data.doors ?? [])
      .filter((door) => {
        if (door.roomKeys.some((key) => keys.has(key))) return true;
        return rooms.some((room) => {
          if (room.levelId !== door.levelId) return false;
          if (
            booleanPointInPolygon(door.pointFeet, {
              type: "Polygon",
              coordinates: room.ringsFeet.map((ring) => [...ring, ring[0]]),
            })
          )
            return true;
          if (!door.footprintFeet) return false;
          const points = room.ringsFeet.flat(),
            footprint = door.footprintFeet;
          if (
            Math.max(...points.map((p) => p[0])) <
              Math.min(...footprint.map((p) => p[0])) ||
            Math.min(...points.map((p) => p[0])) >
              Math.max(...footprint.map((p) => p[0])) ||
            Math.max(...points.map((p) => p[1])) <
              Math.min(...footprint.map((p) => p[1])) ||
            Math.min(...points.map((p) => p[1])) >
              Math.max(...footprint.map((p) => p[1]))
          )
            return false;
          try {
            return (
              polygonClipping.intersection(room.ringsFeet, [footprint]).length >
              0
            );
          } catch {
            return false;
          }
        });
      })
      .map((door) => door.id),
  );
}

/** A broad bounds fallback is not evidence for a solid room-sized wall mass.
 * Narrow legacy wall envelopes keep their existing presentation. */
export function isRoomSizedWallEnvelope(
  wall: IndoorDataset["walls"][number],
): boolean {
  if (!wall.approximate || wall.kind === "column") return false;
  const points = wall.ringsFeet.flat();
  const width =
    Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]));
  const depth =
    Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]));
  return Math.min(width, depth) > 3;
}
