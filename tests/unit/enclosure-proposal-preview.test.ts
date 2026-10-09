import assert from "node:assert/strict";
import test from "node:test";
import pc from "polygon-clipping";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import { gapProject, coupledGapProject } from "../fixtures/native-area-project";
import {
  deriveNativeAreas,
  saveNativeBoundaryPatches,
  pointInNativeArea,
} from "../../app/indoor-project/native-area-review";
import {
  boundaryPatchPreviewPlan,
  boundaryPatchGroupPreviewPlan,
  deriveExactBoundaryPatchGroupPreview,
  deriveExactBoundaryPatchPreview,
  assertBoundaryPatchPreviewResult,
  roomBoundaryPreviewCandidates,
  validateEnclosureProposals,
  type EnclosureProposal,
  type EnclosureProposals,
  proposalDisplayPreviewPlan,
  assertProposalDisplayPreviewPlan,
  assertProposalDisplayPreviewResult,
  type NativeEnclosureWalkwayPreview,
  proposalDisplayGeometryKey,
  saveEnclosureProposals,
} from "../../app/indoor-project/enclosure-proposals";
import {
  exportIndoorProject,
  exportCampusViewer,
  readIndoorProject,
} from "../../app/indoor-project/package";
import type { VolumeAudit } from "../../app/indoor-project/volume-coverage";

async function recommendation() {
  const p = await gapProject();
  const raw = await deriveNativeAreas(p.dataset, 1, {
    manualGapPoints: [
      [15, 7.25],
      [15, 12.75],
    ],
  });
  const id = raw.gapCandidates!.find((c) => c.manualPointsFeet)!.id;
  const saved = await saveNativeBoundaryPatches(
    p,
    raw,
    [id],
    "Inspect native partition and architectural evidence before applying.",
    false,
  );
  const proposal: EnclosureProposal = {
    key: "0",
    cause: "Shared enclosure",
    solution: "Inspect measured wall continuation",
    confidence: "medium",
    prerequisites: ["Protect floor holes"],
    relatedKeys: ["1"],
    boundaryPatchIds: [id],
  };
  return { saved, id, proposal };
}

test("exact preserved wall continuations preview independently and veto altered support, doors, columns and openings", async () => {
  const { saved, id } = await recommendation();
  delete saved.rooms.nativeBoundaryPatches!.patches[0].manualPointsFeet;
  const before = JSON.stringify(saved);
  const plan = boundaryPatchPreviewPlan(saved, "0", id);
  const replay = () =>
    deriveExactBoundaryPatchPreview(saved.dataset, 1, plan.patch, plan.options);
  const result = await replay();
  assert.equal(result.regions.length, 2);
  assertBoundaryPatchPreviewResult(saved, plan, result);
  assert.equal(JSON.stringify(saved), before);
  const footprint = [
    [14.9, 9],
    [15.1, 9],
    [15.1, 10],
    [14.9, 10],
  ] as [number, number][];
  saved.dataset.records[0].properties.floorOpeningsFeet = [footprint];
  await assert.rejects(replay(), /protected opening/);
  delete saved.dataset.records[0].properties.floorOpeningsFeet;
  saved.dataset.walls.push({
    kind: "column",
    nativeElementId: 888,
    levelId: 1,
    ringsFeet: [footprint],
  });
  await assert.rejects(replay(), /fixture/);
  saved.dataset.walls.pop();
  saved.dataset.doors ??= [];
  saved.dataset.doors.push({
    id: "test-door",
    nativeElementId: 889,
    levelId: 1,
    pointFeet: [15, 9.5],
    footprintFeet: footprint,
    normalFeet: [1, 0],
    roomKeys: ["0", "1"],
    state: "connected",
  });
  await assert.rejects(replay(), /measured door/);
  saved.dataset.doors.pop();
  saved.dataset.walkingSupport!.floors[0].ringsFeet.push(footprint);
  await assert.rejects(replay(), /unsupported floor/);
  saved.dataset.walkingSupport!.floors[0].ringsFeet.pop();
  saved.dataset.walls[0].ringsFeet[0][0][0] += 0.1;
  await assert.rejects(replay(), /stale native wall/);
});

