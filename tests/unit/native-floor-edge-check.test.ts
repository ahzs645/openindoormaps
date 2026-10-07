import test from "node:test";
import assert from "node:assert/strict";
import { exposedNativeFloorEdgeFeet as check } from "../../app/indoor-project/native-floor-edge-check";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
test("open slab connection is flagged while an inset enclosure is not", () => {
  const slab = [rect(0, 0, 30, 10)];
  assert.equal(check(slab, [slab]), 80);
  assert.equal(check([rect(1, 1, 28, 8)], [slab]), 0);
  assert.equal(check([rect(0, 1, 4, 8)], [slab]), 8);
});
test("inner floor openings do not count as exposed exterior edges", () => {
  const slab = [rect(0, 0, 30, 20), rect(10, 5, 5, 5)];
  assert.equal(check([rect(10, 5, 5, 5)], [slab]), 0);
});
test("diagonal, reversed and subdivided edges retain their physical lengths", () => {
  const slab: [number, number][][] = [
    [
      [0, 0],
      [6, 8],
      [14, 2],
      [8, -6],
      [0, 0],
    ],
  ];
  const region: [number, number][][] = [
    [
      [0, 0],
      [3, 4],
      [6, 8],
      [7, 4],
      [0, 0],
    ],
  ];
  assert.equal(check(region, [slab]), 10);
  assert.equal(check(region, [slab.map((r) => [...r].reverse())]), 10);
  assert.equal(check(region, [slab, slab]), 10);
});
