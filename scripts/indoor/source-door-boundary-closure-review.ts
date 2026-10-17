/** Checked authoring/display review only. Original door geometry, graph policy
 * and access remain independent; a saved review never grants route authority. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { deserialize } from "node:v8";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import type { IndoorDataset } from "../../../reviter/lib/reviter/indoor-contract";
import type { ConvertResult } from "../../../reviter/lib/reviter/types";
import {
  activeNativeDoorBoundaryClosures,
  closedBoundaryDoors,
  validateNativeDoorBoundaryClosures,
  type NativeDoorBoundaryClosures,
} from "../../../reviter/lib/reviter/native-door-boundary-closures";
import { architecturalPlanGeometry } from "../../../reviter/lib/reviter/architectural-plan";
import { directoryDoors } from "../../../reviter/lib/reviter/directory-navigation";
import { nativeWallPositionRepairedWalls } from "../../../reviter/lib/reviter/native-wall-position-repairs";
import {
  nativeFloorPolygons,
  routingFloorPlateRecords,
} from "../../../reviter/lib/reviter/routing-floor-support";
import { withReviewedDoorApertures } from "../../../reviter/lib/reviter/reviewed-door-apertures";
import {
  reviewedAreaPartitionEvidenceStatuses,
  reviewedAreaPartitionLocalEvidence,
  type ReviewedAreaPartitions,
  type ReviewedAreaPartition,
} from "../../../reviter/lib/reviter/reviewed-area-partitions";

export const sourceDoorBoundaryClosureDigest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex");
const sha = sourceDoorBoundaryClosureDigest;
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
type Closure = NativeDoorBoundaryClosures["doors"][number];
export type SourceDoorBoundaryClosureReview = {
  format: "source-door-boundary-closure-review-v1";
  sourceModelSha256: string;
  /** Original packed archive rooms, distinct from the hydrated current input. */
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
  /** Exact current input, AFTER drawing-floor and native-boundary reviews. */
  sourceBeforeSha256: string;
  descriptorBeforeSha256: string;
  currentPreparedSnapshotSha256: string;
  currentPreparedSnapshot: { path: string; sha256: string; bytes: number };
  entries: {
    oldId: string;
    oldRecordSha256: string;
    reviewState: "held" | "superseded";
    reason: string;
    replacement?: Closure;
  }[];
};
export type SourceDoorBoundaryClosureBinding = {
  sourceModelSha256: string;
  originalSourceRoomsSha256: string;
  nativeCacheSha256: string;
};
type PartitionTransition = {
  id: string;
  before: ReviewedAreaPartition;
  after: ReviewedAreaPartition;
  beforeEvidenceTest: string;
  afterEvidenceSha256: string;
  closureChangeAffectsWindow: boolean;
  errors: string[];
  nativeFloorIds: number[];
  action: "rebind" | "restore";
};
export type SourceDoorBoundaryClosurePortableEvidence = {
  format: "source-door-boundary-closure-review-evidence-v1";
  sourceModelSha256: string;
  reviewSha256: string;
  review: SourceDoorBoundaryClosureReview;
  partitionTransitions: PartitionTransition[];
};
export type SourceDoorBoundaryClosureReviewReceipt = {
  format: "checked-source-door-boundary-closure-review-v1";
  sourceModelSha256: string;
  originalSourceRoomsSha256: string;
  nativeCacheSha256: string;
  sourceBeforeSha256: string;
  sourceAfterSha256: string;
  descriptorBeforeSha256: string;
  descriptorAfterSha256: string;
  reviewSha256: string;
  originalRecords: Closure[];
  retainedRecords: Closure[];
  appendedRecords: Closure[];
  portableEvidence: {
    priorCount: number;
    afterCount: number;
    appendedRecord: SourceDoorBoundaryClosurePortableEvidence;
  };
  partitionEvidence: {
    descriptorBefore?: ReviewedAreaPartitions;
    descriptorAfter?: ReviewedAreaPartitions;
    transitions: PartitionTransition[];
    total: number;
    closureChangedWindows: number;
    preexistingStale: string[];
  };
  physicalGuardsWaived: false;
  physical: {
    currentPreparedSnapshotSha256: string;
    currentWallsSha256: string;
    currentDoorsSha256: string;
    currentWalkingSupportSha256: string;
    currentEdgesSha256: string;
    currentFixturesSha256: string;
    reviewedPhase: "before-native-circulation-and-landings";
    freshFinalFixtureAndClosureReplayRequired: true;
    allActiveClosuresReplayed: true;
    activeBefore: number;
    activeAfter: number;
    originalSourceDoorAndJambsReconstructed: true;
  };
  sourcePreservation: {
    originalRowsRetainedInOrder: true;
    onlyEnumeratedStatesAndOrderedAppendsChanged: true;
    unrelatedGeometryAndAccessUnchanged: true;
    originalInputMutated: false;
  };
  physicalOrNavigationApprovalGranted: false;
  freshRegeneratedCandidateValidationRequired: true;
};

