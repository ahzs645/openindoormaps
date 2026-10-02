import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { stairPlaceGround } from "../../app/indoor-project/stair-place-ground";
import { geographicPoint } from "../../app/indoor-project/routing";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
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
function fixture() {
  const record = {
    key: "stairs",
    stair: true,
    levelId: 1,
    elevationFeet: 10,
    ringsFeet: [ring(0, 0, 10, 4)],
  };
  const d = {
    source: { modelSha256: "model" },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    records: [record, { ...record, key: "corridor", stair: false }],
    stairDisplay: {
      sourceModelSha256: "model",
      flights: [
        {
          roomKey: record.key,
          levelId: 1,
          floorElevationFeet: 10,
          sourceGeometryKey: JSON.stringify([1, 10, record.ringsFeet]),
          floorOccluders: [
            {
              nativeElementId: 2,
              elevationFeet: 10,
              ringsFeet: [ring(-1, -1, 12, 6), ring(2, -0.5, 6, 5)],
            },
          ],
        },
      ],
    },
  } as unknown as IndoorDataset;
  const areas: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: ["stairs", "corridor"].map((key) => ({
      type: "Feature",
      properties: { key },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[record.ringsFeet[0].map((p) => geographicPoint(d, p))]],
      },
    })),
  };
  return { d, areas };
}
test("a stair place retains slab landings and exposes the native well, without changing selection or shared corridors", () => {
  const { d, areas } = fixture(),
    before = JSON.stringify({ d, areas });
  const floors = stairPlaceGround(d, areas),
    stairs = floors.features[0];
  const inside = (x: number) =>
    booleanPointInPolygon(
      { type: "Point", coordinates: geographicPoint(d, [x, 2]) },
      stairs.geometry,
    );
  assert.equal(inside(1), true, "Entrance landing is solid");
  assert.equal(
    inside(5),
    false,
    "Selectable place is not material over its native well",
  );
  assert.equal(inside(9), true, "Exit landing remains solid");
  assert.equal(
    booleanPointInPolygon(
      { type: "Point", coordinates: geographicPoint(d, [5, 2]) },
      areas.features[0].geometry,
    ),
    true,
    "Original outline still selects the stairwell",
  );
  assert.equal(
    floors.features[1],
    areas.features[1],
    "An overhead stair must not erase a shared corridor",
  );
  assert.equal(JSON.stringify({ d, areas }), before);
});
test("stale, missing or wrong-elevation slab evidence cannot create guessed openings", () => {
  const { d, areas } = fixture();
  const f = d.stairDisplay!.flights[0],
    key = f.sourceGeometryKey;
  f.sourceGeometryKey = "stale";
  assert.equal(stairPlaceGround(d, areas).features[0], areas.features[0]);
  f.sourceGeometryKey = key;
  f.floorOccluders![0].elevationFeet = 20;
  assert.equal(stairPlaceGround(d, areas).features[0], areas.features[0]);
  f.floorOccluders = undefined;
  assert.equal(stairPlaceGround(d, areas).features[0], areas.features[0]);
  d.stairDisplay!.sourceModelSha256 = "other";
  assert.equal(stairPlaceGround(d, areas), areas);
});
