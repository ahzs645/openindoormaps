/** Independent authoring-delta check only. This proves preservation of the
 * original source, not physical admissibility of any replacement geometry. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { NativeBoundaryPatch } from "../../../reviter/lib/reviter/native-boundary-patches";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export type EnumeratedBoundaryPatchReplacement = {
  oldPatchId: string;
  oldPatchSha256: string;
  replacementPatches: NativeBoundaryPatch[];
};
export type PortableBoundaryReviewEvidenceAppend = {
  format: "source-native-boundary-review-evidence-v1";
  sourceModelSha256: string;
  reviewSha256: string;
  review: unknown;
};

/** The caller separately binds the explicit review file, current source replay,
 * and the reviewed source/compiler closure. A self-hashed list is never a
 * physical or navigation approval. */
export function verifyEnumeratedBoundaryPatchDelta(
  before: RoomDirectoryData,
  after: RoomDirectoryData,
  sourceModelSha256: string,
  entries: readonly EnumeratedBoundaryPatchReplacement[],
  portableEvidenceAppend?: PortableBoundaryReviewEvidenceAppend,
) {
  assert(digest(sourceModelSha256));
  assert(Array.isArray(entries) && entries.length > 0, "An explicit nonempty replacement inventory is required");
  assert.equal(before.nativeBoundaryPatches?.version, 1);
  if (portableEvidenceAppend) {
    assert.equal(portableEvidenceAppend.format, "source-native-boundary-review-evidence-v1");
    assert.equal(portableEvidenceAppend.sourceModelSha256, sourceModelSha256);
    assert.equal(portableEvidenceAppend.reviewSha256, sha(portableEvidenceAppend.review));
    assert(!before.nativeBoundaryPatches!.sourceReviewEvidence?.some(e => e.reviewSha256 === portableEvidenceAppend.reviewSha256),
      "The exact portable review cannot be appended twice");
  }
  const originalPatches = before.nativeBoundaryPatches!.patches;
  assert.equal(new Set(originalPatches.map(p => p.id)).size, originalPatches.length,
    "Original source patch identities must be unique");
  const originalById = new Map(originalPatches.map(p => [p.id, p]));
  const replacements = new Map<string, NativeBoundaryPatch>();
  const appended: NativeBoundaryPatch[] = [];
  const newIds = new Set<string>();
  const details = entries.map((entry: EnumeratedBoundaryPatchReplacement) => {
    assert(entry && typeof entry.oldPatchId === "string" && entry.oldPatchId.length > 0);
    assert(digest(entry.oldPatchSha256));
    assert(!replacements.has(entry.oldPatchId), "An original recipe cannot be superseded twice");
    const original = originalById.get(entry.oldPatchId);
    assert(original, "The reviewed original recipe must exist exactly once");
    assert.equal(original.status, "applied", "Only an original applied recipe may be superseded");
    assert.equal(original.sourceModelSha256, sourceModelSha256);
    assert.equal(sha(original), entry.oldPatchSha256, "Complete historical recipe changed");
    assert(Array.isArray(entry.replacementPatches) && entry.replacementPatches.length > 0,
      "A supersession must include its exact proposed replacements");
    const retained = { ...original, status: "proposed" as const };
    replacements.set(original.id, retained);
    const newAppliedRecords = entry.replacementPatches.map((proposed: NativeBoundaryPatch) => {
      assert(proposed && typeof proposed.id === "string" && proposed.id.length > 0);
      assert(!originalById.has(proposed.id) && !newIds.has(proposed.id),
        "Replacement identities must be new and globally unique");
      newIds.add(proposed.id);
      assert.equal(proposed.status, "proposed", "Reviewed input must remain an unapplied proposal");
      assert.equal(proposed.sourceModelSha256, sourceModelSha256);
      assert.equal(proposed.levelId, original.levelId, "A replacement cannot silently move to another floor");
      const applied = { ...proposed, status: "applied" as const };
      appended.push(applied);
      return applied;
    });
    return {
      oldPatchId: original.id,
      oldOriginalRecord: original,
      oldRetainedRecord: retained,
      newAppliedRecords,
    };
  });
  const expected: RoomDirectoryData = {
    ...before,
    nativeBoundaryPatches: {
      ...before.nativeBoundaryPatches!,
      patches: [...originalPatches.map(p => replacements.get(p.id) ?? p), ...appended],
      ...portableEvidenceAppend ? { sourceReviewEvidence: [
        ...before.nativeBoundaryPatches!.sourceReviewEvidence ?? [], portableEvidenceAppend,
      ] } : {},
    },
  };
  assert.deepEqual(after, expected,
    "Only enumerated original statuses, exact ordered reviewed appends and the exact bound evidence append may change");
  const appliedBefore = originalPatches.filter(p => p.status === "applied").length;
  return {
    sourceBeforeSha256: sha(before),
    sourceAfterSha256: sha(after),
    entries: details,
    appliedBefore,
    appliedAfter: appliedBefore - entries.length + appended.length,
    historicalRecipesPreservedExceptStatus: true as const,
    allOtherSourceOperandsUnchanged: true as const,
    physicalOrNavigationApprovalGranted: false as const,
    freshOriginalCandidateValidationRequired: true as const,
  };
}