/** A review evidence hash binds the complete replacement, including current
 * original jamb rings. It does not replace their source replay. */
export function sourceDoorBoundaryClosureEntryEvidenceSha256(
  review: Pick<
    SourceDoorBoundaryClosureReview,
    "sourceModelSha256" | "currentPreparedSnapshotSha256"
  >,
  entry: SourceDoorBoundaryClosureReview["entries"][number],
) {
  assert(entry.replacement);
  const { evidenceSha256: _excluded, ...replacement } = entry.replacement;
  return sha({
    format: "source-door-boundary-closure-entry-evidence-v1",
    sourceModelSha256: review.sourceModelSha256,
    currentPreparedSnapshotSha256: review.currentPreparedSnapshotSha256,
    oldId: entry.oldId,
    oldRecordSha256: entry.oldRecordSha256,
    replacement,
  });
}

function checkReview(
  review: SourceDoorBoundaryClosureReview,
  binding: SourceDoorBoundaryClosureBinding,
) {
  assert.equal(review?.format, "source-door-boundary-closure-review-v1");
  assert(
    Object.values(binding).every(digest),
    "Invalid source review identities",
  );
  assert.equal(review.sourceModelSha256, binding.sourceModelSha256);
  assert.equal(review.sourceRoomsSha256, binding.originalSourceRoomsSha256);
  assert.equal(review.nativeCacheSha256, binding.nativeCacheSha256);
  assert(
    [
      review.sourceBeforeSha256,
      review.descriptorBeforeSha256,
      review.currentPreparedSnapshotSha256,
    ].every(digest),
  );
  assert(
    review.currentPreparedSnapshot &&
      typeof review.currentPreparedSnapshot.path === "string" &&
      review.currentPreparedSnapshot.path.length > 0,
  );
  assert.equal(
    review.currentPreparedSnapshot.sha256,
    review.currentPreparedSnapshotSha256,
  );
  assert(
    Number.isSafeInteger(review.currentPreparedSnapshot.bytes) &&
      review.currentPreparedSnapshot.bytes > 0 &&
      review.currentPreparedSnapshot.bytes < 2 ** 31,
  );
  assert(
    Array.isArray(review.entries) &&
      review.entries.length > 0 &&
      review.entries.length <= 1000,
  );
  assert.equal(
    new Set(review.entries.map((e) => e.oldId)).size,
    review.entries.length,
  );
  for (const entry of review.entries) {
    assert(typeof entry.oldId === "string" && entry.oldId.length > 0);
    assert(digest(entry.oldRecordSha256));
    assert(entry.reviewState === "held" || entry.reviewState === "superseded");
    assert(
      typeof entry.reason === "string" &&
        entry.reason.trim().length > 0 &&
        entry.reason.length <= 10_000,
    );
    assert.equal(
      entry.reviewState === "superseded",
      entry.replacement !== undefined,
      "Only a superseded original has one explicitly reviewed replacement",
    );
  }
}

