import assert from "node:assert/strict";
import test from "node:test";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import type { NativeDoorBoundaryClosures } from "../../../reviter/lib/reviter/native-door-boundary-closures";
import {
  sourceDoorBoundaryClosureDigest as sha,
  sourceDoorBoundaryClosureEntryEvidenceSha256,
  sourceDoorBoundaryClosureReviewRecords,
  reverseSourceDoorBoundaryClosureReview,
  verifySourceDoorBoundaryClosureReviewDelta,
  type SourceDoorBoundaryClosureReview,
  type SourceDoorBoundaryClosureReviewReceipt,
  type SourceDoorBoundaryClosurePortableEvidence,
} from "../../scripts/indoor/source-door-boundary-closure-review";

/** Structural fixture only. No source, original-body or route authority. */
function fixture() {
  const binding = {
    sourceModelSha256: "a".repeat(64),
    originalSourceRoomsSha256: "b".repeat(64),
    nativeCacheSha256: "c".repeat(64),
  };
  const row: NativeDoorBoundaryClosures["doors"][number] = {
    id: "original-one",
    levelId: 1,
    nativeElementId: 11,
    originalDoor: {
      pointFeet: [0.5, 1],
      normalFeet: [1, 0],
      footprintFeet: [
        [0, 0],
        [1, 0],
        [1, 2],
        [0, 2],
      ],
      roomKeys: ["one", "two"],
    },
    footprintFeet: [
      [0, -0.1],
      [1, -0.1],
      [1, 2.1],
      [0, 2.1],
    ],
    jambEvidence: [
      {
        nativeElementId: 21,
        ringsFeet: [
          [
            [0, -0.2],
            [1, -0.2],
            [1, 0],
            [0, 0],
          ],
        ],
      },
      {
        nativeElementId: 22,
        ringsFeet: [
          [
            [0, 2],
            [1, 2],
            [1, 2.2],
            [0, 2.2],
          ],
        ],
      },
    ],
    evidenceSha256: "d".repeat(64),
    notes: "Preserve the exact original human review and measured threshold.",
  };
  const held = {
    ...structuredClone(row),
    id: "original-two",
    nativeElementId: 12,
  };
  const before = {
    annotations: [
      {
        key: "one",
        polygonFeet: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        access: { kind: "staff" },
      },
    ],
    navigation: { oldGraph: "unchanged" },
    nativeDoorBoundaryClosures: {
      version: 1,
      sourceModelSha256: binding.sourceModelSha256,
      doors: [row, held],
    },
  } as unknown as RoomDirectoryData;
  const replacement = {
    ...structuredClone(row),
    id: "reviewed-one",
    notes:
      "New current original-column evidence; old review remains retained above.",
  };
  replacement.jambEvidence[0] = {
    ...replacement.jambEvidence[0]!,
    sourceNativeColumnProfile: true,
  } as (typeof replacement.jambEvidence)[number];
  const review: SourceDoorBoundaryClosureReview = {
    format: "source-door-boundary-closure-review-v1",
    sourceModelSha256: binding.sourceModelSha256,
    sourceRoomsSha256: binding.originalSourceRoomsSha256,
    nativeCacheSha256: binding.nativeCacheSha256,
    sourceBeforeSha256: sha(before),
    descriptorBeforeSha256: sha(before.nativeDoorBoundaryClosures),
    currentPreparedSnapshotSha256: "e".repeat(64),
    currentPreparedSnapshot: {
      path: "/immutable/source-only-fixture.bin",
      sha256: "e".repeat(64),
      bytes: 123,
    },
    entries: [
      {
        oldId: row.id,
        oldRecordSha256: sha(row),
        reviewState: "superseded",
        reason: "Current complete native column is explicitly reviewed.",
        replacement,
      },
      {
        oldId: held.id,
        oldRecordSha256: sha(held),
        reviewState: "held",
        reason: "Existing physical guard remains unresolved.",
      },
    ],
  };
  replacement.evidenceSha256 = sourceDoorBoundaryClosureEntryEvidenceSha256(
    review,
    review.entries[0]!,
  );
  const records = sourceDoorBoundaryClosureReviewRecords(
    before,
    review,
    binding,
  );
  const portable: SourceDoorBoundaryClosurePortableEvidence = {
    format: "source-door-boundary-closure-review-evidence-v1" as const,
    sourceModelSha256: binding.sourceModelSha256,
    reviewSha256: sha(review),
    review,
    partitionTransitions: [],
  };
  const after = {
    ...before,
    nativeDoorBoundaryClosures: records.descriptor,
    nativeDoorBoundaryClosureReviewHistory: [portable],
  };
  const receipt: SourceDoorBoundaryClosureReviewReceipt = {
    format: "checked-source-door-boundary-closure-review-v1",
    ...binding,
    sourceBeforeSha256: sha(before),
    sourceAfterSha256: sha(after),
    descriptorBeforeSha256: sha(before.nativeDoorBoundaryClosures),
    descriptorAfterSha256: sha(records.descriptor),
    reviewSha256: sha(review),
    originalRecords: records.originalRecords,
    retainedRecords: records.retainedRecords,
    appendedRecords: records.appendedRecords,
    portableEvidence: {
      priorCount: 0,
      afterCount: 1,
      appendedRecord: portable,
    },
    partitionEvidence: {
      descriptorBefore: before.reviewedAreaPartitions,
      descriptorAfter: after.reviewedAreaPartitions,
      transitions: [],
      total: 0,
      closureChangedWindows: 0,
      preexistingStale: [],
    },
    physicalGuardsWaived: false,
    physical: {
      currentPreparedSnapshotSha256: review.currentPreparedSnapshotSha256,
      currentWallsSha256: "f".repeat(64),
      currentDoorsSha256: "f".repeat(64),
      currentWalkingSupportSha256: "f".repeat(64),
      currentEdgesSha256: "f".repeat(64),
      currentFixturesSha256: "f".repeat(64),
      allActiveClosuresReplayed: true,
      activeBefore: 2,
      activeAfter: 1,
      reviewedPhase: "before-native-circulation-and-landings",
      freshFinalFixtureAndClosureReplayRequired: true,
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
  return { before, after, review, receipt, binding };
}
const verify = (f: ReturnType<typeof fixture>) =>
  verifySourceDoorBoundaryClosureReviewDelta(
    f.before,
    f.after,
    f.binding,
    f.review,
    f.receipt,
  );
test("exact ordered history retention, explicit hold and one reviewed append reverse losslessly", () => {
  const f = fixture(),
    original = JSON.stringify(f),
    result = verify(f);
  assert.equal(result.originalRows, 2);
  assert.equal(result.appendedActiveRows, 1);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
  assert.deepEqual(
    reverseSourceDoorBoundaryClosureReview(f.after, f.review, f.receipt),
    f.before,
  );
  assert.equal(JSON.stringify(f), original);
});
test("historical geometry, notes, IDs/order and unrelated room/access/navigation edits refuse even after receipt rehash", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.after.nativeDoorBoundaryClosures!.doors[0]!.notes += " rewritten";
    },
    (f: ReturnType<typeof fixture>) => {
      f.after.nativeDoorBoundaryClosures!.doors[0]!.footprintFeet[0]![0] += 1e-12;
    },
    (f: ReturnType<typeof fixture>) => {
      f.after.nativeDoorBoundaryClosures!.doors.reverse();
    },
    (f: ReturnType<typeof fixture>) => {
      f.after.annotations[0]!.access = {
        kind: "public",
        evidence: "user-reported",
      };
    },
    (f: ReturnType<typeof fixture>) => {
      f.after.navigation = {} as never;
    },
    (f: ReturnType<typeof fixture>) => {
      f.after.nativeDoorBoundaryClosures!.doors.push({
        ...f.after.nativeDoorBoundaryClosures!.doors[2]!,
        id: "extra",
      });
    },
  ]) {
    const f = fixture();
    f.after = structuredClone(f.after);
    change(f);
    f.receipt.sourceAfterSha256 = sha(f.after);
    f.receipt.descriptorAfterSha256 = sha(f.after.nativeDoorBoundaryClosures);
    assert.throws(() => verify(f));
  }
});
test("wrong current source/archive/cache/snapshot identities refuse without a fallback to old hashes", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.binding.nativeCacheSha256 = "0".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.sourceBeforeSha256 = f.review.sourceRoomsSha256;
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.currentPreparedSnapshot.sha256 = "0".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.descriptorBeforeSha256 = "0".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.entries[0]!.oldRecordSha256 = "0".repeat(64);
    },
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() => verify(f));
  }
});
test("replacement cannot change source ownership, checked limit, native jamb identity or normal depth", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.review.entries[0]!.replacement!.originalDoor.roomKeys.reverse();
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.entries[0]!.replacement!.measuredTangentLimitFeet = 0.2;
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.entries[0]!.replacement!.jambEvidence[0]!.nativeElementId = 999;
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.entries[0]!.replacement!.footprintFeet[0]![0] -= 1e-5;
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.entries[0]!.replacement!.originalDoor.pointFeet[0] += 1e-5;
    },
  ]) {
    const f = fixture();
    change(f);
    const e = f.review.entries[0]!;
    e.replacement!.evidenceSha256 =
      sourceDoorBoundaryClosureEntryEvidenceSha256(f.review, e);
    assert.throws(() =>
      sourceDoorBoundaryClosureReviewRecords(f.before, f.review, f.binding),
    );
  }
});
test("inactive resurrection, out-of-order reviews, duplicate IDs, forged replacement evidence and waived guards refuse", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.review.entries.reverse();
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.entries[0]!.replacement!.id = f.review.entries[0]!.oldId;
    },
    (f: ReturnType<typeof fixture>) => {
      f.review.entries[0]!.replacement!.evidenceSha256 = "0".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.physicalGuardsWaived = true as never;
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.physical.allActiveClosuresReplayed = false as never;
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.physicalOrNavigationApprovalGranted = true as never;
    },
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() => verify(f));
  }
  const f = fixture();
  f.before.nativeDoorBoundaryClosures!.doors[0]!.reviewState = "held";
  f.review.sourceBeforeSha256 = sha(f.before);
  f.review.descriptorBeforeSha256 = sha(f.before.nativeDoorBoundaryClosures);
  f.review.entries[0]!.oldRecordSha256 = sha(
    f.before.nativeDoorBoundaryClosures!.doors[0],
  );
  assert.throws(() =>
    sourceDoorBoundaryClosureReviewRecords(f.before, f.review, f.binding),
  );
});
test("prelanding source family cannot rebind partitions, invent evidence history or silently drop prior provenance", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.after.reviewedAreaPartitions = {
        version: 1,
        sourceModelSha256: f.binding.sourceModelSha256,
        partitions: [],
      };
    },
    (f: ReturnType<typeof fixture>) => {
      f.after.nativeDoorBoundaryClosureReviewHistory = [];
    },
    (f: ReturnType<typeof fixture>) => {
      (f.after.nativeDoorBoundaryClosureReviewHistory as unknown[]).push({
        forged: true,
      });
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.portableEvidence.appendedRecord.partitionTransitions.push(
        {} as never,
      );
    },
  ]) {
    const f = fixture();
    f.after = structuredClone(f.after);
    change(f);
    f.receipt.sourceAfterSha256 = sha(f.after);
    f.receipt.partitionEvidence.descriptorAfter =
      f.after.reviewedAreaPartitions;
    assert.throws(() => verify(f));
  }
});

