import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeRationalAreaCompare as candidate,
  nativeRationalAreaTermCacheStatistics,
  freezeNativeRationalParts,
  nativeRationalArea,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  Rational,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): NativeRationalParts => [
  [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ].map((q) => q.map((v) => new Rational(BigInt(v))) as [Rational, Rational]),
  ],
];
const check = (
  a: NativeRationalParts,
  b: NativeRationalParts,
  x = 1n,
  y = 1n,
) => {
  const aa = nativeRationalArea(a),
    bb = nativeRationalArea(b),
    det = aa.n * x * bb.d - bb.n * y * aa.d;
  assert.equal(candidate(a, b, x, y), det < 0n ? -1 : det > 0n ? 1 : 0);
};
test("mutable and partly frozen inputs recompute exact terms after authoring edits", () => {
  const a = rect(0, 0, 2, 2),
    b = rect(0, 0, 3, 2);
  check(a, b);
  a[0]![0]![1]![0] = new Rational(4n);
  check(a, b);
  a[0]![0]![2]![0] = new Rational(4n);
  check(a, b);
  const c = rect(0, 0, 2, 2);
  Object.freeze(c[0]![0]);
  const before = nativeRationalAreaTermCacheStatistics();
  check(c, b);
  check(c, b);
  assert.equal(nativeRationalAreaTermCacheStatistics().hits, before.hits);
  // A frozen ring and frozen points with mutable scalar payloads must also bypass retention.
  const d = rect(0, 0, 2, 2);
  d[0]![0]!.forEach(Object.freeze);
  Object.freeze(d[0]![0]);
  const hit = nativeRationalAreaTermCacheStatistics().hits;
  check(d, b);
  check(d, b);
  assert.equal(nativeRationalAreaTermCacheStatistics().hits, hit);
});
test("full frozen ring content supports exact holes, reversal, multipliers and equality fallback", () => {
  const H = 10n ** 90n,
    tiny = 10n ** 1200n;
  const a: NativeRationalParts = [
    [
      [
        [new Rational(H), new Rational(-H)],
        [new Rational(H + 1n), new Rational(-H)],
        [new Rational(H + 1n), new Rational(-H * tiny + 1n, tiny)],
        [new Rational(H), new Rational(-H * tiny + 1n, tiny)],
      ],
    ],
  ];
  freezeNativeRationalParts(a);
  check(a, []);
  check(a, a);
  check(a, a, 2n);
  check(a, a, -1n, -1n);
  const outside = rect(-20, -20, 20, 20),
    hole = rect(-19, -19, 18, 18)[0]![0]!;
  const g = freezeNativeRationalParts([[outside[0]![0]!, hole]]);
  check(g, []);
  check(g, g, 0n, 1n);
  const reverse = freezeNativeRationalParts(
    g.map((p) => p.map((r) => [...r].reverse())),
  );
  check(g, reverse);
  const before = nativeRationalAreaTermCacheStatistics().hits;
  check(g, reverse);
  assert.ok(nativeRationalAreaTermCacheStatistics().hits > before);
});
test("retained complete rings and exact determinant payloads remain within both conservative budgets", () => {
  for (let i = 0; i < 811; i++) {
    const a = freezeNativeRationalParts(rect(i, 2, 4, 8));
    check(a, []);
  }
  const stats = nativeRationalAreaTermCacheStatistics();
  assert.ok(stats.entries <= stats.maximumEntries);
  assert.ok(stats.retainedBytes <= stats.maximumBytes);
  // An input with very large exact scalar numerators may compute but must not be retained.
  const scale = 10n ** 70000n;
  const ring = Array.from({ length: 128 }, (_, i) => {
    const side = Math.floor(i / 32),
      at = BigInt(i % 32);
    return [
      new Rational(
        side === 0
          ? scale * at
          : side === 1
            ? scale * 32n
            : side === 2
              ? scale * (32n - at)
              : 0n,
      ),
      new Rational(
        side === 0 ? 0n : side === 1 ? at : side === 2 ? 32n : 32n - at,
      ),
    ] as [Rational, Rational];
  });
  const large = freezeNativeRationalParts([[ring]]),
    before = nativeRationalAreaTermCacheStatistics().skipped;
  check(large, []);
  assert.ok(nativeRationalAreaTermCacheStatistics().skipped > before);
  assert.ok(
    nativeRationalAreaTermCacheStatistics().retainedBytes <= stats.maximumBytes,
  );
});