function priorHistory(
  rooms: RoomDirectoryData,
): SourceDoorBoundaryClosurePortableEvidence[] {
  const history = rooms.nativeDoorBoundaryClosureReviewHistory;
  if (history === undefined) return [];
  assert(
    Array.isArray(history) && history.length <= 1000,
    "Invalid portable source-door review history",
  );
  const hashes = new Set<string>();
  for (const record of history as SourceDoorBoundaryClosurePortableEvidence[]) {
    assert.equal(
      record?.format,
      "source-door-boundary-closure-review-evidence-v1",
    );
    assert(digest(record.sourceModelSha256) && digest(record.reviewSha256));
    assert.equal(record.reviewSha256, sha(record.review));
    assert.equal(record.sourceModelSha256, record.review.sourceModelSha256);
    assert(Array.isArray(record.partitionTransitions));
    assert(
      !hashes.has(record.reviewSha256),
      "Duplicated portable source review",
    );
    hashes.add(record.reviewSha256);
  }
  return history as SourceDoorBoundaryClosurePortableEvidence[];
}

/** Pure structural application. Source/physical guards are deliberately absent
 * here; only the checked async entry point below can produce a replay receipt. */
export function sourceDoorBoundaryClosureReviewRecords(
  rooms: RoomDirectoryData,
  review: SourceDoorBoundaryClosureReview,
  binding: SourceDoorBoundaryClosureBinding,
) {
  checkReview(review, binding);
  assert.equal(
    sha(rooms),
    review.sourceBeforeSha256,
    "Review does not bind the exact current post-floor/post-boundary source",
  );
  validateNativeDoorBoundaryClosures(
    rooms.nativeDoorBoundaryClosures,
    binding.sourceModelSha256,
  );
  const descriptor = rooms.nativeDoorBoundaryClosures;
  assert(descriptor, "Original measured closure descriptor is required");
  assert.equal(
    sha(descriptor),
    review.descriptorBeforeSha256,
    "Original closure descriptor changed",
  );
  assert.equal(
    new Set(descriptor.doors.map((d) => d.id)).size,
    descriptor.doors.length,
  );
  const prior = priorHistory(rooms);
  assert(
    !prior.some((r) => r.reviewSha256 === sha(review)),
    "Review already applied",
  );
  const changed = new Map<string, Closure>(),
    originalRecords: Closure[] = [],
    appendedRecords: Closure[] = [];
  let previousIndex = -1;
  for (const entry of review.entries) {
    const index = descriptor.doors.findIndex((d) => d.id === entry.oldId);
    assert(
      index > previousIndex,
      "Reviews must enumerate unique original rows in their retained source order",
    );
    previousIndex = index;
    const original: Closure = descriptor.doors[index]!;
    assert.equal(
      original.reviewState,
      undefined,
      "Inactive historical closures cannot be resurrected or rewritten",
    );
    assert.equal(
      sha(original),
      entry.oldRecordSha256,
      "Original closure recipe/history changed",
    );
    originalRecords.push(original);
    changed.set(original.id, { ...original, reviewState: entry.reviewState });
    if (!entry.replacement) continue;
    const replacement = entry.replacement;
    assert.equal(
      replacement.reviewState,
      undefined,
      "The replacement must be active",
    );
    assert(
      !descriptor.doors.some((d) => d.id === replacement.id) &&
        !appendedRecords.some((d) => d.id === replacement.id),
      "Replacement identity is not new",
    );
    const {
      id: _oldId,
      footprintFeet: _oldFoot,
      jambEvidence: _oldJambs,
      evidenceSha256: _oldEvidence,
      notes: _oldNotes,
      ...oldRest
    } = original;
    const {
      id: _newId,
      footprintFeet: _newFoot,
      jambEvidence: _newJambs,
      evidenceSha256: _newEvidence,
      notes: _newNotes,
      ...newRest
    } = replacement;
    assert.deepEqual(
      newRest,
      oldRest,
      "Replacement changes original physical door, room ownership, access or checked limits",
    );
    assert.equal(replacement.jambEvidence.length, original.jambEvidence.length);
    for (const [i, jamb] of replacement.jambEvidence.entries()) {
      const old = original.jambEvidence[i]!;
      assert.equal(
        jamb.nativeElementId,
        old.nativeElementId,
        "Named jamb identity/order changed",
      );
      const {
        ringsFeet: _oldRings,
        sourceNativeColumnProfile: _oldProfile,
        ...oldJamb
      } = old;
      const {
        ringsFeet: _newRings,
        sourceNativeColumnProfile: _newProfile,
        ...newJamb
      } = jamb;
      assert.deepEqual(
        newJamb,
        oldJamb,
        "A replacement introduces an unreviewed jamb operand",
      );
      if (sha(jamb) !== sha(old))
        assert.equal(
          jamb.sourceNativeColumnProfile,
          true,
          "Only complete current original column evidence may replace a stale jamb",
        );
    }
    assert.equal(
      replacement.evidenceSha256,
      sourceDoorBoundaryClosureEntryEvidenceSha256(review, entry),
    );
    appendedRecords.push(replacement);
  }
  const retainedRecords = review.entries.map((e) => changed.get(e.oldId)!);
  const after = {
    ...descriptor,
    doors: [
      ...descriptor.doors.map((d) => changed.get(d.id) ?? d),
      ...appendedRecords,
    ],
  };
  validateNativeDoorBoundaryClosures(after, binding.sourceModelSha256);
  return {
    descriptor: after,
    originalRecords,
    retainedRecords,
    appendedRecords,
    priorHistory: prior,
  };
}

