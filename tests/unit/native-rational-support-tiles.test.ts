import assert from "node:assert/strict";
import test from "node:test";
import { createNativeRationalSupportTileQuery } from "../../app/indoor-project/native-rational-support-tiles";
import {
  Rational,
  rational,
  nativeRationalOverlay as overlay,
  type NativeRationalOverlayInput as Parts,
} from "../../app/indoor-project/native-rational-overlay";
import {
  nativeRationalPathSupported,
  freezeNativeRationalParts,
} from "../../app/indoor-project/native-exact-planar-topology";

type Scalar = number | Rational;
const rect = (a: Scalar, b: Scalar, c: Scalar, d: Scalar): Parts => [
  [
    [
      [a, b],
      [c, b],
      [c, d],
      [a, d],
      [a, b],
    ],
  ],
];
const encoded = (parts: Parts) =>
  JSON.stringify(
    parts.map((part) =>
      part.map((ring) =>
        ring.map((point) =>
          point.map((value) => {
            const q = rational(value);
            return [String(q.n), String(q.d)];
          }),
        ),
      ),
    ),
  );
const direct = (half: Parts, floors: Parts, envelope: Parts) =>
  overlay("intersection", overlay("intersection", half, floors), envelope);

test("single-source support tiles preserve normalized cell intersections and excluded hole boundaries", () => {
  const support = overlay("union", [
    [rect(-100, -100, 100, 100)[0]![0]!, rect(31, -2, 33, 2)[0]![0]!],
    ...rect(130, 0, 140, 10),
  ]);
  const query = createNativeRationalSupportTileQuery(support);
  for (const scope of [
    rect(30, -3, 34, 3),
    rect(31, -2, 33, 2),
    rect(-33, -1, -31, 1),
    rect(0, 0, 130, 4),
  ]) {
    const expected = overlay("intersection", scope, support);
    const actual = query(scope);
    assert.equal(encoded(actual), encoded(expected));
    for (const path of [
      rect(31, -2, 33, 2)[0]![0]!,
      [
        [30, 0],
        [34, 0],
      ],
    ])
      assert.equal(
        nativeRationalPathSupported(path, actual),
        nativeRationalPathSupported(path, expected),
      );
  }
});
function equivalent(halves: Parts[], floors: Parts, envelope: Parts): void {
  const before = [halves.map(encoded), encoded(floors), encoded(envelope)],
    query = createNativeRationalSupportTileQuery(floors, envelope);
  for (const half of halves) {
    const expected = encoded(direct(half, floors, envelope));
    assert.equal(encoded(query(half)), expected);
    assert.equal(encoded(query(half)), expected);
  }
  assert.deepEqual(
    [halves.map(encoded), encoded(floors), encoded(envelope)],
    before,
  );
}

test("tile support preserves exact slab and envelope holes without source mutations", () => {
  const floors: Parts = [
    [
      rect(-100, -100, 100, 100)[0][0],
      rect(1, 1, 2, 2)[0][0],
      rect(50, 50, 60, 60)[0][0],
    ],
  ];
  const envelope: Parts = [
    [
      rect(-90, -90, 90, 90)[0][0],
      rect(4, 1, 5, 2)[0][0],
      rect(-60, -60, -50, -50)[0][0],
    ],
  ];
  equivalent(
    [rect(0, 0, 6, 3), rect(0.5, 0.5, 5.5, 2.5), rect(51, 51, 59, 59)],
    floors,
    envelope,
  );
});

test("sub-IEEE holes and positive gaps survive and still block a crossing", () => {
  const d = 10n ** 100n,
    lo = new Rational(4n * d - 1n, d),
    hi = new Rational(4n * d + 1n, d),
    half = rect(3, 0, 5, 4),
    envelope = rect(-10, -10, 10, 10);
  const floors: Parts = [
    [rect(-10, -10, 10, 10)[0][0], rect(lo, 1, hi, 3)[0][0]],
  ];
  equivalent([half, rect(3, 1.5, 5, 2.5)], floors, envelope);
  const support = createNativeRationalSupportTileQuery(floors, envelope)(half);
  assert.equal(
    nativeRationalPathSupported(
      [
        [3, 2],
        [5, 2],
      ],
      support,
    ),
    false,
  );
  const separated = [...rect(-10, -10, lo, 10), ...rect(hi, -10, 10, 10)];
  equivalent([half], separated, envelope);
  assert.equal(
    nativeRationalPathSupported(
      [
        [3, 2],
        [5, 2],
      ],
      createNativeRationalSupportTileQuery(separated, envelope)(half),
    ),
    false,
  );
});

