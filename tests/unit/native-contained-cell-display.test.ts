import test from "node:test";
import assert from "node:assert/strict";
import {
  Rational,
  rational,
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import {
  encodeNativeExactTopology,
  createNativeExactTopologyIndex,
  nativeRationalPointInParts,
} from "../../app/indoor-project/native-exact-planar-topology";
import {
  prepareNativeContainedCellDisplay,
  validateNativeContainedCellDisplay,
} from "../../app/indoor-project/native-contained-cell-display";
const binding = {
  sourceModelSha256: "a".repeat(64),
  sourceGeometryKey: "independent-source-fixture",
  kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
};
const source = () =>
  nativeRationalOverlay(
    "difference",
    [
      [
        [
          [0, 0],
          [3, 0],
          [3, 3],
          [0, 3],
        ],
      ],
    ],
    [
      [
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
        ],
      ],
    ],
  );
function index(
  residual: ReturnType<typeof prepareNativeContainedCellDisplay>["residual"],
) {
  return residual
    ? createNativeExactTopologyIndex(
        encodeNativeExactTopology(binding, [residual]),
        binding,
      )
    : undefined;
}
test("contained cell drawing and separate positive residual reproduce exact source holes", () => {
  const parts = source(),
    prepared = prepareNativeContainedCellDisplay("cell", parts);
  validateNativeContainedCellDisplay(
    prepared.display,
    parts,
    index(prepared.residual),
  );
  assert.equal(nativeRationalPointInParts([1.5, 1.5], parts), false);
  assert.equal(
    nativeRationalOverlay("difference", prepared.display.partsFeet, parts)
      .length,
    0,
  );
  assert.equal(JSON.stringify(prepared.display).includes("numerator"), false);
});
test("unrepresentable positive source piece survives in the separate residual carrier", () => {
  const x = new Rational(
    1_000_000_000_000_000_000_000_001n,
    1_000_000_000_000_000_000_000_000n,
  );
  const parts = nativeRationalOverlay("union", [
    [
      [
        [rational(1), rational(0)],
        [x, rational(0)],
        [x, rational(1)],
        [rational(1), rational(1)],
      ],
    ],
  ]);
  const p = prepareNativeContainedCellDisplay("thin", parts);
  assert.equal(p.display.partsFeet.length, 0);
  assert.ok(p.residual);
  validateNativeContainedCellDisplay(p.display, parts, index(p.residual));
  assert.throws(() => validateNativeContainedCellDisplay(p.display, parts));
});
test("claimed drawing certificate cannot authorize an expanded render piece or lose a positive hole", () => {
  const parts = source(),
    p = prepareNativeContainedCellDisplay("cell", parts),
    bad = structuredClone(p.display);
  bad.partsFeet.push([
    [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ],
  ]);
  bad.faces[0].numericPieces++;
  assert.throws(
    () => validateNativeContainedCellDisplay(bad, parts, index(p.residual)),
    /contained/,
  );
  const annotated = { ...p.display, authoringNotes: "private" };
  assert.throws(
    () =>
      validateNativeContainedCellDisplay(annotated, parts, index(p.residual)),
    /contained/,
  );
});
