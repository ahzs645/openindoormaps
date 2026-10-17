/** Independent source-delta proof for an explicitly enumerated review bundle.
 * No function here grants source-geometry, physical or navigation authority. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { NativeBoundaryPatch } from "../../../reviter/lib/reviter/native-boundary-patches";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import { verifyEnumeratedBoundaryPatchDelta } from "./boundary-review-batch-source-delta";
import type { NativeBoundaryReviewBundleReceipt } from "./source-native-boundary-review-bundle";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const samePoint = (a: readonly number[], b: readonly number[]) => a.length === 2 && b.length === 2 && a[0] === b[0] && a[1] === b[1];
const completeEdge = (ring: readonly (readonly number[])[], a: readonly number[], b: readonly number[]) =>
  ring.some((p, i) => samePoint(p, a) && samePoint(ring[(i + 1) % ring.length]!, b) ||
    samePoint(p, b) && samePoint(ring[(i + 1) % ring.length]!, a));
/** Exact binary64 orientation, independently implemented with integer dyadics.
 * This proof has no tolerance, snapping or near-equal coordinate branch. */
function exactIntegerPoints(points: readonly (readonly number[])[]) {
  const view = new DataView(new ArrayBuffer(8));
  const dyad = (value: number) => {
    assert(Number.isFinite(value));
    view.setFloat64(0, value, false);
    const bits = view.getBigUint64(0, false), exponent = Number((bits >> 52n) & 2047n);
    const mantissa = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
    return { n: (bits >> 63n) ? -mantissa : mantissa, e: exponent ? exponent - 1075 : -1074 };
  };
  const values = points.map(p => { assert(Array.isArray(p) && p.length === 2); return p.map(dyad); });
  const exponents = values.flat().filter(p => p.n !== 0n).map(p => p.e), scale = Math.min(0, ...exponents);
  return values.map(p => p.map(x => x.n << BigInt(x.e - scale)));
}
type IntegerPoint = readonly bigint[];
const cross = (a: IntegerPoint, b: IntegerPoint, p: IntegerPoint) =>
  (b[0]! - a[0]!) * (p[1]! - a[1]!) - (b[1]! - a[1]!) * (p[0]! - a[0]!);
