import test from "node:test";
import assert from "node:assert/strict";
import { Rational } from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalBandIndex } from "../../app/indoor-project/native-rational-band-index";
const sub = (a: Rational, b: Rational) =>
  new Rational(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Rational, b: Rational) => new Rational(a.n * b.n, a.d * b.d);
const div = (a: Rational, b: Rational) => new Rational(a.n * b.d, a.d * b.n);
const reference = (value: Rational, min: Rational, max: Rational) => {
  const t = div(mul(sub(value, min), new Rational(64n)), sub(max, min));
  return Math.min(63, Math.max(0, Number(t.n / t.d)));
};
test("integer band index matches original canonical rational arithmetic for every exact boundary and adjacent sub-ULP samples", () => {
  const epsilon = new Rational(1n, 10n ** 80n);
  for (const [min, max] of [
    [new Rational(-121n, 7n), new Rational(19n, 11n)],
    [new Rational(0n), new Rational(1n)],
    [new Rational(-7n), new Rational(-1n)],
    [new Rational(1n, 10n ** 50n), new Rational(2n, 10n ** 50n)],
  ]) {
    for (let i = -2n; i <= 66n; i++) {
      const delta = mul(sub(max, min), new Rational(i, 64n));
      const boundary = new Rational(
        min.n * delta.d + delta.n * min.d,
        min.d * delta.d,
      );
      for (const sample of [
        boundary,
        sub(boundary, epsilon),
        sub(boundary, new Rational(-epsilon.n, epsilon.d)),
      ])
        assert.equal(
          nativeRationalBandIndex(sample, min, max),
          reference(sample, min, max),
        );
    }
  }
});
test("integer band index retains denominator signs, clamps and arbitrary generated rational coordinates", () => {
  for (let i = 1n; i <= 300n; i++) {
    const min = new Rational(-(i ** 3n), i + 7n),
      max = new Rational(i ** 2n + 1n, i + 13n),
      value = new Rational(i ** 3n - 5000n, i + 19n);
    assert.equal(
      nativeRationalBandIndex(value, min, max),
      reference(value, min, max),
    );
    assert.equal(
      nativeRationalBandIndex(value, max, min),
      reference(value, max, min),
    );
  }
  assert.equal(
    nativeRationalBandIndex(
      new Rational(-1n, 3n),
      new Rational(0n),
      new Rational(1n),
    ),
    0,
  );
  assert.equal(
    nativeRationalBandIndex(
      new Rational(1n),
      new Rational(0n),
      new Rational(1n),
    ),
    63,
  );
  assert.throws(
    () =>
      nativeRationalBandIndex(
        new Rational(0n),
        new Rational(1n),
        new Rational(1n),
      ),
    /zero-height/,
  );
});
