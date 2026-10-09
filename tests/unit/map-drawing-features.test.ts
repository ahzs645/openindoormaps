import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, Polygon } from "geojson";
import { mapDrawingFeatures } from "../../app/indoor-project/map-drawing-features";

test("map tiles keep contained paint and style/pick properties while full source carriers remain unchanged", () => {
  const collection: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "native-room",
        properties: {
          key: "room-a",
          nativeRegionId: "region-a",
          exactFaceId: "face-a",
          roomKeys: ["room-a"],
          color: "#eee7d5",
          levelId: 311,
          circulation: false,
          base: 0,
          height: 3,
          nativeDisplayExactParts: [[[["1/3", "1/5"]]]],
          nativeDisplayResidualParts: [[[["1/300000000000", "1/5"]]]],
          nativeDisplayPartsFeet: [
            [
              [
                [0, 0],
                [1, 0],
                [0, 1],
              ],
            ],
          ],
          nativeBoundaryPartsFeet: [
            [
              [
                [0, 0],
                [1, 0],
                [0, 1],
              ],
            ],
          ],
          unchangedIEEEAnchorsFeet: [[0, 0]],
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  };
  const before = JSON.stringify(collection);
  const drawing = mapDrawingFeatures(collection);
  assert.equal(JSON.stringify(collection), before);
  assert.equal(drawing.features[0].geometry, collection.features[0].geometry);
  assert.equal(drawing.features[0].id, collection.features[0].id);
  assert.deepEqual(drawing.features[0].properties, {
    key: "room-a",
    nativeRegionId: "region-a",
    exactFaceId: "face-a",
    roomKeys: ["room-a"],
    color: "#eee7d5",
    levelId: 311,
    circulation: false,
    base: 0,
    height: 3,
  });
  assert.equal(mapDrawingFeatures(collection), drawing);
  assert.notEqual(mapDrawingFeatures(structuredClone(collection)), drawing);
});

test("ordinary labels, routes and legacy drawings retain their original objects", () => {
  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { key: "route-a", kind: "walk", color: "blue" },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      },
    ],
  };
  assert.equal(mapDrawingFeatures(collection), collection);
  assert.equal(
    mapDrawingFeatures({ type: "FeatureCollection", features: [] }).features
      .length,
    0,
  );
});