const sign = (value: bigint) => value < 0n ? -1 : value > 0n ? 1 : 0;
function exactSides(a: readonly number[], b: readonly number[], points: readonly (readonly number[])[]) {
  const [x, y, ...rest] = exactIntegerPoints([a, b, ...points]);
  return rest.map(p => sign(cross(x!, y!, p)));
}
function convexWinding(ring: readonly IntegerPoint[]) {
  if (ring.length < 3) return 0;
  const turns = new Set(ring.map((p, i) => sign(cross(p, ring[(i + 1) % ring.length]!, ring[(i + 2) % ring.length]!))).filter(Boolean));
  if (turns.size !== 1) return 0;
  const winding = [...turns][0]!;
  for (const [i, a] of ring.entries()) {
    const b = ring[(i + 1) % ring.length]!;
    if (a[0] === b[0] && a[1] === b[1]) return 0;
    if (ring.some(p => cross(a, b, p) * BigInt(winding) < 0n)) return 0;
  }
  return winding;
}
function exactRegisteredSupportCandidate(
  part: NativeBoundaryPatch["ringsFeet"], registered: NativeBoundaryPatch["ringsFeet"],
  cap: [[number, number], [number, number]],
) {
  if (part.length !== 1 || registered.length !== 1) return false;
  const points = exactIntegerPoints([...part[0]!, ...registered[0]!, ...cap]);
  const ring = points.slice(0, part[0]!.length), body = points.slice(part[0]!.length, -2), [a, b] = points.slice(-2);
  const winding = convexWinding(ring);
  if (!winding || !convexWinding(body)) return false;
  const sides = new Set(ring.map(p => sign(cross(a!, b!, p))).filter(Boolean));
  if (!(sides.has(-1) && sides.has(1))) return false;
  const compare = (x: [bigint, bigint], y: [bigint, bigint]) => sign(x[0] * y[1] - y[0] * x[1]);
  let lo: [bigint, bigint] = [0n, 1n], hi: [bigint, bigint] = [1n, 1n];
  for (const [i, p] of ring.entries()) {
    const q = ring[(i + 1) % ring.length]!, h0 = cross(p, q, a!) * BigInt(winding), h1 = cross(p, q, b!) * BigInt(winding);
    if (h0 < 0n && h1 < 0n) return false;
    if (h0 < 0n) { const t: [bigint, bigint] = [-h0, h1 - h0]; if (compare(t, lo) > 0) lo = t; }
    if (h1 < 0n) { const t: [bigint, bigint] = [h0, h0 - h1]; if (compare(t, hi) < 0) hi = t; }
    if (compare(lo, hi) >= 0) return false;
  }
  // Strict separating-axis overlap proves positive body intersection for two
  // independently checked convex polygons, excluding tangencies/zero area.
  for (const polygon of [ring, body]) for (const [i, p] of polygon.entries()) {
    const q = polygon[(i + 1) % polygon.length]!, nx = -(q[1]! - p[1]!), ny = q[0]! - p[0]!;
    const interval = (r: IntegerPoint[]) => {
      const values = r.map(v => v[0]! * nx + v[1]! * ny);
      return [values.reduce((x, y) => x < y ? x : y), values.reduce((x, y) => x > y ? x : y)] as const;
    };
    const x = interval(ring), y = interval(body);
    if (x[1] <= y[0] || y[1] <= x[0]) return false;
  }
  return true;
}
export type BoundaryReviewBundleEntry = {
  oldPatchId: string;
  oldPatchSha256: string;
  kind: "native-member" | "native-column-cap" | "native-column-cap-current-source" | "registered-drawing-column";
  sourceWallId: number;
  targetNativeElementId: number;
  targetNativeBodySha256: string;
  targetNativeHostRelationsSha256?: string;
  sourceCapReview?: {
    originalSourceCapFeet: [[number, number], [number, number]];
    originalSourceEvidenceSha256: string;
    sourceNativeBodySha256: string;
    currentSourceSectionsSha256: string;
    currentSourcePartSha256: string;
    currentSourceCapFeet: [[number, number], [number, number]];
  };
  floorSupportReview?: {
    kind: "existing-native-slab-join-support";
    nativeFloorIds: number[];
    sourceFloorRecordsSha256: string;
    boundEnvelopeSha256: string;
    walkingAuthorityVersion: "native-slab-join-closures-v1";
  };
  replacementPatches: NativeBoundaryPatch[];
};
export type BoundaryReviewBundle = {
  format: "source-native-boundary-review-bundle-v1";
  sourceModelSha256: string;
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
  entries: BoundaryReviewBundleEntry[];
};
export type BoundaryReviewBundleSourceBinding = {
  sourceModelSha256: string;
  originalSourceRoomsSha256: string;
  nativeCacheSha256: string;
};

// Independently duplicated wire digest; do not call the source helper's digest.
function entryEvidenceSha(bundle: BoundaryReviewBundle, entry: BoundaryReviewBundleEntry, patch: NativeBoundaryPatch) {
  const normalized = { ...patch };
  if (normalized.continuationProof) {
    const { evidenceSha256: _omitted, ...proof } = normalized.continuationProof;
    normalized.continuationProof = proof as NativeBoundaryPatch["continuationProof"];
  }
  if (normalized.drawingReconstructionProof) {
    const { evidenceSha256: _omitted, ...proof } = normalized.drawingReconstructionProof;
    normalized.drawingReconstructionProof = proof as NativeBoundaryPatch["drawingReconstructionProof"];
  }
  return sha([
    bundle.format, bundle.sourceModelSha256, bundle.sourceRoomsSha256, bundle.nativeCacheSha256,
    entry.oldPatchId, entry.oldPatchSha256, entry.kind, entry.sourceWallId,
    entry.targetNativeElementId, entry.targetNativeBodySha256,
    entry.targetNativeHostRelationsSha256 ?? null, entry.sourceCapReview ?? null, entry.floorSupportReview ?? null, normalized,
  ]);
}

