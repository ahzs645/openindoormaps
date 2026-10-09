import assert from "node:assert/strict";
import test from "node:test";
import {
  Rational,
  rational,
  type NativeRationalParts,
  type NativeRationalPoint,
} from "../../app/indoor-project/native-rational-overlay";
import {
  freezeNativeRationalParts,
  nativeRationalPathSupported,
  nativeRationalFootprintSupported,
} from "../../app/indoor-project/native-exact-planar-topology";
const q = (n: number) => new Rational(BigInt(n));
const ring = (
  x: number | Rational,
  y: number | Rational,
  right: number | Rational,
  top: number | Rational,
): NativeRationalPoint[] =>
  [
    [x, y],
    [right, y],
    [right, top],
    [x, top],
  ].map((p) => p.map(rational) as NativeRationalPoint);
const clone = (parts: NativeRationalParts): NativeRationalParts =>
  parts.map((p) =>
    p.map((r) =>
      r.map(
        (point) =>
          point.map((s) => new Rational(s.n, s.d)) as NativeRationalPoint,
      ),
    ),
  );
const distant = () =>
  Array.from({ length: 40 }, (_, i) => [
    ring(100 + i * 2, 100, 101 + i * 2, 101),
  ]);
const footprint = (r: NativeRationalPoint[]): NativeRationalParts => [[r]];
const check = (
  parts: NativeRationalParts,
  paths: (number | Rational)[][][],
  footprints: NativeRationalParts[],
) => {
  const original = clone(parts),
    bounded = freezeNativeRationalParts(clone(parts));
  for (const path of paths)
    assert.equal(
      nativeRationalPathSupported(path, bounded),
      nativeRationalPathSupported(path, original),
    );
  for (const footprint of footprints)
    assert.equal(
      nativeRationalFootprintSupported(footprint, bounded),
      nativeRationalFootprintSupported(footprint, original),
    );
};
test("localized complete paths and footprints agree with full original support including holes", () => {
  const den = 10n ** 520n,
    afterTwo = new Rational(2n * den + 1n, den);
  const parts: NativeRationalParts = [
    [
      ring(-400, -400, 400, 400),
      ring(q(2), q(2), afterTwo, q(3)),
      ...distant().map((p) => p[0]!),
    ],
  ];
  check(
    parts,
    [
      [
        [1, 1],
        [10, 1],
      ],
      [
        [1, 2.5],
        [3, 2.5],
      ],
      [
        [-30, -30],
        [-20, -20],
      ],
      [
        [15, 1],
        [16, 1],
        [17, 1],
      ],
      [
        [200, 50],
        [200, 150],
      ],
      [
        [2, 2.5],
        [2, 2.5],
      ],
    ],
    [
      footprint(ring(1, 1, 10, 1.5)),
      footprint(ring(1, 2.4, 3, 2.6)),
      footprint(ring(-30, -30, -20, -20)),
    ],
  );
  assert.equal(
    nativeRationalPathSupported(
      [
        [1, 2.5],
        [3, 2.5],
      ],
      freezeNativeRationalParts(parts),
    ),
    false,
  );
});
test("sub-IEEE positive gaps and positive support strips survive the tile broadphase", () => {
  const den = 10n ** 520n,
    afterOne = new Rational(den + 1n, den);
  const support: NativeRationalParts = [
    [ring(0, 0, 1, 4)],
    [ring(afterOne, q(0), q(3), q(4))],
    ...distant(),
  ];
  check(
    support,
    [
      [
        [0.5, 2],
        [2.5, 2],
      ],
      [
        [0.5, 2],
        [0.5, 2],
      ],
      [
        [2, 2],
        [2.5, 2],
      ],
    ],
    [footprint(ring(0.5, 1, 2.5, 3))],
  );
  assert.equal(
    nativeRationalPathSupported(
      [
        [0.5, 2],
        [2.5, 2],
      ],
      freezeNativeRationalParts(support),
    ),
    false,
  );
  const thin: NativeRationalParts = [
    [ring(q(1), q(0), afterOne, q(2))],
    ...distant(),
  ];
  const middle = new Rational(2n * den + 1n, 2n * den);
  check(
    thin,
    [
      [
        [middle, q(0)],
        [middle, q(2)],
      ],
      [
        [q(1), q(1)],
        [afterOne, q(1)],
      ],
    ],
    [footprint(ring(q(1), q(0), afterOne, q(2)))],
  );
  assert.equal(
    nativeRationalPathSupported(
      [
        [middle, q(0)],
        [middle, q(2)],
      ],
      freezeNativeRationalParts(thin),
    ),
    true,
  );
});
test("touching tile bounds, negative tiles and multi-component complete paths retain original decisions", () => {
  const parts: NativeRationalParts = [
    [ring(0, 0, 16, 16)],
    [ring(16, 0, 17, 1)],
    [ring(-32, -32, -16, -16)],
    ...distant(),
  ];
  check(
    parts,
    [
      [
        [16, 0],
        [17, 0],
      ],
      [
        [-30, -30],
        [-20, -20],
      ],
      [
        [16, 16],
        [17, 16],
      ],
      [
        [0, 0],
        [17, 0],
      ],
      [
        [1, 1],
        [-20, -20],
      ],
    ],
    [footprint(ring(16, 0, 17, 1)), footprint(ring(-30, -30, -20, -20))],
  );
});
