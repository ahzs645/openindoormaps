import test from "node:test";
import assert from "node:assert/strict";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
import { HALLWAY_COLOR } from "../../app/indoor-project/display-passages";
import { stairSlabGround } from "../../app/indoor-project/stair-slab-ground";
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
  const data = {
    source: { modelSha256: "native" },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    records: [
      {
        levelId: 1,
        elevationFeet: 0,
        circulation: false,
        stair: false,
        walkable: true,
        ringsFeet: [ring(9, 0, 1, 10)],
      },
    ],
    walls: [{ levelId: 1, approximate: false, ringsFeet: [ring(0, 0, 1, 10)] }],
    stairDisplay: {
      sourceModelSha256: "native",
      flights: [],
      sourceFlights: [
        {
          stairElementId: 100,
          runs: [{ runElementId: 101, bottomElevationFeet: 0 }],
        },
      ],
    },
  } as unknown as IndoorDataset;
  const geographic = (rings: [number, number][][]) =>
    rings.map((r) => r.map((p) => geographicPoint(data, p)));
  const ground: Feature<MultiPolygon>[] = [
    {
      type: "Feature",
      properties: {
        levelId: 1,
        nativeFloorId: 42,
        nativeFloor: true,
        elevationFeet: 0,
        floorTop: 1.005,
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [geographic([ring(0, 0, 10, 10), ring(4, 4, 2, 2)])],
      },
    },
  ];
  const treads: { features: Feature<Polygon>[] } = {
    features: [
      {
        type: "Feature",
        properties: { stairElementId: 100, runElementId: 101 },
        geometry: {
          type: "Polygon",
          coordinates: geographic([ring(1, 1, 8, 8)]),
        },
      },
    ],
  };
  const contains = (f: Feature<MultiPolygon>, p: number[]) =>
    booleanPointInPolygon(
      { type: "Point", coordinates: geographicPoint(data, p) },
      f,
    );
  return { data, ground, treads, contains, geographic };
}
test("isolated native stair starting slab receives flat circulation tint without filling openings or wall and room material", () => {
  const { data, ground, treads, contains } = fixture();
  const original = JSON.stringify({ data, ground, treads });
  const result = stairSlabGround(data, ground, treads);
  assert.equal(result.length, 1);
  assert.equal(
    result[0].properties!.groundEvidence,
    "native-stair-starting-slab",
  );
  assert.equal(result[0].properties!.displayOnly, true);
  assert.equal(result[0].properties!.color, HALLWAY_COLOR);
  assert.equal(result[0].properties!.floorTop, 1.025);
  assert.equal(contains(result[0], [2, 2]), true);
  assert.equal(
    contains(result[0], [5, 5]),
    false,
    "Native floor hole stays open",
  );
  assert.equal(
    contains(result[0], [0.5, 2]),
    false,
    "Measured wall material remains separate",
  );
  assert.equal(
    contains(result[0], [9.5, 2]),
    false,
    "Other room is not recoloured as stair ground",
  );
  assert.equal(
    JSON.stringify({ data, ground, treads }),
    original,
    "No native, semantic or routing changes",
  );
});
test("an overhead flight, a different native height and an entire campus floor cannot become a blue stair enclosure", () => {
  const { data, ground, treads, geographic } = fixture();
  ground[0].properties!.elevationFeet = 10;
  assert.equal(stairSlabGround(data, ground, treads).length, 0);
  ground[0].properties!.elevationFeet = 0;
  ground[0].geometry.coordinates = [geographic([ring(-100, -100, 200, 200)])];
  assert.equal(stairSlabGround(data, ground, treads).length, 0);
  data.stairDisplay!.sourceModelSha256 = "stale";
  assert.equal(stairSlabGround(data, ground, treads).length, 0);
});
