import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  directoryDoorReviews,
  directoryDoors,
  NATIVE_DOOR_OWNER_MAX_GAP_FEET,
  NATIVE_DOOR_SIDE_STEPS_FEET,
} from "../../../reviter/lib/reviter/directory-navigation.ts";
import {
  validateNativeDoorOwnerDecisions,
  type NativeDoorOwnerDecision,
  type NativeDoorOwnerEvidence,
} from "../../../reviter/lib/reviter/reviewed-native-door-owners.ts";
import {
  isWalkable,
  type RoomDirectoryData,
} from "../../../reviter/lib/reviter/room-directory.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";

/** Door-scoped native-cell owner review, kept outside the authoring master
 * like the door aperture and boundary patch reviews.
 *
 * Each listed native door takes its two owner rooms from the native
 * wall-bounded cells on each side of the door, where the registered room
 * outline stops short of the real wall and the ordinary matcher therefore
 * leaves the door unmatched. Every other door is matched exactly as before.
 *
 * The file names the door and the two rooms and nothing else: it carries no
 * tolerance, no geometry and no access decision. The compiler decides each
 * door from the native model (Reviter `reviewed-native-door-owners.ts`) and
 * refuses the whole compile unless the native rule, with its default 2 ft
 * owner gap, finds exactly the two listed rooms. The source rooms are not
 * changed by this review. */
