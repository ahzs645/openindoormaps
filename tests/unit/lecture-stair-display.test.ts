import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hiddenLectureStairIds } from "../../app/indoor-project/lecture-stair-display";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function fixture() {
  const data: IndoorDataset = JSON.parse(
    readFileSync(
      new URL("../fixtures/unbc-pass-through-display.json", import.meta.url),
      "utf8",
    ),
  );
  data.records = [
    {
      ...data.records[0],
      key: "lecture",
      name: "Lecture Theatre",
      building: "07",
      levelId: 311,
      stair: false,
      circulation: false,
      ringsFeet: [rect(0, 0, 10, 10)],
    },
  ];
  data.edges = [];
  data.floors = [
    { id: "f1", name: "Floor 1", elevationFeet: 0, levelIds: [311, 1487816] },
    { id: "f2", name: "Floor 2", elevationFeet: 12, levelIds: [694] },
  ];
  data.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: data.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 100,
        levelIds: [311, 1487816],
        buildings: ["07"],
        floorElevationFeet: 0,
        sourceGeometry: "native-cache",
        treads: [
          { runElementId: 101, elevationFeet: 1, ringFeet: rect(1, 1, 8, 1) },
        ],
      },
    ],
  };
  return data;
}
test("internal lecture steps are a cached display choice preserving dataset and graph", () => {
  const d = fixture(),
    before = JSON.stringify(d),
    ids = hiddenLectureStairIds(d);
  assert.deepEqual([...ids], [100]);
  assert.equal(hiddenLectureStairIds(d), ids);
  assert.equal(JSON.stringify(d), before);
});
test("enabled native connectors remain visible even with explicit seating context", () => {
  const d = fixture();
  d.stairDisplay!.sourceFlights![0].context = "tiered-seating";
  d.edges = [
    {
      id: "real-stair",
      from: "a",
      to: "b",
      kind: "stairs",
      nativeElementId: 100,
      lengthMetres: 4,
      pointsFeet: [
        [1, 1, 0],
        [1, 2, 12],
      ],
      roomKeys: [],
      enabled: true,
      accessible: "no",
      evidence: "native",
    },
  ];
  assert.equal(hiddenLectureStairIds(d).size, 0);
});
test("cross-floor and unassigned-level inventories cannot become inferred internal steps", () => {
  for (const levels of [
    [311, 694],
    [311, 999],
  ]) {
    const d = fixture();
    d.stairDisplay!.sourceFlights![0].levelIds = levels;
    assert.equal(hiddenLectureStairIds(d).size, 0);
  }
});
test("95 percent actual area threshold preserves large protrusions despite most vertices inside", () => {
  const d = fixture();
  const f = d.stairDisplay!.sourceFlights![0];
  f.treads = [
    { runElementId: 101, elevationFeet: 1, ringFeet: rect(1, 1, 8, 1) },
    { runElementId: 102, elevationFeet: 2, ringFeet: rect(1, 2, 20, 1) },
  ];
  assert.equal(hiddenLectureStairIds(d).size, 0);
});
test("room holes remain excluded from the containment proof", () => {
  const d = fixture();
  d.records[0].ringsFeet.push(rect(2, 1, 6, 1));
  assert.equal(hiddenLectureStairIds(d).size, 0);
});
test("geometry hints require matching source bytes, native level, building and teaching-room context", () => {
  for (const alteration of [
    (d: IndoorDataset) => {
      d.stairDisplay!.sourceModelSha256 = "bad";
    },
    (d: IndoorDataset) => {
      d.records[0].levelId = 694;
    },
    (d: IndoorDataset) => {
      d.records[0].building = "08";
    },
    (d: IndoorDataset) => {
      d.records[0].name = "Office";
    },
    (d: IndoorDataset) => {
      d.stairDisplay!.sourceFlights![0].context = "outdoor";
    },
  ]) {
    const d = fixture();
    alteration(d);
    assert.equal(hiddenLectureStairIds(d).size, 0);
  }
  const d = fixture();
  d.records[0].name = "Classroom";
  assert.deepEqual([...hiddenLectureStairIds(d)], [100]);
});
test("replaced edges and records invalidate cached presentation", () => {
  const d = fixture();
  assert.equal(hiddenLectureStairIds(d).size, 1);
  d.records = [{ ...d.records[0], name: "Office" }];
  assert.equal(hiddenLectureStairIds(d).size, 0);
  d.records = [{ ...d.records[0], name: "Theatre" }];
  assert.equal(hiddenLectureStairIds(d).size, 1);
  d.edges = [
    {
      id: "rise",
      from: "a",
      to: "b",
      kind: "local-steps",
      nativeElementId: 100,
      lengthMetres: 1,
      pointsFeet: [
        [1, 1, 0],
        [1, 2, 1],
      ],
      roomKeys: [],
      enabled: true,
      accessible: "no",
      evidence: "native",
    },
  ];
  assert.equal(hiddenLectureStairIds(d).size, 0);
});
