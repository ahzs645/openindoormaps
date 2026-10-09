import assert from "node:assert/strict";
import test from "node:test";
import { gapProject } from "../fixtures/native-area-project";
import {
  deriveNativeAreas,
  saveNativeBoundaryPatches,
} from "../../app/indoor-project/native-area-review";
import {
  nativeBoundaryPatchFile,
  importNativeBoundaryPatchFile,
} from "../../app/indoor-project/native-boundary-patch-file";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
import {
  reviewedBoundaryWalls,
  validateNativeBoundaryPatches,
} from "../../app/indoor-project/native-boundary-patches";

async function prepared(apply = false) {
  const source = await gapProject();
  const result = await deriveNativeAreas(source.dataset, 1, { maxGapFeet: 6 });
  assert.equal(result.gapCandidates?.length, 1);
  const changed = await saveNativeBoundaryPatches(
    source,
    result,
    [result.gapCandidates![0].id],
    "Measured native partition gap; preserve real doorway and floor opening.",
    apply,
  );
  return { source, changed };
}

test("separate patch log replays as proposals while reviewed ZIP retains exact applied state and source bytes", async () => {
  const { source, changed } = await prepared(true);
  const file = nativeBoundaryPatchFile(changed);
  assert.equal(file.nativeBoundaryPatches.patches[0].status, "applied");
  const imported = importNativeBoundaryPatchFile(
    source,
    JSON.parse(JSON.stringify(file)),
  );
  assert.equal(
    imported.rooms.nativeBoundaryPatches!.patches[0].status,
    "proposed",
  );
  assert.strictEqual(imported.dataset, source.dataset);
  assert.strictEqual(imported.files, source.files);
  assert.equal(imported.dataset.walls.filter((w) => w.reviewPatchId).length, 0);
  const roundtrip = await readIndoorProject(await exportIndoorProject(changed));
  assert.deepEqual(
    roundtrip.rooms.nativeBoundaryPatches,
    file.nativeBoundaryPatches,
  );
  assert.deepEqual(
    roundtrip.files["model/review.rvt"],
    source.files["model/review.rvt"],
  );
  assert.deepEqual(
    roundtrip.files[roundtrip.manifest.georeference!.path],
    source.files[source.manifest.georeference!.path],
  );
  assert.equal(roundtrip.dataset.boundaryPatchState?.regenerated, false);
});

test("reimport is additive, preserves current applied corrections and rejects conflicting contents", async () => {
  const { changed } = await prepared(true);
  const file = nativeBoundaryPatchFile(changed);
  file.nativeBoundaryPatches.patches[0].status = "proposed";
  const reimported = importNativeBoundaryPatchFile(changed, file);
  assert.equal(reimported.rooms.nativeBoundaryPatches!.patches.length, 1);
  assert.equal(
    reimported.rooms.nativeBoundaryPatches!.patches[0].status,
    "applied",
  );
  file.nativeBoundaryPatches.patches[0].notes = "Different review evidence";
  assert.throws(
    () => importNativeBoundaryPatchFile(changed, file),
    /conflicts/,
  );
  assert.equal(
    changed.rooms.nativeBoundaryPatches!.patches[0].notes.includes("Measured"),
    true,
  );
});

test("patch replay binds model, exact native walls and door IDs, while unrelated room provenance may differ", async () => {
  const { source, changed } = await prepared();
  const file = nativeBoundaryPatchFile(changed);
  file.source.roomsSha256 = "c".repeat(64);
  assert.equal(
    importNativeBoundaryPatchFile(source, file).rooms.nativeBoundaryPatches!
      .patches.length,
    1,
  );
  file.source.modelSha256 = "d".repeat(64);
  assert.throws(
    () => importNativeBoundaryPatchFile(source, file),
    /different source model/,
  );
  file.source.modelSha256 = source.dataset.source.modelSha256;
  file.nativeBoundaryPatches.patches[0].wallEvidence[0].ringsFeet[0][0][0] += 0.1;
  assert.throws(
    () => importNativeBoundaryPatchFile(source, file),
    /stale native wall/,
  );
  const missingDoor = nativeBoundaryPatchFile(changed);
  missingDoor.nativeBoundaryPatches.patches[0].nativeDoorIds.push(999);
  assert.throws(
    () => importNativeBoundaryPatchFile(source, missingDoor),
    /stale native level or door/,
  );
});

test("malformed or duplicate evidence cannot enter saved source patches", async () => {
  const { changed } = await prepared();
  const value = nativeBoundaryPatchFile(changed).nativeBoundaryPatches;
  assert.throws(
    () => validateNativeBoundaryPatches({ version: 1, patches: [null] }),
    /Invalid native/,
  );
  value.patches[0].wallEvidence[1].nativeElementId =
    value.patches[0].wallEvidence[0].nativeElementId;
  assert.throws(() => validateNativeBoundaryPatches(value), /Invalid native/);
  value.patches[0].wallEvidence = [null, null] as never;
  assert.throws(() => validateNativeBoundaryPatches(value), /Invalid native/);
});

test("original material sections supplement source cap evidence without replacing prepared walls", async () => {
  const { changed } = await prepared(true);
  const patch = changed.rooms.nativeBoundaryPatches!.patches[0];
  const original = changed.dataset.walls.filter((w) => !w.reviewPatchId);
  const evidence = patch.wallEvidence[0];
  const omitted = original.filter(
    (w) => w.nativeElementId !== evidence.nativeElementId,
  );
  const material = {
    version: 1 as const,
    sourceModelSha256: changed.dataset.source.modelSha256,
    geometrySha256: "a".repeat(64),
    levels: [
      {
        levelId: patch.levelId,
        elevationFeet: 0,
        cutElevationFeet: 4,
        evidenceSha256: "b".repeat(64),
        sourceElementIds: [evidence.nativeElementId],
        sections: [
          {
            nativeElementId: evidence.nativeElementId,
            categoryId: -2000011,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 10,
            partsFeet: [evidence.ringsFeet],
          },
        ],
      },
    ],
  };
  const bytes = JSON.stringify(omitted);
  assert.throws(
    () =>
      reviewedBoundaryWalls(
        omitted,
        { version: 1, patches: [patch] },
        changed.dataset.source.modelSha256,
      ),
    /stale native wall/,
  );
  assert.equal(
    reviewedBoundaryWalls(
      omitted,
      { version: 1, patches: [patch] },
      changed.dataset.source.modelSha256,
      undefined,
      undefined,
      material,
    ).length,
    1,
  );
  assert.equal(JSON.stringify(omitted), bytes);
  const wrongHeight = structuredClone(material);
  wrongHeight.levels[0].cutElevationFeet = 8;
  assert.throws(
    () =>
      reviewedBoundaryWalls(
        omitted,
        { version: 1, patches: [patch] },
        changed.dataset.source.modelSha256,
        undefined,
        undefined,
        wrongHeight,
      ),
    /stale native wall/,
  );
  const wrongModel = structuredClone(material);
  wrongModel.sourceModelSha256 = "c".repeat(64);
  assert.throws(
    () =>
      reviewedBoundaryWalls(
        omitted,
        { version: 1, patches: [patch] },
        changed.dataset.source.modelSha256,
        undefined,
        undefined,
        wrongModel,
      ),
    /Invalid original native material/,
  );
});
