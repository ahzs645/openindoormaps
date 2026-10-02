/** Regression: stacked rooms and overlapping building maps share coordinates. */
import assert from "node:assert/strict";
import { buildPoiMap } from "../app/utils/poi-map";
import type { LocationConfig } from "../app/types/location";

const ring = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];
const rooms = [
  [1, 0, "a"],
  [2, 1, "a"],
  [3, 1, "b"],
] as const;
const location = {
  data: {
    indoorMap: {
      type: "FeatureCollection",
      features: rooms.map(([id, floor, building]) => ({
        type: "Feature",
        id,
        properties: {
          feature_type: "unit",
          level_id: floor,
          building_id: building,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      })),
    },
    pois: {
      type: "FeatureCollection",
      features: rooms.map(([id, floor, building]) => ({
        type: "Feature",
        id: id + 10,
        properties: { floor, building_id: building },
        geometry: { type: "Point", coordinates: [0.5, 0.5] },
      })),
    },
  },
} as unknown as LocationConfig;
const mapping = buildPoiMap(location);
for (const [id] of rooms)
  assert.deepEqual(
    mapping.get(id)?.map((f) => f.id),
    [id + 10],
  );
console.log("PASS: room selection matches its own floor and building.");
