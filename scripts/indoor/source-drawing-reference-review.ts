import assert from "node:assert/strict";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import {
  validateReviewedDrawingReferences,
  type ReviewedDrawingReferences,
} from "../../../reviter/lib/reviter/reviewed-drawing-references";

/** Attach only an existing owner-reviewed, model-bound original import census.
 * The compiler independently replays its original source facts before use.
 * A new decision cannot silently replace a different saved review. */
export function roomsWithDrawingReferenceReview<T extends RoomDirectoryData>(
  rooms: T,
  review: ReviewedDrawingReferences,
  sourceModelSha256: string,
): T & { reviewedDrawingReferences: ReviewedDrawingReferences } {
  validateReviewedDrawingReferences(review, sourceModelSha256);
  if (rooms.reviewedDrawingReferences)
    assert.deepEqual(
      rooms.reviewedDrawingReferences,
      review,
      "Drawing-reference review conflicts with the preserved source review.",
    );
  return { ...rooms, reviewedDrawingReferences: structuredClone(review) };
}
