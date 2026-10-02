import test from "node:test";
import assert from "node:assert/strict";
import polygonClipping from "polygon-clipping";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { stairsAboveDisplayedGround } from "../../app/indoor-project/stair-ground-occlusion";
import { stairFloorApertures } from "../../app/indoor-project/stair-floor-apertures";
const ring = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
test("opaque displayed ground hides descending treads and preserves actual holes and upper treads", () => {
  const treads: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { topMetres: -1, descending: true },
        geometry: { type: "Polygon", coordinates: [ring(0, 0, 10, 2)] },
      },
    ],
  };
  const floors: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { base: 0 },
        geometry: {
          type: "MultiPolygon",
          coordinates: [[ring(-1, -1, 12, 4), ring(4, -0.5, 2, 3)]],
        },
      },
    ],
  };
  const before = structuredClone({ treads, floors });
  const shown = stairsAboveDisplayedGround(treads, floors);
  assert.deepEqual(
    polygonClipping.xor(
      shown.features[0].geometry.coordinates as [number, number][][],
      [ring(4, 0, 2, 2)],
    ),
    [],
  );
  assert.deepEqual(
    stairFloorApertures(floors, treads),
    floors,
    "A tread must not punch a hole in opaque ground",
  );
  assert.deepEqual({ treads, floors }, before);
  floors.features[0].geometry.coordinates = [[ring(-1, -1, 12, 4)]];
  assert.equal(stairsAboveDisplayedGround(treads, floors).features.length, 0);
  treads.features[0].properties!.topMetres = 0;
  assert.deepEqual(stairsAboveDisplayedGround(treads, floors), treads);
  treads.features[0].properties!.topMetres = 0.5;
  assert.deepEqual(
    stairsAboveDisplayedGround(treads, floors, true),
    treads,
    "A tread above this surface remains",
  );
  floors.features[0].properties!.base = 1;
  assert.equal(
    stairsAboveDisplayedGround(treads, floors, true).features.length,
    0,
    "A higher displayed floor covers it",
  );
});
