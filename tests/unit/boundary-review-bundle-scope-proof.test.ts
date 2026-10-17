import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { NativeBoundaryPatch } from "../../../reviter/lib/reviter/native-boundary-patches";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import { verifyBoundaryReviewBundleRecipes, verifyBoundaryReviewBundleSourceDelta, type BoundaryReviewBundle } from "../../scripts/indoor/boundary-review-bundle-scope-proof";
import type { NativeBoundaryReviewBundleReceipt } from "../../scripts/indoor/source-native-boundary-review-bundle";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Wire-preservation fixtures only; these do not assert physical/source proof. */
function fixture() {
  const binding = { sourceModelSha256: "a".repeat(64), originalSourceRoomsSha256: "b".repeat(64), nativeCacheSha256: "c".repeat(64) };
  const base = (id: string, target: number, drawing = false): NativeBoundaryPatch => ({
    id, levelId: 311, status: "applied", sourceModelSha256: binding.sourceModelSha256,
    widthFeet: .3, ringsFeet: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
    wallEvidence: [{ nativeElementId: 1, ringsFeet: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
      { nativeElementId: target, kind: "column", ringsFeet: [[[1, 0], [2, 0], [2, 1], [1, 1]]] }],
    nativeDoorIds: [], notes: `Preserved original recipe for ${id}`,
    ...drawing ? { drawingReconstructionProof: {
      sourceDrawingSha256: "d".repeat(64), sectionId: "original registered section",
      registeredRingsFeet: [[[0, 0], [1, 0], [1, 1], [0, 1]]], contactAdaptationFeet: .1, evidenceSha256: "e".repeat(64),
    } } : { continuationProof: {
      sourceWallId: 1, sourceCapFeet: [[1, 0], [1, 1]], targetContactFeet: [[1.3, 0], [1.3, 1]], evidenceSha256: "e".repeat(64),
    } },
  });
  const originals = [base("old-member", 2), base("old-column", 3), base("old-drawing", 4, true)];
  const before = { annotations: [], nativeBoundaryPatches: { version: 1, patches: originals },
    nativeMaterialSections: { geometrySha256: "f".repeat(64) } } as unknown as RoomDirectoryData;
  const review: BoundaryReviewBundle = {
    format: "source-native-boundary-review-bundle-v1", sourceModelSha256: binding.sourceModelSha256,
    sourceRoomsSha256: binding.originalSourceRoomsSha256, nativeCacheSha256: binding.nativeCacheSha256,
    entries: originals.map((old, index) => ({
      oldPatchId: old.id, oldPatchSha256: sha(old),
      kind: index === 0 ? "native-member" : index === 1 ? "native-column-cap" : "registered-drawing-column",
      sourceWallId: 1, targetNativeElementId: index === 0 ? 5 : index + 2,
      targetNativeBodySha256: "0".repeat(64),
      ...index === 0 ? { targetNativeHostRelationsSha256: "1".repeat(64) } : {},
      replacementPatches: [{ ...structuredClone(old), id: `new-${index}`, status: "proposed" }],
    })),
  };
  review.entries[0].replacementPatches[0].wallEvidence[1].nativeElementId = 5;
  review.entries[1].replacementPatches[0].continuationProof!.targetContactPathFeet = [[1.3, 0], [1.4, .5], [1.3, 1]];
  const f = { binding, before, review, after: structuredClone(before) };
  refresh(f);
  return f;
}
function refresh(f: { before: RoomDirectoryData; after: RoomDirectoryData; review: BoundaryReviewBundle }) {
  for (const e of f.review.entries) for (const p of e.replacementPatches) {
    const normalized = structuredClone(p);
    if (normalized.continuationProof) delete (normalized.continuationProof as Partial<typeof normalized.continuationProof>).evidenceSha256;
    if (normalized.drawingReconstructionProof) delete (normalized.drawingReconstructionProof as Partial<typeof normalized.drawingReconstructionProof>).evidenceSha256;
    const evidence = sha([f.review.format, f.review.sourceModelSha256, f.review.sourceRoomsSha256, f.review.nativeCacheSha256,
      e.oldPatchId, e.oldPatchSha256, e.kind, e.sourceWallId, e.targetNativeElementId,
      e.targetNativeBodySha256, e.targetNativeHostRelationsSha256 ?? null, e.sourceCapReview ?? null, e.floorSupportReview ?? null, normalized]);
    (p.continuationProof ?? p.drawingReconstructionProof)!.evidenceSha256 = evidence;
  }
  f.after = structuredClone({ ...f.before, nativeBoundaryPatches: { ...f.before.nativeBoundaryPatches!, patches: [
    ...f.before.nativeBoundaryPatches!.patches.map(p => f.review.entries.some(e => e.oldPatchId === p.id) ? { ...p, status: "proposed" as const } : p),
    ...f.review.entries.flatMap(e => e.replacementPatches.map(p => ({ ...p, status: "applied" as const }))),
  ], sourceReviewEvidence: [...f.before.nativeBoundaryPatches!.sourceReviewEvidence ?? [], {
    format: "source-native-boundary-review-evidence-v1", sourceModelSha256: f.review.sourceModelSha256,
    reviewSha256: sha(f.review), review: f.review,
  }] } });
}
function refreshPortableOnly(f: ReturnType<typeof fixture>) {
  f.after.nativeBoundaryPatches!.sourceReviewEvidence = [...f.before.nativeBoundaryPatches!.sourceReviewEvidence ?? [], {
    format: "source-native-boundary-review-evidence-v1", sourceModelSha256: f.review.sourceModelSha256,
    reviewSha256: sha(f.review), review: structuredClone(f.review),
  }];
}
const check = (f: ReturnType<typeof fixture>) => verifyBoundaryReviewBundleRecipes(f.before, f.after, f.binding, f.review);
function currentCapFixture() {
  const f = fixture(), entry = f.review.entries[1], original = f.before.nativeBoundaryPatches!.patches[1];
  entry.kind = "native-column-cap-current-source";
  const currentCap: [[number, number], [number, number]] = [[1 + Number.EPSILON, 0], [1 + Number.EPSILON, 1]];
  entry.sourceCapReview = {
    originalSourceCapFeet: structuredClone(original.continuationProof!.sourceCapFeet),
    originalSourceEvidenceSha256: sha(original.wallEvidence[0]), sourceNativeBodySha256: "6".repeat(64),
    currentSourceSectionsSha256: "7".repeat(64), currentSourcePartSha256: "8".repeat(64), currentSourceCapFeet: currentCap,
  };
  entry.replacementPatches[0].continuationProof!.sourceCapFeet = structuredClone(currentCap) as [[number, number], [number, number]];
  refresh(f);
  return f;
}
function replayFixture(f: ReturnType<typeof fixture>): NativeBoundaryReviewBundleReceipt {
  return {
    format: "checked-native-boundary-review-bundle-v1", physicalGuardsWaived: false,
    sourceModelSha256: f.binding.sourceModelSha256, originalSourceRoomsSha256: f.binding.originalSourceRoomsSha256,
    nativeCacheSha256: f.binding.nativeCacheSha256, sourceBeforeSha256: sha(f.before), sourceAfterSha256: sha(f.after), reviewSha256: sha(f.review),
    entries: f.review.entries.map(e => {
      const original = f.before.nativeBoundaryPatches!.patches.find(p => p.id === e.oldPatchId)!;
      return {
        oldPatchId: e.oldPatchId, kind: e.kind, originalRecord: structuredClone(original),
        retainedRecord: { ...structuredClone(original), status: "proposed" },
        newAppliedRecords: e.replacementPatches.map(p => ({ ...structuredClone(p), status: "applied" })),
        physicalGuards: e.replacementPatches.map(p => ({
          currentAllPatchContacts: true, currentHistoricalBinding: true, nativeFloorIds: [10],
          floorGeometrySha256: "2".repeat(64), physicalMaterialSha256: "3".repeat(64), doorsSha256: "4".repeat(64),
          doorFootprintIntersections: 0, reviewedApertureIntersections: 0, exclusionIntersections: 0,
          fullCurrentSourceCapOrRegisteredBody: true, completeCurrentColumnOrMemberEvidence: true,
          firstMaterial: { exactRationalWholeCapShadow: true, addsNoNewMaterialBehindAnyFirstSurface: true, currentNativeOwners: [e.targetNativeElementId] },
          floorSupport: { rawNativeFloorUnsupportedPartCount: 0, originalSlabsUnchanged: true },
          ...e.kind === "registered-drawing-column" ? {
            registeredBodyUnchanged: true, sourceRegistrationEvidencePreserved: true,
            excludedOriginalRegisteredSupportingPartSha256: sha([[[-1, -1], [.5, -1], [.5, 2], [-1, 2]]]),
            registeredSourceSupportReview: { sourceNativeElementId: e.sourceWallId,
              currentSourcePartFeet: [[[-1, -1], [.5, -1], [.5, 2], [-1, 2]]],
              currentSourceSectionsFeet: [[[[-1, -1], [.5, -1], [.5, 2], [-1, 2]]]],
              registeredSourceCapFeet: [[0, 1], [0, 0]], exactPositiveFiniteCapOverlap: true,
              completeConvexNoHolePart: true, allOtherSameOwnerPartsRetained: true },
          } : {},
        })),
      };
    }),
    sourcePreservation: { onlyEnumeratedPatchRecordsAndPortableEvidenceAppendChanged: true, allOtherSourceReferencesUnchanged: true },
    portableSourceEvidence: { priorCount: f.before.nativeBoundaryPatches?.sourceReviewEvidence?.length ?? 0,
      afterCount: (f.before.nativeBoundaryPatches?.sourceReviewEvidence?.length ?? 0) + 1,
      appendedRecord: { format: "source-native-boundary-review-evidence-v1", sourceModelSha256: f.review.sourceModelSha256,
        reviewSha256: sha(f.review), review: structuredClone(f.review) } },
    finalValidation: { currentAllPatchContacts: true, currentHistoricalBinding: true, appliedBefore: 3, appliedAfter: 3 },
    sourceMaterialGeometrySha256: "f".repeat(64),
  };
}
function currentCapReplayFixture(sourceParts?: [number, number][][][]) {
  const f = currentCapFixture(), entry = f.review.entries[1], x = entry.sourceCapReview!.currentSourceCapFeet[0][0];
  const parts = sourceParts ?? [[[[0, 0], [x, 0], [x, 1], [0, 1]]]], part = parts[0]!;
  entry.sourceCapReview!.currentSourcePartSha256 = sha(part);
  entry.sourceCapReview!.currentSourceSectionsSha256 = sha(parts);
  refresh(f);
  const replay = replayFixture(f);
  replay.entries[1].physicalGuards[0].currentSourceCapReview = {
    ...structuredClone(entry.sourceCapReview!),
    currentSourcePartFeet: structuredClone(part), currentSourceSectionsFeet: structuredClone(parts),
    allCurrentSourceOwnerVerticesInward: true, originalFullWallAxisContractRetained: true,
    noSourceMaterialExemption: true, originalBodyAxisFeet: [[0, .5], [1, .5]], originalBodyThicknessFeet: 1,
  };
  return { f, replay };
}
function walkingSupportReplayFixture() {
  const f = fixture(), entry = f.review.entries[1];
  entry.floorSupportReview = { kind: "existing-native-slab-join-support", nativeFloorIds: [10, 11],
    sourceFloorRecordsSha256: "a".repeat(64), boundEnvelopeSha256: "b".repeat(64), walkingAuthorityVersion: "native-slab-join-closures-v1" };
  refresh(f);
  const replay = replayFixture(f), guard = replay.entries[1].physicalGuards[0];
  guard.nativeFloorIds = [10, 11];
  guard.floorSupport = { rawNativeFloorUnsupportedPartCount: 1, originalSlabsUnchanged: true, existingWalkingSupport: {
    ...structuredClone(entry.floorSupportReview), rawNativeFloorRefused: true, onlyExistingWalkingAuthorityUsed: true,
    noNewTolerance: true, originalFloorHoleIntersections: 0, unsupportedOutsideNamedJoinParts: 0,
    unsupportedOutsideBoundEnvelopeParts: 0, unsupportedOutsideCurrentWalkingAuthorityParts: 0,
    rawUnsupportedGeometrySha256: "c".repeat(64), namedJoinGeometrySha256: "d".repeat(64), boundJoinGeometrySha256: "e".repeat(64),
  } };
  return { f, replay };
}

test("three explicitly bound review kinds preserve source operands and grant no physical/navigation authority", () => {
  const f = fixture(), unchanged = JSON.stringify(f), result = check(f);
  assert.equal(result.entries.length, 3);
  assert.equal(result.appliedBefore, 3);
  assert.equal(result.appliedAfter, 3);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
  assert.equal(result.freshOriginalCandidateValidationRequired, true);
  assert.equal(JSON.stringify(f), unchanged);
});

test("rehashing a replacement cannot move its original cap/source wall, source drawing, or doorway identities", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].replacementPatches[0].continuationProof!.sourceCapFeet[0][0] += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].replacementPatches[0].wallEvidence[0].ringsFeet[0][0][0] += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[2].replacementPatches[0].drawingReconstructionProof!.registeredRingsFeet[0][0][0] += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[2].replacementPatches[0].drawingReconstructionProof!.sourceDrawingSha256 = "2".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.review.entries[2].replacementPatches[0].drawingReconstructionProof!.sectionId = "another section"; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[0].replacementPatches[0].nativeDoorIds = [42]; },
  ]) { const f = fixture(); mutate(f); refresh(f); assert.throws(() => check(f)); }
});

