import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import type { NativeExploreResult } from "../../app/indoor-project/native-explore";
import {
  auditVolumeScope,
  volumeSelectionMaskSource,
} from "../../app/indoor-project/volume-coverage";

test("explicit partial and assumed masks retain their distinct provenance", () => {
  for (const source of [
    "partial-native-wall-faces",
    "assumed-native-wall-enclosure",
    "source-outline",
  ])
    assert.equal(
      volumeSelectionMaskSource({
        floorMaskSource: source,
        boundarySource: "source-native-face",
        nativePhysical: true,
      }),
      source,
    );
});

test("native-face reporting requires both exact producer markers", () => {
  assert.equal(
    volumeSelectionMaskSource({
      boundarySource: "source-native-face",
      nativePhysical: true,
    }),
    "source-native-face",
  );
  for (const flag of [undefined, false, 1, "true"])
    assert.equal(
      volumeSelectionMaskSource({
        boundarySource: "source-native-face",
        nativePhysical: flag,
      }),
      "unverified-selection",
    );
  assert.equal(
    volumeSelectionMaskSource({ nativePhysical: true }),
    "unverified-selection",
  );
  assert.equal(
    volumeSelectionMaskSource({
      floorMaskSource: "source-native-face",
      boundarySource: "source-native-face",
      nativePhysical: true,
    }),
    "source-native-face",
  );
  for (const properties of [
    { floorMaskSource: "source-native-face" },
    { floorMaskSource: "source-native-face", nativePhysical: true },
    {
      floorMaskSource: "source-native-face",
      boundarySource: "source-native-face",
      nativePhysical: false,
    },
  ])
    assert.equal(volumeSelectionMaskSource(properties), "unverified-selection");
});

test("actual legacy contours remain source outlines; prepared identities remain distinct", () => {
  for (const boundarySource of ["source-footprint", "source-outline"])
    assert.equal(
      volumeSelectionMaskSource({ boundarySource }),
      "source-outline",
    );
  for (const boundarySource of [
    "native-walls",
    "prepared-native-walls",
    "prepared-registered-source-walls",
    "prepared-native-circulation",
  ])
    assert.equal(volumeSelectionMaskSource({ boundarySource }), boundarySource);
});

test("missing and malformed declarations do not invent an outline or native certificate", () => {
  for (const properties of [
    undefined,
    null,
    {},
    { floorMaskSource: "" },
    { floorMaskSource: 42 },
    { floorMaskSource: false },
    { floorMaskSource: " ", boundarySource: "" },
    { boundarySource: 42 },
  ])
    assert.equal(volumeSelectionMaskSource(properties), "unverified-selection");
});

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
async function nativeFixture() {
  const data = fixture();
  data.records = data.records.slice(0, 1);
  data.nativeLevels[0].elevationFeet = 9;
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
  const faces = {
    regions: [
      {
        id: "actual",
        levelId: 1,
        roomKeys: ["0"],
        ringsFeet: outer,
        visitorPartsFeet: [[...outer, hole]],
      },
    ],
    outlines: { type: "FeatureCollection", features: [] },
    overview: { type: "FeatureCollection", features: [] },
  } as unknown as NativeExploreResult;
  return { data, faces };
}
const nativeScope = {
  id: "native:1",
  name: "Floor1",
  levelIds: [1],
  scope: "native-level" as const,
};

test("actual strict-native selection is reported honestly while its unsupported volume stays unsupported", async () => {
  const { data, faces } = await nativeFixture(),
    before = JSON.stringify(data),
    next = auditVolumeScope(data, nativeScope, faces);
  assert.equal(next.records[0].status, "unsupported-room-enclosure");
  assert.deepEqual(
    next.records[0].modes.map((m) => m.blockCount),
    [0, 0],
  );
  assert.deepEqual(
    next.records[0].modes.map((m) => m.floorMaskSources),
    [["source-native-face"], ["source-native-face"]],
  );
  assert.equal(
    JSON.stringify(data),
    before,
    "audit does not mutate source or hole geometry",
  );
});

test("ordinary legacy visitor selections stay source outlines without changing counts", () => {
  const data = fixture();
  data.records = data.records.slice(0, 1);
  const before = JSON.stringify(data),
    next = auditVolumeScope(data, nativeScope);
  assert.deepEqual(
    next.records[0].modes.map((m) => m.floorMaskSources),
    [["source-outline"], ["source-outline"]],
  );
  assert.deepEqual(
    next.records[0].modes.map((m) => m.blockCount),
    [0, 0],
  );
  assert.equal(next.records[0].status, "unsupported-room-enclosure");
  assert.equal(JSON.stringify(data), before);
});

test("missing native selection remains absent rather than being labelled a source outline", async () => {
  const { data, faces } = await nativeFixture();
  faces.regions = [];
  const view = auditVolumeScope(data, nativeScope, faces);
  assert.equal(view.records[0].status, "unsupported-room-enclosure");
  assert.deepEqual(
    view.records[0].modes.map((m) => m.floorMaskSources),
    [[], []],
  );
});

test("campus and native scopes consume identical shared room-level provenance", async () => {
  const { data, faces } = await nativeFixture();
  const native = auditVolumeScope(data, nativeScope, faces);
  const campus = auditVolumeScope(
    data,
    {
      id: "first",
      name: "Floor1",
      levelIds: [1],
      elevationFeet: 9,
      scope: "campus-floor",
    },
    faces,
  );
  assert.deepEqual(native.records, campus.records);
  assert.deepEqual(native.buildings, campus.buildings);
});
