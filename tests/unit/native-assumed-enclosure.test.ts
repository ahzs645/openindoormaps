import test from "node:test";
import assert from "node:assert/strict";
import {
  validateNativeBoundaryPatches,
  reviewedBoundaryWalls,
  type NativeBoundaryPatch,
} from "../../app/indoor-project/native-boundary-patches";
import { validateNativeBoundaryPatches as compilerValidate } from "../../../reviter/lib/reviter/native-boundary-patches";
import { gapProject } from "../fixtures/native-area-project";
import { deriveExactBoundaryPatchGroupPreview } from "../../app/indoor-project/enclosure-proposals";
import {
  nativeBoundaryPatchFile,
  importNativeBoundaryPatchFile,
} from "../../app/indoor-project/native-boundary-patch-file";

async function fixture() {
  const p = await gapProject();
  const r: [number, number][] = [
    [14.8, 7.2498],
    [15.2, 7.2498],
    [15.2, 12.7502],
    [14.8, 12.7502],
  ];
  const patch: NativeBoundaryPatch = {
    id: "provisional-box",
    levelId: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    status: "proposed",
    widthFeet: 5.5004,
    ringsFeet: [r.map(([x, y]) => [x, y])],
    wallEvidence: p.dataset.walls.map((w) => ({
      nativeElementId: w.nativeElementId,
      ringsFeet: structuredClone(w.ringsFeet),
    })),
    nativeDoorIds: [],
    notes: "Provisional assumed enclosed body; revisit concealed construction.",
    assumedEnclosureProof: {
      sourceDrawingSha256: "c".repeat(64),
      sectionId: "registered-section",
      evidenceSha256: "d".repeat(64),
      registeredFacesFeet: [
        [r[0], r[1]],
        [r[1], r[2]],
        [r[2], r[3]],
      ],
      assumedClosingFaceFeet: [r[3], r[0]],
      registeredRingsFeet: [r],
      contactAdaptationFeet: 0.001,
      assumedConstruction: "solid-enclosed-box",
      userAuthorization:
        "2026-10-06 user requested an assumption to revisit later.",
      revisitRequired: true,
    },
  };
  return { p, patch };
}
test("explicit box assumption stays portable and differs from certified drawing proof", async () => {
  const { p, patch } = await fixture();
  for (const validate of [validateNativeBoundaryPatches, compilerValidate])
    assert.doesNotThrow(() =>
      validate({ version: 1, patches: [patch] }, p.dataset.source.modelSha256),
    );
  assert.equal(patch.drawingReconstructionProof, undefined);
  p.rooms.nativeBoundaryPatches = { version: 1, patches: [patch] };
  const file = nativeBoundaryPatchFile(p),
    round = importNativeBoundaryPatchFile(p, file);
  assert.deepEqual(
    round.rooms.nativeBoundaryPatches,
    p.rooms.nativeBoundaryPatches,
  );
  const changed = structuredClone(file);
  changed.nativeBoundaryPatches.patches[0].assumedEnclosureProof!.userAuthorization =
    "Changed construction authorization";
  assert.throws(
    () => importNativeBoundaryPatchFile(p, changed),
    /changed|conflict/i,
  );
});
test("a genuine registered trapezoid keeps all three faces under rigid adaptation only", async () => {
  const { p, patch } = await fixture();
  const r: [number, number][] = [
    [14.8, 7.2498],
    [15.2, 7.1498],
    [15.2, 12.7502],
    [14.8, 12.7502],
  ];
  const proof = patch.assumedEnclosureProof!;
  proof.registeredRingsFeet = [r];
  proof.registeredFacesFeet = [
    [r[0], r[1]],
    [r[1], r[2]],
    [r[2], r[3]],
  ];
  proof.assumedClosingFaceFeet = [r[3], r[0]];
  proof.contactAdaptationFeet = 0.1;
  patch.widthFeet = 5.6004;
  patch.ringsFeet = [r.map(([x, y]) => [x + 0.05, y])];
  for (const validate of [validateNativeBoundaryPatches, compilerValidate]) {
    assert.doesNotThrow(() =>
      validate({ version: 1, patches: [patch] }, p.dataset.source.modelSha256),
    );
    const stretched = structuredClone(patch);
    stretched.ringsFeet[0][1][1] += 0.005;
    assert.throws(
      () =>
        validate(
          { version: 1, patches: [stretched] },
          p.dataset.source.modelSha256,
        ),
      /Invalid native boundary/,
    );
  }
});
test("provisional assumptions reject absent review intent, mismatched faces and expanded footprints in app and compiler", async () => {
  const { p, patch } = await fixture();
  const mutations: ((p: NativeBoundaryPatch) => void)[] = [
    (q) => (q.assumedEnclosureProof!.userAuthorization = ""),
    (q) => ((q.assumedEnclosureProof as any).revisitRequired = false),
    (q) => (q.assumedEnclosureProof!.assumedClosingFaceFeet[0][0] -= 0.1),
    (q) => q.assumedEnclosureProof!.registeredFacesFeet.pop(),
    (q) => (q.assumedEnclosureProof!.registeredFacesFeet[0][1] = [99, 99]),
    (q) => (q.assumedEnclosureProof!.evidenceSha256 = "missing"),
    (q) => (q.assumedEnclosureProof!.contactAdaptationFeet = 0.151),
    (q) => (q.ringsFeet[0][0][0] -= 0.02),
    (q) => (q.ringsFeet[0][0][1] -= 0.3),
    (q) => (q.widthFeet = 6.1),
    (q) => (q.drawingReconstructionProof = { ...q.assumedEnclosureProof! }),
    (q) => (q.nativeDoorIds = [1]),
    (q) => (q.wallEvidence[0].kind = "column"),
  ];
  for (const mutate of mutations)
    for (const validate of [validateNativeBoundaryPatches, compilerValidate]) {
      const changed = structuredClone(patch);
      mutate(changed);
      assert.throws(
        () =>
          validate(
            { version: 1, patches: [changed] },
            p.dataset.source.modelSha256,
          ),
        /Invalid native boundary/,
      );
    }
});
test("assumed box must pass actual floor, doorway, support and stale native evidence checks", async () => {
  const { p, patch } = await fixture();
  const trace = () =>
    deriveExactBoundaryPatchGroupPreview(p.dataset, 1, [patch], {
      mode: "connected",
      previewGapIds: [patch.id],
    });
  const result = await trace();
  assert.equal(result.regions.filter((r) => r.roomKeys.length).length, 2);
  const originalWalls = structuredClone(p.dataset.walls);
  p.dataset.walls[0].ringsFeet[0][0][0] -= 0.1;
  assert.throws(
    () =>
      reviewedBoundaryWalls(
        p.dataset.walls,
        { version: 1, patches: [{ ...patch, status: "applied" }] },
        p.dataset.source.modelSha256,
      ),
    /stale native wall/,
  );
  p.dataset.walls = originalWalls;
  p.dataset.doors = [
    {
      id: "real-door",
      levelId: 1,
      nativeElementId: 9,
      pointFeet: [15, 10],
      normalFeet: [1, 0],
      footprintFeet: [
        [14, 9],
        [16, 9],
        [16, 11],
        [14, 11],
      ],
      roomKeys: ["0", "1"],
      state: "connected",
    },
  ];
  await assert.rejects(trace, /measured door/);
  p.dataset.doors = [];
  p.dataset.walkingSupport!.floors[0].ringsFeet.push([
    [14, 9],
    [16, 9],
    [16, 11],
    [14, 11],
  ]);
  await assert.rejects(trace, /unsupported floor|protected opening/);
});
