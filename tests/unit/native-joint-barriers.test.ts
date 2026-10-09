import test from "node:test";
import assert from "node:assert/strict";
import { nativeJointBarriers } from "../../app/indoor-project/native-joint-barriers";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const rect = (
  x: number,
  y: number,
  a: number,
  b: number,
): [number, number][] => [
  [x, y],
  [a, y],
  [a, b],
  [x, b],
];
test("strict native material keeps an unapproved finite seam open and preserves applied cap bytes", () => {
  const walls = [
    {
      levelId: 1,
      nativeElementId: 11,
      kind: "wall" as const,
      ringsFeet: [rect(0, 0, 2, 0.25)],
    },
    {
      levelId: 1,
      nativeElementId: 12,
      kind: "wall" as const,
      ringsFeet: [rect(2.04, -1, 2.29, 1)],
    },
  ];
  const legacy = { walls, doors: [] } as unknown as IndoorDataset;
  assert.ok(nativeJointBarriers(legacy, 1).length > 0);
  const applied = {
    levelId: 1,
    nativeElementId: 13,
    kind: "wall" as const,
    ringsFeet: [rect(5, 5, 5.05, 6)],
    reviewPatchId: "explicitly-applied",
  };
  const strict = {
    ...legacy,
    walls: [...walls, applied],
    nativeIndoorEnvelopes: { version: 1 },
  } as unknown as IndoorDataset;
  const before = JSON.stringify(strict.walls);
  assert.deepEqual(nativeJointBarriers(strict, 1), []);
  assert.equal(JSON.stringify(strict.walls), before);
  assert.equal(strict.walls.at(-1), applied);
});