/** Reverse only this explicitly scoped source family, retaining all other
 * reviews. Later family delta proofs must see their exact original operands. */
export function reverseSourceDoorBoundaryClosureReview<
  T extends RoomDirectoryData,
>(
  after: T,
  review: SourceDoorBoundaryClosureReview,
  receipt: SourceDoorBoundaryClosureReviewReceipt,
): T {
  assert.equal(
    receipt.format,
    "checked-source-door-boundary-closure-review-v1",
  );
  assert.equal(receipt.reviewSha256, sha(review));
  assert.equal(
    sha(after),
    receipt.sourceAfterSha256,
    "Current source differs from exact closure-review output",
  );
  const current = after.nativeDoorBoundaryClosures;
  assert(current && sha(current) === receipt.descriptorAfterSha256);
  const count = receipt.appendedRecords.length;
  assert.deepEqual(
    current.doors.slice(current.doors.length - count),
    receipt.appendedRecords,
  );
  const original = new Map(receipt.originalRecords.map((r) => [r.id, r]));
  const sourceRows = current.doors.slice(0, current.doors.length - count);
  for (const r of receipt.retainedRecords)
    assert.deepEqual(
      sourceRows.find((d) => d.id === r.id),
      r,
    );
  const previous = {
    ...current,
    doors: sourceRows.map((r) => original.get(r.id) ?? r),
  };
  assert.equal(sha(previous), receipt.descriptorBeforeSha256);
  const history = priorHistory(after);
  assert.equal(history.length, receipt.portableEvidence.afterCount);
  assert.deepEqual(history.at(-1), receipt.portableEvidence.appendedRecord);
  const before: T = { ...after, nativeDoorBoundaryClosures: previous };
  const metadata = before as RoomDirectoryData;
  if (receipt.portableEvidence.priorCount)
    metadata.nativeDoorBoundaryClosureReviewHistory = history.slice(0, -1);
  else delete metadata.nativeDoorBoundaryClosureReviewHistory;
  if (receipt.partitionEvidence.descriptorBefore === undefined)
    delete before.reviewedAreaPartitions;
  else
    before.reviewedAreaPartitions = receipt.partitionEvidence.descriptorBefore;
  assert.equal(
    sha(before),
    receipt.sourceBeforeSha256,
    "Reversal did not reconstruct the exact original source",
  );
  return before;
}

/** Independent metadata scope only; original candidate import and physical
 * replay are still mandatory. Rehashed receipts cannot authorize wider edits. */