test("touching slabs, aperture edges and grid boundaries remain byte equivalent", () => {
  const floors = [...rect(-64, -64, 32, 64), ...rect(32, -64, 96, 64)],
    envelope = rect(-96, -96, 96, 96);
  equivalent(
    [
      rect(31, 0, 33, 1),
      rect(32, 0, 33, 1),
      rect(-33, -1, -31, 1),
      rect(-32, -1, -31, 1),
      rect(0, 0, 32, 32),
      rect(95, 0, 96, 1),
    ],
    floors,
    envelope,
  );
  equivalent([rect(0, 0, 1, 1)], rect(1, 0, 2, 1), envelope);
});

test("exact containing cells retain sub-IEEE geometry on either side of positive and negative grid lines", () => {
  const d = 10n ** 120n;
  for (const n of [-32n, 0n, 32n, 10n ** 90n]) {
    const lo = new Rational(n * d - 1n, d),
      hi = new Rational(n * d + 1n, d),
      outerLo = new Rational(n - 1n),
      outerHi = new Rational(n + 1n),
      floors = rect(outerLo, -1, outerHi, 2),
      envelope = rect(outerLo, -1, outerHi, 2);
    equivalent(
      [rect(lo, 0, hi, 1), rect(n === 0n ? 0 : new Rational(n), 0, hi, 1)],
      floors,
      envelope,
    );
  }
});

test("diagonal generated intersections keep canonical final geometry", () => {
  const half: Parts = [
      [
        [
          [1, 1],
          [17, 3],
          [23, 18],
          [6, 24],
          [1, 1],
        ],
      ],
    ],
    floors: Parts = [
      [
        [
          [0, -1],
          [30, 7],
          [21, 40],
          [-1, 30],
          [0, -1],
        ],
      ],
    ],
    envelope: Parts = [
      [
        [
          [0, 30],
          [8, -1],
          [25, 3],
          [19, 35],
          [0, 30],
        ],
      ],
    ];
  equivalent(
    [half, overlay("intersection", half, rect(0, 0, 15, 30))],
    floors,
    envelope,
  );
});

test("query caches never share across operation or physical-level owners", () => {
  const half = rect(1, 1, 2, 2),
    support = rect(0, 0, 10, 10),
    voidFloor: Parts = [[support[0][0], rect(0.5, 0.5, 2.5, 2.5)[0][0]]],
    firstLevel = createNativeRationalSupportTileQuery(support, support),
    otherLevel = createNativeRationalSupportTileQuery(voidFloor, support),
    otherOperation = createNativeRationalSupportTileQuery(support, voidFloor);
  assert.equal(firstLevel(half).length, 1);
  assert.equal(otherLevel(half).length, 0);
  assert.equal(otherOperation(half).length, 0);
  assert.equal(firstLevel(half).length, 1);
});

test("captured support is an exact private snapshot and returned intersections cannot corrupt tiles", () => {
  const floors = rect(0, 0, 100, 100),
    envelope: Parts = floors.map((part) =>
      part.map((ring) =>
        ring.map(([x, y]) => [
          new Rational(BigInt(x as number)),
          new Rational(BigInt(y as number)),
        ]),
      ),
    ),
    half = rect(1, 1, 2, 2),
    uncachedHalf = rect(65, 65, 66, 66),
    query = createNativeRationalSupportTileQuery(floors, envelope),
    expected = encoded(direct(half, floors, envelope)),
    uncachedExpected = encoded(direct(uncachedHalf, floors, envelope));
  assert.equal(Object.isFrozen(floors[0][0]), false);
  assert.equal(Object.isFrozen(envelope[0][0][0][0]), false);
  const first = query(half);
  first[0][0][0][0] = new Rational(-100n);
  assert.equal(encoded(query(half)), expected);
  floors[0][0].forEach((point) => {
    point[0] = 100;
  });
  Object.assign(envelope[0][0][0][0], { n: -100n });
  assert.equal(encoded(query(half)), expected);
  assert.equal(encoded(query(uncachedHalf)), uncachedExpected);
  const frozen = freezeNativeRationalParts(
    overlay("union", rect(0, 0, 10, 10)),
  );
  equivalent([half], frozen, frozen);
});

test("deterministic many-cell and empty-support cases match direct intersections", () => {
  const floors = Array.from({ length: 9 }, (_, i) =>
      rect(i * 30 - 120, -60, i * 30 - 100, 60),
    ).flat(),
    envelope: Parts = [
      [rect(-150, -90, 150, 90)[0][0], rect(-20, -20, 20, 20)[0][0]],
    ];
  const halves = Array.from({ length: 50 }, (_, i) =>
    rect(
      (i % 9) * 30 - 121,
      (i % 5) * 12 - 24,
      (i % 9) * 30 - 99,
      (i % 5) * 12 - 14,
    ),
  );
  equivalent(halves, floors, envelope);
  equivalent([[], rect(0, 0, 1, 1)], [], envelope);
  equivalent([rect(0, 0, 1, 1)], floors, []);
});