export type SourceNativeDoorOwnerReview = {
  format: "source-native-door-owner-review-v1";
  id: string;
  sourceModelSha256: string;
  notes: string;
  doors: {
    levelId: number;
    nativeDoorId: number;
    roomKeys: [string, string];
    notes: string;
  }[];
};
export type SourceNativeDoorOwnerReceipt = {
  format: "checked-source-native-door-owner-review-v1";
  id: string;
  sourceModelSha256: string;
  /** SHA-256 of the parsed review as JSON, as in the aperture receipt. */
  reviewSha256: string;
  /** SHA-256 of the review file's bytes, when they were supplied. */
  reviewFileSha256?: string;
  /** The reviewed source rooms the compile used; this review leaves them as is. */
  sourceRoomsSha256: string;
  sourceRoomsChanged: false;
  rule: {
    matcher: "native-cell";
    stepsFeet: number[];
    maxOwnerGapFeet: number;
    cells: string;
  };
  doors: {
    levelId: number;
    nativeDoorId: number;
    listedRoomKeys: [string, string];
    notes: string;
    elevationFeet: number;
    doorPointFeet: [number, number];
    doorNormalFeet: [number, number];
    doorFootprintFeet: [number, number][];
    beforeReview: { state: string; candidates: string[] };
    /** Side against the door normal first, then along it. */
    nativeSides: {
      side: "against-normal" | "along-normal";
      cellId: string;
      cellRoomKeys: string[];
      cellBoundsFeet: [number, number, number, number];
      stepFeet: number;
      probeFeet: [number, number];
      owner: string;
      ownerGapFeet: number;
    }[];
    appliedRoomKeys: [string, string];
    portalFromFeet: [number, number];
    portalToFeet: [number, number];
  }[];
  onlyListedDoorsChanged: true;
  accessOrAccessibilityGranted: false;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sha = /^[a-f0-9]{64}$/;
const onlyKeys = (value: object, allowed: string[], what: string) =>
  assert.deepEqual(
    Object.keys(value).filter((k) => !allowed.includes(k)),
    [],
    `${what} has fields this review does not accept.`,
  );

/** Check the review against the reviewed source rooms and the native model,
 * then hand the compiler the listed decisions. Everything that does not need
 * the native plane is refused here, before the compile starts; the native
 * cells exist only inside the compile, which makes the final decision and
 * reports it through `onEvidence`. `receipt()` is available once every listed
 * door has been applied. */
export function checkSourceNativeDoorOwnerReview(
  rooms: RoomDirectoryData,
  review: SourceNativeDoorOwnerReview,
  sourceModelSha256: string,
  model: ConvertResult,
  reviewBytes?: Uint8Array,
): {
  decisions: NativeDoorOwnerDecision[];
  onEvidence: (evidence: NativeDoorOwnerEvidence) => void;
  complete: () => boolean;
  receipt: () => SourceNativeDoorOwnerReceipt;
} {
  assert.equal(
    review?.format,
    "source-native-door-owner-review-v1",
    "An explicit source native door owner review is required.",
  );
  onlyKeys(
    review,
    ["format", "id", "sourceModelSha256", "notes", "doors"],
    "The review",
  );
  assert.ok(
    typeof review.id === "string" &&
      review.id.trim() &&
      typeof review.notes === "string" &&
      review.notes.trim(),
    "Review id and notes are required.",
  );
  assert.match(review.sourceModelSha256, sha, "Invalid source model digest.");
  assert.equal(
    review.sourceModelSha256,
    sourceModelSha256,
    "Native door owner review belongs to a different Revit model.",
  );
  assert.ok(
    Array.isArray(review.doors) && review.doors.length > 0,
    "A native door owner review needs doors.",
  );
  for (const door of review.doors) {
    assert.ok(door && typeof door === "object", "Invalid door row.");
    onlyKeys(
      door,
      ["levelId", "nativeDoorId", "roomKeys", "notes"],
      `Door ${door.nativeDoorId}`,
    );
    assert.ok(
      typeof door.notes === "string" && door.notes.trim(),
      `Door ${door.nativeDoorId}: notes are required.`,
    );
  }
  const decisions = review.doors.map((d) => ({
    levelId: d.levelId,
    nativeDoorId: d.nativeDoorId,
    roomKeys: d.roomKeys,
  }));
  validateNativeDoorOwnerDecisions(decisions);
  const links = rooms.navigation?.doorLinks ?? [];
  const levelDoors = new Map<number, ReturnType<typeof directoryDoors>>();
  for (const d of decisions) {
    const name = `Door ${d.nativeDoorId} on level ${d.levelId}`;
    assert.ok(
      !links.some(
        (l) => l.doorId === d.nativeDoorId && l.levelId === d.levelId,
      ),
      `${name}: a reviewed door link already names this door; explicit reviews keep precedence.`,
    );
    const levelRooms = rooms.annotations.filter(
      (r) => r.levelId === d.levelId && r.status !== "deleted",
    );
    for (const key of d.roomKeys)
      assert.ok(
        levelRooms.some((r) => r.key === key && isWalkable(r)),
        `${name}: room ${key} is not a walkable area on the door's level.`,
      );
    if (!levelDoors.has(d.levelId))
      levelDoors.set(d.levelId, directoryDoors(model, d.levelId));
    const door = levelDoors
      .get(d.levelId)!
      .find((x) => x.id === d.nativeDoorId);
    assert.ok(door, `${name}: no such native door on this level.`);
    assert.ok(
      door.footprint && door.footprint.length >= 3 && door.normal,
      `${name}: the door has no precise footprint and normal.`,
    );
    // Early refusal only. The compile repeats this on the rooms it routes with.
    const legacy = directoryDoorReviews(levelRooms, [door])[0]!;
    assert.ok(
      !legacy.portal,
      `${name}: the legacy matcher already pairs this door (${legacy.portal?.rooms.join(", ")}).`,
    );
  }
  const evidence = new Map<string, NativeDoorOwnerEvidence>();
  const key = (levelId: number, nativeDoorId: number) =>
    `${levelId}:${nativeDoorId}`;
  const complete = () =>
    decisions.every(
      (d) => evidence.get(key(d.levelId, d.nativeDoorId))?.applied === true,
    );
  const sourceRoomsSha256 = digest(rooms);
  return {
    decisions: structuredClone(decisions),
    onEvidence(row) {
      if (!row.listedRoomKeys) return;
      const id = key(row.levelId, row.nativeDoorId);
      assert.ok(
        decisions.some((d) => key(d.levelId, d.nativeDoorId) === id),
        `Door ${row.nativeDoorId} is not in the native door owner review.`,
      );
      assert.ok(
        !evidence.get(id)?.applied,
        `Door ${row.nativeDoorId} was applied more than once.`,
      );
      evidence.set(id, structuredClone(row));
    },
    complete,
    receipt() {
      assert.ok(
        complete(),
        "Every listed door must be applied by the compile before a receipt exists.",
      );
      return {
        format: "checked-source-native-door-owner-review-v1",
        id: review.id,
        sourceModelSha256,
        reviewSha256: digest(review),
        ...(reviewBytes
          ? {
              reviewFileSha256: createHash("sha256")
                .update(reviewBytes)
                .digest("hex"),
            }
          : {}),
        sourceRoomsSha256,
        sourceRoomsChanged: false,
        rule: {
          matcher: "native-cell",
          stepsFeet: [...NATIVE_DOOR_SIDE_STEPS_FEET],
          maxOwnerGapFeet: NATIVE_DOOR_OWNER_MAX_GAP_FEET,
          cells:
            "Exact native free floor of the door's plane minus every door threshold, named by the majority rule; computed in the compile at door matching.",
        },
        doors: review.doors.map((listed) => {
          const row = evidence.get(key(listed.levelId, listed.nativeDoorId))!;
          const name = `Door ${listed.nativeDoorId}`;
          assert.ok(
            row.accepted && row.applied && row.portal,
            `${name}: not applied.`,
          );
          const applied = row.portal.rooms;
          assert.deepEqual(
            [...applied].sort(),
            [...listed.roomKeys].sort(),
            `${name}: applied rooms differ from the listed rooms.`,
          );
          assert.deepEqual(
            [...(row.native?.rooms ?? [])].sort(),
            [...listed.roomKeys].sort(),
            `${name}: native owners differ from the listed rooms.`,
          );
          const sides = row.native!.sides.map((s) => {
            assert.ok(
              s.cellId !== undefined &&
                s.owner !== undefined &&
                s.cellBoundsFeet !== undefined &&
                s.stepFeet !== undefined &&
                s.probeFeet !== undefined &&
                s.ownerGapFeet !== undefined &&
                s.ownerGapFeet >= 0 &&
                s.ownerGapFeet <= NATIVE_DOOR_OWNER_MAX_GAP_FEET,
              `${name}: a native side is undecided or beyond the owner gap.`,
            );
            return {
              side: s.side,
              cellId: s.cellId,
              cellRoomKeys: [...(s.cellRoomKeys ?? [])],
              cellBoundsFeet: s.cellBoundsFeet,
              stepFeet: s.stepFeet,
              probeFeet: s.probeFeet,
              owner: s.owner,
              ownerGapFeet: s.ownerGapFeet,
            };
          });
          assert.equal(
            sides.length,
            2,
            `${name}: two native sides are required.`,
          );
          assert.notEqual(
            sides[0]!.cellId,
            sides[1]!.cellId,
            `${name}: both sides lie in one native cell.`,
          );
          return {
            levelId: listed.levelId,
            nativeDoorId: listed.nativeDoorId,
            listedRoomKeys: listed.roomKeys,
            notes: listed.notes,
            elevationFeet: row.elevationFeet!,
            doorPointFeet: row.door!.pointFeet,
            doorNormalFeet: row.door!.normalFeet!,
            doorFootprintFeet: row.door!.footprintFeet!,
            beforeReview: {
              state: row.ordinary!.state,
              candidates: row.ordinary!.candidates,
            },
            nativeSides: sides,
            appliedRoomKeys: applied,
            portalFromFeet: row.portal.from,
            portalToFeet: row.portal.to,
          };
        }),
        onlyListedDoorsChanged: true,
        accessOrAccessibilityGranted: false,
      };
    },
  };
}
