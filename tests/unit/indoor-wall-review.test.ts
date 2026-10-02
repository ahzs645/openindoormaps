import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  wallReviewContext,
  wallReviewFeatures,
  wallReviewKey,
} from "../../app/indoor-project/wall-review";
const fixture = (): IndoorDataset =>
  JSON.parse(
    readFileSync(
      new URL("../fixtures/unbc-pass-through-display.json", import.meta.url),
      "utf8",
    ),
  );

test("wall review keeps native IDs and multipart footprints separate from merged room display", () => {
  const data = fixture();
  const wall = data.walls.find((w) => w.nativeElementId === 948_595)!;
  data.walls.push({
    ...wall,
    ringsFeet: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ],
  });
  const before = JSON.stringify(data);
  const key = wallReviewKey(wall);
  const feature = wallReviewFeatures(data, [311], "all").features.find(
    (f) => f.properties?.key === key,
  )!;
  assert.equal(feature.properties?.nativeElementId, 948_595);
  assert.equal(feature.geometry.coordinates.length, 2);
  for (const polygon of feature.geometry.coordinates)
    assert.deepEqual(polygon[0][0], polygon[0].at(-1));
  assert.deepEqual(wallReviewContext(data, key)?.selection.partsFeet, [
    wall.ringsFeet,
    data.walls.at(-1)!.ringsFeet,
  ]);
  assert.equal(JSON.stringify(data), before);
});
test("review exports model identity, uncertain footprint and nearby sprinkler room without inventing a boundary", () => {
  const data = fixture();
  const wall = data.walls.find((w) => w.nativeElementId === 948_595)!;
  wall.approximate = true;
  const context = wallReviewContext(data, wallReviewKey(wall))!;
  assert.deepEqual(context.source, data.source);
  assert.equal(
    context.selection.footprintQuality,
    "approximate bounds envelope",
  );
  assert.ok(context.nearbyRooms.some((r) => r.number === "07-165"));
  assert.deepEqual(context.selection.partsFeet, [wall.ringsFeet]);
  assert.equal(wallReviewContext(data, "wall:311:missing"), null);
});
test("floor and building filters exclude unrelated walls and columns; old quality remains unknown", () => {
  const data = fixture();
  assert.equal(wallReviewFeatures(data, [-1], "all").features.length, 0);
  assert.equal(wallReviewFeatures(data, [311], "missing").features.length, 0);
  const wall = data.walls.find((w) => w.nativeElementId === 948_595)!;
  delete wall.approximate;
  assert.equal(
    wallReviewContext(data, wallReviewKey(wall))!.selection.footprintQuality,
    "not specified in this package",
  );
  wall.kind = "column";
  assert.ok(
    !wallReviewFeatures(data, [311], "all").features.some(
      (f) => f.properties?.key === wallReviewKey(wall),
    ),
  );
});