export function verifySourceDoorBoundaryClosureReviewDelta(
  before: RoomDirectoryData,
  after: RoomDirectoryData,
  binding: SourceDoorBoundaryClosureBinding,
  review: SourceDoorBoundaryClosureReview,
  receipt: SourceDoorBoundaryClosureReviewReceipt,
) {
  const records = sourceDoorBoundaryClosureReviewRecords(
    before,
    review,
    binding,
  );
  assert.equal(receipt.sourceModelSha256, binding.sourceModelSha256);
  assert.equal(
    receipt.originalSourceRoomsSha256,
    binding.originalSourceRoomsSha256,
  );
  assert.equal(receipt.nativeCacheSha256, binding.nativeCacheSha256);
  assert.equal(receipt.physicalGuardsWaived, false);
  assert.equal(receipt.physicalOrNavigationApprovalGranted, false);
  assert.equal(receipt.freshRegeneratedCandidateValidationRequired, true);
  assert.equal(receipt.sourceBeforeSha256, sha(before));
  assert.equal(receipt.sourceAfterSha256, sha(after));
  assert.deepEqual(after.nativeDoorBoundaryClosures, records.descriptor);
  assert.deepEqual(receipt.originalRecords, records.originalRecords);
  assert.deepEqual(receipt.retainedRecords, records.retainedRecords);
  assert.deepEqual(receipt.appendedRecords, records.appendedRecords);
  assert.deepEqual(
    receipt.partitionEvidence.descriptorBefore,
    before.reviewedAreaPartitions,
  );
  assert.deepEqual(
    receipt.partitionEvidence.descriptorAfter,
    after.reviewedAreaPartitions,
  );
  assert.deepEqual(
    after.reviewedAreaPartitions,
    before.reviewedAreaPartitions,
    "This source family may not rewrite preexisting logical boundary evidence",
  );
  assert.deepEqual(receipt.partitionEvidence.transitions, []);
  assert.deepEqual(receipt.portableEvidence, {
    priorCount: records.priorHistory.length,
    afterCount: records.priorHistory.length + 1,
    appendedRecord: {
      format: "source-door-boundary-closure-review-evidence-v1",
      sourceModelSha256: binding.sourceModelSha256,
      reviewSha256: sha(review),
      review,
      partitionTransitions: [],
    },
  });
  assert.equal(
    receipt.physical.currentPreparedSnapshotSha256,
    review.currentPreparedSnapshotSha256,
  );
  assert.equal(receipt.physical.allActiveClosuresReplayed, true);
  assert.equal(receipt.physical.originalSourceDoorAndJambsReconstructed, true);
  assert.equal(
    receipt.physical.reviewedPhase,
    "before-native-circulation-and-landings",
  );
  assert.equal(
    receipt.physical.freshFinalFixtureAndClosureReplayRequired,
    true,
  );
  for (const key of [
    "currentWallsSha256",
    "currentDoorsSha256",
    "currentWalkingSupportSha256",
    "currentEdgesSha256",
    "currentFixturesSha256",
  ] as const)
    assert(digest(receipt.physical[key]));
  assert.equal(
    receipt.physical.activeBefore,
    activeNativeDoorBoundaryClosures(before.nativeDoorBoundaryClosures).length,
  );
  assert.equal(
    receipt.physical.activeAfter,
    activeNativeDoorBoundaryClosures(after.nativeDoorBoundaryClosures).length,
  );
  assert.deepEqual(receipt.sourcePreservation, {
    originalRowsRetainedInOrder: true,
    onlyEnumeratedStatesAndOrderedAppendsChanged: true,
    unrelatedGeometryAndAccessUnchanged: true,
    originalInputMutated: false,
  });
  assert.deepEqual(
    reverseSourceDoorBoundaryClosureReview(after, review, receipt),
    before,
  );
  return {
    format: "independent-source-door-boundary-closure-review-delta-v1",
    sourceBeforeSha256: sha(before),
    sourceAfterSha256: sha(after),
    originalRows: before.nativeDoorBoundaryClosures!.doors.length,
    retainedReviewedRows: records.retainedRecords.length,
    appendedActiveRows: records.appendedRecords.length,
    exactOriginalHistoryAndUnrelatedSourcePreserved: true,
    physicalOrNavigationApprovalGranted: false,
    freshRegeneratedCandidateValidationRequired: true,
  } as const;
}