export function verifyBoundaryReviewBundleRecipes(
  before: RoomDirectoryData,
  after: RoomDirectoryData,
  binding: BoundaryReviewBundleSourceBinding,
  review: BoundaryReviewBundle,
) {
  assert.equal(review.format, "source-native-boundary-review-bundle-v1");
  assert(Object.values(binding).every(digest));
  assert.equal(review.sourceModelSha256, binding.sourceModelSha256);
  assert.equal(review.sourceRoomsSha256, binding.originalSourceRoomsSha256);
  assert.equal(review.nativeCacheSha256, binding.nativeCacheSha256);
  const portableEvidence = { format: "source-native-boundary-review-evidence-v1" as const,
    sourceModelSha256: binding.sourceModelSha256, reviewSha256: sha(review), review };
  const delta = verifyEnumeratedBoundaryPatchDelta(before, after, binding.sourceModelSha256, review.entries, portableEvidence);
  for (const [index, entry] of review.entries.entries()) {
    assert(["native-member", "native-column-cap", "native-column-cap-current-source", "registered-drawing-column"].includes(entry.kind));
    assert(Number.isSafeInteger(entry.sourceWallId) && entry.sourceWallId > 0);
    assert(Number.isSafeInteger(entry.targetNativeElementId) && entry.targetNativeElementId > 0);
    assert.notEqual(entry.sourceWallId, entry.targetNativeElementId);
    assert(digest(entry.targetNativeBodySha256));
    if (entry.kind === "native-member") assert(digest(entry.targetNativeHostRelationsSha256));
    else assert.equal(entry.targetNativeHostRelationsSha256, undefined,
      "Column-source entries cannot introduce unrelated host evidence");
    if (entry.floorSupportReview) {
      assert.equal(entry.floorSupportReview.kind, "existing-native-slab-join-support");
      assert.equal(entry.floorSupportReview.walkingAuthorityVersion, "native-slab-join-closures-v1");
      assert(entry.floorSupportReview.nativeFloorIds.length >= 2 &&
        entry.floorSupportReview.nativeFloorIds.every(id => Number.isSafeInteger(id) && id > 0));
      assert.equal(new Set(entry.floorSupportReview.nativeFloorIds).size, entry.floorSupportReview.nativeFloorIds.length);
      assert(digest(entry.floorSupportReview.sourceFloorRecordsSha256));
      assert(digest(entry.floorSupportReview.boundEnvelopeSha256));
    }
    const original = delta.entries[index]!.oldOriginalRecord;
    const source = original.wallEvidence.filter(w => w.nativeElementId === entry.sourceWallId);
    assert.equal(source.length, 1, "The exact original supporting source wall must be unique");
    assert.notEqual(source[0]!.kind, "column");
    if (entry.kind === "native-column-cap-current-source") {
      const cap = entry.sourceCapReview;
      assert(cap && original.continuationProof, "An exact source-cap review is required for this distinct variant");
      assert.deepEqual(cap.originalSourceCapFeet, original.continuationProof.sourceCapFeet);
      assert.equal(cap.originalSourceEvidenceSha256, sha(source[0]));
      for (const value of [cap.sourceNativeBodySha256, cap.currentSourceSectionsSha256, cap.currentSourcePartSha256]) assert(digest(value));
    } else assert.equal(entry.sourceCapReview, undefined,
      "Only the explicit exact current-source-cap variant may change a native cap");
    if (entry.kind !== "native-member") {
      const oldTarget = original.wallEvidence.filter(w => w.nativeElementId === entry.targetNativeElementId);
      assert.equal(oldTarget.length, 1);
      assert.equal(oldTarget[0]!.kind, "column");
    }
    for (const proposed of entry.replacementPatches) {
      const proposedSource = proposed.wallEvidence.filter(w => w.nativeElementId === entry.sourceWallId);
      const target = proposed.wallEvidence.filter(w => w.nativeElementId !== entry.sourceWallId);
      assert.deepEqual(proposedSource, source, "Supporting source wall evidence must remain exactly unchanged");
      assert.equal(target.length, 1, "A replacement must bind its complete actual target owner");
      assert.equal(target[0]!.nativeElementId, entry.targetNativeElementId);
      assert.equal(proposed.wallEvidence.length, 2);
      assert.deepEqual(proposed.nativeDoorIds, original.nativeDoorIds, "Original doorway identities remain unchanged");
      assert.equal(proposed.assumedEnclosureProof, undefined);
      assert.equal(proposed.manualPointsFeet, undefined);
      if (entry.kind === "registered-drawing-column") {
        assert.equal(proposed.continuationProof, undefined);
        assert(original.drawingReconstructionProof && proposed.drawingReconstructionProof);
        assert.equal(proposed.drawingReconstructionProof.sourceDrawingSha256, original.drawingReconstructionProof.sourceDrawingSha256);
        assert.equal(proposed.drawingReconstructionProof.sectionId, original.drawingReconstructionProof.sectionId);
        assert.deepEqual(proposed.drawingReconstructionProof.registeredRingsFeet, original.drawingReconstructionProof.registeredRingsFeet,
          "The independent registered source drawing must remain unchanged");
        assert.deepEqual(proposed.ringsFeet, original.ringsFeet,
          "The original registered physical reconstruction must remain unchanged");
        assert.equal(proposed.widthFeet, original.widthFeet);
        const { evidenceSha256: _oldEvidence, ...oldRegisteredProof } = original.drawingReconstructionProof,
          { evidenceSha256: _newEvidence, ...newRegisteredProof } = proposed.drawingReconstructionProof;
        assert.deepEqual(newRegisteredProof, oldRegisteredProof,
          "Only the current evidence binding of the same original registered reconstruction may change");
        assert.equal(target[0]!.kind, "column");
        assert.equal(proposed.drawingReconstructionProof.evidenceSha256, entryEvidenceSha(review, entry, proposed));
      } else {
        assert.equal(proposed.drawingReconstructionProof, undefined);
        assert(original.continuationProof && proposed.continuationProof);
        assert.equal(original.continuationProof.sourceWallId, entry.sourceWallId);
        assert.equal(proposed.continuationProof.sourceWallId, entry.sourceWallId);
        assert.deepEqual(proposed.continuationProof.sourceCapFeet,
          entry.kind === "native-column-cap-current-source" ? entry.sourceCapReview!.currentSourceCapFeet : original.continuationProof.sourceCapFeet,
          "The complete native source cap must match its explicit original or exact current-source review");
        if (entry.kind === "native-column-cap" || entry.kind === "native-column-cap-current-source") {
          assert.equal(target[0]!.kind, "column");
          // A flat wall-width contact can end inside one finite target edge.
          // Source replay retains the complete target and original continuation
          // contract; metadata scope must not invent full-column-edge contact.
          assert.equal(proposed.continuationProof.targetWallFaceChain, undefined);
          assert.equal(proposed.continuationProof.targetWallFirstMaterialProfile, undefined);
        }
        assert.equal(proposed.continuationProof.evidenceSha256, entryEvidenceSha(review, entry, proposed));
      }
    }
  }
  return { ...delta, sourceModelSha256: binding.sourceModelSha256,
    originalSourceRoomsSha256: binding.originalSourceRoomsSha256, nativeCacheSha256: binding.nativeCacheSha256,
    reviewSha256: sha(review), portableEvidence };
}

