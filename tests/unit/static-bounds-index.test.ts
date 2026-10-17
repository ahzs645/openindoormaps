import assert from "node:assert/strict";
import { test } from "node:test";
import { createStaticBoundsIndex, polygonPartsBounds, type StaticBounds } from "../../app/indoor-project/static-bounds-index";

test("static broad phase preserves contact, unknowns, duplicates and source order", () => {
  const entries = [
    { id: "far", box: { min: [10, 10], max: [11, 11] } },
    { id: "touch", box: { min: [1, 1], max: [2, 2] } },
    { id: "unknown", box: null },
    { id: "tiny", box: { min: [Number.MIN_VALUE, 0], max: [Number.MIN_VALUE, 0] } },
    { id: "bad", box: { min: [NaN, 0], max: [1, 1] } },
  ];
  entries.push(entries[1]);
  const original = structuredClone(entries), query = createStaticBoundsIndex(entries, (e) => e.box, 2);
  assert.deepEqual(query({ min: [0, 0], max: [1, 1] }).map((e) => e.id), ["touch", "unknown", "tiny", "bad", "touch"]);
  assert.deepEqual(query({ min: [0, 0], max: [0, 0] }).map((e) => e.id), ["unknown", "bad"]);
  assert.deepEqual(query(null), entries);
  assert.deepEqual(query({ min: [0], max: [1] }), entries);
  assert.deepEqual(entries, original);
});

test("balanced tree preserves the full closed-intersection corpus in two and three dimensions", () => {
  let state = 914716;
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) % 2001) - 1000;
  for (const dimensions of [2, 3] as const) {
    const entries = Array.from({ length: 1700 }, (_, id) => {
      const min = Array.from({ length: dimensions }, next),
        max = min.map((n) => n + Math.abs(next()) % 50);
      return { id, bounds: { min, max } };
    });
    const query = createStaticBoundsIndex(entries, (e) => e.bounds, dimensions);
    for (let i = 0; i < 120; i++) {
      const min = Array.from({ length: dimensions }, next), max = min.map((n) => n + 75), bounds = { min, max };
      const all = entries.filter((e) => !e.bounds.min.some((n, j) => n > max[j] || e.bounds.max[j] < min[j]));
      assert.deepEqual(query(bounds), all);
    }
    const huge: StaticBounds = { min: Array(dimensions).fill(-Number.MAX_VALUE), max: Array(dimensions).fill(Number.MAX_VALUE) };
    assert.deepEqual(query(huge), entries);
  }
});

test("polygon bounds retain every shell and hole vertex and refuse malformed input", () => {
  const parts = [[[[0, 0], [2, 0], [2, 2], [0, 2]], [[.5, .5], [1, .5], [.5, 1]]]];
  assert.deepEqual(polygonPartsBounds(parts), { min: [0, 0], max: [2, 2] });
  assert.equal(polygonPartsBounds([]), null);
  assert.equal(polygonPartsBounds([[[[0, 0], [1, 1]]]]), null);
  assert.equal(polygonPartsBounds([[[[0, 0], [1, Infinity], [2, 0]]]]), null);
});

test("sparse minimum and maximum bounds stay in the unknown set", () => {
  const sparse = Array(2) as number[];
  const entries = [{ min: sparse, max: [1, 1] }, { min: [0, 0], max: sparse }];
  const query = createStaticBoundsIndex(entries, (b) => b, 2);
  assert.deepEqual(query({ min: [100, 100], max: [101, 101] }), entries);
  assert.deepEqual(query({ min: sparse, max: [1, 1] }), entries);
});