/** Reconstruct each original native jamb/door/floor used by the reviewed
 * current prepared snapshot. The snapshot supplies its checked graph phase;
 * its copied jamb rows alone cannot satisfy this source check. */
function verifySnapshotAgainstCurrentNativeSource(
  snapshot: IndoorDataset,
  model: ConvertResult,
  descriptor: NativeDoorBoundaryClosures,
) {
  const nativeLevels = model.levels
    .filter(
      (l) => Number.isSafeInteger(l.levelId) && Number.isFinite(l.elevation),
    )
    .map((l) => ({
      id: l.levelId!,
      name: l.name ?? `Level ${l.levelId}`,
      elevationFeet: l.elevation,
    }));
  assert.deepEqual(
    snapshot.nativeLevels,
    nativeLevels,
    "Prepared snapshot native levels differ from the actual current source",
  );
  const levels = [
    ...new Set(
      activeNativeDoorBoundaryClosures(descriptor).map((d) => d.levelId),
    ),
  ];
  const geometry = new Map(
    levels.map((id) => [id, architecturalPlanGeometry(model, id)]),
  );
  const rawWalls = levels.flatMap((levelId) => {
    const g = geometry.get(levelId)!;
    return [
      ...g.walls.map((w) => ({ ...w, kind: "wall" as const })),
      ...g.columns.map((w) => ({ ...w, kind: "column" as const })),
    ]
      .filter((w) => w.polygon.length >= 3)
      .map((w) => ({
        levelId,
        nativeElementId: w.elementId,
        kind: w.kind,
        approximate: w.approximate,
        ringsFeet: [w.polygon],
      }));
  });
  const currentWalls = nativeWallPositionRepairedWalls(
    { ...snapshot, walls: rawWalls },
    { deferPhysicalChecks: true },
  );
  const nativeDoors = new Map(
    levels.map((levelId) => [levelId, directoryDoors(model, levelId)]),
  );
  const nativeOwners = new Map<number, ConvertResult["elementBounds"]>();
  for (const row of model.elementBounds) {
    const list = nativeOwners.get(row.elementId) ?? [];
    list.push(row);
    nativeOwners.set(row.elementId, list);
  }
  for (const row of activeNativeDoorBoundaryClosures(descriptor)) {
    const currentDoor = nativeDoors
      .get(row.levelId)!
      .filter((d) => d.id === row.nativeElementId);
    assert.equal(
      currentDoor.length,
      1,
      `Original source door #${row.nativeElementId} is ambiguous or missing`,
    );
    const preparedDoor =
      snapshot.doors?.filter(
        (d) =>
          d.levelId === row.levelId &&
          d.nativeElementId === row.nativeElementId,
      ) ?? [];
    assert.equal(
      preparedDoor.length,
      1,
      `Prepared source door #${row.nativeElementId} is ambiguous or missing`,
    );
    assert.deepEqual(
      [
        preparedDoor[0]!.pointFeet,
        preparedDoor[0]!.normalFeet,
        preparedDoor[0]!.footprintFeet,
      ],
      [
        currentDoor[0]!.point,
        currentDoor[0]!.normal,
        currentDoor[0]!.footprint,
      ],
      "Prepared physical door differs from actual native source",
    );
    for (const jamb of row.jambEvidence) {
      const actual = currentWalls.filter(
        (w) =>
          w.levelId === row.levelId &&
          w.nativeElementId === jamb.nativeElementId &&
          !w.approximate,
      );
      const prepared = snapshot.walls.filter(
        (w) =>
          w.levelId === row.levelId &&
          w.nativeElementId === jamb.nativeElementId &&
          !w.approximate &&
          !w.reviewPatchId &&
          (w.kind === "wall" || w.kind === "column"),
      );
      assert(
        actual.length > 0,
        `Actual native jamb #${jamb.nativeElementId} is missing`,
      );
      assert.deepEqual(
        prepared,
        actual,
        "Prepared jamb sections differ from the complete ordered actual source sections",
      );
      assert(
        (nativeOwners.get(jamb.nativeElementId)?.length ?? 0) > 0,
        "Current jamb has no original native owner",
      );
      if (jamb.sourceNativeColumnProfile) {
        assert.equal(
          actual.length,
          1,
          "A reviewed native column profile requires a unique complete current section",
        );
        assert.equal(
          nativeOwners.get(jamb.nativeElementId)?.length,
          1,
          "Reviewed column has no unique original native owner",
        );
        assert.equal(actual[0]!.kind, "column");
        assert.equal(
          nativeOwners.get(jamb.nativeElementId)![0]!.renderGeometryProvenance,
          "native",
          "A complete original native column body is required",
        );
      }
    }
  }
  const currentFloors = new Map(
    [
      ...new Set(
        snapshot.walkingSupport?.floors.map((f) => f.elevationFeet) ?? [],
      ),
    ]
      .flatMap((z) => routingFloorPlateRecords(model, z))
      .map((f) => [f.elementId, f]),
  );
  assert.equal(
    snapshot.walkingSupport?.sourceModelSha256,
    snapshot.source.modelSha256,
  );
  for (const floor of snapshot.walkingSupport!.floors) {
    const current = currentFloors.get(floor.nativeElementId);
    assert(
      current,
      `Original named floor #${floor.nativeElementId} is no longer supported by the current source`,
    );
    const parts = nativeFloorPolygons(
      current,
      !!snapshot.nativeIndoorEnvelopes,
    );
    assert.deepEqual(
      floor,
      {
        nativeElementId: current.elementId,
        elevationFeet: current.boundsFeet.max.z,
        ringsFeet: parts[0]!,
        partsFeet: parts,
      },
      "Prepared walking floor differs from actual current original native geometry",
    );
  }
}