test("a measured proposal previews a split without changing saved geometry, routes or source bytes", async () => {
  const { saved, id, proposal } = await recommendation();
  const before = JSON.stringify(saved);
  assert.equal(roomBoundaryPreviewCandidates(saved, "0", proposal).length, 1);
  const original = await deriveNativeAreas(saved.dataset, 1);
  const plan = boundaryPatchPreviewPlan(saved, "0", id);
  const preview = await deriveNativeAreas(saved.dataset, 1, plan.options);
  assert.equal(original.regions.length, 1);
  assert.equal(preview.regions.length, 2);
  assertBoundaryPatchPreviewResult(saved, plan, preview);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(
    saved.rooms.nativeBoundaryPatches!.patches[0].status,
    "proposed",
  );
  assert.equal(saved.dataset.boundaryPatchState, undefined);
});

test("proposal playback rejects stale support, wrong native scope and altered worker geometry", async () => {
  const { saved, id } = await recommendation();
  const plan = boundaryPatchPreviewPlan(saved, "0", id);
  const preview = await deriveNativeAreas(saved.dataset, 1, plan.options);
  const changed = structuredClone(preview);
  changed.gapCandidates!.find((c) => c.id === id)!.ringsFeet[0][0][0] += 0.01;
  assert.throws(
    () => assertBoundaryPatchPreviewResult(saved, plan, changed),
    /does not match/,
  );
  saved.dataset.walkingSupport!.floors[0].ringsFeet[0][0][0] -= 0.01;
  assert.throws(
    () => assertBoundaryPatchPreviewResult(saved, plan, preview),
    /does not match/,
  );
  saved.dataset.walkingSupport!.floors[0].ringsFeet[0][0][0] += 0.01;
  saved.dataset.records[0].levelId = 2;
  assert.throws(() => boundaryPatchPreviewPlan(saved, "0", id), /native level/);
  saved.dataset.records[0].levelId = 1;
  saved.rooms.nativeBoundaryPatches = structuredClone(
    saved.rooms.nativeBoundaryPatches,
  );
  saved.dataset.walls[0].ringsFeet[0][0][0] += 0.01;
  assert.throws(
    () => boundaryPatchPreviewPlan(saved, "0", id),
    /stale native wall/,
  );
});

test("nearby recommendations stay scoped and cannot close protected openings or measured portals", async () => {
  const { saved, id } = await recommendation();
  assert.equal(
    roomBoundaryPreviewCandidates(saved, "0").length,
    0,
    "distant patch is not assigned by its free-form notes",
  );
  saved.dataset.records[0].ringsFeet = [
    [
      [1, 1],
      [15, 1],
      [15, 11],
      [1, 11],
    ],
  ];
  assert.equal(roomBoundaryPreviewCandidates(saved, "0").length, 1);
  const plan = boundaryPatchPreviewPlan(saved, "0", id);
  saved.dataset.records[0].properties.floorOpeningsFeet = [
    [
      [14.8, 9],
      [15.2, 9],
      [15.2, 11],
      [14.8, 11],
    ],
  ];
  await assert.rejects(
    deriveNativeAreas(saved.dataset, 1, plan.options),
    /protected opening/,
  );
  delete saved.dataset.records[0].properties.floorOpeningsFeet;
  saved.rooms.nativeBoundaryPatches!.patches[0].nativeDoorIds = [999];
  assert.throws(
    () => boundaryPatchPreviewPlan(saved, "0", id),
    /stale native level or door/,
  );
});

test("proposal patch references are bounded and unique; text-only proposals remain supported", async () => {
  const { saved, proposal } = await recommendation();
  const catalog = {
    format: "openindoormaps-enclosure-proposals",
    version: 1,
    title: "Native review",
    modelSha256: saved.dataset.source.modelSha256,
    evidenceSha256: "b".repeat(64),
    records: [proposal],
  };
  validateEnclosureProposals(catalog);
  validateEnclosureProposals({
    ...catalog,
    records: [{ ...proposal, boundaryPatchIds: undefined }],
  });
  assert.throws(
    () =>
      validateEnclosureProposals({
        ...catalog,
        records: [
          { ...proposal, boundaryPatchIds: ["duplicate", "duplicate"] },
        ],
      }),
    /Invalid/,
  );
});