export function verifyBoundaryReviewBundleSourceDelta(
  before: RoomDirectoryData,
  after: RoomDirectoryData,
  binding: BoundaryReviewBundleSourceBinding,
  review: BoundaryReviewBundle,
  receipt: NativeBoundaryReviewBundleReceipt,
) {
  const delta = verifyBoundaryReviewBundleRecipes(before, after, binding, review);
  assert.equal(receipt.format, "checked-native-boundary-review-bundle-v1");
  assert.equal(receipt.physicalGuardsWaived, false);
  assert.equal(receipt.sourceModelSha256, binding.sourceModelSha256);
  assert.equal(receipt.originalSourceRoomsSha256, binding.originalSourceRoomsSha256);
  assert.equal(receipt.nativeCacheSha256, binding.nativeCacheSha256);
  assert.equal(receipt.sourceBeforeSha256, delta.sourceBeforeSha256);
  assert.equal(receipt.sourceAfterSha256, delta.sourceAfterSha256);
  assert.equal(receipt.reviewSha256, delta.reviewSha256);
  assert.equal(receipt.sourcePreservation.onlyEnumeratedPatchRecordsAndPortableEvidenceAppendChanged, true);
  assert.equal(receipt.sourcePreservation.allOtherSourceReferencesUnchanged, true);
  assert.equal(receipt.finalValidation.currentAllPatchContacts, true);
  assert.equal(receipt.finalValidation.currentHistoricalBinding, true);
  assert.equal(receipt.finalValidation.appliedBefore, delta.appliedBefore);
  assert.equal(receipt.finalValidation.appliedAfter, delta.appliedAfter);
  assert.equal(receipt.sourceMaterialGeometrySha256, before.nativeMaterialSections?.geometrySha256);
  const priorEvidenceCount = before.nativeBoundaryPatches?.sourceReviewEvidence?.length ?? 0;
  assert.equal(receipt.portableSourceEvidence.priorCount, priorEvidenceCount);
  assert.equal(receipt.portableSourceEvidence.afterCount, priorEvidenceCount + 1);
  assert.deepEqual(receipt.portableSourceEvidence.appendedRecord, delta.portableEvidence);
  assert(digest(receipt.sourceMaterialGeometrySha256));
  if (receipt.sourceSupplementGeometrySha256 !== undefined) assert(digest(receipt.sourceSupplementGeometrySha256));
  assert.equal(receipt.entries.length, delta.entries.length);
  for (const [index, entry] of review.entries.entries()) {
    const replay = receipt.entries[index]!, expected = delta.entries[index]!;
    assert.equal(replay.oldPatchId, entry.oldPatchId);
    assert.equal(replay.kind, entry.kind);
    assert.deepEqual(replay.originalRecord, expected.oldOriginalRecord);
    assert.deepEqual(replay.retainedRecord, expected.oldRetainedRecord);
    assert.deepEqual(replay.newAppliedRecords, expected.newAppliedRecords);
    assert.equal(replay.physicalGuards.length, entry.replacementPatches.length);
    for (const [patchIndex, guard] of replay.physicalGuards.entries()) {
      const proposed = entry.replacementPatches[patchIndex]!;
      assert.equal(guard.currentAllPatchContacts, true);
      assert.equal(guard.currentHistoricalBinding, true);
      assert.equal(guard.doorFootprintIntersections, 0);
      assert.equal(guard.reviewedApertureIntersections, 0);
      assert.equal(guard.exclusionIntersections, 0);
      assert.equal(guard.fullCurrentSourceCapOrRegisteredBody, true);
      assert.equal(guard.completeCurrentColumnOrMemberEvidence, true);
      assert.equal(guard.firstMaterial.exactRationalWholeCapShadow, true);
      assert.equal(guard.firstMaterial.addsNoNewMaterialBehindAnyFirstSurface, true);
      for (const ids of [guard.nativeFloorIds, guard.firstMaterial.currentNativeOwners]) {
        assert(ids.length && ids.every(id => Number.isSafeInteger(id) && id > 0));
        assert.equal(new Set(ids).size, ids.length);
      }
      assert(guard.firstMaterial.currentNativeOwners.includes(entry.targetNativeElementId));
      for (const value of [guard.floorGeometrySha256, guard.physicalMaterialSha256, guard.doorsSha256]) assert(digest(value));
      assert(guard.floorSupport);
      assert.equal(guard.floorSupport.originalSlabsUnchanged, true);
      assert(Number.isSafeInteger(guard.floorSupport.rawNativeFloorUnsupportedPartCount) &&
        guard.floorSupport.rawNativeFloorUnsupportedPartCount >= 0);
      if (entry.floorSupportReview) {
        assert(guard.floorSupport.rawNativeFloorUnsupportedPartCount > 0,
          "Explicit existing walking support must preserve the actual original raw-slab refusal");
        const walking = guard.floorSupport.existingWalkingSupport;
        assert(walking, "Existing walking authority needs its explicit bound source replay");
        const { rawNativeFloorRefused, onlyExistingWalkingAuthorityUsed, noNewTolerance,
          originalFloorHoleIntersections, unsupportedOutsideNamedJoinParts, unsupportedOutsideBoundEnvelopeParts,
          unsupportedOutsideCurrentWalkingAuthorityParts, rawUnsupportedGeometrySha256,
          namedJoinGeometrySha256, boundJoinGeometrySha256, ...reviewedSupport } = walking;
        assert.deepEqual(reviewedSupport, entry.floorSupportReview);
        assert.equal(rawNativeFloorRefused, true);
        assert.equal(onlyExistingWalkingAuthorityUsed, true);
        assert.equal(noNewTolerance, true);
        for (const count of [originalFloorHoleIntersections, unsupportedOutsideNamedJoinParts,
          unsupportedOutsideBoundEnvelopeParts, unsupportedOutsideCurrentWalkingAuthorityParts]) assert.equal(count, 0);
        for (const value of [rawUnsupportedGeometrySha256, namedJoinGeometrySha256, boundJoinGeometrySha256]) assert(digest(value));
        assert(entry.floorSupportReview.nativeFloorIds.every(id => guard.nativeFloorIds.includes(id)));
      } else {
        assert.equal(guard.floorSupport.rawNativeFloorUnsupportedPartCount, 0,
          "Raw original slabs must support every ordinary replacement without an existing-walking review");
        assert.equal(guard.floorSupport.existingWalkingSupport, undefined);
      }
      if (entry.kind === "registered-drawing-column") {
        assert.equal(guard.registeredBodyUnchanged, true);
        assert.equal(guard.sourceRegistrationEvidencePreserved, true);
        const support = guard.registeredSourceSupportReview;
        assert(support, "Registered-body exclusion requires its complete current-source support witness");
        assert.equal(support.sourceNativeElementId, entry.sourceWallId);
        assert.equal(support.exactPositiveFiniteCapOverlap, true);
        assert.equal(support.completeConvexNoHolePart, true);
        assert.equal(support.allOtherSameOwnerPartsRetained, true);
        assert.equal(guard.excludedOriginalRegisteredSupportingPartSha256, sha(support.currentSourcePartFeet));
        assert.equal(support.currentSourceSectionsFeet.filter(part => sha(part) === sha(support.currentSourcePartFeet)).length, 1);
        const cap = support.registeredSourceCapFeet;
        assert(cap.length === 2 && !samePoint(...cap));
        assert(completeEdge(proposed.drawingReconstructionProof!.registeredRingsFeet[0]!, ...cap));
        const candidates = support.currentSourceSectionsFeet.filter(part =>
          exactRegisteredSupportCandidate(part, proposed.ringsFeet, cap));
        assert.equal(candidates.length, 1, "Supporting current original source part must be uniquely identified");
        assert.deepEqual(candidates[0], support.currentSourcePartFeet);
      } else for (const field of ["registeredBodyUnchanged", "sourceRegistrationEvidencePreserved", "excludedOriginalRegisteredSupportingPartSha256"] as const)
        assert.equal(guard[field], undefined, "A native continuation cannot claim the registered-body shadow exclusion");
      if (entry.kind !== "registered-drawing-column") assert.equal(guard.registeredSourceSupportReview, undefined);
      if (entry.kind === "native-column-cap-current-source") {
        const current = guard.currentSourceCapReview;
        assert(current, "Fresh current-cap replay must include its complete original source-section witness");
        const { currentSourcePartFeet, currentSourceSectionsFeet, allCurrentSourceOwnerVerticesInward,
          originalFullWallAxisContractRetained, noSourceMaterialExemption, originalBodyAxisFeet,
          originalBodyThicknessFeet, ...reviewedWitness } = current;
        assert.deepEqual(reviewedWitness, entry.sourceCapReview);
        assert.equal(allCurrentSourceOwnerVerticesInward, true);
        assert.equal(originalFullWallAxisContractRetained, true);
        assert.equal(noSourceMaterialExemption, true);
        assert.equal(sha(currentSourcePartFeet), entry.sourceCapReview!.currentSourcePartSha256);
        assert.equal(sha(currentSourceSectionsFeet), entry.sourceCapReview!.currentSourceSectionsSha256);
        assert(currentSourceSectionsFeet.length > 0);
        assert.equal(currentSourceSectionsFeet.filter(part => sha(part) === entry.sourceCapReview!.currentSourcePartSha256).length, 1);
        assert.equal(currentSourcePartFeet.length, 1);
        const [a, b] = entry.sourceCapReview!.currentSourceCapFeet;
        assert(a && b && !samePoint(a, b));
        assert(completeEdge(currentSourcePartFeet[0]!, a, b));
        const sides = new Set(exactSides(a, b, currentSourceSectionsFeet.flat(2)).filter(Boolean));
        assert.equal(sides.size, 1, "The exact cap must expose the end of every actual source-owner section");
        const inward = [...sides][0]!;
        const target = proposed.wallEvidence.find(w => w.nativeElementId === entry.targetNativeElementId)!;
        assert(exactSides(a, b, target.ringsFeet.flat()).some(side => side === -inward), "Exact cap must face its original target");
        assert(Array.isArray(originalBodyAxisFeet) && originalBodyAxisFeet.length === 2 &&
          originalBodyAxisFeet.every(p => p.length === 2 && p.every(Number.isFinite)) && !samePoint(...originalBodyAxisFeet));
        assert(Number.isFinite(originalBodyThicknessFeet) && originalBodyThicknessFeet > 0);
      } else assert.equal(guard.currentSourceCapReview, undefined,
        "A current-source-cap witness cannot silently expand another review kind");
    }
  }
  return { ...delta, freshSourceReplayBound: true as const };
}
