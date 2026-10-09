import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeDerivedFrameHash,
  nativeDerivedFramePlacementHash,
} from "../../app/indoor-project/native-derived-frame-returns";
import {
  createNativeProvisionalCornerSealIndex,
  nativeProvisionalCornerSealsHash,
  provisionalCornerFootprint,
  reviewedFiniteContactFootprint,
  verifyNativeProvisionalCornerSeals,
} from "../../app/indoor-project/native-provisional-corner-seals";
import { createNativeProvisionalCornerSealIndex as sourceIndex } from "../../../reviter/lib/reviter/native-provisional-corner-seals";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material";
import { nativeMaterialPlanWalls } from "../../app/indoor-project/native-material-plan";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import { nativeCirculationGeometryKey as sourceKey } from "../../../reviter/lib/reviter/native-circulation-geometry";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { nativeSourceStairPlacementHash } from "../../app/indoor-project/native-source-stair-material";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nativeAreaGeometrySha256 } from "../../app/indoor-project/native-area-review";
import { nativeExploreDatasetGeometrySha256 } from "../../app/indoor-project/native-explore-mapping";
const rect = (
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
export function provisionalCornerFixture() {
  const sha = "a".repeat(64),
    carrier = rect(0, -1, 1, 0),
    target = rect(1, 0.01, 2, 1),
    floor = rect(-1, -2, 3, 2),
    foreign = [
      {
        nativeElementId: 1,
        boundsFeet: { min: [0, -1, 0], max: [1, 0, 4] },
        evidenceSha256: "b".repeat(64),
      },
      {
        nativeElementId: 2,
        boundsFeet: { min: [1, 0.01, 0], max: [2, 1, 4] },
        evidenceSha256: "c".repeat(64),
      },
      {
        nativeElementId: 3,
        boundsFeet: { min: [10, 10, 0], max: [11, 11, 4] },
        partsFeet: rect(10, 10, 11, 11),
        evidenceSha256: "d".repeat(64),
      },
    ],
    finite = [
      {
        nativeElementId: 1,
        baseElevationFeet: 0,
        topElevationFeet: 4,
        partsFeet: carrier,
        evidenceSha256: "e".repeat(64),
      },
      {
        nativeElementId: 2,
        baseElevationFeet: 0,
        topElevationFeet: 4,
        partsFeet: target,
        evidenceSha256: "f".repeat(64),
      },
    ];
  const material = {
    version: 1,
    sourceModelSha256: sha,
    geometrySha256: "",
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 0.1,
        evidenceSha256: "0".repeat(64),
        sourceElementIds: [1, 2, 3],
        originalFiniteMaterialSections: finite,
        sections: [
          {
            nativeElementId: 1,
            kind: "wall",
            categoryId: 1,
            baseElevationFeet: 0,
            topElevationFeet: 4,
            partsFeet: carrier,
          },
          {
            nativeElementId: 2,
            kind: "wall",
            categoryId: 1,
            baseElevationFeet: 0,
            topElevationFeet: 4,
            partsFeet: target,
          },
        ],
      },
    ],
  };
  material.geometrySha256 = nativeDerivedFrameHash([
    material.version,
    material.sourceModelSha256,
    material.levels,
  ]);
  const binding = [{ nativeElementId: 10, elevationFeet: 0, partsFeet: floor }],
    proposal = {
      version: 1,
      sourceModelSha256: sha,
      sourceMaterialGeometrySha256: material.geometrySha256,
      sourceWallPositionRepairsSha256:
        nativeDerivedFramePlacementHash(undefined),
      geometrySha256: "",
      completeOriginalPhysicalOwnerCensusSha256:
        nativeDerivedFrameHash(foreign),
      foreignBodies: foreign,
      rows: [
        {
          id: "corner",
          levelId: 1,
          elevationFeet: 0,
          baseElevationFeet: 0,
          topElevationFeet: 4,
          state: "applied",
          carrierContactNativeElementIds: [1],
          targetNativeElementId: 2,
          carrierContactFaceFeet: [
            [0, 0],
            [1, 0],
          ],
          nearestCarrierContactFeet: [1, 0],
          nearestTargetContactFeet: [1, 0.01],
          contactPaddingFeet: 0.00002,
          partsFeet: provisionalCornerFootprint(
            [
              [0, 0],
              [1, 0],
            ],
            [1, 0],
            [1, 0.01],
            0.00002,
          ),
          sourceFloorIds: [10],
          sourceFloorBindings: binding,
          sourceFloorPartsSha256: nativeDerivedFrameHash(binding),
          assumption: {
            kind: "human-authorized-construction-assumption",
            authorizationRecorded: true,
            authorizationEvidenceSha256: "1".repeat(64),
            revisitRequired: true,
            sourceVerified: false,
            evidenceSha256: "2".repeat(64),
          },
          evidenceSha256: "3".repeat(64),
        },
      ],
    };
  proposal.geometrySha256 = nativeProvisionalCornerSealsHash(proposal as never);
  return {
    source: { modelSha256: sha },
    records: [],
    nodes: [],
    edges: [],
    doors: [],
    walls: [],
    stairs: [],
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    nativeMaterialSections: material,
    nativeProvisionalCornerSeals: proposal,
    walkingSupport: {
      version: 1,
      sourceModelSha256: sha,
      floors: [
        {
          nativeElementId: 10,
          elevationFeet: 0,
          ringsFeet: floor[0],
          partsFeet: floor,
        },
      ],
    },
  } as unknown as IndoorDataset;
}
const rehash = (d: IndoorDataset) => {
  d.nativeProvisionalCornerSeals!.geometrySha256 =
    nativeProvisionalCornerSealsHash(d.nativeProvisionalCornerSeals!);
};
test("restoring a provisional seal invalidates selection and published map caches without changing original material", async () => {
  const d = provisionalCornerFixture(),
    originalMaterial = JSON.stringify(d.nativeMaterialSections);
  const before = await Promise.all([
    nativeAreaGeometrySha256(d, 1),
    nativeExploreDatasetGeometrySha256(d),
  ]);
  assert.equal(
    createNativeProvisionalCornerSealIndex(d).partsAt(0.1).length,
    1,
  );
  d.nativeProvisionalCornerSeals!.rows[0].state = "restored";
  rehash(d);
  const after = await Promise.all([
    nativeAreaGeometrySha256(d, 1),
    nativeExploreDatasetGeometrySha256(d),
  ]);
  assert.notEqual(after[0], before[0]);
  assert.notEqual(after[1], before[1]);
  assert.equal(
    createNativeProvisionalCornerSealIndex(d).partsAt(0.1).length,
    0,
  );
  assert.equal(JSON.stringify(d.nativeMaterialSections), originalMaterial);
});
test("explicit provisional corner material is finite, reversible and source/runtime identical without source-model mutation", async () => {
  const d = provisionalCornerFixture(),
    before = JSON.stringify(d),
    a = createNativeProvisionalCornerSealIndex(d),
    b = sourceIndex(d);
  await verifyNativeProvisionalCornerSeals(d);
  assert.deepEqual(a.partsAt(0.1), b.partsAt(0.1));
  assert.equal(a.partsAt(-0.1).length, 0);
  assert.equal(a.partsAt(4).length, 0);
  assert.equal(JSON.stringify(d), before);
  d.nativeProvisionalCornerSeals!.rows[0].state = "restored";
  rehash(d);
  assert.equal(
    createNativeProvisionalCornerSealIndex(d).partsAt(0.1).length,
    0,
  );
});
test("proposed corners add no physical material; applying requires explicit technical authorization and no leaked review notes", () => {
  const d = provisionalCornerFixture();
  d.nativeProvisionalCornerSeals!.rows[0].state = "proposed";
  d.nativeProvisionalCornerSeals!.rows[0].assumption.authorizationRecorded =
    false;
  rehash(d);
  assert.equal(createNativeProvisionalCornerSealIndex(d).rows.length, 0);
  d.nativeProvisionalCornerSeals!.rows[0].state = "applied";
  rehash(d);
  assert.throws(() => createNativeProvisionalCornerSealIndex(d));
  d.nativeProvisionalCornerSeals!.rows[0].assumption.authorizationRecorded =
    true;
  (
    d.nativeProvisionalCornerSeals!.rows[0].assumption as any
  ).literalAuthorization = "private review text";
  rehash(d);
  assert.throws(() => createNativeProvisionalCornerSealIndex(d));
});
test("rehashed widening, farther first contact or foreign unknown cannot become assumed wall geometry", () => {
  for (const edit of [
    (d: IndoorDataset) =>
      (d.nativeProvisionalCornerSeals!.rows[0].partsFeet[0][0][0][0] -= 0.01),
    (d: IndoorDataset) =>
      (d.nativeProvisionalCornerSeals!.rows[0].nearestTargetContactFeet[1] = 0.02),
    (d: IndoorDataset) => {
      d.nativeProvisionalCornerSeals!.foreignBodies[2].boundsFeet = {
        min: [0.5, 0.002, 0],
        max: [0.6, 0.005, 4],
      };
      delete d.nativeProvisionalCornerSeals!.foreignBodies[2].partsFeet;
      d.nativeProvisionalCornerSeals!.completeOriginalPhysicalOwnerCensusSha256 =
        nativeDerivedFrameHash(d.nativeProvisionalCornerSeals!.foreignBodies);
    },
  ]) {
    const d = provisionalCornerFixture();
    edit(d);
    rehash(d);
    assert.throws(() => createNativeProvisionalCornerSealIndex(d));
  }
});
test("true original floor holes and omitted native physical owners veto even this authorized construction assumption", () => {
  const d = provisionalCornerFixture();
  d.walkingSupport!.floors[0].partsFeet![0].push([
    [0.5, 0.001],
    [0.500000001, 0.001],
    [0.500000001, 0.009],
    [0.5, 0.009],
  ]);
  assert.throws(() => createNativeProvisionalCornerSealIndex(d));
  const other = provisionalCornerFixture();
  other.nativeProvisionalCornerSeals!.foreignBodies.pop();
  other.nativeProvisionalCornerSeals!.completeOriginalPhysicalOwnerCensusSha256 =
    nativeDerivedFrameHash(other.nativeProvisionalCornerSeals!.foreignBodies);
  rehash(other);
  assert.throws(() => createNativeProvisionalCornerSealIndex(other));
});
test("every provisional enclosure reference follows actual cut heights and rejects missing/stale/restored descriptor", () => {
  const d = provisionalCornerFixture();
  d.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "e".repeat(64),
    levels: [
      {
        levelId: 20,
        elevationFeet: 1,
        partsFeet: rect(-1, -2, 3, 2),
        sourceElementIds: [100],
        evidenceSha256: "f".repeat(64),
        cutElevationsFeet: [2, 3],
        provisionalCornerGeometrySha256:
          d.nativeProvisionalCornerSeals!.geometrySha256,
        provisionalCornerIds: ["corner"],
      },
    ],
  };
  assert.ok(createNativeProvisionalCornerSealIndex(d));
  d.nativeIndoorEnvelopes!.levels[0].cutElevationsFeet = [5];
  assert.throws(() => createNativeProvisionalCornerSealIndex(d));
  d.nativeIndoorEnvelopes!.levels[0].cutElevationsFeet = [2];
  delete d.nativeProvisionalCornerSeals;
  assert.throws(() => createNativeProvisionalCornerSealIndex(d));
});
test("full descriptors travel to worker and invalidate source/runtime geometry and old foreign clearance when changed in-place", () => {
  const d = provisionalCornerFixture();
  delete d.nativeProvisionalCornerSeals;
  const legacy = nativeCirculationGeometryKey(d),
    oldForeign = nativeSourceStairPlacementHash(undefined);
  d.nativeProvisionalCornerSeals =
    provisionalCornerFixture().nativeProvisionalCornerSeals;
  const key = nativeCirculationGeometryKey(d);
  assert.notEqual(key, legacy);
  assert.equal(key, sourceKey(d));
  assert.deepEqual(
    routeWorkerDataset(d).nativeProvisionalCornerSeals,
    d.nativeProvisionalCornerSeals,
  );
  assert.notEqual(
    nativeSourceStairPlacementHash(
      undefined,
      undefined,
      d.nativeProvisionalCornerSeals,
    ),
    oldForeign,
  );
  d.nativeProvisionalCornerSeals!.rows[0].assumption.authorizationEvidenceSha256 =
    "4".repeat(64);
  assert.notEqual(nativeCirculationGeometryKey(d), key);
});
test("routing material retains provisional corners as ownerless foreign masks, and plan views tag assumed material separately", () => {
  const d = provisionalCornerFixture(),
    m = createNativeRoutingMaterialQuery(d)(0, 0.1);
  assert.deepEqual(
    m.derivedParts,
    d.nativeProvisionalCornerSeals!.rows[0].partsFeet,
  );
  d.nativeLevels[0].elevationFeet = -1;
  const plan = nativeMaterialPlanWalls(d, 1);
  const p = plan.find(
    (p) =>
      "geometrySource" in p &&
      p.geometrySource === "provisional-native-corner-seal",
  );
  assert.ok(p);
  assert.equal(p.reviewPatchId, "corner");
  assert.ok(p.nativeElementId < 0);
  assert.equal(d.walls.length, 0);
});