test("a previously retained review is preserved exactly through a later checked append and reversal", () => {
  const f = fixture();
  const prior = structuredClone(f.receipt.portableEvidence.appendedRecord);
  f.before = {
    ...f.before,
    nativeDoorBoundaryClosureReviewHistory: [prior],
  };
  f.review.sourceBeforeSha256 = sha(f.before);
  const records = sourceDoorBoundaryClosureReviewRecords(
    f.before,
    f.review,
    f.binding,
  );
  const appended = {
    ...f.receipt.portableEvidence.appendedRecord,
    review: structuredClone(f.review),
    reviewSha256: sha(f.review),
  };
  f.after = {
    ...f.before,
    nativeDoorBoundaryClosures: records.descriptor,
    nativeDoorBoundaryClosureReviewHistory: [prior, appended],
  };
  f.receipt = {
    ...f.receipt,
    sourceBeforeSha256: sha(f.before),
    sourceAfterSha256: sha(f.after),
    reviewSha256: sha(f.review),
    portableEvidence: {
      priorCount: 1,
      afterCount: 2,
      appendedRecord: appended,
    },
  };
  assert.equal(verify(f).physicalOrNavigationApprovalGranted, false);
  assert.deepEqual(
    reverseSourceDoorBoundaryClosureReview(f.after, f.review, f.receipt),
    f.before,
  );
  assert.deepEqual(
    (f.after.nativeDoorBoundaryClosureReviewHistory as unknown[])[0],
    prior,
  );
});