test("column owner/type changes, foreign proof kinds and missing source/host identities refuse", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].replacementPatches[0].wallEvidence[1].kind = "wall"; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].replacementPatches[0].wallEvidence[1].nativeElementId = 7; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].replacementPatches[0].continuationProof!.targetWallFaceChain = true; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[0].replacementPatches[0].wallEvidence.push(structuredClone(f.review.entries[0].replacementPatches[0].wallEvidence[0])); },
    (f: ReturnType<typeof fixture>) => { delete f.review.entries[0].targetNativeHostRelationsSha256; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].targetNativeHostRelationsSha256 = "3".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].kind = "other" as never; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].targetNativeBodySha256 = "not-a-digest"; },
  ]) { const f = fixture(); mutate(f); refresh(f); assert.throws(() => check(f)); }
  const flat = fixture();
  delete flat.review.entries[1].replacementPatches[0].continuationProof!.targetContactPathFeet;
  refresh(flat);
  assert.equal(check(flat).physicalOrNavigationApprovalGranted, false,
    "The original flat continuation contract does not require the full column-edge vertices");
});

test("replacement proof digest binds its complete exact proposal and all source/cache/old/body identities", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.review.entries[0].replacementPatches[0].ringsFeet[0][0][0] += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].replacementPatches[0].notes += " changed"; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[2].replacementPatches[0].drawingReconstructionProof!.contactAdaptationFeet += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[0].targetNativeBodySha256 = "4".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.review.entries[0].targetNativeHostRelationsSha256 = "4".repeat(64); },
  ]) {
    const f = fixture(); mutate(f);
    // Update the expected source delta without refreshing the deliberately stale proof.
    f.after.nativeBoundaryPatches!.patches = [
      ...f.after.nativeBoundaryPatches!.patches.slice(0, 3),
      ...f.review.entries.flatMap(e => e.replacementPatches.map(p => ({ ...p, status: "applied" as const }))),
    ];
    refreshPortableOnly(f);
    assert.throws(() => check(f));
  }
  for (const field of ["sourceModelSha256", "sourceRoomsSha256", "nativeCacheSha256"] as const) {
    const f = fixture(); f.review[field] = "5".repeat(64); refresh(f); assert.throws(() => check(f));
  }
});

