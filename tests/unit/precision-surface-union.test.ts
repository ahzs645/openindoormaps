import assert from "node:assert/strict";
import test from "node:test";
import type { MultiPolygon, Polygon } from "geojson";
import { precisionSurfaceUnionGeometry } from "../../app/indoor-project/precision-surface-union";
import {
  nativeRationalOverlay as overlay,
  type NativeRationalOverlayInput,
} from "../../app/indoor-project/native-rational-overlay";

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
const parts = (geometry: Polygon | MultiPolygon) =>
  (geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates) as NativeRationalOverlayInput;
function equivalent(geometry: MultiPolygon) {
  const before = JSON.stringify(geometry),
    result = precisionSurfaceUnionGeometry(geometry);
  assert.notEqual(result, geometry);
  assert.equal(overlay("difference", parts(geometry), parts(result)).length, 0);
  assert.equal(overlay("difference", parts(result), parts(geometry)).length, 0);
  assert.equal(JSON.stringify(geometry), before);
  return result;
}
test("render union removes only internal shared partitions and preserves holes and disconnected islands", () => {
  const geometry: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [
      [rect(0, 0, 10, 10), rect(2, 2, 4, 4)],
      [rect(10, 0, 15, 5)],
      [rect(10, 5, 15, 10)],
      [rect(30, 0, 35, 5)],
    ],
  };
  const result = equivalent(geometry);
  assert.equal(result.coordinates.length, 2);
  assert.equal(
    result.coordinates[0].length,
    2,
    "the real hole remains excluded",
  );
});
test("overlaps and subpixel positive gaps remain the same exact set", () => {
  const tiny = Number.EPSILON * 8;
  equivalent({
    type: "MultiPolygon",
    coordinates: [
      [rect(0, 0, 2, 2)],
      [rect(1, 0, 3, 2)],
      [rect(3 + tiny, 0, 4, 2)],
    ],
  });
  const gap = equivalent({
    type: "MultiPolygon",
    coordinates: [[rect(0, 0, 2, 2)], [rect(2 + tiny, 0, 4, 2)]],
  });
  assert.equal(gap.coordinates.length, 2);
});
test("single parts and ordinary polygons are returned unchanged without any geometry normalization", () => {
  const polygon: Polygon = { type: "Polygon", coordinates: [rect(0, 0, 1, 1)] };
  const multi: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [polygon.coordinates],
  };
  assert.equal(precisionSurfaceUnionGeometry(polygon), polygon);
  assert.equal(precisionSurfaceUnionGeometry(multi), multi);
});
