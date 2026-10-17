import assert from "node:assert/strict";
import test from "node:test";
import {
  Rational,
  nativeRationalOverlay,
  type NativeRationalOverlayInput as Parts,
} from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalScopedDifference } from "../../app/indoor-project/native-rational-scoped-difference";
import {
  freezeNativeRationalParts,
  nativeRationalPointInParts,
} from "../../app/indoor-project/native-exact-planar-topology";
import { createNativeExactRoutingAuthority } from "../../app/indoor-project/native-exact-routing-authority";
import type { IndoorDataset } from "../../app/indoor-project/contract";

type Scalar = number | Rational;
const rect = (x0: Scalar, y0: Scalar, x1: Scalar, y1: Scalar): Parts => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
];
function snapshot(value: unknown): string {
  const encode = (v: unknown): unknown => {
    if (v instanceof Rational) return [String(v.n), String(v.d)];
    if (typeof v === "bigint") return String(v);
    if (Array.isArray(v)) return v.map(encode);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([key, item]) => [key, encode(item)]),
      );
    return v;
  };
  return JSON.stringify(encode(value));
}
function equivalent(scope: Parts, support: Parts, masks: Parts) {
  const before = snapshot([scope, support, masks]);
  const expected = nativeRationalOverlay(
    "intersection",
    scope,
    nativeRationalOverlay("difference", support, masks),
  );
  const actual = nativeRationalScopedDifference(scope, support, masks);
  assert.deepEqual(nativeRationalOverlay("xor", expected, actual), []);
  assert.equal(snapshot([scope, support, masks]), before);
  return actual;
}

test("cell-scoped exact subtraction preserves floor holes, mask holes and disconnected domains", () => {
  const support = [
    [rect(-20, -20, 20, 20)[0][0], rect(4, 4, 6, 6)[0][0]],
    ...rect(50, 50, 60, 60),
  ];
  const masks = [
    [
      rect(-10, -10, 10, 10)[0][0],
      rect(-2, -2, 2, 2)[0][0],
      rect(7, 7, 8, 8)[0][0],
    ],
    ...rect(50, 50, 51, 51),
    ...rect(100, 100, 110, 110),
  ];
  const value = equivalent(
    [...rect(-3, -3, 3, 3), ...rect(5, 5, 7, 7)],
    support,
    masks,
  );
  assert(nativeRationalPointInParts([0, 0], value));
  assert(!nativeRationalPointInParts([2.5, 2.5], value));
  assert(!nativeRationalPointInParts([5.5, 5.5], value));
  equivalent(rect(21, 21, 22, 22), support, masks);
  equivalent([], support, masks);
});

test("diagonal intersections and touching obstacle bounds retain exact rational cuts", () => {
  const scope: Parts = [
    [
      [
        [0, 0],
        [7, 1],
        [5, 8],
        [-1, 6],
        [0, 0],
      ],
    ],
  ];
  const masks: Parts = [
    [
      [
        [1, -3],
        [4, 10],
        [5, 10],
        [2, -3],
        [1, -3],
      ],
    ],
    ...rect(7, 0, 8, 1),
    ...rect(100, 100, 101, 101),
  ];
  equivalent(scope, rect(-4, -4, 12, 12), masks);
  // A mask hole containing the entire query must stay a hole.
  equivalent(rect(0, 0, 1, 1), rect(-10, -10, 10, 10), [
    [rect(-8, -8, 8, 8)[0][0], rect(-2, -2, 2, 2)[0][0]],
  ]);
});

test("sub-IEEE positive barriers at huge offsets are neither filtered nor rounded", () => {
  const offset = 10n ** 90n,
    denominator = 10n ** 120n,
    lo = new Rational(offset),
    cut = new Rational(offset * denominator + 1n, denominator),
    hi = new Rational(offset + 1n);
  const value = equivalent(
    rect(lo, 0, hi, 1),
    rect(lo, 0, new Rational(offset + 2n), 2),
    [
      ...rect(lo, 0, cut, 1),
      ...rect(new Rational(offset + 5n), 0, new Rational(offset + 6n), 1),
    ],
  );
  assert(value.length > 0);
  assert(!nativeRationalPointInParts([lo, new Rational(1n, 2n)], value));
});