test("distinct current-source cap review preserves original wall/body evidence and binds the exact different current cap/section", () => {
  const f = currentCapFixture(), original = JSON.stringify(f), result = check(f);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
  assert.deepEqual(f.review.entries[1].replacementPatches[0].wallEvidence[0], f.before.nativeBoundaryPatches!.patches[1].wallEvidence[0]);
  assert.notDeepEqual(f.review.entries[1].sourceCapReview!.currentSourceCapFeet, f.review.entries[1].sourceCapReview!.originalSourceCapFeet);
  assert.equal(JSON.stringify(f), original);
});

test("current-cap variant cannot relabel an old cap, forge old evidence, omit source-body/section binding or alter preserved wall evidence", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { delete f.review.entries[1].sourceCapReview; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].sourceCapReview!.originalSourceCapFeet[0][0] += Number.EPSILON; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].sourceCapReview!.originalSourceEvidenceSha256 = "9".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].sourceCapReview!.sourceNativeBodySha256 = "missing"; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].sourceCapReview!.currentSourceSectionsSha256 = "missing"; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].sourceCapReview!.currentSourcePartSha256 = "missing"; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].sourceCapReview!.currentSourceCapFeet[0][1] += Number.EPSILON; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].replacementPatches[0].wallEvidence[0].ringsFeet[0][0][0] += Number.EPSILON; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].kind = "native-column-cap"; },
  ]) { const f = currentCapFixture(); mutate(f); refresh(f); assert.throws(() => check(f)); }
  const f = currentCapFixture();
  f.review.entries[1].sourceCapReview!.currentSourcePartSha256 = "9".repeat(64);
  f.after.nativeBoundaryPatches!.patches[4] = { ...structuredClone(f.review.entries[1].replacementPatches[0]), status: "applied" };
  refreshPortableOnly(f);
  assert.throws(() => check(f), "The proposal digest must also bind the new explicit source-cap evidence");
  const unchangedCap = currentCapFixture(), entry = unchangedCap.review.entries[1];
  entry.sourceCapReview!.currentSourceCapFeet = structuredClone(entry.sourceCapReview!.originalSourceCapFeet);
  entry.replacementPatches[0].continuationProof!.sourceCapFeet = structuredClone(entry.sourceCapReview!.currentSourceCapFeet);
  refresh(unchangedCap);
  assert.equal(check(unchangedCap).physicalOrNavigationApprovalGranted, false,
    "An exact unchanged cap can still receive a separately bound current-section witness");
});

