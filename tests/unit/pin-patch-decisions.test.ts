import test from "node:test";
import assert from "node:assert/strict";
import { coupledGapProject } from "../fixtures/native-area-project";
import {
  compileNativeExploreMapping,
  nativeExploreDatasetGeometrySha256,
} from "../../app/indoor-project/native-explore-mapping";
import { deriveNativeAreas } from "../../app/indoor-project/native-area-review";
import { comparePinBoundary } from "../../app/indoor-project/pin-comparison";
import { saveReviewCompanion } from "../../app/indoor-project/review-companion-save";
import {
  pinRecommendationGeometryHash,
  pinRecommendations,
} from "../../app/indoor-project/pin-recommendations";
import {
  savePinPatchDecision,
  readPinPatchDecisions,
  acceptedPinPatches,
} from "../../app/indoor-project/pin-patch-decisions";
import {
  exportIndoorProject,
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
async function sample() {
  let p = await coupledGapProject();
  p.dataset.nativeExploreMapping = await compileNativeExploreMapping(
    p.dataset,
    await nativeExploreDatasetGeometrySha256(p.dataset),
  );
  const result = await deriveNativeAreas(p.dataset, 1, { maxGapFeet: 1 });
  const patches = result.gapCandidates!.map((p) => ({
    ...p,
    status: "proposed" as const,
    notes: "Source-supported diagnostic join.",
  }));
  p.rooms.nativeBoundaryPatches = { version: 1, patches };
  p.rooms.reviewPins = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    pins: [
      { id: "pin", label: "Pin", levelId: 1, pointFeet: [6, 6], notes: "" },
    ],
  };
  p = await saveReviewCompanion(p, "pin-review/pin-recommendations.json", {
    format: "openindoormaps-pin-recommendations",
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    roomsSha256: p.dataset.source.roomsSha256,
    geometrySha256: await pinRecommendationGeometryHash(p.dataset),
    entries: [
      {
        id: "r",
        pinId: "pin",
        title: "Two joins",
        recommendation: "Inspect both joints.",
        question: "Close each joint?",
        patchIds: patches.map((p) => p.id),
        evidencePaths: [],
      },
    ],
  });
  return p;
}
async function accepted(p: Awaited<ReturnType<typeof sample>>) {
  return acceptedPinPatches(p.dataset, p.rooms.nativeBoundaryPatches!.patches, {
    decisions: readPinPatchDecisions(p),
    recommendationId: "r",
    evidenceSha256: pinRecommendations(p)[0].evidenceSha256,
  });
}
test("individual patch replies accumulate in portable authoring metadata; accepted scope reflects their combined effect", async () => {
  let p = await sample();
  const before = JSON.stringify(p.dataset),
    patches = structuredClone(p.rooms.nativeBoundaryPatches);
  const [one, two] = patches!.patches;
  p = await savePinPatchDecision(
    p,
    "r",
    one.id,
    "accept",
    "Close the first supported join.",
  );
  p = await savePinPatchDecision(
    p,
    "r",
    two.id,
    "reject",
    "The second join needs source review.",
  );
  assert.deepEqual(
    (await accepted(p)).map((p) => p.id),
    [one.id],
  );
  assert.deepEqual(
    (await comparePinBoundary(p.dataset, 1, [6, 6], await accepted(p))).updated
      ?.roomKeys,
    ["0", "1"],
  );
  p = await savePinPatchDecision(
    p,
    "r",
    two.id,
    "accept",
    "Both joins are supported.",
  );
  assert.equal(readPinPatchDecisions(p).decisions.length, 2);
  assert.deepEqual(
    (await comparePinBoundary(p.dataset, 1, [6, 6], await accepted(p))).updated
      ?.roomKeys,
    ["0"],
  );
  assert.equal(JSON.stringify(p.dataset), before);
  assert.deepEqual(p.rooms.nativeBoundaryPatches, patches);
  p = await readIndoorProject(await exportIndoorProject(p));
  assert.equal((await accepted(p)).length, 2);
  const visitor = await readIndoorProject(await exportCampusViewer(p));
  assert.equal(visitor.rooms.reviewBundle, undefined);
  p = await savePinPatchDecision(
    p,
    "r",
    one.id,
    "more-evidence",
    "Hold the first join until its jamb is measured.",
  );
  assert.deepEqual(
    (await accepted(p)).map((p) => p.id),
    [two.id],
  );
});
test("changed patch geometry, recommendation evidence or dataset invalidate accepted scope; unrelated patches cannot be decided", async () => {
  let p = await sample();
  const [one, two] = p.rooms.nativeBoundaryPatches!.patches;
  p = await savePinPatchDecision(
    p,
    "r",
    one.id,
    "accept",
    "Reviewed first joint.",
  );
  const changedPatch = structuredClone(p);
  changedPatch.rooms.nativeBoundaryPatches!.patches[0].ringsFeet[0][0][0] += 0.001;
  assert.equal((await accepted(changedPatch)).length, 0);
  const changedData = structuredClone(p);
  changedData.dataset.walls[0].ringsFeet[0][0][0] += 0.001;
  assert.equal((await accepted(changedData)).length, 0);
  await assert.rejects(
    savePinPatchDecision(changedData, "r", two.id, "accept", "Review second."),
    /older geometry/,
  );
  await assert.rejects(
    savePinPatchDecision(p, "r", "unrelated", "accept", "Review."),
    /does not belong/,
  );
  const changedEvidence = await saveReviewCompanion(
    p,
    "pin-review/pin-recommendations.json",
    {
      format: "openindoormaps-pin-recommendations",
      version: 1,
      sourceModelSha256: p.dataset.source.modelSha256,
      geometrySha256: await pinRecommendationGeometryHash(p.dataset),
      entries: [
        {
          ...pinRecommendations(p)[0].recommendation,
          question: "Updated source question",
        },
      ],
    },
  );
  assert.equal((await accepted(changedEvidence)).length, 0);
});

test("newly published native mapping invalidates replies bound to the older unmapped geometry", async () => {
  let p = await sample();
  delete p.dataset.nativeExploreMapping;
  const entry = pinRecommendations(p)[0].recommendation;
  p = await saveReviewCompanion(p, "pin-review/pin-recommendations.json", {
    format: "openindoormaps-pin-recommendations",
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    roomsSha256: p.dataset.source.roomsSha256,
    geometrySha256: await pinRecommendationGeometryHash(p.dataset),
    entries: [entry],
  });
  p = await savePinPatchDecision(
    p,
    "r",
    p.rooms.nativeBoundaryPatches!.patches[0].id,
    "accept",
    "Reviewed before native mapping publication.",
  );
  assert.equal((await accepted(p)).length, 1);
  const reopened = await readIndoorProject(await exportIndoorProject(p));
  assert.ok(reopened.dataset.nativeExploreMapping);
  assert.equal((await accepted(reopened)).length, 0);
  assert.equal(readPinPatchDecisions(reopened).decisions.length, 1);
});