async function landingRecommendation() {
  const p = await gapProject();
  p.dataset.records[0].stair = true;
  const report: VolumeAudit = {
    format: "openindoormaps-volume-coverage-audit",
    version: 1,
    source: p.dataset.source,
    datasetSha256: "b".repeat(64),
    reviewEvidenceSha256: "c".repeat(64),
    views: [],
  };
  const catalog: EnclosureProposals = {
    format: "openindoormaps-enclosure-proposals",
    version: 1,
    modelSha256: p.dataset.source.modelSha256,
    evidenceSha256: report.reviewEvidenceSha256,
    title: "Native landing comparison",
    records: [
      {
        key: "0",
        cause: "Stair and flat supported landing share an annotation",
        solution: "Preview clear supported landing",
        confidence: "medium",
        relatedKeys: [],
        prerequisites: ["Inspect actual floor openings and stair ownership"],
        displayPreview: {
          kind: "slab-supported-walkway",
          levelId: 1,
          sourceGeometryKey: proposalDisplayGeometryKey(p, 1),
          nativeFloorEvidence: structuredClone(
            p.dataset.walkingSupport!.floors,
          ),
          partsFeet: [
            [
              [
                [1, 1],
                [3, 1],
                [3, 3],
                [1, 3],
              ],
            ],
          ],
        },
      },
    ],
  };
  return { p, report, catalog };
}

test("native-only projects reject even previously approved historical outline-crop previews", async () => {
  const { p, report, catalog } = await landingRecommendation();
  const oldPlan = proposalDisplayPreviewPlan(p, catalog, report, "0");
  p.dataset.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    geometrySha256: "",
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [p.dataset.walkingSupport!.floors[0].ringsFeet],
        sourceElementIds: [p.dataset.walkingSupport!.floors[0].nativeElementId],
        cutElevationsFeet: [4],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  p.dataset.nativeIndoorEnvelopes.geometrySha256 =
    await nativeIndoorEnvelopeHash(p.dataset.nativeIndoorEnvelopes);
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /native-only.*full native-region/,
  );
  assert.throws(
    () => assertProposalDisplayPreviewPlan(p, oldPlan),
    /native-only.*full native-region/,
  );
});

test("portable landing previews bind audit and exact floor/level geometry without authoring or routing mutation", async () => {
  const { p, report, catalog } = await landingRecommendation();
  const before = JSON.stringify(p);
  const plan = proposalDisplayPreviewPlan(p, catalog, report, "0");
  assert.equal(plan.kind, "slab-supported-walkway");
  assertProposalDisplayPreviewPlan(p, plan);
  assert.equal(JSON.stringify(p), before);
  catalog.evidenceSha256 = "d".repeat(64);
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /earlier evidence/,
  );
  catalog.evidenceSha256 = report.reviewEvidenceSha256;
  p.dataset.walls[0].ringsFeet[0][0][0] += 0.01;
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /stale native geometry/,
  );
  assert.throws(
    () => assertProposalDisplayPreviewPlan(p, plan),
    /earlier geometry/,
  );
});

test("landing previews reject unsupported floor, source scope and protected voids even with refreshed geometry binding", async () => {
  const { p, report, catalog } = await landingRecommendation();
  const preview = catalog.records[0].displayPreview!;
  preview.partsFeet[0][0][0] = [-1, 1];
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /outside supported room floor/,
  );
  preview.partsFeet = [
    [
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
      ],
    ],
  ];
  p.dataset.records[0].properties.floorOpeningsFeet = [
    [
      [1.5, 1.5],
      [2.5, 1.5],
      [2.5, 2.5],
      [1.5, 2.5],
    ],
  ];
  preview.sourceGeometryKey = proposalDisplayGeometryKey(p, 1);
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /protected opening/,
  );
  delete p.dataset.records[0].properties.floorOpeningsFeet;
  p.dataset.walkingSupport!.floors[0].ringsFeet[0][0][0] -= 0.01;
  preview.sourceGeometryKey = proposalDisplayGeometryKey(p, 1);
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /stale native slab evidence/,
  );
});

test("measured landing proposals survive the reviewed ZIP but stay out of visitor exports", async () => {
  const { p, report, catalog } = await landingRecommendation();
  const saved = saveEnclosureProposals(p, catalog);
  const reopened = await readIndoorProject(await exportIndoorProject(saved));
  assert.deepEqual(reopened.rooms.enclosureProposals, catalog);
  const plan = proposalDisplayPreviewPlan(
    reopened,
    reopened.rooms.enclosureProposals!,
    report,
    "0",
  );
  assertProposalDisplayPreviewPlan(reopened, plan);
  assert.deepEqual(
    reopened.files["model/review.rvt"],
    p.files["model/review.rvt"],
  );
  assert.deepEqual(reopened.dataset.nodes, p.dataset.nodes);
  assert.deepEqual(reopened.dataset.edges, p.dataset.edges);
  const viewer = await readIndoorProject(await exportCampusViewer(saved));
  assert.equal(viewer.rooms.enclosureProposals, undefined);
});