export async function roomsWithCheckedSourceDoorBoundaryClosureReview<
  T extends RoomDirectoryData,
>(
  rooms: T,
  context: IndoorDataset,
  model: ConvertResult,
  options: {
    sourceRoomsSha256: string;
    nativeCacheSha256: string;
    review: SourceDoorBoundaryClosureReview;
  },
): Promise<{ rooms: T; receipt: SourceDoorBoundaryClosureReviewReceipt }> {
  const { review } = options,
    beforeSha256 = sha(rooms),
    binding = {
      sourceModelSha256: context.source.modelSha256,
      originalSourceRoomsSha256: options.sourceRoomsSha256,
      nativeCacheSha256: options.nativeCacheSha256,
    };
  assert.equal(
    context.source.roomsSha256,
    options.sourceRoomsSha256,
    "Original physical context belongs to another archive source",
  );
  const records = sourceDoorBoundaryClosureReviewRecords(
    rooms,
    review,
    binding,
  );
  let bytes: Buffer | undefined = await readFile(
    review.currentPreparedSnapshot.path,
  );
  assert.equal(bytes.length, review.currentPreparedSnapshot.bytes);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    review.currentPreparedSnapshotSha256,
    "Immutable reviewed prepared snapshot changed",
  );
  const snapshot = deserialize(bytes) as IndoorDataset;
  bytes = undefined;
  assert.equal(snapshot?.source?.modelSha256, binding.sourceModelSha256);
  assert.equal(
    snapshot.source.roomsSha256,
    beforeSha256,
    "Prepared snapshot does not bind the exact current post-floor/post-boundary source object",
  );
  assert.equal(
    sha(snapshot.nativeDoorBoundaryClosures),
    review.descriptorBeforeSha256,
  );
  assert.deepEqual(
    snapshot.reviewedAreaPartitions,
    rooms.reviewedAreaPartitions,
  );
  const reviewedModel = withReviewedDoorApertures(
    model,
    rooms.reviewedDoorApertures,
    binding.sourceModelSha256,
    architecturalPlanGeometry,
  );
  verifySnapshotAgainstCurrentNativeSource(
    snapshot,
    reviewedModel,
    records.descriptor,
  );
  const current = {
    ...snapshot,
    nativeDoorBoundaryClosures: records.descriptor,
  };
  // All existing production closure guards are replayed over the complete
  // active descriptor in this actual prepared graph phase. A later regenerated
  // dataset must pass again; this snapshot carries no publication authority.
  for (const levelId of new Set(
    activeNativeDoorBoundaryClosures(records.descriptor).map((d) => d.levelId),
  ))
    closedBoundaryDoors(current, levelId, records.descriptor);
  const partitions = rooms.reviewedAreaPartitions?.partitions ?? [];
  const beforeStatuses = await reviewedAreaPartitionEvidenceStatuses(
    snapshot,
    partitions,
  );
  let changedWindows = 0;
  for (const partition of partitions) {
    const before = await reviewedAreaPartitionLocalEvidence(
      snapshot,
      partition,
    );
    const after = await reviewedAreaPartitionLocalEvidence(current, partition);
    if (before.sha256 !== after.sha256) {
      changedWindows++;
      throw new Error(
        `Door-closure review changes logical boundary ${partition.id}. A complete current compiled evidence/physical review is required; prelanding evidence cannot rebind it.`,
      );
    }
  }
  const portable: SourceDoorBoundaryClosurePortableEvidence = {
    format: "source-door-boundary-closure-review-evidence-v1",
    sourceModelSha256: binding.sourceModelSha256,
    reviewSha256: sha(review),
    review: structuredClone(review),
    partitionTransitions: [],
  };
  const next: T = {
    ...rooms,
    nativeDoorBoundaryClosures: records.descriptor,
    nativeDoorBoundaryClosureReviewHistory: [...records.priorHistory, portable],
  };
  assert.equal(sha(rooms), beforeSha256, "Original source input was mutated");
  const receipt: SourceDoorBoundaryClosureReviewReceipt = {
    format: "checked-source-door-boundary-closure-review-v1",
    ...binding,
    sourceBeforeSha256: beforeSha256,
    sourceAfterSha256: sha(next),
    descriptorBeforeSha256: review.descriptorBeforeSha256,
    descriptorAfterSha256: sha(records.descriptor),
    reviewSha256: sha(review),
    originalRecords: records.originalRecords,
    retainedRecords: records.retainedRecords,
    appendedRecords: records.appendedRecords,
    portableEvidence: {
      priorCount: records.priorHistory.length,
      afterCount: records.priorHistory.length + 1,
      appendedRecord: portable,
    },
    partitionEvidence: {
      descriptorBefore: rooms.reviewedAreaPartitions,
      descriptorAfter: next.reviewedAreaPartitions,
      transitions: [],
      total: partitions.length,
      closureChangedWindows: changedWindows,
      preexistingStale: partitions
        .filter((p) => beforeStatuses[p.id]!.test === "changed")
        .map((p) => p.id),
    },
    physicalGuardsWaived: false,
    physical: {
      currentPreparedSnapshotSha256: review.currentPreparedSnapshotSha256,
      currentWallsSha256: sha(snapshot.walls),
      currentDoorsSha256: sha(snapshot.doors),
      currentWalkingSupportSha256: sha(snapshot.walkingSupport),
      currentEdgesSha256: sha(snapshot.edges),
      currentFixturesSha256: sha(snapshot.circulationGeometry?.fixtures ?? []),
      allActiveClosuresReplayed: true,
      reviewedPhase: "before-native-circulation-and-landings",
      freshFinalFixtureAndClosureReplayRequired: true,
      activeBefore: activeNativeDoorBoundaryClosures(
        rooms.nativeDoorBoundaryClosures,
      ).length,
      activeAfter: activeNativeDoorBoundaryClosures(records.descriptor).length,
      originalSourceDoorAndJambsReconstructed: true,
    },
    sourcePreservation: {
      originalRowsRetainedInOrder: true,
      onlyEnumeratedStatesAndOrderedAppendsChanged: true,
      unrelatedGeometryAndAccessUnchanged: true,
      originalInputMutated: false,
    },
    physicalOrNavigationApprovalGranted: false,
    freshRegeneratedCandidateValidationRequired: true,
  };
  verifySourceDoorBoundaryClosureReviewDelta(
    rooms,
    next,
    binding,
    review,
    receipt,
  );
  return { rooms: next, receipt };
}
