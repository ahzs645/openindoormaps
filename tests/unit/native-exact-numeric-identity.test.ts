import test from "node:test";
import assert from "node:assert/strict";
import { nativeExactNumericIdentity } from "../../app/indoor-project/native-exact-numeric-identity";
import {
  rational,
  Rational,
  nativeRationalOverlay,
} from "../../app/indoor-project/native-rational-overlay";
import type { NativeRationalParts } from "../../app/indoor-project/native-rational-overlay";
import {
  prepareNativeContainedCellDisplay,
  validateNativeContainedCellDisplay,
} from "../../app/indoor-project/native-contained-cell-display";

const box: [number, number][][][] = [
  [
    [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
      [0, 0],
    ],
  ],
];
const exact = (parts: number[][][][]): NativeRationalParts =>
  parts.map((p) =>
    p.map((r) => r.map((q) => [rational(q[0]), rational(q[1])])),
  );
test("exact numeric identity includes all ordered parts and holes, with no overlay or tolerance", () => {
  const parts = [
    ...structuredClone(box),
    [
      [
        [5, 0],
        [7, 0],
        [7, 2],
        [5, 0],
      ],
    ],
  ];
  parts[0].push([
    [1, 1],
    [1, 2],
    [2, 2],
    [1, 1],
  ]);
  assert.equal(nativeExactNumericIdentity(parts, exact(parts)), true);
  for (const changed of [
    parts.slice(0, 1),
    [parts[0].slice(0, 1), parts[1]],
    [parts[0].slice().reverse(), parts[1]],
  ])
    assert.equal(nativeExactNumericIdentity(changed, exact(parts)), false);
});
test("one ULP, non-dyadic exact coordinates, nonfinite values and changed vertex order never match", () => {
  const source = exact(box);
  const moved = structuredClone(box);
  moved[0][0][1][0] += Number.EPSILON * 2;
  assert.equal(nativeExactNumericIdentity(moved, source), false);
  const rationalSource = exact(box);
  rationalSource[0][0][1][0] = new Rational(
    3_000_000_000_000_000_000_000_001n,
    1_000_000_000_000_000_000_000_000n,
  );
  assert.equal(nativeExactNumericIdentity(box, rationalSource), false);
  const nonfinite = structuredClone(box);
  nonfinite[0][0][1][0] = Infinity;
  assert.equal(nativeExactNumericIdentity(nonfinite, source), false);
  assert.equal(
    nativeExactNumericIdentity([[box[0][0].slice().reverse()]], source),
    false,
  );
});
test("identical contained-cell proof still checks inventory and original anchors, and expanded drawings fail", () => {
  const source = nativeRationalOverlay("union", box),
    prepared = prepareNativeContainedCellDisplay("box", source);
  assert.equal(
    nativeExactNumericIdentity(prepared.display.partsFeet, source),
    true,
  );
  validateNativeContainedCellDisplay(prepared.display, source);
  const anchor = structuredClone(prepared.display);
  anchor.unchangedIEEEAnchorsFeet.push([9, 9]);
  assert.throws(
    () => validateNativeContainedCellDisplay(anchor, source),
    /contained/,
  );
  const moved = structuredClone(prepared.display);
  moved.partsFeet[0][0][1][0] += 0.001;
  assert.throws(
    () => validateNativeContainedCellDisplay(moved, source),
    /contained/,
  );
});