async function fullNativeLandingRecommendation() {
  const { p, report, catalog } = await landingRecommendation();
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number][] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  p.dataset.walls.push(
    ...[
      [0, 0, 30, 0.4],
      [0, 19.6, 30, 0.4],
      [0, 0, 0.4, 20],
      [29.6, 0, 0.4, 20],
      [8, 8, 1, 1],
    ].map((b, i) => ({
      kind: "wall" as const,
      nativeElementId: 210 + i,
      levelId: 1,
      ringsFeet: [rect(...(b as [number, number, number, number]))],
    })),
  );
  p.dataset.doors = [
    {
      id: "door",
      nativeElementId: 300,
      levelId: 1,
      pointFeet: [15, 10],
      footprintFeet: rect(14.8, 7.25, 0.4, 5.5),
      normalFeet: [1, 0],
      roomKeys: ["0", "1"],
      state: "connected",
    },
  ];
  p.dataset.records[0].properties.floorOpeningsFeet = [rect(6, 12, 1, 1)];
  const result = await deriveNativeAreas(p.dataset, 1, {
    mode: "connected",
    maxGapFeet: 0,
  });
  const region = result.regions.find((r) => r.roomKeys.includes("0"))!;
  const preview: NativeEnclosureWalkwayPreview = {
    kind: "native-enclosure-walkway",
    previewPurpose: "walkway-candidate",
    levelId: 1,
    sourceGeometryKey: proposalDisplayGeometryKey(p, 1),
    nativeFloorEvidence: structuredClone(p.dataset.walkingSupport!.floors),
    partsFeet: pc.union(
      region.displayPartsFeet[0],
      ...region.displayPartsFeet.slice(1),
    ),
    seedPointFeet: [2, 2],
    regionId: region.id,
    regionRingsFeet: structuredClone(region.ringsFeet),
    nativeAreaGeometrySha256: result.geometrySha256,
    nativeFloorIds: region.nativeFloorIds,
    nativeDoorIds: region.nativeDoorIds,
    diagnostics: {
      roomKeys: region.roomKeys,
      exposedFloorEdgeFeet: region.exposedFloorEdgeFeet,
      doorChecks: result.doorChecks.filter((d) =>
        d.sideRegionIds.includes(region.id),
      ),
    },
  };
  catalog.records[0].displayPreview = preview;
  return { p, report, catalog, result, preview };
}

test("full native landing uses outline only as seed and preserves native apertures, solid faces and closed measured doors", async () => {
  const { p, report, catalog, result, preview } =
    await fullNativeLandingRecommendation();
  const before = JSON.stringify(p);
  const plan = proposalDisplayPreviewPlan(p, catalog, report, "0");
  assert.equal(plan.boundaryProvenance, "full-native-region");
  assert.deepEqual(plan.options, { mode: "connected", maxGapFeet: 0 });
  assertProposalDisplayPreviewResult(p, plan, result);
  assert.equal(
    pointInNativeArea([12, 18], preview.regionRingsFeet),
    true,
    "native landing grows beyond old stair annotation",
  );
  assert.equal(
    pointInNativeArea([4, 15], preview.regionRingsFeet),
    false,
    "native slab hole survives outside annotation",
  );
  assert.equal(
    pointInNativeArea([6.5, 12.5], preview.regionRingsFeet),
    false,
    "protected source stair aperture survives",
  );
  assert.equal(
    pointInNativeArea([8.5, 8.5], preview.regionRingsFeet),
    false,
    "solid column/wall footprint stays excluded",
  );
  assert.equal(
    pointInNativeArea([15, 10], preview.regionRingsFeet),
    false,
    "measured threshold closes only outline",
  );
  assert.equal(
    pointInNativeArea([20, 10], preview.regionRingsFeet),
    false,
    "door prevents adjacent region leaking in",
  );
  assert.deepEqual(
    result.doorChecks.map((d) => d.status),
    ["separated"],
  );
  assert.equal(
    JSON.stringify(p),
    before,
    "all geometry and routing remain unchanged",
  );
});

