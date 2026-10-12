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
 * exact-contact closure closes the same joint again. With `crossLevel` the
 * repair is on level 2 (elevation 10, plan cut 14) while the row is authored
 * on level 1 (elevation 0) with the height band [0, rowTopFeet). */
function fixture(
  options: {
    row?: boolean;
    column?: boolean;
    crossLevel?: boolean;
    rowTopFeet?: number;
    rowOwners?: number[];
  } = {},
) {
  const repairElevation = options.crossLevel ? 10 : 0,
    repairLevelId = options.crossLevel ? 2 : 1;
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
        levelId: repairLevelId,
        elevationFeet: repairElevation,
        cutElevationFeet: repairElevation + 4,
        evidenceSha256: "c".repeat(64),
        sourceElementIds: finite.map((f) => f.id),
        originalFiniteMaterialSections: finite.map((f) => ({
          nativeElementId: f.id,
          baseElevationFeet: repairElevation,
          topElevationFeet: repairElevation + 10,
          partsFeet: [[f.ring]],
          evidenceSha256: "e".repeat(64),
        })),
        sections: finite.map((f) => ({
          nativeElementId: f.id,
          categoryId: f.id === 50 ? -2_000_100 : -2_000_011,
          kind: f.id === 50 ? ("column" as const) : ("wall" as const),
          baseElevationFeet: repairElevation,
          topElevationFeet: repairElevation + 10,
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
  // A row that does not own target 20 may only meet it as an acknowledged
  // unverified census body (no exact parts), as source rows do.
  const unverifiedBodyIds =
    options.rowOwners && !options.rowOwners.includes(20) ? [20] : [];
  const drawingBacked = {
    version: 1 as const,
    kind: "exact-contact-closure" as const,
    decisionId: "2026-10-09-gap-review#q2",
    decisionsSha256: "9".repeat(64),
    nativeOwnerIds: options.rowOwners ?? [10, 20],
    measuredGapFeet: gap,
    numericalBoundFeet: 1.5e-5,
    construction,
    acknowledgedUnverifiedBodyIds: unverifiedBodyIds,
  };
  const binding = [
    { nativeElementId: 30, elevationFeet: 0, partsFeet: [floor] },
  ];
  const row = {
    id: "db:1:q2:10-20@0.0000,0.2500",
    levelId: 1,
    elevationFeet: 0,
    baseElevationFeet: 0,
    topElevationFeet: options.rowTopFeet ?? (options.crossLevel ? 30 : 10),
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
  // Body 40 is an unsectioned census body at the joint (a row co-owner only).
  const census = [
    ...finite,
    ...(options.rowOwners?.includes(40)
      ? [{ id: 40, ring: rect(-0.001, 0.2, 0.001, 0.3) }]
      : []),
  ];
  const foreign = census.map((f) => ({
    nativeElementId: f.id,
    boundsFeet: {
      min: [
        Math.min(...f.ring.map((p) => p[0])),
        Math.min(...f.ring.map((p) => p[1])),
        repairElevation,
      ],
      max: [
        Math.max(...f.ring.map((p) => p[0])),
        Math.max(...f.ring.map((p) => p[1])),
        repairElevation + 10,
      ],
    },
    ...(unverifiedBodyIds.includes(f.id) ? {} : { partsFeet: [[f.ring]] }),
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
    nativeLevels: [
      { id: 1, elevationFeet: 0 },
      ...(options.crossLevel ? [{ id: 2, elevationFeet: 10 }] : []),
    ],
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
        ...(options.crossLevel
          ? [
              {
                nativeElementId: 31,
                elevationFeet: 10,
                ringsFeet: floor[0],
                partsFeet: [floor],
              },
            ]
          : []),
      ],
    },
    nativeMaterialSections: material,
    nativeProvisionalCornerSeals: seals,
  } as unknown as IndoorDataset;
  const repair: NativeSelectionContactRepair = {
    id: `native-contact:${repairLevelId}:10-20`,
    sourceModelSha256: sha,
    sourceMaterialGeometrySha256: material.geometrySha256,
    levelId: repairLevelId,
    elevationFeet: repairElevation,
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

test("only an applied drawing-backed row present at the repair cut and owning both repair owners closes the same joint", () => {
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
    // Not material at this level's cut (elevation 0, cut 4).
    { ...row, baseElevationFeet: 4.5 },
    { ...row, topElevationFeet: 4 },
    { ...row, state: "proposed" },
    { ...row, drawingBacked: undefined },
    undefined,
  ])
    assert.equal(nativeSelectionContactSameJoint(repair, other), false);
});

const outcome = (run: () => unknown): { value?: unknown; error?: string } => {
  try {
    return { value: run() };
  } catch (error) {
    return { error: (error as Error).message };
  }
};
test("a row authored on another level whose height band covers this level's cut closes the same joint", () => {
  // (1) The Floor 1.25 q2 row reaches Floors 3/4: on level 2 it is plan
  // material at the cut and closes the same joint as the level-2 repair.
  const { data, repair, row } = fixture({ row: true, crossLevel: true });
  assert.equal(row.levelId, 1);
  assert.equal(repair.levelId, 2);
  assert.equal(nativeSelectionContactSameJoint(repair, row), true);
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
    compilerGuards(data, [repair], [compilerDerive(data, repair)]),
    recorded,
  );
  // (2) The same row with its band ending below the level-2 cut is not plan
  // material there: no duplicate and no refusal.
  const below = fixture({ row: true, crossLevel: true, rowTopFeet: 14 });
  assert.equal(nativeSelectionContactSameJoint(below.repair, below.row), false);
  assert.deepEqual(
    assertNativeSelectionContactPhysicalGuards(
      below.data,
      below.repair,
      deriveNativeSelectionContactRepair(below.data, below.repair),
    ),
    [],
  );
  assert.deepEqual(
    compilerGuards(
      below.data,
      [below.repair],
      [compilerDerive(below.data, below.repair)],
    ),
    [],
  );
});

test("a cross-level row with another owner or a real column in the gap is still foreign", () => {
  // (3) Row owners [10, 40]: not this joint, so foreign material in the gap.
  // (4) Same-joint row plus a native column inside the gap: still refused.
  const cases: { rowOwners?: number[]; column?: boolean }[] = [
    { rowOwners: [10, 40] },
    { column: true },
  ];
  for (const options of cases) {
    const { data, repair } = fixture({
      row: true,
      crossLevel: true,
      ...options,
    });
    const runtime = outcome(() =>
      assertNativeSelectionContactPhysicalGuards(
        data,
        repair,
        deriveNativeSelectionContactRepair(data, repair),
      ),
    );
    const compiler = outcome(() =>
      compilerGuards(data, [repair], [compilerDerive(data, repair)]),
    );
    assert.match(runtime.error ?? "", /foreign wall or column/);
    assert.deepEqual(compiler, runtime, "runtime and compiler agree");
  }
});
