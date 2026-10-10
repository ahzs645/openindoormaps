import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection } from "geojson";
import { geoJsonStatistics } from "../../app/indoor-project/geojson-statistics";

test("source statistics count every vertex and property without serializing", () => {
  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { key: "r1", color: "#fff", height: 2.5 },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
              [
                [0.2, 0.2],
                [0.4, 0.2],
                [0.2, 0.4],
                [0.2, 0.2],
              ],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: null,
        geometry: {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [5, 5] },
            {
              type: "LineString",
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          ],
        },
      },
    ],
  };
  const stats = geoJsonStatistics(collection);
  assert.equal(stats.features, 2);
  assert.equal(stats.vertices, 11);
  assert.equal(stats.propertyKeys, 3);
  assert(stats.propertyBytes > 0);
  assert.equal(stats.estimatedBytes, 11 * 16 + stats.propertyBytes);
  assert.deepEqual(geoJsonStatistics(undefined), {
    features: 0,
    vertices: 0,
    propertyKeys: 0,
    propertyBytes: 0,
    estimatedBytes: 0,
  });
});
