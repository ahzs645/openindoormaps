import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nativeMaterialPlanExactWalls } from "../../app/indoor-project/native-material-plan";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material";
import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import {
  deriveNativeSelectionContactRepair,
  type NativeSelectionContactRepair,
} from "../../app/indoor-project/native-selection-contact-repairs";
import { assertNativeSelectionContactPhysicalGuards } from "../../app/indoor-project/native-selection-contact-guards";
import {
  nativeRationalOverlay,
  rational,
  Rational,
} from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalMeasuredArea } from "../../app/indoor-project/native-exact-planar-topology";
import { deriveNativeSelectionContactRepair as compilerDerive } from "../../../reviter/lib/reviter/native-selection-contact-repairs.ts";
import { assertNativeSelectionContactPhysicalGuards as compilerGuard } from "../../../reviter/lib/reviter/native-selection-contact-guards.ts";
type P = [number, number];
const rectangle = (x0: number, y0: number, x1: number, y1: number): P[][] => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
];
async function fixture(
  gap = 2 ** -45,
  targetOverride?: P[],
  extraTargetParts: P[][][] = [],
) {
  const model = "a".repeat(64),
    source: P[] = [
      [-10, 0],
      [0, 0],
      [0, 1],
      [-10, 1.01],
    ],
    target: P[] = targetOverride ?? [
      [gap, -1],
      [3, -1],
      [3, 2],
      [-gap, 2],
    ],
    material = {
      version: 1 as const,
      sourceModelSha256: model,
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          cutElevationFeet: 4,
          evidenceSha256: "c".repeat(64),
          sourceElementIds: [10, 20],
          sections: [source, target].map((r, i) => ({
            nativeElementId: i ? 20 : 10,
            categoryId: -2_000_011,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 10,
            partsFeet: i ? [[r], ...extraTargetParts] : [[r]],
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
          ringsFeet: rectangle(-20, -5, 10, 5),
        },
      ],
    },
    nativeMaterialSections: {
      ...material,
      geometrySha256: await nativeMaterialSectionsHash(material),
    },
  } as unknown as IndoorDataset;
  const repair: NativeSelectionContactRepair = {
    id: "free-cap:10-20",
    sourceModelSha256: model,
    sourceMaterialGeometrySha256: data.nativeMaterialSections!.geometrySha256,
    levelId: 1,
    elevationFeet: 0,
    status: "applied",
    source: {
      nativeElementId: 10,
      ringsFeet: [source],
      capFeet: [source[1], source[2]],
    },
    target: {
      nativeElementId: 20,
      ringsFeet: [target],
      faceFeet: [target[3], target[0]],
    },
    contactMode: "original-free-cap",
    evidenceSha256: "d".repeat(64),
    notes:
      "Provisional exact positive free interval in original skewed cap; retain original penetration.",
    assumption: {
      kind: "provisional-extracted-native-contact",
      revisitRequired: true,
    },
  };
  const current = nativeMaterialPlanExactWalls(
    data,
    1,
    createNativeRoutingMaterialQuery(data),
  );
  for (const e of [repair.source, repair.target])
    e.ringsFeet = current.find(
      (w) =>
        w.nativeElementId === e.nativeElementId &&
        w.ringsFeet[0].some(
          (p) =>
            p[0] === (e === repair.source ? 0 : target[0][0]) &&
            p[1] === (e === repair.source ? 0 : target[0][1]),
        ),
    )!.ringsFeet;
  return { data, repair, gap };
}
const plain = (x: unknown): unknown =>
  typeof x === "bigint"
    ? String(x)
    : Array.isArray(x)
      ? x.map(plain)
      : x && typeof x === "object"
        ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)]))
        : x;
