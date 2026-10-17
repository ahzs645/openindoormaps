import type { IndoorDataset } from "../../app/indoor-project/contract";
type XY = [number, number];
const rect = (a: number, b: number, c: number, d: number): XY[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
export function arrivalFixture() {
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