test("outer-floor provisional context binds original support and cannot become walking material or fill an aperture", () => {
  const d = provisionalCornerFixture() as any;
  const floor = rect(-1, -2, 3, 0);
  d.walkingSupport.floors[0].ringsFeet = floor[0];
  d.walkingSupport.floors[0].partsFeet = floor;
  const r = d.nativeProvisionalCornerSeals.rows[0];
  r.sourceFloorBindings[0].partsFeet = floor;
  r.sourceFloorPartsSha256 = nativeDerivedFrameHash(r.sourceFloorBindings);
  r.sourceFloorOuterContext = {
    kind: "original-native-floor-outer-edge",
    sourceFloorOuterPartsSha256: nativeDerivedFrameHash(
      floor.map((p) => [p[0]]),
    ),
    evidenceSha256: "0".repeat(64),
    noWalkingMaterial: true,
  };
  d.nativeProvisionalCornerSeals.geometrySha256 =
    nativeProvisionalCornerSealsHash(d.nativeProvisionalCornerSeals);
  const index = createNativeProvisionalCornerSealIndex(d);
  assert.equal(index.rows.length, 1);
  assert.deepEqual(index.partsAt(0.1), []);
  assert.deepEqual(sourceIndex(d).partsAt(0.1), []);
  assert.ok(
    nativeMaterialPlanWalls(d, 1).every(
      (w) =>
        !("geometrySource" in w) ||
        w.geometrySource !== "provisional-native-corner-seal",
    ),
  );
  r.sourceFloorOuterContext.sourceFloorOuterPartsSha256 = "d".repeat(64);
  d.nativeProvisionalCornerSeals.geometrySha256 =
    nativeProvisionalCornerSealsHash(d.nativeProvisionalCornerSeals);
  assert.throws(() => createNativeProvisionalCornerSealIndex(d), /outer edges/);
  const h = provisionalCornerFixture() as any;
  const hr = h.nativeProvisionalCornerSeals.rows[0],
    hp = h.walkingSupport.floors[0].ringsFeet;
  hp.push(rect(0.3, 0.001, 0.4, 0.005)[0][0]);
  hr.sourceFloorBindings[0].partsFeet = [hp];
  hr.sourceFloorPartsSha256 = nativeDerivedFrameHash(hr.sourceFloorBindings);
  hr.sourceFloorOuterContext = {
    kind: "original-native-floor-outer-edge",
    sourceFloorOuterPartsSha256: nativeDerivedFrameHash([[hp[0]]]),
    evidenceSha256: "0".repeat(64),
    noWalkingMaterial: true,
  };
  h.nativeProvisionalCornerSeals.geometrySha256 =
    nativeProvisionalCornerSealsHash(h.nativeProvisionalCornerSeals);
  assert.throws(
    () => createNativeProvisionalCornerSealIndex(h),
    /inner aperture/,
  );
});

