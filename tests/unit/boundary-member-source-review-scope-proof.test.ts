import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import type { NativeBoundaryPatch } from "../../../reviter/lib/reviter/native-boundary-patches";
import type { NativeBoundaryMemberReview, NativeBoundaryMemberReviewReceipt } from "../../scripts/indoor/source-native-boundary-member-review";
import { verifyBoundaryMemberSourceReviewDelta } from "../../scripts/indoor/boundary-member-source-review-scope-proof";
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
/** A metadata-scope fixture only: it has no physical/source authority. */
function fixture() {
  const binding = { sourceModelSha256: "a".repeat(64), originalSourceRoomsSha256: "b".repeat(64), nativeCacheSha256: "c".repeat(64) },
    original: NativeBoundaryPatch = {
      id: "old", levelId: 1, sourceModelSha256: binding.sourceModelSha256,
      status: "applied", widthFeet: 1, ringsFeet: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
      wallEvidence: [1, 2].map(nativeElementId => ({ nativeElementId, ringsFeet: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })),
      nativeDoorIds: [], notes: "Preserve complete historical recipe.",
      continuationProof: { sourceWallId: 1, sourceCapFeet: [[0, 0], [0, 1]], targetContactFeet: [[1, 0], [1, 1]], evidenceSha256: "d".repeat(64) },
    },
    proposed = { ...structuredClone(original), id: "new", status: "proposed" as const },
    before = { annotations: [{ key: "same-room", polygonFeet: [[0, 0], [1, 0], [1, 1]] }], nativeBoundaryPatches: { version: 1, patches: [original] }, nativeMaterialSections: { geometrySha256: "e".repeat(64) }, nativeIndoorEnvelopes: { history: "unchanged" } } as unknown as RoomDirectoryData;
  proposed.wallEvidence[1].nativeElementId = 3;
  const review: NativeBoundaryMemberReview = {
    format: "source-native-boundary-member-supersession-v1", sourceModelSha256: binding.sourceModelSha256,
    sourceRoomsSha256: binding.originalSourceRoomsSha256, nativeCacheSha256: binding.nativeCacheSha256,
    oldPatchId: "old", oldPatchSha256: sha(original), sourceWallId: 1, targetNativeElementId: 3,
    targetNativeBodySha256: "f".repeat(64), targetNativeHostRelationsSha256: "0".repeat(64), newPatch: proposed,
  };
  proposed.continuationProof!.evidenceSha256 = sha([
    review.format, review.sourceModelSha256, review.sourceRoomsSha256, review.nativeCacheSha256,
    review.oldPatchId, review.oldPatchSha256, review.sourceWallId, review.targetNativeElementId,
    review.targetNativeBodySha256, review.targetNativeHostRelationsSha256,
    proposed.wallEvidence[0].ringsFeet, proposed.wallEvidence[1].ringsFeet,
  ]);
  const retained = { ...original, status: "proposed" as const }, applied = { ...proposed, status: "applied" as const },
    after = structuredClone({ ...before, nativeBoundaryPatches: { version: 1 as const, patches: [retained, applied] } }),
    receipt: NativeBoundaryMemberReviewReceipt = {
      format: "checked-native-boundary-member-review-v1", physicalGuardsWaived: false,
      sourceModelSha256: binding.sourceModelSha256, originalSourceRoomsSha256: binding.originalSourceRoomsSha256,
      nativeCacheSha256: binding.nativeCacheSha256, sourceBeforeSha256: sha(before), sourceAfterSha256: sha(after), reviewSha256: sha(review),
      oldOriginalRecord: original, oldRetainedRecord: retained, newAppliedRecord: applied,
      appliedBefore: 1, appliedAfter: 1,
      sourcePreservation: { onlyOldStatusAndNewRecordChanged: true, allOtherSourceReferencesUnchanged: true },
      physical: { currentAllPatchContacts: true, currentHistoricalBinding: true, nativeFloorIds: [10], doorFootprintIntersections: 0, reviewedApertureIntersections: 0, exclusionIntersections: 0,
        firstMaterial: { exactRationalWholeCapShadow: true, addsNoNewMaterialBehindAnyFirstSurface: true, currentNativeOwners: [3] },
        currentPhysicalMaterialSha256: "1".repeat(64), currentDoorsSha256: "2".repeat(64), sourceFloorGeometrySha256: "3".repeat(64), materialGeometrySha256: "e".repeat(64) },
    };
  return { before, after, binding, review, receipt };
}
const check = (f: ReturnType<typeof fixture>) => verifyBoundaryMemberSourceReviewDelta(f.before, f.after, f.binding, f.review, f.receipt);
test("exact historical-status-only plus one reviewed append is scoped without granting physical authority", () => {
  const f = fixture(), before = JSON.stringify(f), result = check(f);
  assert.equal(result.historicalRecipePreservedExceptStatus, true);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
  assert.equal(result.freshOriginalCandidateValidationRequired, true);
  assert.equal(JSON.stringify(f), before);
});
test("rehashing cannot authorize historical-body/history edits, unrelated annotation edits, or extra source patches", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.after.nativeBoundaryPatches!.patches[0].notes = "Lost history"; },
    (f: ReturnType<typeof fixture>) => { f.after.nativeBoundaryPatches!.patches[0].ringsFeet[0][0][0] += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.after.annotations[0].polygonFeet[0][0] += 1; },
    (f: ReturnType<typeof fixture>) => { f.after.nativeBoundaryPatches!.patches.push({ ...f.after.nativeBoundaryPatches!.patches[1], id: "unreviewed" }); },
  ]) {
    const f = fixture(); mutate(f); f.receipt.sourceAfterSha256 = sha(f.after);
    assert.throws(() => check(f));
  }
});
test("wrong source/cache/room identities, moved cap and forged evidence refuse even with self-consistent new hashes", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.binding.nativeCacheSha256 = "4".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.receipt.originalSourceRoomsSha256 = "4".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.review.newPatch.continuationProof!.sourceCapFeet[0][0] += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.review.newPatch.continuationProof!.evidenceSha256 = "4".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.review.newPatch.wallEvidence[0].ringsFeet[0][0][0] += 1; },
  ]) {
    const f = fixture(); mutate(f); f.receipt.reviewSha256 = sha(f.review);
    assert.throws(() => check(f));
  }
});
test("waived/incomplete physical replay, lost floor/target inventory and preapplied review input refuse", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.receipt.physicalGuardsWaived = true as never; },
    (f: ReturnType<typeof fixture>) => { f.receipt.physical.firstMaterial.addsNoNewMaterialBehindAnyFirstSurface = false as never; },
    (f: ReturnType<typeof fixture>) => { f.receipt.physical.nativeFloorIds = []; },
    (f: ReturnType<typeof fixture>) => { f.receipt.physical.firstMaterial.currentNativeOwners = []; },
    (f: ReturnType<typeof fixture>) => { f.receipt.physical.currentAllPatchContacts = false as never; },
    (f: ReturnType<typeof fixture>) => { f.receipt.physical.reviewedApertureIntersections = 1 as never; },
    (f: ReturnType<typeof fixture>) => { f.receipt.physical.exclusionIntersections = 1 as never; },
    (f: ReturnType<typeof fixture>) => { f.review.newPatch.status = "applied"; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => check(f)); }
});
