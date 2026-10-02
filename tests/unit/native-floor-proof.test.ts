import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeSlabsCoverSegment,
  type FloorPolygon,
} from "../../scripts/indoor/native-floor-proof";
const rectangle = (
  a: number,
  b: number,
  c: number,
  d: number,
): FloorPolygon => [
  [
    [a, b],
    [c, b],
    [c, d],
    [a, d],
  ],
];
test("complete native slab proof rejects a narrow unsupported interval between valid endpoints", () => {
  const floors = [rectangle(0, 0, 4.999, 10), rectangle(5.001, 0, 10, 10)];
  assert.equal(nativeSlabsCoverSegment([1, 5], [9, 5], floors), false);
  assert.equal(nativeSlabsCoverSegment([1, 5], [4, 5], floors), true);
});
test("native slab holes remain excluded and a second actual slab may cover a hole", () => {
  const floor = [rectangle(0, 0, 10, 10)[0], rectangle(4.99, 4, 5.01, 6)[0]];
  assert.equal(nativeSlabsCoverSegment([1, 5], [9, 5], [floor]), false);
  assert.equal(
    nativeSlabsCoverSegment([1, 5], [9, 5], [floor, rectangle(4, 3, 6, 7)]),
    true,
  );
  assert.equal(nativeSlabsCoverSegment([5, 5], [5, 5], [floor]), false);
});
test("slab union can support a complete segment without any one slab spanning it", () => {
  assert.equal(
    nativeSlabsCoverSegment(
      [1, 5],
      [9, 5],
      [rectangle(0, 0, 6, 10), rectangle(4, 0, 10, 10)],
    ),
    true,
  );
  assert.equal(
    nativeSlabsCoverSegment([-1, 5], [9, 5], [rectangle(0, 0, 10, 10)]),
    false,
  );
});
test("collinear slab boundaries retain complete support and missing floors never pass", () => {
  assert.equal(
    nativeSlabsCoverSegment(
      [0, 0],
      [10, 0],
      [rectangle(0, 0, 6, 10), rectangle(4, 0, 10, 10)],
    ),
    true,
  );
  assert.equal(nativeSlabsCoverSegment([0, 0], [10, 0], []), false);
});