test("separately reviewed partial finite bridges stay context-only and preserve old small-corner limits", () => {
  const d = provisionalCornerFixture() as any,
    r = d.nativeProvisionalCornerSeals.rows[0];
  const target = rect(0, 0.2, 1, 1);
  d.nativeMaterialSections.levels[0].sections[1].partsFeet = target;
  d.nativeMaterialSections.levels[0].originalFiniteMaterialSections[1].partsFeet =
    target;
  d.nativeProvisionalCornerSeals.foreignBodies[1].boundsFeet = {
    min: [0, 0.2, 0],
    max: [1, 1, 4],
  };
  d.nativeMaterialSections.geometrySha256 = nativeDerivedFrameHash([
    1,
    d.source.modelSha256,
    d.nativeMaterialSections.levels,
  ]);
  d.nativeProvisionalCornerSeals.sourceMaterialGeometrySha256 =
    d.nativeMaterialSections.geometrySha256;
  d.nativeProvisionalCornerSeals.completeOriginalPhysicalOwnerCensusSha256 =
    nativeDerivedFrameHash(d.nativeProvisionalCornerSeals.foreignBodies);
  r.materialRole = "enclosure-context-only";
  r.reviewedConstructionShape = {
    kind: "finite-face-fragment-bridge",
    carrierFragmentFeet: [
      [0.2, 0],
      [0.5, 0],
    ],
    targetFragmentFeet: [
      [0.2, 0.2],
      [0.5, 0.2],
    ],
    paddingDirectionFeet: [0, 1],
    evidenceSha256: "b".repeat(64),
    sourceAxisCertified: false,
    sourceFullMemberWidthCertified: false,
  };
  r.partsFeet = reviewedFiniteContactFootprint(
    r.reviewedConstructionShape,
    r.contactPaddingFeet,
  );
  d.nativeProvisionalCornerSeals.geometrySha256 =
    nativeProvisionalCornerSealsHash(d.nativeProvisionalCornerSeals);
  assert.equal(createNativeProvisionalCornerSealIndex(d).rows.length, 1);
  assert.deepEqual(createNativeProvisionalCornerSealIndex(d).partsAt(0.1), []);
  assert.deepEqual(sourceIndex(d).partsAt(0.1), []);
  assert.throws(
    () =>
      provisionalCornerFootprint(
        [
          [0, 0],
          [1, 0],
        ],
        [1, 0],
        [1, 0.2],
        0.00002,
      ),
    /Invalid finite/,
  );
  r.partsFeet[0][0][0][0] -= 0.01;
  d.nativeProvisionalCornerSeals.geometrySha256 =
    nativeProvisionalCornerSealsHash(d.nativeProvisionalCornerSeals);
  assert.throws(
    () => createNativeProvisionalCornerSealIndex(d),
    /geometry changed/,
  );
});

