import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { NativeBoundaryPatch } from "../../../reviter/lib/reviter/native-boundary-patches";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import { verifyEnumeratedBoundaryPatchDelta } from "../../scripts/indoor/boundary-review-batch-source-delta";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Metadata-only fixture: none of these rectangles claim source or route proof. */
function fixture() {
  const model = "a".repeat(64);
  const patch = (id: string, status: NativeBoundaryPatch["status"]): NativeBoundaryPatch => ({
    id, status, sourceModelSha256: model, levelId: 311, widthFeet: .3,
    ringsFeet: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
    wallEvidence: [{ nativeElementId: 1, ringsFeet: [[[0, 0], [1, 0], [1, 1]]] }],
    nativeDoorIds: [], notes: `Original complete recipe and decision for ${id}`,
  });
  const before = {
    annotations: [{ key: "room", polygonFeet: [[0, 0], [1, 0], [1, 1]], access: "staff" }],
    nativeBoundaryPatches: { version: 1, patches: [patch("old-a", "applied"), patch("untouched", "applied"), patch("old-b", "applied"), patch("proposal", "proposed")] },
    nativeMaterialSections: { geometrySha256: "b".repeat(64), sections: ["complete true curved column"] },
    navigation: { originalPermissions: ["staff", "unknown"] },
  } as unknown as RoomDirectoryData;
  const entries = [
    { oldPatchId: "old-a", oldPatchSha256: sha(before.nativeBoundaryPatches!.patches[0]), replacementPatches: [patch("new-a", "proposed")] },
    { oldPatchId: "old-b", oldPatchSha256: sha(before.nativeBoundaryPatches!.patches[2]), replacementPatches: [patch("new-b-1", "proposed"), patch("new-b-2", "proposed")] },
  ];
  const after = structuredClone({
    ...before,
    nativeBoundaryPatches: { version: 1 as const, patches: [
      ...before.nativeBoundaryPatches!.patches.map(p => entries.some(e => e.oldPatchId === p.id) ? { ...p, status: "proposed" as const } : p),
      ...entries.flatMap(e => e.replacementPatches.map(p => ({ ...p, status: "applied" as const }))),
    ] },
  });
  return { model, before, after, entries };
}
const check = (f: ReturnType<typeof fixture>) => verifyEnumeratedBoundaryPatchDelta(f.before, f.after, f.model, f.entries);

test("batch delta preserves complete recipes and allows exact ordered one-to-many reviewed replacements without granting approval", () => {
  const f = fixture(), original = JSON.stringify(f), result = check(f);
  assert.equal(result.appliedBefore, 3);
  assert.equal(result.appliedAfter, 4);
  assert.equal(result.entries.length, 2);
  assert.equal(result.historicalRecipesPreservedExceptStatus, true);
  assert.equal(result.physicalOrNavigationApprovalGranted, false);
  assert.equal(result.freshOriginalCandidateValidationRequired, true);
  assert.equal(JSON.stringify(f), original);
});

test("missing, duplicated, extra and reordered replacement inventory cannot conceal source changes", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.entries.pop(); },
    (f: ReturnType<typeof fixture>) => { f.entries.push(structuredClone(f.entries[0])); },
    (f: ReturnType<typeof fixture>) => { f.entries[1].replacementPatches[0].id = "new-a"; },
    (f: ReturnType<typeof fixture>) => { f.entries[0].replacementPatches[0].id = "untouched"; },
    (f: ReturnType<typeof fixture>) => { f.after.nativeBoundaryPatches!.patches.push({ ...f.after.nativeBoundaryPatches!.patches[4], id: "extra" }); },
    (f: ReturnType<typeof fixture>) => { f.after.nativeBoundaryPatches!.patches.reverse(); },
    (f: ReturnType<typeof fixture>) => { f.entries.reverse(); },
  ]) { const f = fixture(); mutate(f); assert.throws(() => check(f)); }
});

test("original recipe notes, geometry, proofs, status and unrelated source columns/rooms/permissions remain exact", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.after.nativeBoundaryPatches!.patches[0].notes = "lost original review"; },
    (f: ReturnType<typeof fixture>) => { f.after.nativeBoundaryPatches!.patches[0].ringsFeet[0][0][0] += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.after.nativeBoundaryPatches!.patches[1].status = "proposed"; },
    (f: ReturnType<typeof fixture>) => { f.after.annotations[0].polygonFeet[0][0] += 1e-12; },
    (f: ReturnType<typeof fixture>) => { f.after.nativeMaterialSections!.geometrySha256 = "c".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.after.navigation = { version: 1, ...f.after.navigation, doorLinks: [] }; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => check(f)); }
});

test("wrong original record hash, floor/model identity, preapplied or empty proposal and duplicate source IDs refuse", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.entries[0].oldPatchSha256 = "c".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.entries[0].oldPatchId = "missing"; },
    (f: ReturnType<typeof fixture>) => { f.entries[0].replacementPatches[0].levelId = 1487816; },
    (f: ReturnType<typeof fixture>) => { f.entries[0].replacementPatches[0].sourceModelSha256 = "c".repeat(64); },
    (f: ReturnType<typeof fixture>) => { f.entries[0].replacementPatches[0].status = "applied"; },
    (f: ReturnType<typeof fixture>) => { f.entries[0].replacementPatches = []; },
    (f: ReturnType<typeof fixture>) => { f.before.nativeBoundaryPatches!.patches.push(structuredClone(f.before.nativeBoundaryPatches!.patches[0])); },
    (f: ReturnType<typeof fixture>) => { f.entries = []; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => check(f)); }
});
