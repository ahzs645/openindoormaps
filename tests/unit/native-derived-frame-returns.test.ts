import assert from "node:assert/strict";
import test from "node:test";
import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import {
  createNativeDerivedFrameReturnIndex,
  nativeDerivedFrameHash,
  nativeDerivedFramePlacementHash,
  nativeDerivedFrameReturnsHash,
  type NativeDerivedFrameReturns,
} from "../../app/indoor-project/native-derived-frame-returns";
import { createNativeDerivedFrameReturnIndex as sourceIndex } from "../../../reviter/lib/reviter/native-derived-frame-returns";
const model = "a".repeat(64),
  evidence = "b".repeat(64);
const box = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][][][] => [
  [
    [
      [a, b],
      [c, b],
      [c, d],
      [a, d],
    ],
  ],
];
export async function frameFixture() {
  const profile = {
    nativeElementId: 1,
    baseElevationFeet: 0,
    topElevationFeet: 0.2,
    partsFeet: box(0, 0, 1, 1),
    sourceWidthFeet: 1,
    sourceAxisDirectionFeet: [1, 0] as [number, number],
    sourceCapFeet: [
      [1, 0],
      [1, 1],
    ] as [number, number][],
    evidenceSha256: evidence,
  };
  const material = {
    version: 1 as const,
    sourceModelSha256: model,
    geometrySha256: "",
    levels: [
      {
        levelId: 10,
        elevationFeet: 0,
        cutElevationFeet: 0.1,
        evidenceSha256: evidence,
        sourceElementIds: [1, 2],
        originalNativeMemberSections: [profile],
        originalNativeHostRelations: [
          {
            hostNativeElementId: 99,
            memberNativeElementIds: [1],
            physicalDoorNativeElementIds: [],
            evidenceSha256: evidence,
          },
        ],
        sections: [
          {
            nativeElementId: 1,
            categoryId: 1,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 0.2,
            partsFeet: profile.partsFeet,
          },
          {
            nativeElementId: 2,
            categoryId: 1,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 10,
            partsFeet: box(1.1, -1, 2, 2),
          },
        ],
      },
    ],
  };
  material.geometrySha256 = await nativeMaterialSectionsHash(material);
  const floors = [
    { nativeElementId: 3, elevationFeet: 0, partsFeet: box(-1, -2, 3, 3) },
  ];
  const value: NativeDerivedFrameReturns = {
    version: 1,
    sourceModelSha256: model,
    sourceMaterialGeometrySha256: material.geometrySha256,
    sourceWallPositionRepairsSha256: nativeDerivedFramePlacementHash(undefined),
    geometrySha256: "",
    rows: [
      {
        id: "sill-1",
        levelId: 10,
        elevationFeet: 0,
        sourceNativeElementId: 1,
        targetNativeElementId: 2,
        nativeSharedCurtainHostId: 99,
        role: "walking-material",
        baseElevationFeet: 0,
        topElevationFeet: 0.2,
        sourceWidthFeet: 1,
        sourceAxisDirectionFeet: [1, 0],
        sourceCapFeet: [
          [1, 0],
          [1, 1],
        ],
        targetContactFeet: [
          [1.1, 0],
          [1.1, 1],
        ],
        targetOriginalFiniteFaceChainFeet: [
          [1.1, 0],
          [1.1, 1],
        ],
        partsFeet: box(0.99998, 0, 1.10002, 1),
        sourceOriginalMaterialPartsFeet: profile.partsFeet,
        targetOriginalMaterialPartsFeet:
          material.levels[0].sections[1].partsFeet,
        sourceFloorIds: [3],
        sourceFloorBindings: floors,
        sourceFloorPartsSha256: nativeDerivedFrameHash(floors),
        contactPaddingFeet: 0.00002,
        completeOriginalPhysicalOwnerCensusSha256: evidence,
        evidenceSha256: evidence,
      },
    ],
  };
  value.geometrySha256 = nativeDerivedFrameReturnsHash(value);
  return {
    source: { modelSha256: model },
    nativeMaterialSections: material,
    nativeDerivedFrameReturns: value,
    walkingSupport: {
      sourceModelSha256: model,
      floors: floors.map((f) => ({ ...f, ringsFeet: f.partsFeet[0] })),
    },
  };
}
const rehash = (d: Awaited<ReturnType<typeof frameFixture>>) =>
  (d.nativeDerivedFrameReturns.geometrySha256 = nativeDerivedFrameReturnsHash(
    d.nativeDerivedFrameReturns,
  ));
