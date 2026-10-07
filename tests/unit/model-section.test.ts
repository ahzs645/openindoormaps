import { test } from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { sourceModelSection } from "../../app/indoor-project/model-section";

const data = {
  records: [
    { levelId: 1, elevationFeet: 24 },
    { levelId: 2, elevationFeet: 30 },
    { levelId: 3, elevationFeet: 35 },
  ],
} as IndoorDataset;

test("room source section excludes offset storey without moving GIS datum", () => {
  assert.deepEqual(sourceModelSection(data, [1, 2], 1), {
    datum: 24,
    lo: 23.2,
    hi: 28,
  });
  assert.deepEqual(sourceModelSection(data, [1, 2], 2), {
    datum: 24,
    lo: 29.2,
    hi: 34,
  });
});

test("ordinary source view retains campus section and rejects unrelated selection", () => {
  const campus = { datum: 24, lo: 23.2, hi: 34 };
  assert.deepEqual(sourceModelSection(data, [1, 2]), campus);
  assert.deepEqual(sourceModelSection(data, [1, 2], 3), campus);
});

test("full source context removes floor clipping without moving its GIS datum", () => {
  assert.deepEqual(sourceModelSection(data, [1, 2], 2, true), {
    datum: 24,
    lo: null,
    hi: null,
  });
});
