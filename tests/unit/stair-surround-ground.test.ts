import test from "node:test";
import assert from "node:assert/strict";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
import { stairSurroundGround } from "../../app/indoor-project/stair-surround-ground";
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
  const rings = [ring(0, 0, 12, 8)];
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
        key: "stairs",
        stair: true,
        levelId: 1,
        elevationFeet: 10,
        ringsFeet: rings,
        properties: {},
      },
      {
        key: "hall",
        stair: false,
        levelId: 1,
        elevationFeet: 10,
        ringsFeet: rings,
        properties: {},
      },
    ],
    walls: [
      {
        levelId: 1,
        kind: "wall",
        approximate: false,
        ringsFeet: [ring(0, 0, 1, 8)],
      },
    ],
    nodes: [{ id: "arrival" }],
    edges: [{ id: "stairs-link" }],
    walkingSupport: {
      sourceModelSha256: "native",
      floors: [
        {
          nativeElementId: 42,
          elevationFeet: 10,
          ringsFeet: [ring(-1, -1, 14, 10), ring(3, 1, 6, 6)],
        },
      ],
    },
  } as unknown as IndoorDataset;
  const areas: FeatureCollection<MultiPolygon> = {
    type: "FeatureCollection",
    features: ["stairs", "hall"].map((key) => ({
      type: "Feature",
      properties: {
        key,
        boundarySource: "prepared-native-walls",
        color: "#cfd9e4",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[rings[0].map((p) => geographicPoint(data, p))]],
      },
    })),
  };
  return { data, areas };
}
const contains = (
  data: IndoorDataset,
  geometry: MultiPolygon | Polygon,
  x: number,
  y: number,
) =>
  booleanPointInPolygon(
    { type: "Point", coordinates: geographicPoint(data, [x, y]) },
    geometry,
  );
test("native stair surrounds retain both flat landings while preserving the exact void and wall material", () => {
  const { data, areas } = fixture();
  const before = JSON.stringify({ data, areas });
  const after = stairSurroundGround(data, areas);
  const stairs = after.features[0];
  assert.equal(contains(data, stairs.geometry, 2, 4), true);
  assert.equal(contains(data, stairs.geometry, 10, 4), true);
  assert.equal(
    contains(data, stairs.geometry, 6, 4),
    false,
    "Native well stays open",
  );
  assert.equal(
    contains(data, stairs.geometry, 0.5, 4),
    false,
    "Wall is not painted as floor",
  );
  assert.equal(stairs.properties?.groundEvidence, "native-stair-surround");
  assert.deepEqual(stairs.properties?.groundSlabIds, [42]);
  assert.equal(after.features[1], areas.features[1], "Shared hallway retained");
  assert.equal(
    JSON.stringify({ data, areas }),
    before,
    "No source geometry, access or route changes",
  );
});
test("raw stair outlines and registered drawing contours yield to neutral native floor rather than a fake enclosure", () => {
  for (const source of [
    "source-footprint",
    "prepared-registered-source-walls",
    "unknown",
  ]) {
    const { data, areas } = fixture();
    areas.features[0].properties!.boundarySource = source;
    const after = stairSurroundGround(data, areas);
    assert.equal(after.features.length, 1);
    assert.equal(after.features[0], areas.features[1]);
    assert.equal(
      areas.features.length,
      2,
      "Original source footprint remains available for picking",
    );
  }
});
test("wrong-height floor material and an absent native enclosure cannot paint a landing", () => {
  const { data, areas } = fixture();
  data.walkingSupport!.floors[0].elevationFeet = 20;
  assert.equal(stairSurroundGround(data, areas).features.length, 1);
  data.walkingSupport!.floors = [];
  assert.equal(stairSurroundGround(data, areas).features.length, 1);
});
test("separate native slab components and their holes remain separate", () => {
  const { data, areas } = fixture();
  const floor = data.walkingSupport!.floors[0];
  floor.partsFeet = [[ring(0, 0, 4, 8), ring(1, 2, 1, 2)], [ring(8, 0, 4, 8)]];
  const stairs = stairSurroundGround(data, areas).features[0];
  assert.equal(stairs.geometry.coordinates.length, 2);
  assert.equal(contains(data, stairs.geometry, 1.5, 3), false);
  assert.equal(contains(data, stairs.geometry, 6, 3), false);
  assert.equal(contains(data, stairs.geometry, 10, 3), true);
});
test("legacy and stale packages retain their existing treatment; explicit open drops remain untouched", () => {
  const { data, areas } = fixture();
  areas.features[0].properties!.openDrop = true;
  assert.equal(stairSurroundGround(data, areas).features[0], areas.features[0]);
  data.walkingSupport!.sourceModelSha256 = "stale";
  assert.equal(stairSurroundGround(data, areas), areas);
  data.walkingSupport = undefined;
  assert.equal(stairSurroundGround(data, areas), areas);
});

test("a native circulation cell owned by a stair retains the entire shared hallway", () => {
  const { data, areas } = fixture();
  areas.features[0].properties!.nativeCellId = "native-cell:floor:1";
  areas.features[0].properties!.boundarySource = "prepared-native-circulation";
  assert.equal(stairSurroundGround(data, areas).features[0], areas.features[0]);
});
