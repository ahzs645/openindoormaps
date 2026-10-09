import assert from "node:assert/strict";
import test from "node:test";
import type { NativeExploreResult } from "../../app/indoor-project/native-explore";
import { fixture } from "../fixtures/native-area-project";
import { strictNativeDisplay } from "../../app/indoor-project/strict-native-display";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
import { nativeFloorGround } from "../../app/indoor-project/native-floor-ground";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import {
  floorHeightDatum,
  relativeHeightGeometry,
} from "../../app/indoor-project/relative-heights";
import { nativeExploreIdentityLocation } from "../../app/indoor-project/native-explore-selection";
const outer: [number, number][][] = [
  [
    [0, 0],
    [12, 0],
    [12, 10],
    [0, 10],
  ],
];
const hole: [number, number][] = [
  [4, 4],
  [4, 6],
  [6, 6],
  [6, 4],
];
async function project() {
  const data = fixture();
  data.nativeLevels[0].elevationFeet = 9;
  data.records = data.records.slice(0, 1);
  data.records[0].elevationFeet = 0;
  data.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    geometrySha256: "",
    levels: [
      {
        levelId: 1,
        elevationFeet: 9,
        partsFeet: [outer],
        sourceElementIds: [100],
        cutElevationsFeet: [13],
        evidenceSha256: "c".repeat(64),
      },
    ],
  };
  data.nativeIndoorEnvelopes.geometrySha256 = await nativeIndoorEnvelopeHash(
    data.nativeIndoorEnvelopes,
  );
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      { nativeElementId: 100, elevationFeet: 9, ringsFeet: [...outer, hole] },
    ],
  };
  const parts = [...outer, hole];
  const native = {
    regions: [
      {
        id: "actual",
        levelId: 1,
        roomKeys: ["0"],
        ringsFeet: outer,
        visitorPartsFeet: [parts],
      },
    ],
    outlines: { type: "FeatureCollection", features: [] },
    overview: { type: "FeatureCollection", features: [] },
  } as unknown as NativeExploreResult;
  return { data, native };
}
test("strict visitor surfaces and source holes survive stale manual/prepared outlines", async () => {
  const { data, native } = await project();
  const before = JSON.stringify(data);
  const first = strictNativeDisplay(data, [1], "all", "", true, native);
  assert.equal(first.areas.features.length, 1);
  assert.equal(first.areas.features[0].geometry.coordinates[0].length, 2);
  assert.equal(
    first.roomBlocks.features.length,
    0,
    "missing physical enclosure stays flat",
  );
  const changed = structuredClone(data);
  changed.records[0].ringsFeet = [
    [
      [100, 100],
      [101, 100],
      [101, 101],
      [100, 101],
    ],
  ];
  changed.presentation!.rooms = [
    {
      roomKey: "0",
      levelId: 1,
      sourceGeometryKey: "stale",
      interiorRingsFeet: changed.records[0].ringsFeet,
      blockPartsFeet: [changed.records[0].ringsFeet],
      boundarySource: "native-wall-enclosure",
      boundaryElementIds: [],
      sourceCoverage: 1,
      cellCoverage: 1,
    },
  ];
  const next = strictNativeDisplay(changed, [1], "all", "", true, native);
  assert.deepEqual(
    next.areas.features[0].geometry,
    first.areas.features[0].geometry,
  );
  assert.equal(
    next.roomBlocks.features.length,
    0,
    "stale raised block is never a fallback",
  );
  assert.deepEqual(
    nativeFloorGround(changed, [1], "01"),
    nativeFloorGround(data, [1], "01"),
    "native slab is never cropped to the old room box",
  );
  assert.equal(JSON.stringify(data), before);
});
test("complete native geometry defines both simplified and relative-height visitor modes", async () => {
  const { data, native } = await project();
  data.presentation!.rooms = [
    {
      roomKey: "0",
      levelId: 1,
      sourceGeometryKey: JSON.stringify([1, data.records[0].ringsFeet]),
      interiorRingsFeet: outer,
      blockPartsFeet: [[...outer, hole]],
      boundarySource: "native-wall-enclosure",
      boundaryElementIds: [],
      sourceCoverage: 1,
      cellCoverage: 1,
    },
  ];
  const first = prepareFloor(data, [1], "all", {
    review: false,
    simplifyGeometry: true,
    relativeHeights: true,
    showPillars: true,
    showStructures: true,
    showPassThroughPlaces: true,
    showVestibuleDoors: true,
    nativeFaces: native,
  });
  assert.equal(first.selectionAreas.features.length, 1);
  assert.equal(first.stairCutRooms.features.length, 1);
  assert.equal(
    first.stairCutRooms.features[0].geometry.coordinates[0].length,
    2,
  );
  assert.equal(
    first.stairCutRooms.features[0].properties?.base,
    0,
    "actual physical height defines the datum",
  );
  assert.equal(floorHeightDatum(data, [1]), 9);
  const nativeHeight = relativeHeightGeometry(
    data,
    [1],
    first.presentation.display.areas,
    "floor",
  );
  assert.equal(nativeHeight.features[0].properties?.levelId, 1);
  assert.equal(
    nativeHeight.features[0].properties?.base,
    0,
    "old metadata elevation does not lower actual native surfaces",
  );
});
test("selection-only partition defines a flat place without inventing a raised wall enclosure", async () => {
  const { data, native } = await project();
  data.presentation!.rooms = [
    {
      roomKey: "0",
      levelId: 1,
      sourceGeometryKey: JSON.stringify([1, data.records[0].ringsFeet]),
      interiorRingsFeet: outer,
      blockPartsFeet: [outer],
      boundarySource: "native-wall-enclosure",
      boundaryElementIds: [],
      sourceCoverage: 1,
      cellCoverage: 1,
    },
  ];
  data.reviewedAreaPartitions = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    partitions: [
      {
        id: "virtual",
        levelId: 1,
        elevationFeet: 9,
        geometrySha256: "c".repeat(64),
        kind: "open-entrance",
        pointsFeet: [
          [0, 0],
          [12, 0],
        ],
        closed: false,
        status: "applied",
        label: "Open entrance",
        notes: "",
        evidence: {
          kind: "reviewed-assumption",
          nativeElementIds: [],
          reason: "Open frontage",
        },
        selection: "closed",
        navigation: "unchanged",
      },
    ],
  };
  const result = strictNativeDisplay(data, [1], "all", "", true, native);
  assert.equal(result.areas.features.length, 1);
  assert.equal(result.roomBlocks.features.length, 0);
  assert.equal(
    result.areas.features[0].properties?.boundaryReviewRequired,
    true,
  );
});
test("strict search has no outline fallback for unsupported arrivals", async () => {
  const { data } = await project();
  assert.equal(nativeExploreIdentityLocation(data, "0", [1], "all"), undefined);
  data.records[0].arrivalNodeId = "source-arrival";
  data.nodes.push({
    id: "source-arrival",
    roomKey: "0",
    levelId: 1,
    pointFeet: [8, 8, 9],
    kind: "arrival",
    building: data.records[0].building,
    surfaceId: "fixture-arrival",
    geographic: [0, 0],
  });
  assert.deepEqual(nativeExploreIdentityLocation(data, "0", [1], "all"), [
    [8, 8],
  ]);
});