const wire = (x: unknown): string => JSON.stringify(plain(x));
test("original free cap retains intersecting source material and recovers exact positive wedge with compiler parity", async () => {
  const { data, repair, gap } = await fixture(),
    before = wire({ data, repair }),
    mask = deriveNativeSelectionContactRepair(data, repair),
    third = new Rational(rational(gap).n, rational(gap).d * 3n),
    expected = nativeRationalOverlay("union", [
      [
        [
          [0, 0],
          [third, 0],
          [0, 0.5],
        ],
      ],
    ]);
  assert.equal(nativeRationalOverlay("difference", mask, expected).length, 0);
  assert.equal(nativeRationalOverlay("difference", expected, mask).length, 0);
  assert(nativeRationalMeasuredArea(mask) > 0);
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
  assert.equal(wire(mask), wire(compilerDerive(data, repair)));
  assert.doesNotThrow(() =>
    compilerGuard(data, repair, compilerDerive(data, repair)),
  );
  assert.equal(wire({ data, repair }), before);
  assert.throws(
    () =>
      deriveNativeSelectionContactRepair(data, {
        ...repair,
        contactMode: undefined,
      }),
    /rectangular/,
  );
  assert.throws(
    () =>
      deriveNativeSelectionContactRepair(data, {
        ...repair,
        contactMode: "finite-cap-overlap",
      }),
    /rectangular/,
  );
});
test("free cap rejects non-numerical gaps, zero contact, concavity, stale bodies, long sides and invented shortened caps", async () => {
  const large = await fixture(0.000_001);
  assert.throws(
    () => deriveNativeSelectionContactRepair(large.data, large.repair),
    /non-numerical/,
  );
  const zero = await fixture(0);
  assert.throws(
    () => deriveNativeSelectionContactRepair(zero.data, zero.repair),
    /absent positive/,
  );
  const { data, repair } = await fixture();
  assert.throws(
    () =>
      deriveNativeSelectionContactRepair(data, {
        ...repair,
        source: {
          ...repair.source,
          capFeet: [
            repair.source.ringsFeet[0][0],
            repair.source.ringsFeet[0][1],
          ],
        },
      }),
    /short original/,
  );
  assert.throws(
    () =>
      deriveNativeSelectionContactRepair(data, {
        ...repair,
        source: {
          ...repair.source,
          capFeet: [
            [0, 0.2],
            [0, 0.4],
          ],
        },
      }),
    /full actual original edge/,
  );
  assert.throws(
    () =>
      deriveNativeSelectionContactRepair(data, {
        ...repair,
        source: { ...repair.source, ringsFeet: rectangle(-10, 0, 0, 1) },
      }),
    /changed, missing/,
  );
  assert.throws(
    () =>
      deriveNativeSelectionContactRepair(data, {
        ...repair,
        target: {
          ...repair.target,
          faceFeet: [
            repair.target.ringsFeet[0][1],
            repair.target.ringsFeet[0][2],
          ],
        },
      }),
    /non-first named/,
  );
});
test("physical recheck rejects changed mask, original holes, physical doors, foreign materials and unsupported full original cap", async () => {
  const { data, repair } = await fixture(),
    mask = deriveNativeSelectionContactRepair(data, repair),
    tampered = nativeRationalOverlay("union", mask, [
      rectangle(0, 0.1, 2 ** -43, 0.2),
    ]);
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(data, repair, tampered),
    /overlap|differs/,
  );
  const door = {
    ...data,
    doors: [
      {
        levelId: 1,
        nativeElementId: 40,
        footprintFeet: rectangle(-1, -0.1, 1, 0.1)[0],
      },
    ],
  } as IndoorDataset;
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(door, repair, mask),
    /physical doorway/,
  );
  assert.throws(
    () => compilerGuard(door, repair, compilerDerive(door, repair)),
    /physical doorway/,
  );
  const hole = {
    ...data,
    walkingSupport: {
      ...data.walkingSupport!,
      floors: [
        {
          ...data.walkingSupport!.floors[0],
          ringsFeet: [
            ...data.walkingSupport!.floors[0].ringsFeet,
            rectangle(-1, -0.1, 1, 0.1)[0],
          ],
        },
      ],
    },
  } as IndoorDataset;
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(hole, repair, mask),
    /opening|unsupported/,
  );
  const foreign = {
    ...data,
    walls: [
      {
        levelId: 1,
        nativeElementId: 50,
        kind: "column",
        ringsFeet: rectangle(-1, -0.1, 1, 0.1),
      },
    ],
  } as IndoorDataset;
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(foreign, repair, mask),
    /foreign wall or column/,
  );
  const unsupported = {
    ...data,
    walkingSupport: {
      ...data.walkingSupport!,
      floors: [
        {
          ...data.walkingSupport!.floors[0],
          ringsFeet: rectangle(-20, -5, 10, 0.75),
        },
      ],
    },
  } as IndoorDataset;
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(unsupported, repair, mask),
    /entire original free cap/,
  );
});

test("free cap follows both first finite faces of a convex target without filling its chamfer", async () => {
  const gap = 2 ** -45,
    target: P[] = [
      [2 * gap, 0],
      [3, 0],
      [3, 1],
      [2 * gap, 1],
      [gap, 0.5],
    ],
    { data, repair } = await fixture(gap, target);
  repair.target.faceFeet = [target[4], target[0]];
  const mask = deriveNativeSelectionContactRepair(data, repair),
    expected = nativeRationalOverlay("union", [
      [
        [
          [0, 0],
          [2 * gap, 0],
          [gap, 0.5],
          [2 * gap, 1],
          [0, 1],
        ],
      ],
    ]);
  assert.equal(nativeRationalOverlay("difference", mask, expected).length, 0);
  assert.equal(nativeRationalOverlay("difference", expected, mask).length, 0);
  assert.doesNotThrow(() =>
    assertNativeSelectionContactPhysicalGuards(data, repair, mask),
  );
  assert.equal(wire(mask), wire(compilerDerive(data, repair)));
});
test("complete original owner siblings are retained; a second same-owner obstacle still vetoes the free gap", async () => {
  const ordinary = await fixture(2 ** -45, undefined, [rectangle(5, -1, 6, 2)]),
    mask = deriveNativeSelectionContactRepair(ordinary.data, ordinary.repair);
  assert.doesNotThrow(() =>
    assertNativeSelectionContactPhysicalGuards(
      ordinary.data,
      ordinary.repair,
      mask,
    ),
  );
  const gap = 2 ** -45,
    blocked = await fixture(gap, undefined, [
      rectangle(gap / 8, 0.1, gap / 4, 0.2),
    ]),
    otherMask = deriveNativeSelectionContactRepair(
      blocked.data,
      blocked.repair,
    );
  assert.throws(
    () =>
      assertNativeSelectionContactPhysicalGuards(
        blocked.data,
        blocked.repair,
        otherMask,
      ),
    /inside an original support/,
  );
});
