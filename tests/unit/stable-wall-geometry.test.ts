import { test } from "node:test";
import assert from "node:assert/strict";
import pc from "polygon-clipping";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { stableWallGeometry } from "../../app/indoor-project/stable-wall-geometry";

const metres = (points: number[][]) =>
  points.map(([x, y]) => [x / 111_319.49, y / 111_319.49]);
const rectangle = (x: number, y: number, w: number, h: number) =>
  metres([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ]);
const collection = (
  coordinates: number[][][][],
): FeatureCollection<MultiPolygon> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "native-wall-123",
      properties: { nativeElementId: 123, levelId: 311, kind: "wall" },
      geometry: { type: "MultiPolygon", coordinates },
    },
  ],
});

test("isolates real shells and retains door gaps, holes and source identity without mutation", () => {
  const wallA = [rectangle(0, 0, 10, 0.2), rectangle(2, 0.05, 0.7, 0.1)];
  const wallB = [rectangle(11, 0, 3, 0.2)];
  const original = collection([wallA, wallB]);
  const before = JSON.stringify(original);
  const output = stableWallGeometry(original);
  assert.equal(output.features.length, 2);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(
    output.features.map((f) => f.properties?.nativeElementId),
    [123, 123],
  );
  assert.notEqual(output.features[0].id, output.features[1].id);
  assert.equal(output.features[0].geometry.coordinates[0].length, 2);
  const parts = output.features.flatMap((f) => f.geometry.coordinates);
  assert.deepEqual(
    pc.difference(parts as pc.MultiPolygon, [wallA, wallB] as pc.MultiPolygon),
    [],
  );
  assert.deepEqual(
    pc.difference([wallA, wallB] as pc.MultiPolygon, parts as pc.MultiPolygon),
    [],
  );
});

test("removes long numerical slivers but retains measured millimetre-wide components", () => {
  const sliver = rectangle(0, 0, 30, 0.000_001);
  const measured = rectangle(0, 1, 3, 0.001);
  const line = metres([
    [0, 2],
    [5, 2],
    [10, 2],
    [0, 2],
  ]);
  const output = stableWallGeometry(collection([[sliver], [measured], [line]]));
  assert.equal(output.features.length, 1);
  assert.deepEqual(output.features[0].geometry.coordinates, [[measured]]);
});

test("normalizes opposite shell/hole winding and duplicate closing vertices", () => {
  const outer = rectangle(0, 0, 10, 10).reverse();
  const hole = rectangle(3, 3, 2, 2);
  const output = stableWallGeometry(
    collection([[[...outer, outer[0], outer[0]], hole]]),
  );
  const polygon = output.features[0].geometry.coordinates[0];
  assert.equal(polygon[0].length, 5);
  assert.equal(polygon[1].length, 5);
  assert.deepEqual(
    pc.difference(
      [polygon] as pc.MultiPolygon,
      [[outer, hole]] as pc.MultiPolygon,
    ),
    [],
  );
  assert.deepEqual(
    pc.difference(
      [[outer, hole]] as pc.MultiPolygon,
      [polygon] as pc.MultiPolygon,
    ),
    [],
  );
  const signed = (r: number[][]) =>
    r.reduce((s, a, i) => {
      const b = r[(i + 1) % r.length];
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0);
  assert.ok(signed(polygon[0]) > 0);
  assert.ok(signed(polygon[1]) < 0);
});

test("removes a numerical backtracking spur attached to a real wall", () => {
  const ring = metres([
    [0, 0],
    [10, 0],
    [10, 0.2],
    [5, 0.2],
    [15, 0.200_001],
    [5, 0.2],
    [0, 0.2],
    [0, 0],
  ]);
  const output = stableWallGeometry(collection([[ring]]));
  assert.equal(output.features.length, 1);
  const result = output.features[0].geometry.coordinates[0][0];
  assert.ok(Math.max(...result.map((p) => p[0])) <= 10 / 111_319.49);
  assert.deepEqual(
    pc.difference(
      output.features[0].geometry.coordinates as pc.MultiPolygon,
      [[rectangle(0, 0, 10, 0.2)]] as pc.MultiPolygon,
    ),
    [],
  );
});
