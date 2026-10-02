import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { resolveRouteArrival } from "../../app/indoor-project/route-arrival";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
type XY = [number, number];
const rect = (a: number, b: number, c: number, d: number): XY[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
function fixture() {
  const hall = {
    key: "hall",
    number: "H",
    name: "Hall",
    building: "B",
    levelId: 1,
    elevationFeet: 0,
    circulation: true,
    stair: false,
    walkable: true,
    access: "public",
    arrivalNodeId: "a",
    properties: {},
    ringsFeet: [rect(0, 0, 9.8, 10)],
  };
  const data = {
    source: { modelSha256: "a".repeat(64) },
    records: [
      hall,
      {
        ...hall,
        key: "room",
        name: "Room",
        number: "R",
        circulation: false,
        access: "unknown",
        arrivalNodeId: "b",
        ringsFeet: [rect(10.2, 0, 20, 10)],
      },
    ],
    nativeLevels: [{ id: 1, name: "Level 1", elevationFeet: 0 }],
    floors: [{ id: "1", name: "Level 1", levelIds: [1], elevationFeet: 0 }],
    nodes: [
      {
        id: "a",
        roomKey: "hall",
        levelId: 1,
        building: "B",
        pointFeet: [2, 5, 0],
      },
      {
        id: "out",
        roomKey: "hall",
        levelId: 1,
        building: "B",
        pointFeet: [9, 5, 0],
      },
      {
        id: "in",
        roomKey: "room",
        levelId: 1,
        building: "B",
        pointFeet: [11, 5, 0],
      },
      {
        id: "b",
        roomKey: "room",
        levelId: 1,
        building: "B",
        pointFeet: [15, 5, 0],
      },
    ],
    edges: [
      {
        id: "walk-in",
        from: "a",
        to: "out",
        kind: "walk",
        roomKeys: ["hall"],
        pointsFeet: [
          [2, 5, 0],
          [9, 5, 0],
        ],
        lengthMetres: 7 * 0.3048,
        enabled: true,
        accessible: "yes",
      },
      {
        id: "door",
        from: "out",
        to: "in",
        kind: "door",
        roomKeys: ["hall", "room"],
        pointsFeet: [
          [9, 5, 0],
          [11, 5, 0],
        ],
        lengthMetres: 2 * 0.3048,
        enabled: true,
        accessible: "yes",
      },
      {
        id: "walk-room",
        from: "in",
        to: "b",
        kind: "walk",
        roomKeys: ["room"],
        pointsFeet: [
          [11, 5, 0],
          [15, 5, 0],
        ],
        lengthMetres: 4 * 0.3048,
        enabled: true,
        accessible: "yes",
      },
    ],
    walls: [
      {
        kind: "wall",
        levelId: 1,
        nativeElementId: 101,
        ringsFeet: [rect(9.8, 0, 10.2, 10)],
      },
    ],
    doors: [
      {
        id: "door",
        nativeElementId: 102,
        levelId: 1,
        state: "connected",
        roomKeys: ["hall", "room"],
        pointFeet: [10, 5],
        normalFeet: [1, 0],
        footprintFeet: rect(9.8, 4, 10.2, 6),
      },
    ],
    walkingSupport: {
      version: 1,
      sourceModelSha256: "a".repeat(64),
      floors: [
        {
          nativeElementId: 100,
          elevationFeet: 0,
          ringsFeet: [rect(0, 0, 20, 10)],
        },
      ],
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
  } as unknown as IndoorDataset;
  return data;
}
test("arrival choices share a verified route but stop inside, on the threshold or on its hallway side", () => {
  const data = fixture(),
    base = findProjectRoute(data, "hall", "room")!,
    snapshot = JSON.stringify({ data, base });
  assert.ok(base);
  assert.equal(resolveRouteArrival(data, base, "room", "inside").route, base);
  const atDoor = resolveRouteArrival(data, base, "room", "doorway").route!,
    outside = resolveRouteArrival(data, base, "room", "hallway").route!;
  assert.deepEqual(atDoor.arrival!.pointFeet, [10, 5, 0]);
  assert.deepEqual(outside.arrival!.pointFeet, [9, 5, 0]);
  assert.deepEqual(base.paths.at(-1)!.pointsFeet.at(-1), [15, 5, 0]);
  assert.ok(
    outside.distanceMetres < atDoor.distanceMetres &&
      atDoor.distanceMetres < base.distanceMetres,
  );
  assert.equal(outside.unknownAccessAreas.length, 0);
  assert.equal(atDoor.unknownAccessAreas.length, 1);
  assert.deepEqual(outside.doorEdgeIds, []);
  assert.deepEqual(atDoor.doorEdgeIds, ["door"]);
  for (const r of [atDoor, outside]) {
    const steps = projectNavigationSteps(data, r, "Hall", "Room"),
      last = steps.at(-1)!;
    assert.deepEqual(last.pointsFeet[0], r.paths.at(-1)!.pointsFeet.at(-1));
    assert.deepEqual(last.pointsFeet[0], r.arrival!.pointFeet);
    assert.equal(last.levelId, 1);
    assert.ok(
      Math.abs(
        steps.reduce((m, s) => m + s.distanceMeters, 0) - r.distanceMetres,
      ) < 1e-7,
    );
  }
  assert.equal(
    projectNavigationSteps(data, atDoor, "Hall", "Room").at(-1)!.message,
    "Arrive at the doorway of Room",
  );
  assert.equal(
    projectNavigationSteps(data, outside, "Hall", "Room").at(-1)!.message,
    "Arrive outside Room",
  );
  assert.equal(JSON.stringify({ data, base }), snapshot);
});
test("arrival choices retain reverse-door orientation and never fabricate missing hallway/door geometry", () => {
  const data = fixture(),
    reverse = findProjectRoute(data, "room", "hall")!;
  assert.deepEqual(
    resolveRouteArrival(data, reverse, "hall", "doorway").route!.arrival!
      .pointFeet,
    [10, 5, 0],
  );
  assert.match(
    resolveRouteArrival(data, reverse, "hall", "hallway").message!,
    /another room/,
  );
  const base = findProjectRoute(data, "hall", "room")!;
  data.doors = [];
  assert.equal(resolveRouteArrival(data, base, "room", "doorway").route, null);
  assert.match(
    resolveRouteArrival(data, base, "room", "doorway").message!,
    /geometry needs review/,
  );
});
test("endpoint choices do not bypass closed doors, staff restrictions or step-free reviews", () => {
  for (const mutate of [
    (d: IndoorDataset) => {
      d.edges[1].enabled = false;
    },
    (d: IndoorDataset) => {
      d.records[1].access = "staff";
    },
    (d: IndoorDataset) => {
      d.edges[1].accessible = "unknown";
    },
  ]) {
    const d = fixture();
    mutate(d);
    const base = findProjectRoute(d, "hall", "room", "accessible");
    assert.equal(base, null);
    for (const mode of ["inside", "doorway", "hallway"] as const)
      assert.equal(resolveRouteArrival(d, base, "room", mode).route, null);
  }
});
