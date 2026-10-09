import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import { nativeMaterialPlanExactWalls } from "../../app/indoor-project/native-material-plan";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalAreaCompare } from "../../app/indoor-project/native-exact-planar-topology";
import {
  deriveNativeSelectionContactRepair,
  nativeSelectionContactInterval,
  validateNativeSelectionContactRepairs,
  type NativeSelectionContactRepair,
} from "../../app/indoor-project/native-selection-contact-repairs";
import { assertNativeSelectionContactPhysicalGuards } from "../../app/indoor-project/native-selection-contact-guards";
type P = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): P[][] => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
];
async function fixture(trim = 1e-10, gap = 2 ** -45) {
  const model = "a".repeat(64),
    source = rect(-10, 0, 0, 1),
    target = rect(gap, trim, 3, 1 - trim);
  const material = {
    version: 1 as const,
    sourceModelSha256: model,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 4,
        evidenceSha256: "c".repeat(64),
        sourceElementIds: [10, 20],
        sections: [source, target].map((rings, i) => ({
          nativeElementId: i ? 20 : 10,
          categoryId: -2000011,
          kind: "wall" as const,
          baseElevationFeet: 0,
          topElevationFeet: 10,
          partsFeet: [rings],
        })),
      },
    ],
  };
  const data = {
    source: { modelSha256: model },
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    walls: [],
    records: [],
    doors: [],
    edges: [],
    walkingSupport: {
      version: 1,
      sourceModelSha256: model,
      floors: [
        {
          nativeElementId: 30,
          elevationFeet: 0,
          ringsFeet: rect(-20, -5, 10, 5),
        },
      ],
    },
    nativeMaterialSections: {
      ...material,
      geometrySha256: await nativeMaterialSectionsHash(material),
    },
  } as unknown as IndoorDataset;
  const repair: NativeSelectionContactRepair = {
    id: "finite:10-20",
    sourceModelSha256: model,
    sourceMaterialGeometrySha256: data.nativeMaterialSections!.geometrySha256,
    levelId: 1,
    elevationFeet: 0,
    status: "applied",
    source: {
      nativeElementId: 10,
      ringsFeet: source,
      capFeet: [source[0][1], source[0][2]],
    },
    target: {
      nativeElementId: 20,
      ringsFeet: target,
      faceFeet: [target[0][3], target[0][0]],
    },
    contactMode: "finite-cap-overlap",
    evidenceSha256: "d".repeat(64),
    notes: "Explicit provisional finite source contact.",
    assumption: {
      kind: "provisional-extracted-native-contact",
      revisitRequired: true,
    },
  };
  return { data, repair, gap, trim };
}
function bind(data: IndoorDataset, repair: NativeSelectionContactRepair) {
  const current = nativeMaterialPlanExactWalls(
    data,
    1,
    createNativeRoutingMaterialQuery(data),
  );
  for (const e of [repair.source, repair.target])
    e.ringsFeet = current.find(
      (w) => w.nativeElementId === e.nativeElementId,
    )!.ringsFeet;
}
test("finite option reconstructs maximal rational interval; full-cap default still rejects partial contact", async () => {
  const { data, repair, gap, trim } = await fixture(),
    before = JSON.stringify({ data, repair });
  assert.throws(
    () =>
      deriveNativeSelectionContactRepair(data, {
        ...repair,
        contactMode: undefined,
      }),
    /partial-width/,
  );
  const mask = deriveNativeSelectionContactRepair(data, repair),
    expected = nativeRationalOverlay("union", [rect(0, trim, gap, 1 - trim)]);
  assert.equal(nativeRationalOverlay("difference", mask, expected).length, 0);
  assert.equal(nativeRationalOverlay("difference", expected, mask).length, 0);
  assert.equal(nativeRationalAreaCompare(mask, []), 1);
  assert.equal(
    nativeRationalOverlay("intersection", mask, [
      repair.source.ringsFeet,
      repair.target.ringsFeet,
    ]).length,
    0,
  );
  assert.doesNotThrow(() =>
    assertNativeSelectionContactPhysicalGuards(data, repair, mask),
  );
  assert.equal(JSON.stringify({ data, repair }), before);
  const span = nativeSelectionContactInterval(repair);
  assert(span.start.n > 0n);
  assert(span.end.n < span.end.d);
});
test("finite option rejects excessive lateral trims, depth, full-width misuse and unrecognized modes", async () => {
  for (const [trim, gap] of [
    [0.000001, 2 ** -45],
    [1e-10, 0.000001],
    [0, 2 ** -45],
    [0.6, 2 ** -45],
  ]) {
    const { data, repair } = await fixture(trim, gap);
    assert.throws(() => deriveNativeSelectionContactRepair(data, repair));
  }
  const { repair } = await fixture();
  assert.throws(
    () =>
      validateNativeSelectionContactRepairs({
        version: 1,
        sourceModelSha256: repair.sourceModelSha256,
        repairs: [{ ...repair, contactMode: "unbounded" } as any],
      }),
    /finite original/,
  );
});
test("finite interval cannot choose a far face, invent a trimmed source cap or suppress a concave target", async () => {
  const { data, repair } = await fixture();
  const far = {
    ...repair,
    target: {
      ...repair.target,
      faceFeet: [
        repair.target.ringsFeet[0][1],
        repair.target.ringsFeet[0][2],
      ] as [P, P],
    },
  };
  assert.throws(
    () => deriveNativeSelectionContactRepair(data, far),
    /first original/,
  );
  assert.throws(
    () =>
      deriveNativeSelectionContactRepair(data, {
        ...repair,
        source: {
          ...repair.source,
          capFeet: [
            [0, 1e-10],
            [0, 1 - 1e-10],
          ],
        },
      }),
    /full actual/,
  );
  const r = repair.target.ringsFeet[0],
    concave = [r[0], r[1], [2, 0.5], r[2], r[3]];
  data.nativeMaterialSections!.levels[0].sections[1].partsFeet = [[concave]];
  bind(data, repair);
  assert.throws(
    () => deriveNativeSelectionContactRepair(data, repair),
    /nonconvex/,
  );
});
test("entire original cap needs floor even when trimmed gap is fully supported", async () => {
  const { data, repair, trim } = await fixture();
  const mask = deriveNativeSelectionContactRepair(data, repair);
  data.walkingSupport!.floors[0].ringsFeet = rect(-20, trim / 2, 10, 5);
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(data, repair, mask),
    /entire original source cap/,
  );
});
test("entire original cap cannot cross a protected hole hidden by another slab or by finite trimming", async () => {
  const { data, repair, trim } = await fixture();
  const mask = deriveNativeSelectionContactRepair(data, repair);
  data.walkingSupport!.floors[0].ringsFeet.push(
    rect(-1e-12, trim / 4, 1e-12, trim / 2)[0],
  );
  data.walkingSupport!.floors.push({
    nativeElementId: 31,
    elevationFeet: 0,
    ringsFeet: rect(-20, -5, 10, 5),
  });
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(data, repair, mask),
    /entire original source cap/,
  );
});
test("finite option never admits positive physical door, fixture or foreign material overlap", async () => {
  for (const kind of ["door", "fixture", "wall", "column"]) {
    const { data, repair, gap } = await fixture();
    const mask = deriveNativeSelectionContactRepair(data, repair),
      tiny = rect(0, 0.5, gap, 0.5000001);
    if (kind === "door")
      data.doors = [
        {
          id: "protected",
          nativeElementId: 40,
          levelId: 1,
          pointFeet: [0, 0.5],
          normalFeet: [1, 0],
          footprintFeet: tiny[0],
          roomKeys: [],
          state: "unmatched",
        },
      ];
    else if (kind === "fixture")
      data.circulationGeometry = {
        version: 1,
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: "bound",
        cells: [],
        fixtures: [
          {
            id: "protected",
            nativeElementId: 40,
            levelIds: [1],
            elevationFeet: 0,
            heightFeet: 1,
            ringsFeet: tiny,
          },
        ],
      };
    else
      data.walls.push({
        nativeElementId: 40,
        levelId: 1,
        kind: kind as "wall" | "column",
        ringsFeet: tiny,
      });
    assert.throws(
      () => assertNativeSelectionContactPhysicalGuards(data, repair, mask),
      /physical|foreign/,
    );
  }
});
test("outside-corner wedge and shorter subset masks cannot replace complete finite contact", async () => {
  const { data, repair, gap, trim } = await fixture();
  for (const rings of [
    rect(0, 0, gap, 1),
    rect(0, trim * 2, gap, 1 - trim * 2),
  ]) {
    const mask = nativeRationalOverlay("union", [rings]);
    assert.throws(
      () => assertNativeSelectionContactPhysicalGuards(data, repair, mask),
      /complete (finite source interval|target contact)/,
    );
  }
});
