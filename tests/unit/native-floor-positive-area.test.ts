import assert from "node:assert/strict";
import test from "node:test";
import {
  Rational,
  rational,
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import {
  nativeRationalArea,
  nativeRationalAreaCompare,
  freezeNativeRationalParts,
} from "../../app/indoor-project/native-exact-planar-topology";
const rect = (
  x: number | Rational,
  y: number | Rational,
  right: number | Rational,
  top: number | Rational,
): NativeRationalParts => [
  [
    [
      [x, y],
      [right, y],
      [right, top],
      [x, top],
    ].map((p) => p.map(rational) as [Rational, Rational]),
  ],
];
function equal(parts: NativeRationalParts): void {
  assert.equal(
    nativeRationalAreaCompare(parts, []) > 0,
    nativeRationalArea(parts).n > 0n,
  );
  assert.equal(
    nativeRationalAreaCompare(freezeNativeRationalParts(parts), []) > 0,
    nativeRationalArea(parts).n > 0n,
  );
}
test("floor positivity preserves empty intersections, tangent contact and disconnected positive fragments", () => {
  equal([]);
  equal(
    nativeRationalOverlay("intersection", rect(0, 0, 1, 1), rect(1, 0, 2, 1)),
  );
  equal(
    nativeRationalOverlay(
      "intersection",
      [...rect(0, 0, 1, 1), ...rect(3, 0, 4, 1)],
      rect(-1, -1, 5, 2),
    ),
  );
});
test("arbitrarily tiny positive area and true holes retain exact full-fraction fallback", () => {
  const den = 10n ** 520n,
    base = new Rational(2n),
    after = new Rational(2n * den + 1n, den);
  const thin = rect(base, new Rational(0n), after, new Rational(1n));
  equal(thin);
  assert.equal(nativeRationalAreaCompare(thin, []) > 0, true);
  const unit = rect(0, 0, 1, 1),
    hole = rect(
      new Rational(1n, 4n),
      new Rational(1n, 4n),
      new Rational(den + 4n, den * 4n),
      new Rational(3n, 4n),
    );
  equal(nativeRationalOverlay("difference", unit, hole));
  equal(nativeRationalOverlay("difference", unit, unit));
});
test("huge translated coordinates, reversed valid rings and many holes preserve positivity", () => {
  const offset = 10n ** 90n,
    d = 10n ** 120n;
  const x = new Rational(offset),
    right = new Rational(offset * d + 1n, d);
  equal(rect(x, new Rational(-offset), right, new Rational(-offset + 1n)));
  const source = nativeRationalOverlay(
    "difference",
    rect(-20, -20, 20, 20),
    Array.from({ length: 30 }, (_, i) => rect(i - 15, -1, i - 14.5, 1)).flat(),
  );
  equal(source);
  equal(source.map((p) => p.map((r) => [...r].reverse())));
});
test("varied complete exact native intersection parts agree with original positivity predicate", () => {
  for (let i = 0; i < 40; i++) {
    const subject = rect(-5 + 0.1 * i, -3.2, 7 + 0.04 * i, 6.3);
    const diagonal: [number, number][][][] = [
      [
        [
          [-4 + i * 0.03, -8],
          [2 + i * 0.03, 9],
          [3 + i * 0.03, 9],
          [-3 + i * 0.03, -8],
        ],
      ],
    ];
    const support = nativeRationalOverlay(
      "difference",
      rect(-10, -10, 20, 20),
      diagonal,
    );
    equal(nativeRationalOverlay("intersection", subject, support));
  }
});
