import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import {
  roomsWithCheckedSourceDoorApertures,
  type SourceDoorApertureReview,
} from "../../scripts/indoor/source-door-aperture-review";

const review: SourceDoorApertureReview = JSON.parse(
  readFileSync(
    new URL(
      "../../docs/continuation/unbc-20261021/link-doors/DOOR-APERTURE-REVIEW.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const model = review.sourceModelSha256;
const rooms = (patches: SourceDoorApertureReview["patches"] = []) =>
  ({
    format: "reviter-room-annotations",
    version: 1,
    annotations: [],
    reviewedDoorApertures: { version: 1, sourceModelSha256: model, patches },
  }) as unknown as RoomDirectoryData;

test("the link-door review appends both apertures and changes nothing else", () => {
  const before = rooms();
  const snapshot = JSON.stringify(before);
  const { rooms: after, receipt } = roomsWithCheckedSourceDoorApertures(
    before,
    review,
    model,
  );
  assert.equal(JSON.stringify(before), snapshot, "input is not mutated");
  assert.deepEqual(
    receipt.appended.map((p) => [p.levelId, p.nativeDoorId]),
    [
      [694, 2_311_764],
      [400_176, 2_315_416],
    ],
  );
  assert.equal(after.reviewedDoorApertures!.patches.length, 2);
  assert.deepEqual(
    { ...after, reviewedDoorApertures: undefined },
    {
      ...before,
      reviewedDoorApertures: undefined,
    },
  );
  // Each follows the curtain-door precedent: four native frame members and a
  // through-host depth equal to the host's persisted 3.2808 ft thickness.
  for (const p of review.patches) {
    assert.equal(p.frameEvidence.length, 4);
    const across = p.apertureFeet.map(
      (q) => q[0] * p.normalFeet[0] + q[1] * p.normalFeet[1],
    );
    assert.ok(
      Math.abs(Math.max(...across) - Math.min(...across) - 3.2808) < 1e-3,
    );
  }
});

test("a review for another model, an already reviewed door or a drawing-backed door is refused", () => {
  assert.throws(
    () => roomsWithCheckedSourceDoorApertures(rooms(), review, "f".repeat(64)),
    /different Revit model/,
  );
  assert.throws(
    () =>
      roomsWithCheckedSourceDoorApertures(
        rooms([{ ...review.patches[0]!, id: "saved-earlier" }]),
        review,
        model,
      ),
    /already has a reviewed aperture/,
  );
  assert.throws(
    () =>
      roomsWithCheckedSourceDoorApertures(
        rooms(),
        {
          ...review,
          patches: [{ ...review.patches[0]!, kind: "dwg-drawn-door" }],
        } as SourceDoorApertureReview,
        model,
      ),
    /drawing-backed/,
  );
  assert.throws(
    () =>
      roomsWithCheckedSourceDoorApertures(
        rooms(),
        { ...review, patches: [{ ...review.patches[0]!, frameEvidence: [] }] },
        model,
      ),
    /Invalid reviewed native door aperture/,
  );
});
