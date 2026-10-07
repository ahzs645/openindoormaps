import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import {
  nativeLectureFloorOwners,
  nativeLectureFloorOwner,
} from "../../app/indoor-project/native-lecture-ownership";
import { nativeExplorePlaces } from "../../app/indoor-project/native-explore";
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
function data() {
  const d = fixture();
  d.records = [
    {
      ...d.records[0],
      key: "theatre",
      name: "Lecture Theatre",
      ringsFeet: [rect(0, 0, 10, 10)],
    },
  ];
  d.floors = [
    { id: "one", name: "Floor 1", levelIds: [1, 2], elevationFeet: 0 },
  ];
  d.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: d.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 100,
        levelIds: [1, 2],
        buildings: ["01"],
        floorElevationFeet: 0,
        sourceGeometry: "native-cache",
        treads: [
          { runElementId: 101, elevationFeet: -1, ringFeet: rect(1, 1, 8, 1) },
        ],
      },
    ],
  };
  return d;
}
test("offset seating floor and entrance strip keep their exact physical holes and one theatre identity", () => {
  const d = data(),
    before = JSON.stringify(d),
    owners = nativeLectureFloorOwners(d);
  const rings = [rect(0, 0, 10, 8), rect(3, 3, 2, 2)];
  assert.equal(nativeLectureFloorOwner(owners, 2, rings), "theatre");
  assert.equal(
    nativeLectureFloorOwner(owners, 1, [rect(0, 8, 10, 2)]),
    "theatre",
  );
  const region = {
    id: "lower",
    levelId: 2,
    roomKeys: ["theatre"],
    lectureRoomKey: "theatre",
    ringsFeet: rings,
  } as Parameters<typeof nativeExplorePlaces>[1];
  assert.deepEqual(
    nativeExplorePlaces(d, region).map((r) => r.key),
    ["theatre"],
  );
  assert.deepEqual(
    nativeExplorePlaces(d, { ...region, lectureRoomKey: undefined }),
    [],
  );
  assert.deepEqual(rings[1], rect(3, 3, 2, 2));
  assert.equal(JSON.stringify(d), before);
});
test("same campus floor alone never authorizes another level, competing room, exposed apron or a real route", () => {
  const d = data();
  assert.equal(
    nativeLectureFloorOwner(nativeLectureFloorOwners(d), 3, [
      rect(0, 0, 10, 8),
    ]),
    undefined,
  );
  assert.equal(
    nativeLectureFloorOwner(nativeLectureFloorOwners(d), 2, [
      rect(0, 0, 20, 8),
    ]),
    undefined,
  );
  d.records.push({ ...d.records[0], key: "competing" });
  assert.deepEqual(nativeLectureFloorOwners(d), []);
  d.records.pop();
  d.edges = [
    {
      id: "real",
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
  assert.deepEqual(nativeLectureFloorOwners(d), []);
});
test("cross-campus-floor steps, unmatched model and explicit seating without containment remain unclaimed", () => {
  for (const change of [
    (d: ReturnType<typeof data>) => {
      d.floors = [
        { id: "one", name: "Floor 1", levelIds: [1], elevationFeet: 0 },
        { id: "two", name: "Floor 2", levelIds: [2], elevationFeet: 12 },
      ];
    },
    (d: ReturnType<typeof data>) => {
      d.stairDisplay!.sourceModelSha256 = "bad";
    },
    (d: ReturnType<typeof data>) => {
      d.stairDisplay!.sourceFlights![0].context = "tiered-seating";
      d.records[0].ringsFeet = [rect(100, 100, 10, 10)];
    },
  ]) {
    const d = data();
    change(d);
    assert.deepEqual(nativeLectureFloorOwners(d), []);
  }
});

test("native Explore shows both offset pieces using native edges without editing the master", async () => {
  const { deriveNativeExplore } = await import(
    "../../app/indoor-project/native-explore"
  );
  const { pointInNativeArea } = await import(
    "../../app/indoor-project/native-area-review"
  );
  const d = data();
  d.nativeLevels = [
    { id: 1, name: "Entrance", elevationFeet: 0 },
    { id: 2, name: "Seating", elevationFeet: -3 },
  ];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 201,
        elevationFeet: 0,
        ringsFeet: [rect(0, 8, 10, 2)],
      },
      {
        nativeElementId: 202,
        elevationFeet: -3,
        ringsFeet: [rect(0, 0, 10, 8), rect(3, 3, 2, 2)],
      },
    ],
  };
  const before = JSON.stringify(d),
    result = await deriveNativeExplore(d, [1, 2], "01");
  assert.equal(result.regions.length, 2);
  assert.equal(
    result.outlines.features.length,
    1,
    "a level seam is not a room partition",
  );
  assert.equal(
    result.outlines.features[0].geometry.coordinates.length,
    2,
    "the real opening remains in the combined outline",
  );
  for (const region of result.regions) {
    assert.deepEqual(
      nativeExplorePlaces(d, region).map((r) => r.key),
      ["theatre"],
    );
    assert.deepEqual(region.visitorPartsFeet, [region.ringsFeet]);
  }
  const lower = result.regions.find((r) => r.levelId === 2)!;
  assert.equal(pointInNativeArea([4, 4], lower.ringsFeet), false);
  assert.equal(JSON.stringify(d), before);
});
