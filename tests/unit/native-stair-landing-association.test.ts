import test from "node:test";
import assert from "node:assert/strict";
import { project } from "../fixtures/native-area-project";
import { associateNativeRooms } from "../../app/indoor-project/native-explore-associations";
import {
  nativeStairLandingAssociation,
  nativeStairLandingLinksPreserved,
} from "../../app/indoor-project/native-stair-landing-association";
import type { NativeAreaRegion } from "../../app/indoor-project/native-area-review";
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
async function fixture() {
  const data = (await project()).dataset,
    room = data.records[0];
  room.stair = true;
  room.walkable = true;
  room.elevationFeet = 0;
  room.ringsFeet = [rect(0, 0, 10, 10)];
  const face: NativeAreaRegion = {
    id: "native-landing",
    ringsFeet: [rect(0, 0, 4, 4), rect(1, 1, 1, 1)],
    displayPartsFeet: [],
    nativeFloorIds: [100],
    nativeDoorIds: [],
    roomKeys: [],
    areaSquareFeet: 15,
    exposedFloorEdgeFeet: 0,
  };
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      { nativeElementId: 100, elevationFeet: 0, ringsFeet: face.ringsFeet },
    ],
  };
  data.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    geometrySha256: "a".repeat(64),
    levels: [
      {
        levelId: room.levelId,
        elevationFeet: 0,
        partsFeet: [face.ringsFeet],
        sourceElementIds: [100, 200],
        cutElevationsFeet: [0.1, 4],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  const base = data.nodes[0];
  data.nodes = [
    {
      ...base,
      id: "lower",
      kind: "stair",
      roomKey: room.key,
      levelId: room.levelId,
      pointFeet: [0.5, 0.5, 0],
    },
    {
      ...base,
      id: "upper",
      kind: "stair",
      roomKey: "other",
      levelId: 2,
      pointFeet: [0.5, 0.5, 10],
    },
  ];
  data.edges = [
    {
      id: "original-flight",
      from: "lower",
      to: "upper",
      kind: "stairs",
      nativeElementId: 200,
      roomKeys: [room.key, "other"],
      pointsFeet: [
        [0.5, 0.5, 0],
        [0.5, 0.5, 10],
      ],
      lengthMetres: 4,
      evidence: "native-flight",
      enabled: true,
      accessible: "no",
    },
  ];
  data.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: data.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 200,
        levelIds: [room.levelId, 2],
        buildings: [room.building],
        floorElevationFeet: 0,
        sourceGeometry: "native-cache",
        treads: [
          {
            runElementId: 201,
            elevationFeet: 1,
            ringFeet: rect(0, 0, 1, 1),
            thicknessFeet: 0.1,
          },
        ],
      },
    ],
  };
  return { data, room, face };
}
test("exact endpoint owns native landing identity despite large named stair box and real hole", async () => {
  const { data, room, face } = await fixture(),
    before = JSON.stringify(data);
  const result = associateNativeRooms([face], [room], data)[0];
  assert.deepEqual(result.roomKeys, [room.key]);
  assert.equal(result.associations[0].method, "native-stair-landing");
  assert.equal(result.associations[0].coverage, 1);
  assert.deepEqual(result.ringsFeet, face.ringsFeet);
  assert.equal(JSON.stringify(data), before);
});
test("missing flight, outside endpoint, removed floor, hole and unenclosed landing cannot acquire identity", async () => {
  for (const change of [
    (d: Awaited<ReturnType<typeof fixture>>) => {
      d.data.edges = [];
    },
    (d: Awaited<ReturnType<typeof fixture>>) => {
      d.data.nodes[0].pointFeet = [8, 8, 0];
    },
    (d: Awaited<ReturnType<typeof fixture>>) => {
      d.data.nodes[0].pointFeet = [1.5, 1.5, 0];
      d.data.edges[0].pointsFeet[0] = [1.5, 1.5, 0];
    },
    (d: Awaited<ReturnType<typeof fixture>>) => {
      d.data.walkingSupport!.floors = [];
    },
    (d: Awaited<ReturnType<typeof fixture>>) => {
      d.data.nativeIndoorEnvelopes!.levels[0].partsFeet = [[rect(0, 0, 1, 1)]];
    },
    (d: Awaited<ReturnType<typeof fixture>>) => {
      d.data.edges[0].accessible = "yes";
    },
  ]) {
    const x = await fixture();
    change(x);
    assert.equal(
      nativeStairLandingAssociation(x.data, x.room, [x.face]),
      undefined,
    );
  }
});
test("unique source terminal identifies landing without an old stair-box majority", async () => {
  const x = await fixture();
  x.room.ringsFeet = [rect(0, 0, 1, 1)];
  const result = nativeStairLandingAssociation(x.data, x.room, [x.face]);
  assert.ok(result);
  assert.ok(result.coverage < 0.5);
});
test("competing named room and ambiguous distinct endpoint faces are rejected", async () => {
  const x = await fixture();
  x.data.records.push({
    ...x.room,
    key: "unrelated",
    number: "Other",
    stair: false,
    ringsFeet: x.face.ringsFeet,
  });
  assert.equal(
    nativeStairLandingAssociation(x.data, x.room, [x.face]),
    undefined,
  );
  const y = await fixture();
  assert.equal(
    nativeStairLandingAssociation(y.data, y.room, [
      y.face,
      { ...y.face, id: "duplicate" },
    ]),
    undefined,
  );
});
test("wide shared corridor, foreign run owner and wrong physical height reject landing identity", async () => {
  const wide = await fixture();
  wide.data.nodes.push({
    ...wide.data.nodes[0],
    id: "hall-branch",
    kind: "junction",
    roomKey: "hall",
    pointFeet: [3, 3, 0],
  });
  assert.equal(
    nativeStairLandingAssociation(wide.data, wide.room, [wide.face]),
    undefined,
  );
  const foreign = await fixture();
  foreign.data.stairDisplay!.sourceFlights!.push({
    ...foreign.data.stairDisplay!.sourceFlights![0],
    stairElementId: 999,
  });
  assert.equal(
    nativeStairLandingAssociation(foreign.data, foreign.room, [foreign.face]),
    undefined,
  );
  const height = await fixture();
  height.data.nodes[0].pointFeet[2] = 0.001;
  height.data.edges[0].pointsFeet[0][2] = 0.001;
  assert.equal(
    nativeStairLandingAssociation(height.data, height.room, [height.face]),
    undefined,
  );
  const double = await fixture();
  double.data.nodes.push({
    ...double.data.nodes[0],
    id: "second-terminal",
    pointFeet: [3, 3, 0],
  });
  double.data.edges.push({
    ...double.data.edges[0],
    id: "second-flight",
    from: "second-terminal",
    pointsFeet: [
      [3, 3, 0],
      [0.5, 0.5, 10],
    ],
  });
  assert.equal(
    nativeStairLandingAssociation(double.data, double.room, [double.face]),
    undefined,
  );
});
test("landing preservation guard catches source endpoint/access drift and missing original link", async () => {
  const { data, room } = await fixture();
  const after = structuredClone(data);
  assert.equal(nativeStairLandingLinksPreserved(data, after, room.key), true);
  after.nodes[0].pointFeet[0] += 0.001;
  assert.equal(nativeStairLandingLinksPreserved(data, after, room.key), false);
  const changed = structuredClone(data);
  changed.edges[0].accessible = "yes";
  assert.equal(
    nativeStairLandingLinksPreserved(data, changed, room.key),
    false,
  );
  const none = structuredClone(data);
  none.edges = [];
  assert.equal(nativeStairLandingLinksPreserved(none, none, room.key), false);
});