test("full native playback rejects altered parts, cropped results, temporary gaps and stale source geometry", async () => {
  const { p, report, catalog, result, preview } =
    await fullNativeLandingRecommendation();
  const plan = proposalDisplayPreviewPlan(p, catalog, report, "0");
  const cropped = await deriveNativeAreas(p.dataset, 1, {
    mode: "room",
    roomKey: "0",
    maxGapFeet: 0,
  });
  assert.throws(
    () => assertProposalDisplayPreviewResult(p, plan, cropped),
    /uncropped native region/,
  );
  const pendingGap = structuredClone(result);
  pendingGap.options!.maxGapFeet = 1;
  assert.throws(
    () => assertProposalDisplayPreviewResult(p, plan, pendingGap),
    /uncropped native region/,
  );
  const wrongParts = structuredClone(plan);
  wrongParts.partsFeet = [
    [
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
      ],
    ],
  ];
  assert.throws(
    () => assertProposalDisplayPreviewResult(p, wrongParts, result),
    /uncropped native region/,
  );
  const altered = structuredClone(result);
  altered.regions.find((r) => r.id === preview.regionId)!.ringsFeet[0][0][0] +=
    0.01;
  assert.throws(
    () => assertProposalDisplayPreviewResult(p, plan, altered),
    /uncropped native region/,
  );
  p.dataset.doors![0].footprintFeet![0][0] += 0.01;
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /stale native geometry/,
  );
});

test("leaky full regions stay investigational and cannot masquerade as blue walkway candidates", async () => {
  const { p, report, catalog, preview } =
    await fullNativeLandingRecommendation();
  p.dataset.doors = [];
  const result = await deriveNativeAreas(p.dataset, 1, {
    mode: "connected",
    maxGapFeet: 0,
  });
  const region = result.regions.find((r) => r.roomKeys.includes("0"))!;
  Object.assign(preview, {
    sourceGeometryKey: proposalDisplayGeometryKey(p, 1),
    regionId: region.id,
    regionRingsFeet: region.ringsFeet,
    nativeAreaGeometrySha256: result.geometrySha256,
    nativeDoorIds: region.nativeDoorIds,
    nativeFloorIds: region.nativeFloorIds,
    partsFeet: pc.union(
      region.displayPartsFeet[0],
      ...region.displayPartsFeet.slice(1),
    ),
    diagnostics: {
      roomKeys: region.roomKeys,
      exposedFloorEdgeFeet: region.exposedFloorEdgeFeet,
      doorChecks: [],
    },
  });
  p.dataset.records[1].circulation = false;
  preview.sourceGeometryKey = proposalDisplayGeometryKey(p, 1);
  // Reproduce with the changed classification/identity evidence as well.
  const current = await deriveNativeAreas(p.dataset, 1, {
    mode: "connected",
    maxGapFeet: 0,
  });
  preview.nativeAreaGeometrySha256 = current.geometrySha256;
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /boundary investigation/,
  );
  preview.previewPurpose = "boundary-investigation";
  const plan = proposalDisplayPreviewPlan(p, catalog, report, "0");
  assertProposalDisplayPreviewResult(p, plan, current);
  assert.equal(plan.nativeRegion!.diagnostics.roomKeys.length, 2);
});

test("full native metadata round-trips in the master while actual room geometry and visitor assets stay unchanged", async () => {
  const { p, report, catalog, result } =
    await fullNativeLandingRecommendation();
  const before = JSON.stringify(p.dataset);
  const saved = saveEnclosureProposals(p, catalog);
  const reopened = await readIndoorProject(await exportIndoorProject(saved));
  assert.deepEqual(reopened.rooms.enclosureProposals, catalog);
  const plan = proposalDisplayPreviewPlan(
    reopened,
    reopened.rooms.enclosureProposals!,
    report,
    "0",
  );
  assertProposalDisplayPreviewResult(reopened, plan, result);
  assert.equal(JSON.stringify(p.dataset), before);
  assert.deepEqual(
    reopened.files["model/review.rvt"],
    p.files["model/review.rvt"],
  );
  const visitor = await readIndoorProject(await exportCampusViewer(saved));
  assert.equal(visitor.rooms.enclosureProposals, undefined);
});

