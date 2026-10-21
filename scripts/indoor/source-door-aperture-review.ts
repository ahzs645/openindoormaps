import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  validateReviewedDoorApertures,
  type ReviewedDoorApertures,
} from "../../../reviter/lib/reviter/reviewed-door-apertures.ts";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory.ts";

/** New reviewed apertures for native doors, kept outside the authoring master
 * like the other source reviews. Each patch is the usual reviewed-aperture
 * record: native door, measured aperture, original host wall parts and the
 * door's own native frame members. The compiler then validates every patch
 * against the native model (`withReviewedDoorApertures`) exactly as it does
 * for apertures saved in the master. */
export type SourceDoorApertureReview = {
  format: "source-door-aperture-review-v1";
  id: string;
  sourceModelSha256: string;
  notes: string;
  patches: ReviewedDoorApertures["patches"];
};
export type SourceDoorApertureReceipt = {
  format: "checked-source-door-aperture-review-v1";
  id: string;
  sourceModelSha256: string;
  reviewSha256: string;
  sourceBeforeSha256: string;
  sourceAfterSha256: string;
  appended: { id: string; levelId: number; nativeDoorId: number }[];
  onlyReviewedDoorAperturesChanged: true;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sha = /^[a-f0-9]{64}$/;

/** Append the reviewed apertures to the source annotations. Only native-door
 * apertures are accepted, and only for doors without one: an existing
 * reviewed decision is never replaced from outside the master. */
export function roomsWithCheckedSourceDoorApertures<
  T extends RoomDirectoryData,
>(
  rooms: T,
  review: SourceDoorApertureReview,
  sourceModelSha256: string,
): { rooms: T; receipt: SourceDoorApertureReceipt } {
  assert.equal(
    review?.format,
    "source-door-aperture-review-v1",
    "An explicit source door aperture review is required.",
  );
  assert.ok(
    review.id?.trim() && review.notes?.trim(),
    "Review id and notes are required.",
  );
  assert.match(review.sourceModelSha256, sha, "Invalid source model digest.");
  assert.equal(
    review.sourceModelSha256,
    sourceModelSha256,
    "Door aperture review belongs to a different Revit model.",
  );
  assert.ok(review.patches?.length, "A door aperture review needs patches.");
  for (const patch of review.patches) {
    assert.notEqual(
      patch.kind,
      "dwg-drawn-door",
      `${patch.id}: drawing-backed doors are saved in the master only.`,
    );
    assert.ok(
      Number.isSafeInteger(patch.nativeDoorId),
      `${patch.id}: a native door is required.`,
    );
  }
  const existing = rooms.reviewedDoorApertures;
  if (existing)
    assert.equal(
      existing.sourceModelSha256,
      sourceModelSha256,
      "Saved door apertures belong to a different Revit model.",
    );
  const saved = existing?.patches ?? [];
  for (const patch of review.patches) {
    assert.ok(
      !saved.some((p) => p.id === patch.id),
      `${patch.id}: an aperture with this id is already saved.`,
    );
    assert.ok(
      !saved.some(
        (p) =>
          p.kind !== "dwg-drawn-door" &&
          p.levelId === patch.levelId &&
          p.nativeDoorId === patch.nativeDoorId,
      ),
      `${patch.id}: door ${patch.nativeDoorId} already has a reviewed aperture.`,
    );
  }
  const combined: ReviewedDoorApertures = {
    version: 1,
    sourceModelSha256,
    patches: [...saved, ...structuredClone(review.patches)],
  };
  validateReviewedDoorApertures(combined, sourceModelSha256);
  const before = digest(rooms);
  const next = { ...rooms, reviewedDoorApertures: combined };
  return {
    rooms: next,
    receipt: {
      format: "checked-source-door-aperture-review-v1",
      id: review.id,
      sourceModelSha256,
      reviewSha256: digest(review),
      sourceBeforeSha256: before,
      sourceAfterSha256: digest(next),
      appended: review.patches.map((p) => ({
        id: p.id,
        levelId: p.levelId,
        nativeDoorId: p.nativeDoorId!,
      })),
      onlyReviewedDoorAperturesChanged: true,
    },
  };
}