test("finite derived sill remains separate from original material with source/runtime cut parity", async () => {
  const d = await frameFixture(),
    before = JSON.stringify(d.nativeMaterialSections);
  const runtime = createNativeDerivedFrameReturnIndex(d),
    source = sourceIndex(d);
  assert.equal(runtime.partsAt(0.1).length, 1);
  assert.equal(runtime.partsAt(4).length, 0);
  assert.deepEqual(runtime.partsAt(0.1), source.partsAt(0.1));
  assert.equal(JSON.stringify(d.nativeMaterialSections), before);
});
test("rehashing does not authorize a wider or unrelated supported-floor footprint", async () => {
  const d = await frameFixture();
  d.nativeDerivedFrameReturns.rows[0].partsFeet = box(0.99998, 0, 1.10002, 1.5);
  rehash(d);
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(d),
    /full-width axis continuation/,
  );
});
test("source body, original host and floor holes bind the correction independently", async () => {
  const original = await frameFixture();
  const body = structuredClone(original);
  body.nativeMaterialSections.levels[0].originalNativeMemberSections = [];
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(body),
    /original finite body/,
  );
  const host = structuredClone(original);
  host.nativeMaterialSections.levels[0].originalNativeHostRelations = [];
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(host),
    /persisted original curtain host/,
  );
  const floor = structuredClone(original);
  floor.walkingSupport = structuredClone(floor.walkingSupport);
  floor.walkingSupport.floors[0].partsFeet[0].push([
    [1.02, 0.2],
    [1.08, 0.2],
    [1.08, 0.8],
    [1.02, 0.8],
  ]);
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(floor),
    /source floor binding/,
  );
  const hash = structuredClone(original);
  hash.nativeDerivedFrameReturns.rows[0].evidenceSha256 = "c".repeat(64);
  assert.throws(() => createNativeDerivedFrameReturnIndex(hash), /stale/);
});
test("first finite target contact cannot be bypassed by a farther wall face", async () => {
  const d = await frameFixture();
  const r = d.nativeDerivedFrameReturns.rows[0];
  r.targetOriginalFiniteFaceChainFeet = [
    [2, 0],
    [2, 1],
  ];
  r.partsFeet = box(0.99998, 0, 2.00002, 1);
  rehash(d);
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(d),
    /first original finite target contact/,
  );
});
test("new foreign physical material invalidates a formerly clear introduced strip", async () => {
  const d = await frameFixture();
  d.nativeMaterialSections.levels[0].sections.push({
    nativeElementId: 4,
    categoryId: 1,
    kind: "wall",
    baseElevationFeet: 0,
    topElevationFeet: 10,
    partsFeet: box(1.04, 0.2, 1.06, 0.8),
  });
  d.nativeMaterialSections.levels[0].sourceElementIds.push(4);
  d.nativeMaterialSections.geometrySha256 = await nativeMaterialSectionsHash(
    d.nativeMaterialSections,
  );
  d.nativeDerivedFrameReturns.sourceMaterialGeometrySha256 =
    d.nativeMaterialSections.geometrySha256;
  rehash(d);
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(d),
    /foreign original native material/,
  );
});

test("upper frame context checks foreign original material at its own finite height", async () => {
  const d = await frameFixture();
  const level = d.nativeMaterialSections.levels[0];
  const upper = {
    ...level.originalNativeMemberSections[0],
    nativeElementId: 5,
    baseElevationFeet: 7.8,
    topElevationFeet: 8,
  };
  level.originalNativeMemberSections.push(upper);
  level.sourceElementIds.push(5);
  level.originalNativeHostRelations[0].memberNativeElementIds.push(5);
  const anchor = d.nativeDerivedFrameReturns.rows[0];
  d.nativeDerivedFrameReturns.rows.push({
    ...structuredClone(anchor),
    id: "header-5",
    sourceNativeElementId: 5,
    baseElevationFeet: 7.8,
    topElevationFeet: 8,
    role: "enclosure-context-only",
    originalSourceAnchorMemberNativeElementId: 1,
    originalSourceAnchorFloorIds: [3],
    sourceFloorIds: [],
    sourceFloorBindings: [],
    sourceFloorPartsSha256: nativeDerivedFrameHash([]),
    unsupportedContextHeightNoWalkingFloorClaim: true,
  });
  d.nativeMaterialSections.geometrySha256 = await nativeMaterialSectionsHash(
    d.nativeMaterialSections,
  );
  d.nativeDerivedFrameReturns.sourceMaterialGeometrySha256 =
    d.nativeMaterialSections.geometrySha256;
  rehash(d);
  assert.equal(createNativeDerivedFrameReturnIndex(d).partsAt(7.9).length, 1);
  level.sourceElementIds.push(6);
  Object.assign(level, {
    originalFiniteMaterialSections: [
      {
        nativeElementId: 6,
        baseElevationFeet: 7.8,
        topElevationFeet: 8,
        partsFeet: box(1.04, 0.2, 1.06, 0.8),
        evidenceSha256: evidence,
      },
    ],
  });
  d.nativeMaterialSections.geometrySha256 = await nativeMaterialSectionsHash(
    d.nativeMaterialSections,
  );
  d.nativeDerivedFrameReturns.sourceMaterialGeometrySha256 =
    d.nativeMaterialSections.geometrySha256;
  rehash(d);
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(d),
    /header-5 intersects foreign/,
  );
  assert.throws(() => sourceIndex(d), /header-5 intersects foreign/);
});