test("a measured doorway bypass is investigational even when every contained label is already hallway or stair", async () => {
  const { p, report, catalog, preview } =
    await fullNativeLandingRecommendation();
  p.dataset.walls[1].ringsFeet[0][0][1] = 13.75;
  p.dataset.walls[1].ringsFeet[0][1][1] = 13.75;
  const result = await deriveNativeAreas(p.dataset, 1, {
    mode: "connected",
    maxGapFeet: 0,
  });
  const region = result.regions.find((r) => r.roomKeys.includes("0"))!;
  Object.assign(preview, {
    sourceGeometryKey: proposalDisplayGeometryKey(p, 1),
    regionId: region.id,
    regionRingsFeet: region.ringsFeet,
    nativeAreaGeometrySha256: result.geometrySha256,
    nativeDoorIds: region.nativeDoorIds,
    nativeFloorIds: region.nativeFloorIds,
    partsFeet: pc.union(
      region.displayPartsFeet[0],
      ...region.displayPartsFeet.slice(1),
    ),
    diagnostics: {
      roomKeys: region.roomKeys,
      exposedFloorEdgeFeet: region.exposedFloorEdgeFeet,
      doorChecks: result.doorChecks.filter((d) =>
        d.sideRegionIds.includes(region.id),
      ),
    },
  });
  assert.equal(preview.diagnostics.doorChecks[0].status, "same-region");
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /boundary investigation/,
  );
  preview.previewPurpose = "boundary-investigation";
  assertProposalDisplayPreviewResult(
    p,
    proposalDisplayPreviewPlan(p, catalog, report, "0"),
    result,
  );
});

test("portable pass-through preview replays only checked thresholds and rejects a closed or substituted trace", async () => {
  const { p, report, catalog, preview } =
    await fullNativeLandingRecommendation();
  const before = JSON.stringify(p.dataset);
  const result = await deriveNativeAreas(p.dataset, 1, {
    mode: "connected",
    maxGapFeet: 0,
    passThroughDoorIds: [300],
  });
  const region = result.regions.find((r) => r.roomKeys.includes("0"))!;
  Object.assign(preview, {
    previewPurpose: "boundary-investigation",
    passThroughDoorIds: [300],
    regionId: region.id,
    regionRingsFeet: region.ringsFeet,
    nativeAreaGeometrySha256: result.geometrySha256,
    nativeDoorIds: region.nativeDoorIds,
    nativeFloorIds: region.nativeFloorIds,
    partsFeet: pc.union(
      region.displayPartsFeet[0],
      ...region.displayPartsFeet.slice(1),
    ),
    diagnostics: {
      roomKeys: region.roomKeys,
      exposedFloorEdgeFeet: region.exposedFloorEdgeFeet,
      doorChecks: result.doorChecks.filter((d) =>
        d.sideRegionIds.includes(region.id),
      ),
    },
  });
  const plan = proposalDisplayPreviewPlan(p, catalog, report, "0");
  assert.deepEqual(plan.options!.passThroughDoorIds, [300]);
  assertProposalDisplayPreviewResult(p, plan, result);
  assert.ok(pointInNativeArea([15, 10], region.ringsFeet));
  assert.ok(!pointInNativeArea([8.5, 8.5], region.ringsFeet));
  assert.ok(!pointInNativeArea([4, 15], region.ringsFeet));
  const closed = await deriveNativeAreas(p.dataset, 1, {
    mode: "connected",
    maxGapFeet: 0,
  });
  assert.throws(
    () => assertProposalDisplayPreviewResult(p, plan, closed),
    /uncropped native region/,
  );
  const substituted = structuredClone(result);
  substituted.options!.passThroughDoorIds = [301];
  assert.throws(
    () => assertProposalDisplayPreviewResult(p, plan, substituted),
    /uncropped native region/,
  );
  assert.equal(JSON.stringify(p.dataset), before);
  const reopened = await readIndoorProject(
    await exportIndoorProject(saveEnclosureProposals(p, catalog)),
  );
  assert.deepEqual(
    reopened.rooms.enclosureProposals!.records[0].displayPreview,
    preview,
  );
});