test("complete source replay receipt binds all exact entries and physical inventories without replacing original candidate QA", () => {
  const f = fixture(), replay = replayFixture(f), unchanged = JSON.stringify({ f, replay });
  const result = verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay);
  assert.equal(result.freshSourceReplayBound, true);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
  assert.equal(result.freshOriginalCandidateValidationRequired, true);
  assert.equal(JSON.stringify({ f, replay }), unchanged);
});

test("missing, reordered, stale or waived final replay and missing per-replacement source/floor/material guards refuse", () => {
  for (const mutate of [
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries.pop(); },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries.reverse(); },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[0].physicalGuards = []; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[0].originalRecord.notes += " edited"; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.physicalGuardsWaived = true as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.finalValidation.currentHistoricalBinding = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.finalValidation.appliedAfter++; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.sourceBeforeSha256 = "5".repeat(64); },
    (r: NativeBoundaryReviewBundleReceipt) => { r.nativeCacheSha256 = "5".repeat(64); },
    (r: NativeBoundaryReviewBundleReceipt) => { r.sourceMaterialGeometrySha256 = "5".repeat(64); },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[0].physicalGuards[0].nativeFloorIds = []; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[0].physicalGuards[0].nativeFloorIds = [10, 10]; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[0].physicalGuards[0].firstMaterial.currentNativeOwners = [999]; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[0].physicalGuards[0].firstMaterial.addsNoNewMaterialBehindAnyFirstSurface = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[0].physicalGuards[0].doorFootprintIntersections = 1 as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].reviewedApertureIntersections = 1 as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[2].physicalGuards[0].exclusionIntersections = 1 as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[2].physicalGuards[0].sourceRegistrationEvidencePreserved = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[2].physicalGuards[0].excludedOriginalRegisteredSupportingPartSha256 = "5".repeat(64); },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[0].physicalGuards[0].registeredBodyUnchanged = true; },
  ]) {
    const f = fixture(), replay = replayFixture(f); mutate(replay);
    assert.throws(() => verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay));
  }
});

