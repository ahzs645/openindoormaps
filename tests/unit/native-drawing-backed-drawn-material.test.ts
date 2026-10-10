import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeDerivedFrameHash,
  nativeDerivedFramePlacementHash,
} from "../../app/indoor-project/native-derived-frame-returns";
import {
  createNativeProvisionalCornerSealIndex,
  drawingBackedAssumptionFootprint,
  nativeProvisionalAssumptionCounts,
  nativeProvisionalCornerSealsHash,
  verifyDrawingBackedDrawingEvidence,
  type NativeDrawingBackedConstruction,
} from "../../app/indoor-project/native-provisional-corner-seals";
import {
  createNativeProvisionalCornerSealIndex as sourceIndex,
  verifyDrawingBackedDrawingEvidence as sourceDrawingEvidence,
} from "../../../reviter/lib/reviter/native-provisional-corner-seals";
import type { IndoorDataset } from "../../app/indoor-project/contract";

type P2 = [number, number];
type Seg = [P2, P2];
const rect = (a: number, b: number, c: number, d: number): P2[][][] => [
  [
    [
      [a, b],
      [c, b],
      [c, d],
      [a, d],
    ],
  ],
];
const sha = "a".repeat(64);
const noWallRepairs = undefined as Parameters<
  typeof nativeDerivedFramePlacementHash
>[0];
/** Wall #1 (x 0..2, 0.5 ft thick) ends 0.1 ft short of column #2 (x 2.1..2.9). The registered
 * drawing draws the wall's two face lines; by default they run on through the column. */