test("coupled joins preview the complete linked set without falsely certifying individual repairs", async () => {
  let p = await coupledGapProject();
  for (const [a, b] of [
    [5, 6],
    [14, 15],
  ]) {
    const raw = await deriveNativeAreas(p.dataset, 1, {
      manualGapPoints: [
        [15, a],
        [15, b],
      ],
    });
    const id = raw.gapCandidates!.find((c) => c.manualPointsFeet)!.id;
    p = await saveNativeBoundaryPatches(
      p,
      raw,
      [id],
      "Original native end continuation",
      false,
    );
  }
  const patches = p.rooms.nativeBoundaryPatches!.patches;
  patches.forEach((p) => delete p.manualPointsFeet);
  const ids = patches.map((p) => p.id);
  p.rooms.enclosureProposals = {
    format: "openindoormaps-enclosure-proposals",
    title: "Coupled joins",
    version: 1,
    modelSha256: p.dataset.source.modelSha256,
    evidenceSha256: "c".repeat(64),
    records: [
      {
        key: "0",
        cause: "Two bypasses",
        solution: "Continue both original walls",
        confidence: "checked",
        prerequisites: [],
        relatedKeys: ["1"],
        boundaryPatchIds: ids,
      },
    ],
  };
  const before = JSON.stringify(p);
  for (const patch of patches) {
    const plan = boundaryPatchPreviewPlan(p, "0", patch.id);
    const individual = await deriveExactBoundaryPatchPreview(
      p.dataset,
      1,
      patch,
      plan.options,
    );
    assert.equal(
      individual.regions.find((r) => r.roomKeys.includes("0"))!.roomKeys.length,
      2,
    );
  }
  const plan = boundaryPatchGroupPreviewPlan(p, "0", ids);
  const result = await deriveExactBoundaryPatchGroupPreview(
    p.dataset,
    1,
    plan.patches!,
    plan.options,
  );
  assert.deepEqual(
    result.regions.find((r) => r.roomKeys.includes("0"))!.roomKeys,
    ["0"],
  );
  assertBoundaryPatchPreviewResult(p, plan, result);
  assert.equal(JSON.stringify(p), before);
  const bad = structuredClone(result);
  bad.gapCandidates![1].ringsFeet[0][0][0] += 0.1;
  assert.throws(
    () => assertBoundaryPatchPreviewResult(p, plan, bad),
    /does not match/,
  );
  bad.gapCandidates = result.gapCandidates!.slice(0, 1);
  assert.throws(
    () => assertBoundaryPatchPreviewResult(p, plan, bad),
    /does not match/,
  );
  assert.throws(
    () => boundaryPatchGroupPreviewPlan(p, "0", [ids[0], ids[0]]),
    /complete correction set/,
  );
  p.dataset.records[0].properties.floorOpeningsFeet = [
    [
      [14.9, 14.3],
      [15.1, 14.3],
      [15.1, 14.5],
      [14.9, 14.5],
    ],
  ];
  await assert.rejects(
    () =>
      deriveExactBoundaryPatchGroupPreview(
        p.dataset,
        1,
        plan.patches!,
        plan.options,
      ),
    /protected opening/,
  );
});

test("a coupled full-width corner requires original cap contacts and positive-area links, never point or edge contact", async () => {
  const p = await gapProject();
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number][][] => [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  ];
  p.dataset.walls = [
    {
      kind: "wall",
      nativeElementId: 200,
      levelId: 1,
      ringsFeet: rect(14, 0, 0.4, 8),
    },
    {
      kind: "wall",
      nativeElementId: 201,
      levelId: 1,
      ringsFeet: rect(0, 8.6, 13.4, 0.4),
    },
  ];
  const base = {
    levelId: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    status: "proposed" as const,
    widthFeet: 1,
    nativeDoorIds: [],
    notes: "Original-width corner continuation",
  };
  const evidence = p.dataset.walls.map((w) => ({
    nativeElementId: w.nativeElementId,
    ringsFeet: w.ringsFeet,
  }));
  const patches = [
    {
      ...base,
      id: "vertical",
      ringsFeet: rect(14, 7.99, 0.4, 1.01),
      wallEvidence: evidence,
    },
    {
      ...base,
      id: "horizontal",
      ringsFeet: rect(13.39, 8.6, 1.02, 0.4),
      wallEvidence: [...evidence].reverse(),
    },
  ];
  const replay = () =>
    deriveExactBoundaryPatchGroupPreview(p.dataset, 1, patches, {
      mode: "connected",
      previewGapIds: patches.map((q) => q.id),
    });
  for (const patch of patches)
    await assert.rejects(
      deriveExactBoundaryPatchPreview(p.dataset, 1, patch, {
        mode: "connected",
        previewGapIds: [patch.id],
      }),
      /both supporting/,
    );
  const before = JSON.stringify(p.dataset);
  await replay();
  assert.equal(JSON.stringify(p.dataset), before);
  const original = patches[1].ringsFeet;
  patches[1].ringsFeet = rect(13.39, 8.6, 0.61, 0.4); // Edge-only contact at x=14.
  await assert.rejects(replay(), /both supporting/);
  patches[1].ringsFeet = original;
  patches[0].ringsFeet = rect(14, 8.01, 0.4, 0.99); // Detached from its primary original cap.
  await assert.rejects(replay(), /both supporting/);
});