test("exact current-cap receipt binds one full current edge and the complete source inventory with no material exemption", () => {
  const { f, replay } = currentCapReplayFixture();
  const result = verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay);
  assert.equal(result.freshSourceReplayBound, true);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
});

test("even rehashed source fragments cannot hide forward material, a disconnected same-owner part, an unexposed cap or partial native edge", () => {
  const x = 1 + Number.EPSILON;
  const variants: [number, number][][][][] = [
    // A connected source component reaches around the cap and leaves a real
    // downstream void. Its complete material must never be exempted by owner.
    [[[[0, 0], [x, 0], [x, 1], [.5, 1], [.5, 2], [x + 2, 2], [x + 2, 0], [x + 3, 0], [x + 3, 3], [0, 3]]]],
    [[[[0, 0], [x, 0], [x, 1], [0, 1]]], [[[x + 1, 0], [x + 2, 0], [x + 2, 1], [x + 1, 1]]]],
    // A single binary64 step across the cap is retained, with no tolerance.
    [[[[0, 0], [x, 0], [x, 1], [x + Number.EPSILON, 2], [0, 2]]]],
    // The reviewed cap is only a strict subsegment of this current edge.
    [[[[0, -1], [x, -1], [x, 2], [0, 2]]]],
  ];
  for (const parts of variants) {
    const { f, replay } = currentCapReplayFixture(parts);
    assert.throws(() => verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay));
  }
  for (const mutate of [
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].currentSourceCapReview!.noSourceMaterialExemption = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].currentSourceCapReview!.originalFullWallAxisContractRetained = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].currentSourceCapReview!.originalBodyAxisFeet[1] = [0, .5]; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].currentSourceCapReview!.originalBodyThicknessFeet = 0; },
    (r: NativeBoundaryReviewBundleReceipt) => { delete r.entries[1].physicalGuards[0].currentSourceCapReview; },
  ]) {
    const { f, replay } = currentCapReplayFixture(); mutate(replay);
    assert.throws(() => verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay));
  }
});

