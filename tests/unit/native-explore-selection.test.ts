import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import {
  deriveNativeExplore,
  nativeExplorePickRegions,
} from "../../app/indoor-project/native-explore";
import {
  nativeExploreSelectionFeatures,
  nativeExploreSelectionIds,
  nativeExploreIdentityLocation,
} from "../../app/indoor-project/native-explore-selection";
import { geographicPoint } from "../../app/indoor-project/routing";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import { nativeExploreControlHit } from "../../app/indoor-project/native-explore";
import { HALLWAY_COLOR } from "../../app/indoor-project/display-passages";

const ring = (
  left: number,
  bottom: number,
  right: number,
  top: number,
): [number, number][] => [
  [left, bottom],
  [right, bottom],
  [right, top],
  [left, top],
];

test("selected native geometry uses the exact displayed face and holes, not the old identity footprint", async () => {
  const data = fixture();
  data.records = data.records.slice(0, 1);
  data.records[0].ringsFeet = [ring(1, 1, 5, 5)];
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      {
        nativeElementId: 1,
        elevationFeet: 0,
        ringsFeet: [ring(0, 0, 12, 12), ring(8, 8, 10, 10)],
      },
    ],
  };
  const before = JSON.stringify(data);
  const result = await deriveNativeExplore(data, [1]);
  const selected = nativeExploreSelectionFeatures(result, data.records[0].key);
  assert.ok(selected.length);
  assert.deepEqual(selected, result.outlines.features);
  assert.deepEqual(
    selected[0].geometry.coordinates[0][0],
    geographicPoint(data, [0, 0]),
  );
  assert.equal(
    selected[0].geometry.coordinates.length,
    2,
    "physical opening remains excluded",
  );
  assert.notDeepEqual(
    selected[0].geometry.coordinates[0][0],
    geographicPoint(data, [1, 1]),
  );
  assert.equal(
    JSON.stringify(data),
    before,
    "selection never edits source, access or routing",
  );
  assert.deepEqual(nativeExploreSelectionFeatures(result, "missing"), []);
});

test("native picks replace the previous named selection without promoting a hallway destination", async () => {
  const data = fixture();
  data.records = data.records.slice(0, 2);
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      { nativeElementId: 1, elevationFeet: 0, ringsFeet: [ring(0, 0, 35, 12)] },
    ],
  };
  data.walls = [
    { levelId: 1, nativeElementId: 2, ringsFeet: [ring(15, 0, 16, 12)] },
  ];
  const result = await deriveNativeExplore(data, [1]);
  const office = result.regions.find((r) => r.roomKeys.includes("0"))!;
  const hallway = result.regions.find((r) => r.roomKeys.includes("1"))!;
  assert.deepEqual(nativeExploreSelectionIds(result, "0", [hallway.id]), [
    hallway.id,
  ]);
  assert.deepEqual(nativeExploreSelectionIds(result, "0"), [office.id]);
  assert.deepEqual(nativeExplorePickRegions(data, [hallway], [25, 5]), []);
});

test("hidden prepared identities can be located only on the requested floor and building", () => {
  const data = fixture();
  const room = data.records[0];
  assert.equal(
    nativeExploreIdentityLocation(data, room.key, [1], "all"),
    room.ringsFeet[0],
  );
  assert.equal(
    nativeExploreIdentityLocation(data, room.key, [1], room.building),
    room.ringsFeet[0],
  );
  assert.equal(
    nativeExploreIdentityLocation(data, room.key, [2], "all"),
    undefined,
  );
  assert.equal(
    nativeExploreIdentityLocation(data, room.key, [1], "08"),
    undefined,
  );
});

test("native stair surfaces retain exact green treads and landing holes with source controls, without inventing a floor or route", async () => {
  const data = fixture();
  const tread = ring(5, 5, 7, 6);
  const landing = [ring(5, 6, 9, 9), ring(7, 7, 8, 8)];
  data.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: data.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 10,
        levelIds: [1],
        buildings: ["01"],
        floorElevationFeet: 0,
        sourceGeometry: "native-cache",
        treads: [{ runElementId: 11, elevationFeet: 0.5, ringFeet: tread }],
        landings: [
          {
            nativeElementId: 12,
            elevationFeet: 1,
            thicknessFeet: 0.16404199475065617,
            ringsFeet: landing,
          },
        ],
      },
    ],
  };
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      {
        nativeElementId: 1,
        elevationFeet: 0,
        ringsFeet: [ring(0, 0, 12, 12), ring(4, 4, 10, 10)],
      },
    ],
  };
  const before = JSON.stringify(data);
  const surfaces = projectStairDisplay(data, [1], "all", false, true).features;
  assert.equal(surfaces.length, 2);
  assert.equal(surfaces[0].properties!.id, "source-stair:10");
  assert.equal(surfaces[0].properties!.color, HALLWAY_COLOR);
  assert.deepEqual(
    surfaces[0].geometry.coordinates[0].slice(0, 4),
    tread.map((point) => geographicPoint(data, point)),
  );
  assert.equal(
    surfaces[1].geometry.coordinates.length,
    2,
    "real landing opening remains a hole",
  );
  assert.equal(nativeExploreControlHit("project-native-stair-fill"), true);
  const result = await deriveNativeExplore(data, [1]);
  assert.deepEqual(
    nativeExplorePickRegions(data, result.regions, [6, 5.5]),
    [],
    "tread projection never creates flat native floor support",
  );
  assert.equal(
    data.edges.length,
    0,
    "unbound physical stairs acquire no route",
  );
  assert.equal(JSON.stringify(data), before);
});
