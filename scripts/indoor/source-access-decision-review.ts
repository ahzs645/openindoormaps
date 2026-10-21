import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  roomBuilding,
  type RoomDirectoryData,
} from "../../../reviter/lib/reviter/room-directory.ts";

/** One owner-approved access decision for named source areas. Each binding
 * names the exact original key, level, building, number and name (as the
 * compiled record derives them), so a renumbered or regenerated area refuses
 * instead of silently gaining access. */
export type SourceAccessDecisionReview = {
  format: "source-access-decision-review-v1";
  id: string;
  sourceModelSha256: string;
  access: "public";
  notes: string;
  decision: { path: string; sha256: string; id: string };
  /** The reviewed staff zone that this decision depends on. */
  requiredAccessZoneId: string;
  bindings: {
    reviewLabel: string;
    key: string;
    levelId: number;
    building: string;
    number: string;
    name: string;
  }[];
};
export type SourceAccessDecisionReceipt = {
  format: "checked-source-access-decision-v1";
  id: string;
  sourceModelSha256: string;
  reviewSha256: string;
  sourceBeforeSha256: string;
  sourceAfterSha256: string;
  requiredAccessZoneId: string;
  changed: string[];
  alreadyApplied: string[];
  onlyAnnotationAccessChanged: true;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sha = /^[a-f0-9]{64}$/;

/** Apply the decision to source annotations before compilation. The compiler
 * then derives records, policies and the existing access-zone carve from these
 * annotations as usual. Staff, void, zone-member or conflicting areas refuse. */
export function roomsWithCheckedSourceAccessDecision<
  T extends RoomDirectoryData,
>(
  rooms: T,
  review: SourceAccessDecisionReview,
  sourceModelSha256: string,
): { rooms: T; receipt: SourceAccessDecisionReceipt } {
  assert.equal(
    review?.format,
    "source-access-decision-review-v1",
    "An explicit source access decision is required.",
  );
  assert.equal(review.access, "public", "Only public decisions are supported.");
  assert.ok(
    review.id?.trim() && review.notes?.trim(),
    "Decision id and notes are required.",
  );
  assert.match(
    review.decision?.sha256 ?? "",
    sha,
    "Invalid decision record digest.",
  );
  assert.match(review.sourceModelSha256, sha, "Invalid source model digest.");
  assert.equal(
    review.sourceModelSha256,
    sourceModelSha256,
    "Access decision belongs to a different Revit model.",
  );
  assert.ok(review.bindings?.length, "An access decision needs bound areas.");
  const keys = review.bindings.map((binding) => binding.key);
  assert.equal(
    new Set(keys).size,
    keys.length,
    "Duplicate access decision area.",
  );
  const labels = review.bindings.map((binding) => binding.reviewLabel);
  assert.equal(new Set(labels).size, labels.length, "Duplicate review label.");

  const zones = rooms.nativeAccessZones;
  assert.equal(
    zones?.sourceModelSha256,
    sourceModelSha256,
    "The required reviewed access zone is missing for this model.",
  );
  const zone = zones!.zones.find((z) => z.id === review.requiredAccessZoneId);
  assert.ok(
    zone,
    `Required access zone ${review.requiredAccessZoneId} is missing.`,
  );
  const zoneMembers = new Set([
    ...zone.memberRoomKeys,
    ...(zone.staffCirculationRoomKeys ?? []),
  ]);

  const before = digest(rooms);
  const annotations = structuredClone(rooms.annotations);
  const changed: string[] = [],
    alreadyApplied: string[] = [];
  for (const binding of review.bindings) {
    const matches = annotations.filter((room) => room.key === binding.key);
    assert.equal(
      matches.length,
      1,
      `Area ${binding.key} is missing or duplicated.`,
    );
    const room = matches[0]!;
    assert.notEqual(room.status, "deleted", `Area ${binding.key} was deleted.`);
    assert.equal(
      room.levelId,
      binding.levelId,
      `Area ${binding.key} moved level.`,
    );
    assert.equal(
      roomBuilding(room),
      binding.building,
      `Area ${binding.key} changed building.`,
    );
    assert.equal(
      room.number ?? "",
      binding.number,
      `Area ${binding.key} was renumbered.`,
    );
    assert.equal(
      room.name ?? "Unnamed area",
      binding.name,
      `Area ${binding.key} was renamed.`,
    );
    assert.notEqual(
      room.walkability,
      "void",
      `Area ${binding.key} is not walkable.`,
    );
    assert.ok(
      !zoneMembers.has(room.key),
      `Area ${binding.key} belongs to the reviewed staff zone.`,
    );
    if (room.access?.kind === "public") {
      alreadyApplied.push(room.key);
      continue;
    }
    assert.equal(
      room.access,
      undefined,
      `Area ${binding.key} already has a different reviewed access.`,
    );
    room.access = {
      kind: "public",
      evidence: "user-reported",
      notes: review.notes,
    };
    changed.push(room.key);
  }
  const next = { ...rooms, annotations };
  assert.equal(digest(rooms), before, "Source input was mutated.");
  const receipt: SourceAccessDecisionReceipt = {
    format: "checked-source-access-decision-v1",
    id: review.id,
    sourceModelSha256,
    reviewSha256: digest(review),
    sourceBeforeSha256: before,
    sourceAfterSha256: digest(next),
    requiredAccessZoneId: zone.id,
    changed,
    alreadyApplied,
    onlyAnnotationAccessChanged: true,
  };
  return { rooms: next, receipt };
}
