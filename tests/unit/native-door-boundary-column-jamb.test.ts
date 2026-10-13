import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  closedBoundaryDoors,
  type NativeDoorBoundaryClosures,
} from "../../app/indoor-project/native-door-boundary-closures";

type Point = [number, number];
const model = "a".repeat(64);
const ring = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
/** Door #10 (x 0..1.9) between jamb #20 (x -1..0.1) and jamb #21 (x 2..3), of the given kind. */
function fixture(secondJambKind: string) {
  const door = {
    id: "door:1:10",
    nativeElementId: 10,
    levelId: 1,
    pointFeet: [1, 0.5],
    normalFeet: [0, 1],
    footprintFeet: ring(0, 0, 1.9, 1),
    roomKeys: ["a", "b"],
    state: "connected",
  };
  const walls = [
    {
      levelId: 1,
      nativeElementId: 20,
      kind: "wall",
      approximate: false,
      ringsFeet: [ring(-1, 0, 0.1, 1)],
    },
    {
      levelId: 1,
      nativeElementId: 21,
      kind: secondJambKind,
      approximate: false,
      ringsFeet: [ring(2, 0, 3, 1)],
    },
  ];
  const data = {
    source: { modelSha256: model },
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    walkingSupport: {
      version: 1,
      sourceModelSha256: model,
      floors: [
        {
          nativeElementId: 30,
          elevationFeet: 0,
          ringsFeet: [ring(-4, -4, 4, 4)],
        },
      ],
    },
    records: [],
    walls,
    doors: [door],
    edges: [
      {
        id: door.id,
        enabled: true,
        kind: "door",
        nativeElementId: 10,
        roomKeys: door.roomKeys,
      },
    ],
  } as unknown as IndoorDataset;
  const value: NativeDoorBoundaryClosures = {
    version: 1,
    sourceModelSha256: model,
    doors: [
      {
        id: "closure:10",
        levelId: 1,
        nativeElementId: 10,
        originalDoor: {
          pointFeet: [1, 0.5],
          normalFeet: [0, 1],
          footprintFeet: ring(0, 0, 1.9, 1),
          roomKeys: ["a", "b"],
        },
        footprintFeet: ring(0, 0, 2.0002, 1),
        jambEvidence: walls.map((w) => ({
          nativeElementId: w.nativeElementId,
          ringsFeet: structuredClone(w.ringsFeet),
        })),
        evidenceSha256: "b".repeat(64),
        notes: "Measured native jamb correction.",
      },
    ],
  };
  return { data, value };
}

test("a door threshold may close against a native column jamb", () => {
  const { data, value } = fixture("column");
  const out = closedBoundaryDoors(data, 1, value);
  assert.deepEqual(out[0]!.footprintFeet, value.doors[0]!.footprintFeet);
});

test("a jamb that is neither a wall nor a column is still refused", () => {
  const { data, value } = fixture("stair");
  assert.throws(
    () => closedBoundaryDoors(data, 1, value),
    /not a wall or column/,
  );
});
