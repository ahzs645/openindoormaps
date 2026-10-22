import test from "node:test";
import assert from "node:assert/strict";
import { composeSharedCorridorGuide } from "../../app/indoor-project/shared-corridor-composition";
import type { SharedGuidePoint } from "../../app/indoor-project/shared-corridor-guides";

test("composition cancels exact unused approaches without fitting real bends", () => {
  const original: SharedGuidePoint[] = [
    [0, 2, 0],
    [0, 6, 0],
    [10, 6, 0],
    [11, 6.2, 0],
    [10.5, 6, 0],
    [20, 6, 0],
    [20, 1, 0],
    [20, 6, 0],
    [40, 6, 0],
    [40, 10, 0],
  ];
  const before = JSON.stringify(original);
  const result = composeSharedCorridorGuide(original);
  assert.equal(
    result.some((p) => p[0] === 20 && p[1] === 1),
    false,
  );
  assert.ok(result.some((p) => p[0] === 11 && p[1] === 6.2));
  assert.deepEqual(
    composeSharedCorridorGuide(original.toReversed()),
    result.toReversed(),
  );
  assert.equal(JSON.stringify(original), before);
});

test("composition keeps outer hallway stops, true loops, nearby bends and elevations", () => {
  const start: SharedGuidePoint = [2, 2, 0];
  const points: SharedGuidePoint[] = [
    [0, 2, 0],
    start,
    [1, 2, 0],
    [4, 2, 0],
    [4, 4, 0],
    [6, 4, 0],
    [6, 2, 0],
    [4, 2, 0],
    [10, 2.000_000_000_000_001, 0],
    [12, 2, 0],
    [13, 2, 1],
    [14, 2, 0],
  ];
  const result = composeSharedCorridorGuide(points, { start });
  for (const protectedPoint of [
    start,
    points[4],
    points[5],
    points[6],
    points[8],
    points[10],
  ])
    assert.ok(result.some((p) => p.every((v, i) => v === protectedPoint[i])));
});
