import test from "node:test";
import assert from "node:assert/strict";
import { project } from "../fixtures/native-area-project";
import { deriveNativeAreas } from "../../app/indoor-project/native-area-review";
import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import {
  createNativeExactTopologyIndex,
  encodeNativeExactTopology,
  nativeRationalPointInParts,
  nativeRationalArea,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  nativeRationalOverlay,
  Rational,
} from "../../app/indoor-project/native-rational-overlay";
import { associateNativeRooms } from "../../app/indoor-project/native-explore-associations";
import {
  compileNativeExploreMapping,
  nativeExploreDatasetGeometrySha256,
  validatePublishedNativeExploreMapping,
} from "../../app/indoor-project/native-explore-mapping";
const rect = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
async function strictData(gap = 0) {
  const p = await project(),
    d = p.dataset;
  d.records = d.records.slice(0, 2);
  d.records[0].ringsFeet = [rect(0, 0, 1, 1)];
  d.records[1].ringsFeet = [rect(1.1, 0, 1.5, 1)];
  d.nativeLevels = d.nativeLevels.filter((l) => l.id === 1);
  d.doors = [];
  d.walls = [];
  d.edges = [];
  d.nodes = [];
  delete d.circulationGeometry;
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 1.5, 1), rect(0.1, 0.1, 0.2, 0.2)],
      },
    ],
  };
  const sections = [
    {
      nativeElementId: 200,
      categoryId: -2000011,
      kind: "wall" as const,
      baseElevationFeet: 0,
      topElevationFeet: 10,
      partsFeet: [[rect(1, 0, 1.1, 0.5)]],
    },
    {
      nativeElementId: 201,
      categoryId: -2000011,
      kind: "wall" as const,
      baseElevationFeet: 0,
      topElevationFeet: 10,
      partsFeet: [[rect(1, 0.5 + gap, 1.1, 1)]],
    },
  ];
  const raw = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [0.1, 4].map((cut) => ({
      levelId: 1,
      elevationFeet: 0,
      cutElevationFeet: cut,
      evidenceSha256: "b".repeat(64),
      sourceElementIds: [200, 201],
      sections,
    })),
  };
  d.nativeMaterialSections = {
    ...raw,
    geometrySha256: await nativeMaterialSectionsHash(raw),
  };
  const envelope = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rect(0, 0, 1.5, 1)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4],
        evidenceSha256: "c".repeat(64),
      },
    ],
  };
  d.nativeIndoorEnvelopes = {
    ...envelope,
    geometrySha256: await nativeIndoorEnvelopeHash(envelope),
  };
  return d;
}
test("strict selection retains sub-square-foot components, exact holes and source identities without grid cleanup", async () => {
  const d = await strictData(),
    before = JSON.stringify(d),
    r = await deriveNativeAreas(d, 1);
  assert.equal(r.regions.length, 2);
  assert.ok(r.regions.every((p) => p.areaSquareFeet < 1 && p.exactFaceId));
  const index = createNativeExactTopologyIndex(r.exactTopology!, {
    sourceModelSha256: d.source.modelSha256,
    sourceGeometryKey: r.geometrySha256,
    kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  });
  assert.ok(
    r.regions.every(
      (p) => nativeRationalArea(index.parts(p.exactFaceId!)!).n > 0n,
    ),
  );
  assert.ok(
    r.regions.some((p) =>
      nativeRationalPointInParts([1.2, 0.5], index.parts(p.id)!),
    ),
  );
  assert.ok(
    !r.regions.some((p) =>
      nativeRationalPointInParts([0.15, 0.15], index.parts(p.id)!),
    ),
  );
  assert.ok(
    !r.regions.some((p) =>
      nativeRationalPointInParts([1.05, 0.25], index.parts(p.id)!),
    ),
  );
  assert.equal(JSON.stringify(d), before);
});
test("a real sub-nanometre native gap stays connected and is never auto-sealed", async () => {
  const d = await strictData(1e-12),
    r = await deriveNativeAreas(d, 1);
  assert.equal(r.regions.length, 1);
  const index = createNativeExactTopologyIndex(r.exactTopology!, {
    sourceModelSha256: d.source.modelSha256,
    sourceGeometryKey: r.geometrySha256,
    kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  });
  assert.ok(
    nativeRationalPointInParts(
      [1.05, 0.5 + 5e-13],
      index.parts(r.regions[0].id)!,
    ),
  );
});
test("strict wall paint subdivides actual native material without drawing its concave bounding box", async () => {
  const { deriveNativeExplore, nativeExploreWallFeatures } = await import(
    "../../app/indoor-project/native-explore"
  );
  const d = await strictData();
  for (const level of d.nativeMaterialSections!.levels)
    level.sections[0].partsFeet = [
      [
        [
          [0.3, 0.3],
          [0.6, 0.3],
          [0.6, 0.4],
          [0.4, 0.4],
          [0.4, 0.6],
          [0.3, 0.6],
        ],
      ],
    ];
  d.nativeMaterialSections!.geometrySha256 = await nativeMaterialSectionsHash(
    d.nativeMaterialSections!,
  );
  const before = JSON.stringify(d);
  const display = await deriveNativeExplore(d, [1]);
  const floorFirst = await deriveNativeExplore(d, [1], "all", {
    includeWalls: false,
  });
  const { walls, ...withoutWallDetail } = display;
  assert.deepEqual(
    floorFirst,
    withoutWallDetail,
    "deferral preserves all exact faces, labels, holes and picking topology",
  );
  assert.deepEqual(
    nativeExploreWallFeatures(
      d,
      floorFirst.levelIds,
      floorFirst.exactTopologies!.map((entry) => entry.levelId),
    ),
    walls,
    "deferred detail equals the inline exact source wall drawing",
  );
  const { strictNativeDisplay } = await import(
    "../../app/indoor-project/strict-native-display"
  );
  const raisedView = strictNativeDisplay(d, [1], "all", "", true, display);
  assert.deepEqual(
    raisedView.walls.features.map((f) => f.geometry.coordinates[0]),
    walls!.features.map((f) => f.geometry.coordinates),
    "3D uses the same contained source wall paint without rounded recutting",
  );
  const awaitingNative = strictNativeDisplay(d, [1], "all", "", true);
  assert.equal(
    awaitingNative.areas.features.length,
    0,
    "a missing strict trace cannot fall back to old outlines or rounded routing cells",
  );
  const pieces = display.walls!.features.filter(
    (f) => f.properties!.nativeElementId === 200,
  );
  assert.ok(
    pieces.length > 1,
    "the concave native section needs contained cells",
  );
  const { geographicPoint } = await import("../../app/indoor-project/routing");
  const notch = geographicPoint(d, [0.5, 0.5]);
  const numericRingContains = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      if (
        ring[i][1] > notch[1] !== ring[j][1] > notch[1] &&
        notch[0] <
          ((ring[j][0] - ring[i][0]) * (notch[1] - ring[i][1])) /
            (ring[j][1] - ring[i][1]) +
            ring[i][0]
      )
        inside = !inside;
    return inside;
  };
  assert.ok(
    !pieces.some((f) => numericRingContains(f.geometry.coordinates[0])),
  );
  assert.equal(JSON.stringify(d), before, "source evidence is unchanged");
});
test("exact majority attribution does not use a tie tolerance, crop the face, or trust the old seed", async () => {
  const d = await strictData(),
    room = d.records[0];
  room.ringsFeet = [rect(0, 0, 1, 1)];
  const make = (id: string) => ({
    id,
    ringsFeet: [rect(0, 0, 1, 1)],
    displayPartsFeet: [],
    roomKeys: [],
    nativeFloorIds: [],
    nativeDoorIds: [],
    areaSquareFeet: 1,
    exposedFloorEdgeFeet: 0,
  });
  const mid = new Rational(1n, 2n),
    epsilon = new Rational(1n, 10n ** 24n),
    x = new Rational(mid.n * epsilon.d + epsilon.n * mid.d, mid.d * epsilon.d);
  const parts = nativeRationalOverlay("union", [
      [
        [
          [0, 0],
          [x, 0],
          [x, 1],
          [0, 1],
        ],
      ],
    ]),
    before = JSON.stringify(room);
  const result = associateNativeRooms(
    [make("strict")],
    [room],
    d,
    new Map([["strict", parts]]),
  );
  assert.deepEqual(result[0].roomKeys, [room.key]);
  assert.ok(result[0].associations[0].coverageRatio);
  assert.equal(
    result[0].associations[0].coverage,
    0.5,
    "explanatory IEEE fraction may round while exact majority remains recorded",
  );
  assert.equal(JSON.stringify(room), before);
});
test("strict publication preserves all exact positive faces and rejects missing/stale carriers", async () => {
  const d = await strictData();
  d.nativeExploreMapping = await compileNativeExploreMapping(
    d,
    await nativeExploreDatasetGeometrySha256(d),
  );
  assert.equal(d.nativeExploreMapping.version, 3);
  assert.equal(d.nativeExploreMapping.levels[0].regions.length, 2);
  await validatePublishedNativeExploreMapping(d);
  const stale = structuredClone(d);
  delete stale.nativeExploreMapping!.levels[0].exactTopology;
  await assert.rejects(
    validatePublishedNativeExploreMapping(stale),
    /exact|native/i,
  );
  const changed = structuredClone(d);
  changed.nativeExploreMapping!.levels[0].exactTopology!.coordinates[0].x[0] =
    "999";
  await assert.rejects(
    validatePublishedNativeExploreMapping(changed),
    /checksum|native|canonical/i,
  );
});
test("published contained display cannot expand into a native wall or discard a positive render residual", async () => {
  const d = await strictData();
  for (const level of d.nativeMaterialSections!.levels) {
    level.sections[0].partsFeet = [
      [
        [
          [0.123, -0.5],
          [1.323, 1.5],
          [1.423, 1.5],
          [0.223, -0.5],
        ],
      ],
    ];
    level.sections[1].partsFeet = [[rect(1.4, 0.2, 1.45, 0.3)]];
  }
  d.nativeMaterialSections!.geometrySha256 = await nativeMaterialSectionsHash(
    d.nativeMaterialSections!,
  );
  d.nativeExploreMapping = await compileNativeExploreMapping(
    d,
    await nativeExploreDatasetGeometrySha256(d),
  );
  await validatePublishedNativeExploreMapping(d);
  const expanded = structuredClone(d);
  expanded.nativeExploreMapping!.levels[0].regions[0].displayPartsFeet!.push([
    rect(-1, -1, 2, 2),
  ]);
  expanded.nativeExploreMapping!.levels[0].regions[0].containedDisplay!.faces[0]
    .numericPieces++;
  expanded.nativeExploreMapping!.levels[0].regions[0].containedDisplay!.faces[0]
    .exactCells++;
  await assert.rejects(
    validatePublishedNativeExploreMapping(expanded),
    /subset|residual|native face/i,
  );
  const missing = structuredClone(d);
  assert.ok(
    missing.nativeExploreMapping!.levels[0].displayResidualTopology!.faces
      .length,
    "generated intersections have positive exact render residuals",
  );
  const binding =
    missing.nativeExploreMapping!.levels[0].displayResidualTopology!;
  missing.nativeExploreMapping!.levels[0].displayResidualTopology =
    encodeNativeExactTopology(
      {
        sourceModelSha256: binding.sourceModelSha256,
        sourceGeometryKey: binding.sourceGeometryKey,
        kernelVersion: binding.kernelVersion,
      },
      [],
    );
  for (const r of missing.nativeExploreMapping!.levels[0].regions)
    for (const face of r.containedDisplay!.faces) {
      face.exactResidualParts = 0;
      face.exactResidualStartIndex = 0;
    }
  await assert.rejects(
    validatePublishedNativeExploreMapping(missing),
    /checksum|residual|native/i,
  );
});
test("a small corridor identity cannot tint an entire strict native enclosure green", async () => {
  const { nativeExploreRegionStyle } = await import(
    "../../app/indoor-project/native-explore"
  );
  const d = await strictData(),
    room = {
      ...d.records[0],
      name: "Corridor",
      circulation: true,
      walkable: true,
    };
  room.ringsFeet = [rect(0, 0, 1, 1)];
  const face = {
    id: "large-native",
    ringsFeet: [rect(0, 0, 100, 100)],
    displayPartsFeet: [],
    roomKeys: [room.key],
    nativeFloorIds: [],
    nativeDoorIds: [],
    areaSquareFeet: 10000,
    exposedFloorEdgeFeet: 0,
  };
  const parts = nativeRationalOverlay("union", [face.ringsFeet]);
  assert.deepEqual(
    nativeExploreRegionStyle(face, [room], [face.ringsFeet], parts),
    { color: "#e9edef", circulation: false },
  );
  room.ringsFeet = [rect(0, 0, 100, 100)];
  const colored = nativeExploreRegionStyle(
    face,
    [room],
    [face.ringsFeet],
    parts,
  );
  assert.equal(colored.circulation, true);
  assert.equal(colored.color, "#bdd5c9");
});
test("source and runtime exact wall-plan masks preserve identical original/aperture topology", async () => {
  const d = await strictData(1e-12);
  const { nativeMaterialPlanExactWalls } = await import(
    "../../app/indoor-project/native-material-plan"
  );
  const { nativeMaterialPlanExactWalls: sourceWalls } = await import(
    "../../../reviter/lib/reviter/native-material-plan.ts"
  );
  const { createNativeRoutingMaterialQuery } = await import(
    "../../app/indoor-project/native-routing-material"
  );
  const { createNativeRoutingMaterialQuery: sourceQuery } = await import(
    "../../../reviter/lib/reviter/native-routing-material.ts"
  );
  const normalize = (rows: ReturnType<typeof nativeMaterialPlanExactWalls>) =>
    rows.map((r) => [
      r.nativeElementId,
      "geometrySource" in r ? r.geometrySource : undefined,
      r.exactParts.map((p) =>
        p.map((r) => r.map((p) => p.map((q) => [String(q.n), String(q.d)]))),
      ),
    ]);
  assert.deepEqual(
    normalize(
      nativeMaterialPlanExactWalls(d, 1, createNativeRoutingMaterialQuery(d)),
    ),
    normalize(sourceWalls(d, 1, sourceQuery(d))),
  );
});