async function outerEdgeContextFixture() {
  const d = await frameFixture();
  const floors = [
    { nativeElementId: 3, elevationFeet: 0, partsFeet: box(-1, -2, 3, 0.5) },
  ];
  d.walkingSupport.floors = floors.map((f) => ({
    ...f,
    ringsFeet: f.partsFeet[0],
  }));
  const r = d.nativeDerivedFrameReturns.rows[0];
  r.role = "enclosure-context-only";
  r.sourceFloorIds = [];
  r.sourceFloorBindings = [];
  r.sourceFloorPartsSha256 = nativeDerivedFrameHash([]);
  r.unsupportedContextHeightNoWalkingFloorClaim = true;
  r.sourceFloorOuterContext = {
    kind: "original-native-floor-outer-edge",
    sourceFloorIds: [3],
    sourceFloorBindings: floors,
    sourceFloorPartsSha256: nativeDerivedFrameHash(floors),
    sourceFloorOuterPartsSha256: nativeDerivedFrameHash(
      floors.flatMap((f) => f.partsFeet.map((p) => [p[0]])),
    ),
    evidenceSha256: evidence,
    noWalkingMaterial: true,
  };
  rehash(d);
  return d;
}

test("finite source outer-edge enclosure context preserves the slab and never becomes walking material", async () => {
  const d = await outerEdgeContextFixture(),
    before = JSON.stringify(d.walkingSupport);
  const runtime = createNativeDerivedFrameReturnIndex(d),
    source = sourceIndex(d);
  assert.equal(runtime.rows.length, 1);
  assert.deepEqual(runtime.partsAt(0.1), []);
  assert.deepEqual(runtime.partsAt(0.1), source.partsAt(0.1));
  assert.equal(JSON.stringify(d.walkingSupport), before);
});

test("rehashing outer-edge context cannot close an original inner floor aperture", async () => {
  const d = await outerEdgeContextFixture(),
    r = d.nativeDerivedFrameReturns.rows[0];
  const floor = d.walkingSupport.floors[0];
  floor.partsFeet[0].push([
    [1.02, 0.1],
    [1.08, 0.1],
    [1.08, 0.3],
    [1.02, 0.3],
  ]);
  const bindings = [
    {
      nativeElementId: floor.nativeElementId,
      elevationFeet: floor.elevationFeet,
      partsFeet: floor.partsFeet,
    },
  ];
  r.sourceFloorOuterContext!.sourceFloorBindings = bindings;
  r.sourceFloorOuterContext!.sourceFloorPartsSha256 =
    nativeDerivedFrameHash(bindings);
  rehash(d);
  assert.throws(() => createNativeDerivedFrameReturnIndex(d), /inner aperture/);
  assert.throws(() => sourceIndex(d), /inner aperture/);
});

test("outer-edge context retains exact floor provenance and independent foreign material guards", async () => {
  const original = await outerEdgeContextFixture();
  const stale = structuredClone(original);
  stale.walkingSupport.floors[0].partsFeet = box(-1, -2, 3, 0.4);
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(stale),
    /source floor binding changed/,
  );
  const foreign = structuredClone(original),
    level = foreign.nativeMaterialSections.levels[0];
  level.sections.push({
    nativeElementId: 4,
    categoryId: 1,
    kind: "wall",
    baseElevationFeet: 0,
    topElevationFeet: 10,
    partsFeet: box(1.04, 0.2, 1.06, 0.8),
  });
  level.sourceElementIds.push(4);
  foreign.nativeMaterialSections.geometrySha256 =
    await nativeMaterialSectionsHash(foreign.nativeMaterialSections);
  foreign.nativeDerivedFrameReturns.sourceMaterialGeometrySha256 =
    foreign.nativeMaterialSections.geometrySha256;
  rehash(foreign);
  assert.throws(
    () => createNativeDerivedFrameReturnIndex(foreign),
    /foreign original native material/,
  );
});
