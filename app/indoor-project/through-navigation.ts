import type { IndoorRecord } from "./contract";

export const throughNavigationGeometryKey = (
  modelSha256: string,
  room: IndoorRecord,
) => JSON.stringify([modelSha256, room.key, room.levelId, room.ringsFeet]);

/** A geometry-bound passage review changes corridor preference, preserving source type and access rules. */
export function hasReviewedThroughNavigation(
  room: IndoorRecord,
  modelSha256: string,
) {
  const review = room.properties.throughNavigationReview as
    | { geometryKey?: string; notes?: string }
    | undefined;
  return (
    !!review &&
    typeof review.notes === "string" &&
    !!review.notes.trim() &&
    review.geometryKey === throughNavigationGeometryKey(modelSha256, room)
  );
}