test("ordinary 3D retains the source-only plane above the lower floor", async () => {
  const { data, native } = await project();
  data.nativeLevels.push({ id: 2, name: "Floor 1.5", elevationFeet: 18 });
  data.floors[0].levelIds.push(2);
  data.walkingSupport!.floors.push({
    nativeElementId: 200,
    elevationFeet: 18,
    ringsFeet: outer,
  });
  data.nativeIndoorEnvelopes!.levels.push({
    ...data.nativeIndoorEnvelopes!.levels[0],
    levelId: 2,
    elevationFeet: 18,
    cutElevationsFeet: [22],
    sourceElementIds: [200],
  });
  data.nativeIndoorEnvelopes!.geometrySha256 = await nativeIndoorEnvelopeHash(
    data.nativeIndoorEnvelopes!,
  );
  native.regions.push({
    ...native.regions[0],
    id: "actual-intermediate",
    levelId: 2,
    roomKeys: [],
  });
  const view = prepareFloor(data, [1, 2], "all", {
    review: false,
    simplifyGeometry: false,
    relativeHeights: false,
    showPillars: true,
    showStructures: true,
    showPassThroughPlaces: true,
    showVestibuleDoors: true,
    nativeFaces: native,
  });
  const floors = view.physicalGround.features.filter(
    (f) => f.properties?.nativeFloor,
  );
  assert.equal(floors.length, 2);
  assert.deepEqual(
    floors.map((f) => f.properties?.levelId),
    [1, 2],
  );
  assert.deepEqual(
    floors.map((f) => f.properties?.base),
    [0, 9 * 0.3048],
  );
  assert.equal(
    view.selectionAreas.features[1].properties?.base,
    9 * 0.3048,
    "anonymous actual plane keeps its physical elevation even in ordinary 3D",
  );
});

test("source-connector ownership can name a different actual plane without moving the original room", async () => {
  const { data, native } = await project();
  data.records[0].levelId = 2;
  data.nativeLevels.push({ id: 2, name: "Annotation level", elevationFeet: 0 });
  data.records[0].arrivalNodeId = "physical";
  data.nodes.push({
    id: "physical",
    roomKey: "0",
    levelId: 1,
    pointFeet: [8, 8, 9],
    kind: "arrival",
    building: data.records[0].building,
    surfaceId: "fixture-arrival",
    geographic: [0, 0],
  });
  const view = strictNativeDisplay(data, [1], "all", "", true, native);
  assert.equal(view.areas.features[0].properties?.key, "0");
  assert.equal(view.areas.features[0].properties?.levelId, 1);
  assert.deepEqual(nativeExploreIdentityLocation(data, "0", [1], "all"), [
    [8, 8],
  ]);
  assert.equal(data.records[0].levelId, 2);
});