test("explicit unchanged walking-join review records raw slab refusal and binds original slabs/envelope without claiming raw support", () => {
  const { f, replay } = walkingSupportReplayFixture();
  const result = verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay);
  assert.equal(result.freshSourceReplayBound, true);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
  assert.equal(replay.entries[1].physicalGuards[0].floorSupport.rawNativeFloorUnsupportedPartCount, 1);
});

test("walking-join review refuses changed policies, missing/distinct floor evidence, real hole hits and support outside named joins/envelope", () => {
  for (const mutate of [
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.rawNativeFloorUnsupportedPartCount = 0; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.originalSlabsUnchanged = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].nativeFloorIds = [10]; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.existingWalkingSupport!.boundEnvelopeSha256 = "f".repeat(64); },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.existingWalkingSupport!.rawNativeFloorRefused = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.existingWalkingSupport!.noNewTolerance = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.existingWalkingSupport!.originalFloorHoleIntersections = 1 as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.existingWalkingSupport!.unsupportedOutsideNamedJoinParts = 1 as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.existingWalkingSupport!.unsupportedOutsideBoundEnvelopeParts = 1 as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[1].physicalGuards[0].floorSupport.existingWalkingSupport!.unsupportedOutsideCurrentWalkingAuthorityParts = 1 as never; },
  ]) {
    const { f, replay } = walkingSupportReplayFixture(); mutate(replay);
    assert.throws(() => verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay));
  }
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].floorSupportReview!.nativeFloorIds = [10, 10]; },
    (f: ReturnType<typeof fixture>) => { f.review.entries[1].floorSupportReview!.walkingAuthorityVersion = "new-tolerance" as never; },
  ]) { const { f } = walkingSupportReplayFixture(); mutate(f); refresh(f); assert.throws(() => check(f)); }
  const { f, replay } = walkingSupportReplayFixture();
  f.review.entries[1].floorSupportReview!.boundEnvelopeSha256 = "f".repeat(64);
  assert.throws(() => verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay),
    "Floor authority is also bound by each exact proposal's evidence hash");
  const noReview = fixture(), noReviewReplay = replayFixture(noReview);
  noReviewReplay.entries[1].physicalGuards[0].floorSupport.rawNativeFloorUnsupportedPartCount = 1;
  assert.throws(() => verifyBoundaryReviewBundleSourceDelta(noReview.before, noReview.after, noReview.binding, noReview.review, noReviewReplay));
});

