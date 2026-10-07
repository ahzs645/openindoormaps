import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import pc from "polygon-clipping";
import { nativeAreaOverlapsSupportedFloor } from "../../app/indoor-project/native-area-review";
type Rings = [number, number][][];
const quad = (x: number, y: number, w: number, h: number): Rings => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
];
test("computed diagonal region crossings share the native floor comparison grid without rewriting the region", () => {
  const [region, floors] = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/native-floor-membership-intersection.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as [Rings[], Rings[]];
  const before = JSON.stringify([region, floors]);
  assert.throws(() => pc.intersection(region, floors), /SweepLine/);
  assert.equal(nativeAreaOverlapsSupportedFloor(region[0], floors), true);
  assert.equal(JSON.stringify([region, floors]), before);
});
test("floor membership keeps genuine narrow gaps and nested slab holes excluded", () => {
  const floor = quad(0, 0, 10, 20),
    second = quad(10.0004, 0, 10, 20),
    gap = quad(10.0001, 0, 0.0002, 20);
  assert.equal(nativeAreaOverlapsSupportedFloor(gap, [floor, second]), false);
  assert.equal(
    nativeAreaOverlapsSupportedFloor(quad(9.9, 0, 0.1, 20), [floor, second]),
    true,
  );
  const slab = [...quad(0, 0, 20, 20), quad(5, 5, 10, 10)[0]];
  assert.equal(
    nativeAreaOverlapsSupportedFloor(quad(6, 6, 2, 2), [slab]),
    false,
  );
  assert.equal(
    nativeAreaOverlapsSupportedFloor(quad(1, 1, 2, 2), [slab]),
    true,
  );
});
