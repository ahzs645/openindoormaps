import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { fixture } from "../fixtures/native-area-project";
import { nativeSurfacePerimeters } from "../../app/indoor-project/native-surface-perimeters";
import { nativeRenderProperties } from "../../app/indoor-project/native-render-parts";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import { geographicPoint } from "../../app/indoor-project/routing";

const outer: [number, number][] = [
  [0, 0],
  [12, 0],
  [12, 10],
  [0, 10],
];
const hole: [number, number][] = [
  [4, 4],
  [4, 6],
  [6, 6],
  [6, 4],
];
const source = (
  properties: Record<string, unknown>,
): FeatureCollection<MultiPolygon> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "native",
      properties,
      // Two adjacent draw cells have an artificial shared vertical edge.
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [4, 0],
              [4, 10],
              [0, 10],
              [0, 0],
            ],
          ],
          [
            [
              [4, 0],
              [12, 0],
              [12, 10],
              [4, 10],
              [4, 0],
            ],
          ],
        ],
      },
    },
  ],
});
test("native room borders retain outer and hole perimeters without paint subdivision edges", () => {
  const data = fixture(),
    surfaces = source({ key: "0", nativeBoundaryPartsFeet: [[outer, hole]] });
  const before = JSON.stringify(surfaces);
  const result = nativeSurfacePerimeters(data, surfaces);
  assert.deepEqual(
    result.features[0].geometry.coordinates,
    [outer, hole].map((r) => [...r, r[0]].map((p) => geographicPoint(data, p))),
  );
  assert.equal(result.features[0].properties?.key, "0");
  assert.equal(
    JSON.stringify(surfaces),
    before,
    "fill/source metadata stays unchanged",
  );
});
test("post-cut exact drawing boundary replaces the earlier native perimeter", () => {
  const data = fixture();
  const cut = nativeRationalOverlay("difference", [[outer]], [[hole]]);
  const properties = {
    ...{ nativeBoundaryPartsFeet: [[outer]] },
    ...nativeRenderProperties(cut),
  };
  const surfaces = source(properties),
    before = JSON.stringify(surfaces);
  const result = nativeSurfacePerimeters(data, surfaces);
  assert.equal(
    result.features[0].geometry.coordinates.length,
    2,
    "actual cut hole is stroked",
  );
  assert.equal(result.features[0].geometry.coordinates.flat().length, 10);
  assert.equal(JSON.stringify(surfaces), before);
});
test("legacy surfaces retain their existing geographic polygon rings", () => {
  const data = fixture(),
    surfaces = source({ key: "legacy" });
  assert.deepEqual(
    nativeSurfacePerimeters(data, surfaces).features[0].geometry.coordinates,
    surfaces.features[0].geometry.coordinates.flat(),
  );
});