test("proposal-only review runs finite material guards without application or material exposure", () => {
  const d = provisionalCornerFixture() as any,
    r = d.nativeProvisionalCornerSeals.rows[0];
  r.state = "proposed";
  r.assumption.authorizationRecorded = false;
  d.nativeProvisionalCornerSeals.geometrySha256 =
    nativeProvisionalCornerSealsHash(d.nativeProvisionalCornerSeals);
  const before = JSON.stringify(d),
    review = createNativeProvisionalCornerSealIndex(d, {
      reviewProposed: true,
    });
  assert.equal(review.rows.length, 1);
  assert.deepEqual(review.partsAt(0.1), []);
  assert.equal(JSON.stringify(d), before);
  r.partsFeet[0][0][0][0] -= 0.01;
  d.nativeProvisionalCornerSeals.geometrySha256 =
    nativeProvisionalCornerSealsHash(d.nativeProvisionalCornerSeals);
  assert.throws(
    () => createNativeProvisionalCornerSealIndex(d, { reviewProposed: true }),
    /geometry changed/,
  );
});

test("true finite corner contact keeps its positive area at large native coordinates", () => {
  const d = provisionalCornerFixture() as any,
    r = d.nativeProvisionalCornerSeals.rows[0],
    target = rect(1.02, 0.01, 2, 1);
  d.nativeMaterialSections.levels[0].sections[1].partsFeet = target;
  d.nativeMaterialSections.levels[0].originalFiniteMaterialSections[1].partsFeet =
    target;
  d.nativeProvisionalCornerSeals.foreignBodies[1].boundsFeet = {
    min: [1.02, 0.01, 0],
    max: [2, 1, 4],
  };
  r.materialRole = "enclosure-context-only";
  r.reviewedConstructionShape = {
    kind: "native-corner-points-bridge",
    carrierFragmentFeet: [
      [1, 0],
      [1, 0],
    ],
    targetFragmentFeet: [
      [1.02, 0.01],
      [1.02, 0.01],
    ],
    paddingDirectionFeet: [1, 0],
    evidenceSha256: "b".repeat(64),
    sourceAxisCertified: false,
    sourceFullMemberWidthCertified: false,
  };
  const shift = (p: number[]) => {
    p[0] += 258;
    p[1] += 459;
  };
  // Translate each independently owned record once, preserving source identity.
  for (const p of d.nativeMaterialSections.levels[0]
    .originalFiniteMaterialSections)
    for (const q of p.partsFeet.flat(2)) shift(q);
  // Fixture sections share their original finite profile arrays.
  for (const b of d.nativeProvisionalCornerSeals.foreignBodies) {
    shift(b.boundsFeet.min);
    shift(b.boundsFeet.max);
    if (b.partsFeet) for (const p of b.partsFeet.flat(2)) shift(p);
  }
  for (const p of d.walkingSupport.floors[0].partsFeet.flat(2)) shift(p);
  for (const p of [
    ...r.carrierContactFaceFeet,
    r.nearestCarrierContactFeet,
    r.nearestTargetContactFeet,
  ])
    shift(p);
  for (const p of [
    ...r.reviewedConstructionShape.carrierFragmentFeet,
    ...r.reviewedConstructionShape.targetFragmentFeet,
  ])
    shift(p);
  r.partsFeet = reviewedFiniteContactFootprint(
    r.reviewedConstructionShape,
    r.contactPaddingFeet,
  );
  d.nativeMaterialSections.geometrySha256 = nativeDerivedFrameHash([
    1,
    d.source.modelSha256,
    d.nativeMaterialSections.levels,
  ]);
  d.nativeProvisionalCornerSeals.sourceMaterialGeometrySha256 =
    d.nativeMaterialSections.geometrySha256;
  d.nativeProvisionalCornerSeals.completeOriginalPhysicalOwnerCensusSha256 =
    nativeDerivedFrameHash(d.nativeProvisionalCornerSeals.foreignBodies);
  r.sourceFloorPartsSha256 = nativeDerivedFrameHash(r.sourceFloorBindings);
  d.nativeProvisionalCornerSeals.geometrySha256 =
    nativeProvisionalCornerSealsHash(d.nativeProvisionalCornerSeals);
  assert.equal(createNativeProvisionalCornerSealIndex(d).rows.length, 1);
  assert.deepEqual(sourceIndex(d).partsAt(0.1), []);
});