function fixture(
  options: {
    construction?: NativeDrawingBackedConstruction;
    wallLines?: Seg[];
    doorSegments?: Seg[];
    pairs?: [number, number][];
    outlines?: number[][];
    floor?: P2[][][];
    doors?: { footprint: P2[]; enabled: boolean }[];
    owners?: number[];
    withColumn?: boolean;
  } = {},
) {
  const wall = rect(0, -0.25, 2, 0.25),
    column = rect(2.1, -0.4, 2.9, 0.4),
    floor = options.floor ?? rect(-1, -2, 10, 2),
    withColumn = options.withColumn ?? true;
  const owned = [
    { id: 1, parts: wall, max: [2, 0.25, 4] },
    ...(withColumn ? [{ id: 2, parts: column, max: [2.9, 0.4, 4] }] : []),
  ];
  const foreign = owned.map((o) => ({
    nativeElementId: o.id,
    boundsFeet: {
      min: [o.parts[0][0][0][0], o.parts[0][0][0][1], 0],
      max: o.max,
    },
    evidenceSha256: "b".repeat(64),
  }));
  const finite = owned.map((o) => ({
    nativeElementId: o.id,
    baseElevationFeet: 0,
    topElevationFeet: 4,
    partsFeet: o.parts,
    evidenceSha256: "e".repeat(64),
  }));
  const material = {
    version: 1,
    sourceModelSha256: sha,
    geometrySha256: "",
    levels: [0.1, 4].map((cut) => ({
      levelId: 1,
      elevationFeet: 0,
      cutElevationFeet: cut,
      evidenceSha256: "0".repeat(64),
      sourceElementIds: owned.map((o) => o.id),
      originalFiniteMaterialSections: finite,
      sections: finite.map((f) => ({
        nativeElementId: f.nativeElementId,
        kind: f.nativeElementId === 2 ? "column" : "wall",
        categoryId: 1,
        baseElevationFeet: 0,
        topElevationFeet: 4,
        partsFeet: f.partsFeet,
      })),
    })),
  };
  material.geometrySha256 = nativeDerivedFrameHash([
    material.version,
    material.sourceModelSha256,
    material.levels,
  ]);
  const wallSegments: Seg[] = options.wallLines ?? [
    [
      [0, -0.25],
      [3, -0.25],
    ],
    [
      [0, 0.25],
      [3, 0.25],
    ],
  ];
  const section = {
    sectionId: "Test LVL 1",
    levelId: 1,
    registrationErrorFeet: 0,
    wallSegments,
    doorSegments: options.doorSegments ?? [],
  };
  const boundaryReference = {
    format: "reviter-boundary-reference",
    version: 1,
    coordinateSystem: "revit-model-feet",
    sourceSha256: "5".repeat(64),
    sections: [section],
  };
  const construction: NativeDrawingBackedConstruction =
    options.construction ?? {
      kind: "wall-end-extension",
      wallNativeElementId: 1,
      endFaceFeet: [
        [2, -0.25],
        [2, 0.25],
      ],
      axisFeet: [1, 0],
      lengthFeet: 0.11,
      backOverlapFeet: 0.01,
    };
  const binding = [{ nativeElementId: 10, elevationFeet: 0, partsFeet: floor }];
  const drawingBacked = {
    version: 1 as const,
    kind: "dwg-drawn-material" as const,
    decisionId: "test-decisions#joint",
    decisionsSha256: "9".repeat(64),
    nativeOwnerIds: options.owners ?? owned.map((o) => o.id),
    measuredGapFeet: 0.1,
    construction,
    dwg: {
      sourceDwgSha256: boundaryReference.sourceSha256,
      registrationSha256: nativeDerivedFrameHash([
        boundaryReference.sourceSha256,
        section,
      ]),
      sectionId: section.sectionId,
      toleranceFeet: 0.05,
      entities: wallSegments.map((segmentFeet, index) => ({
        kind: "wallSegments" as const,
        index,
        segmentFeet,
      })),
      drawnMaterial: {
        faceLinePairs: options.pairs ?? [[0, 1]],
        closedOutlines: options.outlines ?? [],
      },
    },
    acknowledgedUnverifiedBodyIds: [] as number[],
  };
  const row = {
    id: "db:1:test:drawn-material",
    levelId: 1,
    elevationFeet: 0,
    baseElevationFeet: 0,
    topElevationFeet: 4,
    state: "applied",
    carrierContactNativeElementIds: [1],
    targetNativeElementId: 2,
    carrierContactFaceFeet: [
      [2, -0.25],
      [2, 0.25],
    ],
    nearestCarrierContactFeet: [2, 0],
    nearestTargetContactFeet: [2.1, 0],
    contactPaddingFeet: 0.01,
    partsFeet: drawingBackedAssumptionFootprint(construction),
    sourceFloorIds: [10],
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
  const seals = {
    version: 1,
    sourceModelSha256: sha,
    sourceMaterialGeometrySha256: material.geometrySha256,
    sourceWallPositionRepairsSha256:
      nativeDerivedFramePlacementHash(noWallRepairs),
    geometrySha256: "",
    completeOriginalPhysicalOwnerCensusSha256: nativeDerivedFrameHash(foreign),
    foreignBodies: foreign,
    rows: [row],
  };
  const doors = (options.doors ?? []).map((d, i) => ({
    nativeElementId: 90 + i,
    id: `door:${90 + i}`,
    footprintFeet: d.footprint,
  }));
  const edges = (options.doors ?? []).map((d, i) => ({
    id: `door:${90 + i}`,
    kind: "door",
    enabled: d.enabled,
    pointsFeet: [[2.05, 0, 0]],
  }));
  const data = {
    source: { modelSha256: sha },
    records: [],
    nodes: [],
    edges,
    doors,
    walls: [],
    stairs: [],
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    nativeMaterialSections: material,
    nativeProvisionalCornerSeals: seals,
    walkingSupport: {
      version: 1,
      sourceModelSha256: sha,
      floors: [
        {
          nativeElementId: 10,
          elevationFeet: 0,
          ringsFeet: floor[0][0],
          partsFeet: floor,
        },
      ],
    },
  } as unknown as IndoorDataset;
  seals.geometrySha256 = nativeProvisionalCornerSealsHash(seals as never);
  return { data, boundaryReference };
}
const index = (data: IndoorDataset) =>
  createNativeProvisionalCornerSealIndex(data);

test("a wall-end extension inside the drawn wall band closes the joint, identically in source and runtime", () => {
  const { data, boundaryReference } = fixture();
  const runtime = index(data);
  assert.ok(runtime.partsAt(0.1).length > 0);
  assert.deepEqual(
    JSON.stringify(runtime.partsAt(0.1)),
    JSON.stringify(sourceIndex(data as never).partsAt(0.1)),
  );
  verifyDrawingBackedDrawingEvidence(
    data.nativeProvisionalCornerSeals,
    boundaryReference,
  );
  sourceDrawingEvidence(
    data.nativeProvisionalCornerSeals as never,
    boundaryReference,
  );
  assert.equal(
    nativeProvisionalAssumptionCounts(data.nativeProvisionalCornerSeals)
      .drawingBackedByKind["dwg-drawn-material"],
    1,
  );
  // the same body is far wider than the old 0.05 ft seal half-width: evidence, not size, decides
  assert.ok(Math.abs(runtime.rows[0]!.partsFeet[0]![0]![2]![1] - 0.25) < 1e-12);
});

test("a closed drawn outline (column casing) is drawn material too", () => {
  const casing: Seg[] = [
    [
      [1.9, -0.45],
      [3, -0.45],
    ],
    [
      [3, -0.45],
      [3, 0.45],
    ],
    [
      [3, 0.45],
      [1.9, 0.45],
    ],
    [
      [1.9, 0.45],
      [1.9, -0.45],
    ],
  ];
  const { data } = fixture({
    wallLines: casing,
    pairs: [],
    outlines: [[0, 1, 2, 3]],
  });
  assert.ok(index(data).partsAt(0.1).length > 0);
});

test("a DWG-only wall between registered face lines needs no native host body", () => {
  const faceA: Seg = [
      [0, -0.25],
      [8, -0.25],
    ],
    faceB: Seg = [
      [0, 0.25],
      [8, 0.25],
    ];
  const { data, boundaryReference } = fixture({
    withColumn: false,
    wallLines: [faceA, faceB],
    construction: {
      kind: "dwg-face-pair",
      faceAFeet: faceA,
      faceBFeet: faceB,
      intervalFeet: [1.9, 8],
    },
  });
  assert.ok(index(data).partsAt(0.1).length > 0);
  verifyDrawingBackedDrawingEvidence(
    data.nativeProvisionalCornerSeals,
    boundaryReference,
  );
});

test("refused outside drawn material: the drawn wall lines stop at the native wall end", () => {
  const { data } = fixture({
    wallLines: [
      [
        [0, -0.25],
        [2, -0.25],
      ],
      [
        [0, 0.25],
        [2, 0.25],
      ],
    ],
  });
  assert.throws(() => index(data), /outside drawn DWG material/);
  // a band wider than any wall is not drawn wall material
  const wide = fixture({
    wallLines: [
      [
        [0, -0.25],
        [3, -0.25],
      ],
      [
        [0, 3.5],
        [3, 3.5],
      ],
    ],
  });
  assert.throws(() => index(wide.data), /not a wall/);
});

test("refused when crossing a door: a native door footprint (even disabled) or a registered door segment", () => {
  const door = rect(2.02, -0.6, 2.08, 0.6)[0]![0]!;
  assert.throws(
    () => index(fixture({ doors: [{ footprint: door, enabled: false }] }).data),
    /crosses native door footprint 90/,
  );
  const drawn = fixture({
    doorSegments: [
      [
        [2.05, -0.6],
        [2.05, 0.6],
      ],
    ],
  });
  index(drawn.data);
  assert.throws(
    () =>
      verifyDrawingBackedDrawingEvidence(
        drawn.data.nativeProvisionalCornerSeals,
        drawn.boundaryReference,
      ),
    /crosses registered DWG door segment/,
  );
});

test("refused over a floor void without drawn material, accepted along a drawn line at that edge", () => {
  const voided: P2[][][] = [
    [
      [
        [-1, -2],
        [10, -2],
        [10, 2],
        [-1, 2],
      ],
      [
        [2.02, -0.3],
        [2.02, 0.3],
        [2.3, 0.3],
        [2.3, -0.3],
      ],
    ],
  ];
  const lines: Seg[] = [
    [
      [0, -0.25],
      [2.03, -0.25],
    ],
    [
      [0, 0.25],
      [2.03, 0.25],
    ],
  ];
  assert.throws(
    () => index(fixture({ floor: voided, wallLines: lines }).data),
    /over a native floor opening, void or slab edge outside drawn DWG material/,
  );
  assert.ok(index(fixture({ floor: voided }).data).partsAt(0.1).length > 0);
});

test("refused when DWG entities are missing or not this project's registered segments", () => {
  const none = fixture();
  const row = none.data.nativeProvisionalCornerSeals!.rows[0]!;
  delete (row.drawingBacked as { dwg?: unknown }).dwg;
  none.data.nativeProvisionalCornerSeals!.geometrySha256 =
    nativeProvisionalCornerSealsHash(none.data.nativeProvisionalCornerSeals!);
  assert.throws(() => index(none.data), /Invalid drawing-backed/);
  const dangling = fixture({ pairs: [[0, 5]] });
  assert.throws(() => index(dangling.data), /Invalid drawing-backed/);
  const moved = fixture();
  const reference = structuredClone(moved.boundaryReference);
  reference.sections[0]!.wallSegments[1] = [
    [0, 0.3],
    [3, 0.3],
  ];
  assert.throws(
    () =>
      verifyDrawingBackedDrawingEvidence(
        moved.data.nativeProvisionalCornerSeals,
        reference,
      ),
    /registered drawing/,
  );
});

test("an extension must be the wall's own end face swept along its own axis", () => {
  const skew = fixture({
    construction: {
      kind: "wall-end-extension",
      wallNativeElementId: 1,
      endFaceFeet: [
        [1.5, -0.25],
        [1.5, 0.25],
      ],
      axisFeet: [1, 0],
      lengthFeet: 0.61,
      backOverlapFeet: 0.01,
    },
  });
  assert.throws(() => index(skew.data), /own end face/);
});

test("two parallel lines with other registered linework between them are not solid drawn material", () => {
  const lines: Seg[] = [
    [
      [0, -0.25],
      [3, -0.25],
    ],
    [
      [0, 0.25],
      [3, 0.25],
    ],
    [
      [2.04, -0.2],
      [2.04, 0.2],
    ],
  ];
  const { data, boundaryReference } = fixture({ wallLines: lines });
  // the row cites only the outer pair (all three lines are cited entities, the third in no band)
  assert.ok(index(data).partsAt(0.1).length > 0);
  assert.throws(
    () =>
      verifyDrawingBackedDrawingEvidence(
        data.nativeProvisionalCornerSeals,
        boundaryReference,
      ),
    /not solid drawn material: registered line wallSegments#2/,
  );
});
