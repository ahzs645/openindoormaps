import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  nativeDerivedFrameHash,
  nativeDerivedFramePlacementHash,
} from "../../app/indoor-project/native-derived-frame-returns";
import {
  createNativeProvisionalCornerSealIndex,
  drawingBackedAssumptionFootprint,
  nativeProvisionalCornerSealsHash,
} from "../../app/indoor-project/native-provisional-corner-seals";
import {
  deriveNativeSelectionContactRepair,
  type NativeSelectionContactRepair,
} from "../../app/indoor-project/native-selection-contact-repairs";
import {
  assertNativeSelectionContactPhysicalGuards,
  assertNativeSelectionContactRepairsPhysicalGuards,
  nativeSelectionContactSameJoint,
} from "../../app/indoor-project/native-selection-contact-guards";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalPoint } from "../../app/indoor-project/native-exact-planar-topology";
import { assertNativeSelectionContactRepairsPhysicalGuards as compilerGuards } from "../../../reviter/lib/reviter/native-selection-contact-guards.ts";
import { deriveNativeSelectionContactRepair as compilerDerive } from "../../../reviter/lib/reviter/native-selection-contact-repairs.ts";

type P2 = [number, number];
const rect = (a: number, b: number, c: number, d: number): P2[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
const sha = "a".repeat(64);
const noWallRepairs = undefined as Parameters<
  typeof nativeDerivedFramePlacementHash
>[0];
/** Wall 10 ends on wall 20 across a numerical seam (2^-30 ft). A published
 * contact repair closes the seam; optionally an applied drawing-backed
 * exact-contact closure closes the same joint again. */
function fixture(options: { row?: boolean; column?: boolean } = {}) {
  const gap = 2 ** -30;
  const source = rect(-10, 0, 0, 0.5),
    target = rect(gap, -1, 3, 2),
    floor = [rect(-20, -5, 10, 5)];
  const finite = [
    { id: 10, ring: source },
    { id: 20, ring: target },
    ...(options.column ? [{ id: 50, ring: rect(-0.05, 0.1, 0.05, 0.2) }] : []),
  ];
  const material = {
    version: 1 as const,
    sourceModelSha256: sha,
    geometrySha256: "",
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 4,
        evidenceSha256: "c".repeat(64),
        sourceElementIds: finite.map((f) => f.id),
        originalFiniteMaterialSections: finite.map((f) => ({
          nativeElementId: f.id,
          baseElevationFeet: 0,
          topElevationFeet: 10,
          partsFeet: [[f.ring]],
          evidenceSha256: "e".repeat(64),
        })),
        sections: finite.map((f) => ({
          nativeElementId: f.id,
          categoryId: f.id === 50 ? -2_000_100 : -2_000_011,
          kind: f.id === 50 ? ("column" as const) : ("wall" as const),
          baseElevationFeet: 0,
          topElevationFeet: 10,
          partsFeet: [[f.ring]],
        })),
      },
    ],
  };
  material.geometrySha256 = nativeDerivedFrameHash([
    material.version,
    material.sourceModelSha256,
    material.levels,
  ]);
  const construction = {
    kind: "bridge" as const,
    pointAFeet: [0, 0.25] as P2,
    pointBFeet: [gap, 0.25] as P2,
    directionFeet: [1, 0] as P2,
    halfWidthFeet: 0.0001,
    overlapFeet: 0.0001,
  };
  const drawingBacked = {
    version: 1 as const,
    kind: "exact-contact-closure" as const,
    decisionId: "2026-10-09-gap-review#q2",
    decisionsSha256: "9".repeat(64),
    nativeOwnerIds: [10, 20],
    measuredGapFeet: gap,
    numericalBoundFeet: 1.5e-5,
    construction,
    acknowledgedUnverifiedBodyIds: [] as number[],
  };
  const binding = [
    { nativeElementId: 30, elevationFeet: 0, partsFeet: [floor] },
  ];
  const row = {
    id: "db:1:q2:10-20@0.0000,0.2500",
    levelId: 1,
    elevationFeet: 0,
    baseElevationFeet: 0,
    topElevationFeet: 10,
    state: "applied",
    carrierContactNativeElementIds: [10],
    targetNativeElementId: 20,
    carrierContactFaceFeet: [construction.pointAFeet, construction.pointBFeet],
    nearestCarrierContactFeet: construction.pointAFeet,
    nearestTargetContactFeet: construction.pointBFeet,
    contactPaddingFeet: construction.overlapFeet,
    partsFeet: drawingBackedAssumptionFootprint(construction),
    sourceFloorIds: [30],
    sourceFloorBindings: binding,
    sourceFloorPartsSha256: nativeDerivedFrameHash(binding),
    drawingBacked,
    assumption: {
      kind: "drawing-backed",
      authorizationRecorded: true,
      authorizationEvidenceSha256: "1".repeat(64),
      revisitRequired: true,
      sourceVerified: false,
      evidenceSha256: nativeDerivedFrameHash(drawingBacked),
    },
    evidenceSha256: "3".repeat(64),
  };
  const foreign = finite.map((f) => ({
    nativeElementId: f.id,
    boundsFeet: {
      min: [
        Math.min(...f.ring.map((p) => p[0])),
        Math.min(...f.ring.map((p) => p[1])),
        0,
      ],
      max: [
        Math.max(...f.ring.map((p) => p[0])),
        Math.max(...f.ring.map((p) => p[1])),
        10,
      ],
    },
    partsFeet: [[f.ring]],
    evidenceSha256: "b".repeat(64),
  }));
  const seals = {
    version: 1,
    sourceModelSha256: sha,
    sourceMaterialGeometrySha256: material.geometrySha256,
    sourceWallPositionRepairsSha256:
      nativeDerivedFramePlacementHash(noWallRepairs),
    geometrySha256: "",
    completeOriginalPhysicalOwnerCensusSha256: nativeDerivedFrameHash(foreign),
    foreignBodies: foreign,
    rows: options.row ? [row] : [],
  };
  seals.geometrySha256 = nativeProvisionalCornerSealsHash(seals as never);
  const data = {
    source: { modelSha256: sha },
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    walls: [],
    records: [],
    doors: [],
    edges: [],
    nodes: [],
    walkingSupport: {
      version: 1,
      sourceModelSha256: sha,
      floors: [
        {
          nativeElementId: 30,
          elevationFeet: 0,
          ringsFeet: floor[0],
          partsFeet: [floor],
        },
      ],
    },
    nativeMaterialSections: material,
    nativeProvisionalCornerSeals: seals,
  } as unknown as IndoorDataset;
  const repair: NativeSelectionContactRepair = {
    id: "native-contact:1:10-20",
    sourceModelSha256: sha,
    sourceMaterialGeometrySha256: material.geometrySha256,
    levelId: 1,
    elevationFeet: 0,
    status: "applied",
    source: {
      nativeElementId: 10,
      ringsFeet: [source],
      capFeet: [source[1]!, source[2]!],
    },
    target: {
      nativeElementId: 20,
      ringsFeet: [target],
      faceFeet: [target[3]!, target[0]!],
    },
    evidenceSha256: "d".repeat(64),
    notes:
      "Numerical seam between an original cap and the original face it ends on.",
    assumption: {
      kind: "provisional-extracted-native-contact",
      revisitRequired: true,
    },
  };
  return { data, repair, row };
}

