import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeRationalOverlay as runtime,
  rational,
  Rational,
  nativeRationalScalarToIEEE,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import {
  nativeRationalOverlay as compiler,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION as compilerVersion,
} from "../../../reviter/lib/reviter/native-rational-overlay";
const rect = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][][][] => [
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
const encoded = (v: any): any =>
  Array.isArray(v)
    ? v.map(encoded)
    : v instanceof Rational
      ? [String(v.n), String(v.d)]
      : [String(v.n), String(v.d)];
test("exact native topology cannot silently become floating geometry or archive JSON", () => {
  const q = rational(1 / 3);
  assert.throws(() => JSON.stringify(q), /rational carrier/);
  assert.throws(() => Number(q), /explicit scalar conversion/);
  assert.equal(nativeRationalScalarToIEEE(q), 1 / 3);
});
test("native source and runtime preserve an actual two-ULP positive gap", () => {
  const lo = -64.7861485303358,
    hi = -64.78614853033577,
    a = rect(lo - 1, 528, hi + 1, 530),
    b = [...rect(lo - 2, 527, lo, 531), ...rect(hi, 527, hi + 2, 531)];
  const result = runtime("difference", a, b);
  assert.equal(result.length, 1);
  const xs = result[0][0].map((p) => nativeRationalScalarToIEEE(p[0]));
  assert.equal(Math.min(...xs), lo);
  assert.equal(Math.max(...xs), hi);
  assert.deepEqual(encoded(result), encoded(compiler("difference", a, b)));
  assert.equal(NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION, compilerVersion);
});
test("native rational Boolean intermediates reconstruct a diagonal source without serialization", () => {
  const a: [number, number][][][] = [
      [
        [
          [0.1, 0.2],
          [8.7, 0.8],
          [9.1, 10.3],
          [0.4, 9.5],
          [0.1, 0.2],
        ],
      ],
    ],
    b: [number, number][][][] = [
      [
        [
          [1.7, -1.2],
          [7.3, 11.7],
          [4.2, 12.1],
          [0.8, -0.7],
          [1.7, -1.2],
        ],
      ],
    ];
  const difference = runtime("difference", a, b),
    intersection = runtime("intersection", a, b);
  assert.deepEqual(
    runtime("xor", runtime("union", difference, intersection), a),
    [],
  );
});
test("true thin native holes and positive components remain, while isolated corner contact has no area", () => {
  const hole: [number, number][][][] = [
    [rect(-1, -1, 1, 1)[0][0], rect(0, 0, 2e-24, 1e-24)[0][0]],
  ];
  assert.equal(runtime("union", hole)[0].length, 2);
  assert.equal(
    runtime("difference", rect(-1, -1, 1, 1), [
      ...rect(-2, -2, 0, 2),
      ...rect(2e-24, -2, 2, 2),
    ]).length,
    1,
  );
  assert.deepEqual(
    runtime("intersection", rect(0, 0, 1, 1), rect(1, 1, 2, 2)),
    [],
  );
});
test("nonfinite native source coordinates fail before geometry publication", () => {
  assert.throws(() => runtime("union", rect(0, 0, Infinity, 1)), /Nonfinite/);
});
test("bounded coordinate cache eviction preserves exact values and previously prepared topology", () => {
  const original = rational(1 / 3),
    oldFace = runtime("union", rect(0.1, 0.2, 8.7, 9.5));
  for (let i = 0; i < 66000; i++) rational(i + 0.125);
  const after = rational(1 / 3);
  assert.equal(after.n, original.n);
  assert.equal(after.d, original.d);
  assert.deepEqual(runtime("xor", oldFace, rect(0.1, 0.2, 8.7, 9.5)), []);
});

for (const [name, load] of [
  [
    "runtime",
    () =>
      import(
        "../../app/indoor-project/vendor/native-rational-overlay-arithmetic.mjs"
      ),
  ],
  [
    "source",
    () =>
      import(
        "../../../reviter/lib/reviter/vendor/native-rational-overlay-arithmetic.mjs"
      ),
  ],
] as const) {
  test(`${name}: exact orientation keeps tiny positive turns at enormous rational offsets`, async () => {
    const { Rational: R, orient2d } = await load();
    const huge = 10n ** 90n,
      tinyDenominator = 10n ** 120n;
    const a = [new R(huge), new R(-huge)];
    const b = [new R(huge + 1n), new R(-huge)];
    const c = [
      new R(huge + 1n),
      new R(-huge * tinyDenominator + 1n, tinyDenominator),
    ];
    assert.equal(orient2d(a[0], a[1], b[0], b[1], c[0], c[1]), -1);
    assert.equal(orient2d(a[0], a[1], c[0], c[1], b[0], b[1]), 1);
    assert.equal(
      Object.is(orient2d(a[0], a[1], b[0], b[1], b[0], b[1]), -0),
      true,
    );
    // Mixing finite source numbers with generated exact coordinates retains
    // the exact branch; the legacy all-numeric fallback remains identical.
    assert.equal(
      orient2d(0, 0, new R(1n), 0, 0, new R(1n, tinyDenominator)),
      -1,
    );
    assert.equal(orient2d(0, 0, 1, 0, 0, 1), -1);
  });
}