test("portable evidence appends the exact reviewed operands and preserves all prior review history", () => {
  const f = fixture(), history = { ...structuredClone(f.review), sourceRoomsSha256: "7".repeat(64) };
  f.before.nativeBoundaryPatches!.sourceReviewEvidence = [{ format: "source-native-boundary-review-evidence-v1",
    sourceModelSha256: f.binding.sourceModelSha256, reviewSha256: sha(history), review: history }];
  refresh(f);
  const replay = replayFixture(f), result = verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
  assert.equal(replay.portableSourceEvidence.priorCount, 1);
  assert.equal(replay.portableSourceEvidence.afterCount, 2);
  assert.deepEqual(f.after.nativeBoundaryPatches!.sourceReviewEvidence![0], f.before.nativeBoundaryPatches!.sourceReviewEvidence![0]);
  for (const mutate of [
    (candidate: typeof f) => { candidate.after.nativeBoundaryPatches!.sourceReviewEvidence = []; },
    (candidate: typeof f) => { candidate.after.nativeBoundaryPatches!.sourceReviewEvidence![0].reviewSha256 = "f".repeat(64); },
    (candidate: typeof f) => { candidate.after.nativeBoundaryPatches!.sourceReviewEvidence![1].review = { foreign: "payload" }; },
    (candidate: typeof f) => { candidate.after.nativeBoundaryPatches!.sourceReviewEvidence!.push(structuredClone(candidate.after.nativeBoundaryPatches!.sourceReviewEvidence![1])); },
  ]) { const copy = structuredClone(f); mutate(copy); assert.throws(() => check(copy)); }
  const duplicate = fixture();
  duplicate.before.nativeBoundaryPatches!.sourceReviewEvidence = [{ format: "source-native-boundary-review-evidence-v1",
    sourceModelSha256: duplicate.binding.sourceModelSha256, reviewSha256: sha(duplicate.review), review: structuredClone(duplicate.review) }];
  refresh(duplicate);
  assert.throws(() => check(duplicate));
});

test("registered drawing uses its unique complete current convex supporting part instead of relabeling the old full wall body", () => {
  const f = fixture(), replay = replayFixture(f), support = replay.entries[2].physicalGuards[0].registeredSourceSupportReview!;
  assert.notEqual(sha(support.currentSourcePartFeet), sha(f.before.nativeBoundaryPatches!.patches[2].wallEvidence[0].ringsFeet));
  assert.equal(verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay).physicalOrNavigationApprovalGranted, false);
  for (const mutate of [
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[2].physicalGuards[0].registeredSourceSupportReview!.sourceNativeElementId = 9; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[2].physicalGuards[0].registeredSourceSupportReview!.allOtherSameOwnerPartsRetained = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[2].physicalGuards[0].registeredSourceSupportReview!.exactPositiveFiniteCapOverlap = false as never; },
    (r: NativeBoundaryReviewBundleReceipt) => { r.entries[2].physicalGuards[0].registeredSourceSupportReview!.currentSourceSectionsFeet.push(structuredClone(r.entries[2].physicalGuards[0].registeredSourceSupportReview!.currentSourcePartFeet)); },
  ]) { const copy = structuredClone(replay); mutate(copy); assert.throws(() => verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, copy)); }
});

test("computed drawing witness independently rejects holes/concavity, point contacts and intersections outside the finite registered cap", () => {
  const variants: [number, number][][][] = [
    [[[-1, -1], [.5, -1], [.5, 2], [-1, 2]], [[-.5, 0], [0, 0], [0, .5]]],
    [[[-1, -1], [.5, -1], [.5, 2], [0, .5], [-1, 2]]],
    [[[-1, -1], [0, 0], [-1, 1]]],
    [[[-1, 2], [1, 2], [1, 3], [-1, 3]]],
    [[[-1, -1], [0, -1], [0, 2], [-1, 2]]],
  ];
  for (const part of variants) {
    const f = fixture(), replay = replayFixture(f), guard = replay.entries[2].physicalGuards[0], support = guard.registeredSourceSupportReview!;
    support.currentSourcePartFeet = structuredClone(part);
    support.currentSourceSectionsFeet = [structuredClone(part)];
    guard.excludedOriginalRegisteredSupportingPartSha256 = sha(part);
    assert.throws(() => verifyBoundaryReviewBundleSourceDelta(f.before, f.after, f.binding, f.review, replay));
  }
});