test("varied multi-cell queries agree with whole-level subtraction", () => {
  for (let i = 0; i < 18; i++) {
    const x = (i % 6) * 3 - 7,
      y = (i % 5) * 2 - 4;
    equivalent(
      rect(x + 0.1, y + 0.2, x + 2.7, y + 2.4),
      [
        [rect(-15, -15, 20, 20)[0][0], rect(5, 5, 6, 6)[0][0]],
        ...rect(50, 50, 70, 70),
      ],
      Array.from({ length: 24 }, (_, n) =>
        rect(n - 12.3, (n % 5) - 3.1, n - 11.7, (n % 5) - 1.3),
      ).flat(),
    );
  }
});

function fixture(): IndoorDataset {
  const ring = (a: number, b: number, c: number, d: number) =>
    rect(a, b, c, d)[0][0] as [number, number][];
  const model = "a".repeat(64);
  return {
    source: { modelSha256: model },
    records: [],
    edges: [],
    nodes: [],
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    walls: [
      {
        nativeElementId: 101,
        levelId: 1,
        kind: "wall",
        ringsFeet: [ring(2, 2, 3, 3)],
      },
    ],
    doors: [{ levelId: 1, footprintFeet: ring(12, 12, 13, 13) }],
    walkingSupport: {
      version: 1,
      sourceModelSha256: model,
      floors: [
        {
          nativeElementId: 11,
          elevationFeet: 0,
          ringsFeet: [ring(0, 0, 20, 20), ring(4, 4, 6, 6)],
        },
      ],
    },
    nativeIndoorEnvelopes: {
      version: 1,
      sourceModelSha256: model,
      geometrySha256: "b".repeat(64),
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          partsFeet: [[ring(0, 0, 20, 20), ring(14, 14, 16, 16)]],
          sourceElementIds: [11],
          cutElevationsFeet: [4],
          evidenceSha256: "c".repeat(64),
        },
      ],
    },
    nativeMaterialSections: {
      version: 1,
      sourceModelSha256: model,
      geometrySha256: "d".repeat(64),
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          cutElevationFeet: 0.1,
          evidenceSha256: "e".repeat(64),
          sourceElementIds: [102],
          sections: [
            {
              nativeElementId: 102,
              categoryId: 1,
              kind: "column",
              baseElevationFeet: 0,
              topElevationFeet: 8,
              partsFeet: [[ring(7, 7, 8, 8)]],
            },
          ],
        },
      ],
    },
    circulationGeometry: {
      fixtures: [{ elevationFeet: 0, ringsFeet: [ring(9, 9, 10, 10)] }],
    },
    stairDisplay: {
      sourceModelSha256: model,
      sourceFlights: [
        {
          treads: [
            {
              runElementId: 123,
              elevationFeet: 1,
              ringFeet: ring(11, 11, 12, 12),
            },
          ],
        },
      ],
    },
    indoorExclusions: {
      version: 1,
      sourceModelSha256: model,
      areas: [
        {
          id: "veto",
          levelId: 1,
          elevationFeet: 0,
          label: "Off limits",
          reason: "off-limits",
          nativeFloorIds: [11],
          partsFeet: [[ring(17, 17, 18, 18)]],
        },
      ],
    },
  } as unknown as IndoorDataset;
}

test("scoped authority retains every independent physical veto and operation-local cache", () => {
  const data = fixture(),
    before = snapshot(data),
    authority = createNativeExactRoutingAuthority(data),
    scope = freezeNativeRationalParts(
      nativeRationalOverlay("union", rect(1, 1, 19, 19)),
    ),
    scoped = authority(0, scope),
    reference = nativeRationalOverlay("intersection", scope, authority(0));
  assert.deepEqual(nativeRationalOverlay("xor", scoped, reference), []);
  assert.equal(authority(0, scope), scoped);
  assert(Object.isFrozen(scoped));
  assert(nativeRationalPointInParts([1.5, 1.5], scoped));
  for (const xy of [2.5, 5, 7.5, 9.5, 11.5, 12.5, 15, 17.5])
    assert(
      !nativeRationalPointInParts([xy, xy], scoped),
      `physical veto at ${xy}`,
    );
  assert.equal(snapshot(data), before);
  data.walkingSupport!.sourceModelSha256 = "f".repeat(64);
  assert.deepEqual(createNativeExactRoutingAuthority(data)(0, scope), []);
  data.walkingSupport!.sourceModelSha256 = data.source.modelSha256;
  data.nativeIndoorEnvelopes!.sourceModelSha256 = "f".repeat(64);
  assert.throws(() => createNativeExactRoutingAuthority(data), /binding/);
});
