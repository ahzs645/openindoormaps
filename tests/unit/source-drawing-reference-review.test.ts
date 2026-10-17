import test from "node:test";
import assert from "node:assert/strict";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import {
  reviewedDrawingReferencesHash,
  type ReviewedDrawingReferences,
} from "../../../reviter/lib/reviter/reviewed-drawing-references";
import { roomsWithDrawingReferenceReview } from "../../scripts/indoor/source-drawing-reference-review";

function review(): ReviewedDrawingReferences {
  const value = {
    version: 1 as const,
    sourceModelSha256: "a".repeat(64),
    sourceInventorySha256: "b".repeat(64),
    decisionEvidenceSha256: "c".repeat(64),
    instances: [
      {
        nativeElementId: 10,
        nativeUniqueId: "12345678-1234-1234-1234-123456789abc-0000000a",
        sourceFactSha256: "d".repeat(64),
        sourceName: "Original floor drawing.DWG",
        classification: "drawing-reference" as const,
      },
    ],
  };
  return { ...value, geometrySha256: reviewedDrawingReferencesHash(value) };
}
test("source review application preserves all room geometry, access and other authoring fields", () => {
  const rooms = {
    annotations: [
      {
        key: "room",
        polygonFeet: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        access: { kind: "staff" },
      },
    ],
    georeference: { points: [{ modelFeet: [0, 0, 0], geographic: [1, 2] }] },
    reviewBundle: { retained: "opaque original companion" },
  } as unknown as RoomDirectoryData;
  const original = JSON.stringify(rooms),
    input = review();
  const next = roomsWithDrawingReferenceReview(
    rooms,
    input,
    input.sourceModelSha256,
  );
  assert.equal(JSON.stringify(rooms), original);
  assert.equal(next.annotations, rooms.annotations);
  assert.equal(next.georeference, rooms.georeference);
  assert.equal(next.reviewBundle, rooms.reviewBundle);
  assert.deepEqual(next.reviewedDrawingReferences, input);
  input.instances[0].sourceName = "edited after application";
  assert.notEqual(
    next.reviewedDrawingReferences?.instances[0].sourceName,
    input.instances[0].sourceName,
  );
});
test("source review rejects another model, tampered facts or a conflicting preserved decision", () => {
  const rooms = {} as RoomDirectoryData,
    input = review();
  assert.throws(() =>
    roomsWithDrawingReferenceReview(rooms, input, "e".repeat(64)),
  );
  const tampered = structuredClone(input);
  tampered.instances[0].nativeElementId = 11;
  assert.throws(() =>
    roomsWithDrawingReferenceReview(rooms, tampered, input.sourceModelSha256),
  );
  const changed = structuredClone(input);
  changed.decisionEvidenceSha256 = "e".repeat(64);
  changed.geometrySha256 = reviewedDrawingReferencesHash(changed);
  assert.throws(
    () =>
      roomsWithDrawingReferenceReview(
        { ...rooms, reviewedDrawingReferences: input },
        changed,
        input.sourceModelSha256,
      ),
    /conflicts/,
  );
  assert.deepEqual(
    roomsWithDrawingReferenceReview(
      { ...rooms, reviewedDrawingReferences: input },
      input,
      input.sourceModelSha256,
    ).reviewedDrawingReferences,
    input,
  );
});