test("a drawing-backed row and a contact repair closing the same joint are one closure, recorded, not a foreign wall", () => {
  const { data, repair, row } = fixture({ row: true });
  // The row is valid applied material at the joint, and it sits inside the repair's gap.
  assert(createNativeProvisionalCornerSealIndex(data).partsAt(4).length > 0);
  const mask = deriveNativeSelectionContactRepair(data, repair);
  const body = row.partsFeet.map((part) =>
    part.map((ring) => ring.map(nativeRationalPoint)),
  );
  assert(nativeRationalOverlay("intersection", mask, body).length > 0);
  const recorded = [
    { repairId: repair.id, rowId: row.id, closure: "contact-repair" },
  ];
  assert.deepEqual(
    assertNativeSelectionContactPhysicalGuards(data, repair, mask),
    recorded,
  );
  assert.deepEqual(
    assertNativeSelectionContactRepairsPhysicalGuards(data, [repair], [mask]),
    recorded,
  );
  assert.deepEqual(
    compilerGuards(data, [repair], [compilerDerive(data, repair)]),
    recorded,
  );
  // Without the row the joint has one closure and nothing is recorded.
  const alone = fixture();
  assert.deepEqual(
    assertNativeSelectionContactPhysicalGuards(
      alone.data,
      alone.repair,
      deriveNativeSelectionContactRepair(alone.data, alone.repair),
    ),
    [],
  );
});

test("a gap that really meets foreign material still fails with a duplicate closure present", () => {
  const { data, repair } = fixture({ row: true, column: true });
  const mask = deriveNativeSelectionContactRepair(data, repair);
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(data, repair, mask),
    /foreign wall or column/,
  );
  assert.throws(
    () => compilerGuards(data, [repair], [compilerDerive(data, repair)]),
    /foreign wall or column/,
  );
});

test("only a same-level applied drawing-backed row owning both repair owners closes the same joint", () => {
  const { repair, row } = fixture({ row: true });
  assert.equal(nativeSelectionContactSameJoint(repair, row), true);
  // A junction row that also owns a third body still closes this joint.
  assert.equal(
    nativeSelectionContactSameJoint(repair, {
      ...row,
      drawingBacked: { ...row.drawingBacked, nativeOwnerIds: [10, 20, 40] },
    }),
    true,
  );
  for (const other of [
    {
      ...row,
      drawingBacked: { ...row.drawingBacked, nativeOwnerIds: [10, 40] },
    },
    { ...row, drawingBacked: { ...row.drawingBacked, nativeOwnerIds: [20] } },
    { ...row, levelId: 2 },
    { ...row, state: "proposed" },
    { ...row, drawingBacked: undefined },
    undefined,
  ])
    assert.equal(nativeSelectionContactSameJoint(repair, other), false);
});
