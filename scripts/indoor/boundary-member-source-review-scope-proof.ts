/** Independent source-metadata delta proof only. The original candidate
 * importer, current source replay and route calculations remain mandatory. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import type {
  NativeBoundaryMemberReview,
  NativeBoundaryMemberReviewReceipt,
} from "./source-native-boundary-member-review";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function verifyBoundaryMemberSourceReviewDelta(
  before: RoomDirectoryData,
  after: RoomDirectoryData,
  binding: { sourceModelSha256: string; originalSourceRoomsSha256: string; nativeCacheSha256: string },
  review: NativeBoundaryMemberReview,
  receipt: NativeBoundaryMemberReviewReceipt,
) {
  assert.equal(review.format, "source-native-boundary-member-supersession-v1");
  assert.equal(receipt.format, "checked-native-boundary-member-review-v1");
  assert(Object.values(binding).every(digest));
  assert.equal(review.sourceModelSha256, binding.sourceModelSha256);
  assert.equal(review.sourceRoomsSha256, binding.originalSourceRoomsSha256);
  assert.equal(review.nativeCacheSha256, binding.nativeCacheSha256);
  for (const id of [review.sourceWallId, review.targetNativeElementId]) assert(Number.isSafeInteger(id) && id > 0);
  assert.notEqual(review.sourceWallId, review.targetNativeElementId);
  assert.equal(receipt.sourceModelSha256, binding.sourceModelSha256);
  assert.equal(receipt.originalSourceRoomsSha256, binding.originalSourceRoomsSha256);
  assert.equal(receipt.nativeCacheSha256, binding.nativeCacheSha256);
  assert.equal(receipt.physicalGuardsWaived, false);
  assert.equal(receipt.sourceBeforeSha256, sha(before));
  assert.equal(receipt.sourceAfterSha256, sha(after));
  assert.equal(receipt.reviewSha256, sha(review));
  assert.equal(before.nativeBoundaryPatches?.version, 1);
  const oldPatches = before.nativeBoundaryPatches!.patches,
    oldMatches = oldPatches.filter(p => p.id === review.oldPatchId);
  assert.equal(oldMatches.length, 1, "Reviewed original patch must occur exactly once");
  assert.equal(new Set(oldPatches.map(p => p.id)).size, oldPatches.length);
  const original = oldMatches[0]!;
  assert.equal(original.status, "applied");
  assert.equal(sha(original), review.oldPatchSha256);
  assert.equal(original.sourceModelSha256, binding.sourceModelSha256);
  const proposed = review.newPatch;
  assert.equal(proposed.status, "proposed", "The reviewed input must remain an unapplied proposal");
  assert.equal(proposed.sourceModelSha256, binding.sourceModelSha256);
  assert.equal(proposed.levelId, original.levelId);
  assert(!oldPatches.some(p => p.id === proposed.id));
  assert(original.continuationProof && proposed.continuationProof);
  assert.equal(original.continuationProof.sourceWallId, review.sourceWallId);
  assert.equal(proposed.continuationProof.sourceWallId, review.sourceWallId);
  assert.deepEqual(proposed.continuationProof.sourceCapFeet, original.continuationProof.sourceCapFeet);
  const oldSource = original.wallEvidence.filter(w => w.nativeElementId === review.sourceWallId),
    newSource = proposed.wallEvidence.filter(w => w.nativeElementId === review.sourceWallId),
    newTargets = proposed.wallEvidence.filter(w => w.nativeElementId !== review.sourceWallId);
  assert.equal(oldSource.length, 1);
  assert.equal(newSource.length, 1);
  assert.deepEqual(newSource, oldSource);
  assert.equal(newTargets.length, 1);
  assert.equal(newTargets[0]!.nativeElementId, review.targetNativeElementId);
  const evidenceSha256 = sha([
    review.format, review.sourceModelSha256, review.sourceRoomsSha256,
    review.nativeCacheSha256, review.oldPatchId, review.oldPatchSha256,
    review.sourceWallId, review.targetNativeElementId, review.targetNativeBodySha256,
    review.targetNativeHostRelationsSha256, newSource[0]!.ringsFeet, newTargets[0]!.ringsFeet,
  ]);
  assert.equal(proposed.continuationProof.evidenceSha256, evidenceSha256);
  const retained = { ...original, status: "proposed" as const },
    applied = { ...proposed, status: "applied" as const },
    expected: RoomDirectoryData = {
      ...before,
      nativeBoundaryPatches: {
        ...before.nativeBoundaryPatches!,
        patches: [...oldPatches.map(p => p.id === original.id ? retained : p), applied],
      },
    };
  assert.deepEqual(receipt.oldOriginalRecord, original);
  assert.deepEqual(receipt.oldRetainedRecord, retained);
  assert.deepEqual(receipt.newAppliedRecord, applied);
  assert.deepEqual(after, expected, "Only the old patch status and one appended exact reviewed record may change");
  assert.equal(receipt.sourcePreservation.onlyOldStatusAndNewRecordChanged, true);
  assert.equal(receipt.sourcePreservation.allOtherSourceReferencesUnchanged, true);
  const oldApplied = oldPatches.filter(p => p.status === "applied").length;
  assert.equal(receipt.appliedBefore, oldApplied);
  assert.equal(receipt.appliedAfter, oldApplied);
  assert.equal(receipt.physical.currentAllPatchContacts, true);
  assert.equal(receipt.physical.currentHistoricalBinding, true);
  assert.equal(receipt.physical.doorFootprintIntersections, 0);
  assert.equal(receipt.physical.reviewedApertureIntersections, 0);
  assert.equal(receipt.physical.exclusionIntersections, 0);
  assert.equal(receipt.physical.firstMaterial.exactRationalWholeCapShadow, true);
  assert.equal(receipt.physical.firstMaterial.addsNoNewMaterialBehindAnyFirstSurface, true);
  assert(receipt.physical.firstMaterial.currentNativeOwners.includes(review.targetNativeElementId));
  for (const ids of [receipt.physical.nativeFloorIds, receipt.physical.firstMaterial.currentNativeOwners]) {
    assert(ids.length && ids.every(id => Number.isSafeInteger(id) && id > 0));
    assert.equal(new Set(ids).size, ids.length);
  }
  for (const value of [
    review.targetNativeBodySha256, review.targetNativeHostRelationsSha256,
    receipt.physical.currentPhysicalMaterialSha256, receipt.physical.currentDoorsSha256,
    receipt.physical.sourceFloorGeometrySha256, receipt.physical.materialGeometrySha256,
  ]) assert(digest(value));
  assert.equal(receipt.physical.materialGeometrySha256, before.nativeMaterialSections?.geometrySha256);
  if (receipt.physical.supplementGeometrySha256 !== undefined) assert(digest(receipt.physical.supplementGeometrySha256));
  return {
    sourceModelSha256: binding.sourceModelSha256,
    originalSourceRoomsSha256: binding.originalSourceRoomsSha256,
    nativeCacheSha256: binding.nativeCacheSha256,
    sourceBeforeSha256: sha(before), sourceAfterSha256: sha(after),
    oldPatchId: original.id, newPatchId: applied.id,
    historicalRecipePreservedExceptStatus: true,
    allOtherSourceOperandsUnchanged: true,
    physicalOrNavigationApprovalGranted: false,
    freshOriginalCandidateValidationRequired: true,
  };
}