test("exact preview tolerates trailing-digit face contacts while rejecting a real column overlap", async () => {
  const p = await gapProject();
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
  ): [number, number][][] => [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  ];
  p.dataset.walls = [
    {
      kind: "wall",
      nativeElementId: 300,
      levelId: 1,
      ringsFeet: rect(14, 0, 0.4, 8),
    },
    {
      kind: "wall",
      nativeElementId: 301,
      levelId: 1,
      ringsFeet: rect(0, 8.6, 20, 0.4),
    },
    {
      kind: "column",
      nativeElementId: 302,
      levelId: 1,
      ringsFeet: [
        [
          [14.4 + 1e-13, 8],
          [15, 8 + 1e-13],
          [15, 9],
          [14.4, 9],
        ],
      ],
    },
  ];
  const patch = {
    id: "native-contact",
    levelId: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    status: "proposed" as const,
    widthFeet: 0.6,
    nativeDoorIds: [],
    notes: "Continue exact original cap",
    ringsFeet: rect(14, 7.9998, 0.4, 0.6004),
    wallEvidence: p.dataset.walls.slice(0, 2).map((w) => ({
      nativeElementId: w.nativeElementId,
      ringsFeet: w.ringsFeet,
    })),
  };
  const replay = () =>
    deriveExactBoundaryPatchPreview(p.dataset, 1, patch, {
      mode: "connected",
      previewGapIds: [patch.id],
    });
  const before = JSON.stringify(p.dataset);
  await replay();
  assert.equal(JSON.stringify(p.dataset), before);
  p.dataset.walls[2].ringsFeet = rect(14.39, 8, 0.61, 1);
  await assert.rejects(replay(), /fixture/);
});

test("a retained historical record cannot preview through a current catalog", async () => {
  const { p, report, catalog } = await landingRecommendation();
  catalog.records[0].evidenceSha256 = "b".repeat(64);
  assert.throws(
    () => proposalDisplayPreviewPlan(p, catalog, report, "0"),
    /earlier evidence/,
  );
  catalog.records[0].evidenceSha256 = report.reviewEvidenceSha256;
  assert.doesNotThrow(() =>
    proposalDisplayPreviewPlan(p, catalog, report, "0"),
  );

  const { saved, id, proposal } = await recommendation();
  saved.rooms.enclosureProposals = {
    format: "openindoormaps-enclosure-proposals",
    version: 1,
    title: "Mixed audit history",
    modelSha256: saved.dataset.source.modelSha256,
    evidenceSha256: "a".repeat(64),
    records: [{ ...proposal, evidenceSha256: "b".repeat(64) }],
  };
  assert.throws(
    () => boundaryPatchPreviewPlan(saved, "0", id),
    /earlier audit evidence/,
  );
  delete saved.rooms.enclosureProposals.records[0].evidenceSha256;
  assert.doesNotThrow(() => boundaryPatchPreviewPlan(saved, "0", id));
  assert.throws(
    () => boundaryPatchPreviewPlan(saved, "0", id, "c".repeat(64)),
    /earlier audit evidence/,
  );
});

test("preview replay rechecks its saved record but allows an independently imported current catalog", async () => {
  const { p, report, catalog } = await landingRecommendation();
  p.rooms.enclosureProposals = catalog;
  const plan = proposalDisplayPreviewPlan(p, catalog, report, "0");
  catalog.records[0].evidenceSha256 = "b".repeat(64);
  assert.throws(
    () => assertProposalDisplayPreviewPlan(p, plan),
    /earlier geometry/,
  );
  const imported = structuredClone(catalog);
  delete imported.records[0].evidenceSha256;
  const newPlan = proposalDisplayPreviewPlan(p, imported, report, "0");
  assert.doesNotThrow(() => assertProposalDisplayPreviewPlan(p, newPlan));
});
