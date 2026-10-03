import test from "node:test";
import assert from "node:assert/strict";
import pc from "polygon-clipping";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import {
  generalizeRooms,
  generalizedRoomDoorways,
  generalizedRoomGeometry,
} from "../../app/indoor-project/generalized-room-geometry";
import actual from "../fixtures/unbc-pt-mpl-neighbours.json";

type Point = [number, number];
const box = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const room = (key: string, ring: Point[]): IndoorRecord => ({
  key,
  number: key,
  name: key,
  levelId: 1,
  elevationFeet: 0,
  elevationEvidence: "test",
  surfaceId: "floor",
  building: "test",
  circulation: false,
  stair: false,
  walkable: true,
  access: "unknown",
  confidence: 1,
  ringsFeet: [ring],
  properties: {},
});
// The shallow recess is an architectural detail, not a corridor.
const notched = (): Point[] => [
  [0, 0],
  [20, 0],
  [20, 10],
  [11, 10],
  [11, 9.5],
  [9, 9.5],
  [9, 10],
  [0, 10],
];
const dataset = (records: IndoorRecord[]): IndoorDataset => ({
  format: "reviter-indoor",
  version: 1,
  generator: "reviter/indoor-pipeline-1",
  report: {
    recordCount: 0,
    routableArrivals: 0,
    components: 0,
    largestComponentArrivals: 0,
    unmatchedDoors: 0,
    cellSizeFeet: 1,
    omittedSourceLabels: 0,
  },
  source: {
    modelFileName: "test.rvt",
    modelSha256: "test",
    roomsSha256: "test",
  },
  alignment: {
    originFeet: [0, 0, 0],
    originGeographic: [-123, 54],
    rotationRadians: 0,
    projectionLatitude: 54,
    horizontalMetresPerFoot: 0.3048,
    verticalMetresPerFoot: 0.3048,
    rmsMetres: 0,
    referenceCount: 1,
  },
  floors: [],
  nativeLevels: [],
  records,
  nodes: [],
  edges: [],
  walls: [],
  issues: [],
});
const run = (d: IndoorDataset, key = "a") => generalizeRooms(d).get(key)!;
test("rotated long wall faces remove shallow notches without changing room or graph data", () => {
  const a = room("a", notched()),
    angle = 0.42;
  a.ringsFeet = a.ringsFeet.map((r) =>
    r.map(([x, y]) => [
      100 + x * Math.cos(angle) - y * Math.sin(angle),
      100 + y * Math.cos(angle) + x * Math.sin(angle),
    ]),
  );
  const d = dataset([a]),
    before = JSON.stringify(d),
    r = run(d);
  assert.equal(r.status, "rectangle");
  assert.equal(r.displayVertices, 4);
  assert.equal(JSON.stringify(d), before);
  const edge = r.partsFeet[0][0];
  assert.ok(
    Math.abs(
      (edge[1][0] - edge[0][0]) * (edge[2][0] - edge[1][0]) +
        (edge[1][1] - edge[0][1]) * (edge[2][1] - edge[1][1]),
    ) < 1e-8,
  );
});
test("a corridor or other room inside a recess vetoes the rectangle", () => {
  for (const circulation of [false, true]) {
    const b = room("b", box(9, 9.5, 2, 0.5));
    b.circulation = circulation;
    const d = dataset([room("a", notched()), b]);
    assert.equal(run(d).reason, "neighbour-or-corridor");
  }
});
test("native circulation boundaries protect gaps omitted by coarse source corridor outlines", () => {
  const d = dataset([room("a", notched())]);
  d.circulationGeometry = {
    version: 1,
    sourceModelSha256: "test",
    sourceGeometryKey: "test",
    cells: [
      {
        id: "hall",
        levelIds: [1],
        elevationFeet: 0,
        roomKeys: [],
        nativeFloorIds: [],
        ringsFeet: [box(9, 9.5, 2, 0.5)],
        sourceCoverage: 1,
      },
    ],
  };
  assert.equal(run(d).reason, "native-circulation");
});
test("native floor openings are not filled even when the room source missed them", () => {
  const d = dataset([room("a", notched())]);
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: "test",
    floors: [
      {
        nativeElementId: 1,
        elevationFeet: 0,
        ringsFeet: [box(-1, -1, 22, 12), box(9, 9.6, 2, 0.3)],
      },
    ],
  };
  assert.equal(run(d).reason, "native-floor-opening");
});
test("real room holes remain exact and large L shapes do not become boxes", () => {
  const a = room("a", notched());
  a.ringsFeet.push(box(2, 2, 3, 3));
  const d = dataset([a]);
  assert.equal(run(d).status, "rectangle");
  assert.deepEqual(run(d).partsFeet[0][1], a.ringsFeet[1]);
  const l = room("l", [
    [0, 0],
    [20, 0],
    [20, 5],
    [5, 5],
    [5, 20],
    [0, 20],
  ]);
  assert.equal(run(dataset([l]), "l").status, "retained");
});
test("a room-to-room portal and its landing keep measured positions", () => {
  const d = dataset([room("a", notched()), room("b", box(20.5, 0, 10, 10))]);
  d.doors = [
    {
      id: "door",
      levelId: 1,
      nativeElementId: 1,
      pointFeet: [20, 5],
      roomKeys: ["a", "b"],
      state: "connected",
    },
  ];
  d.nodes = [
    {
      id: "landing",
      roomKey: "a",
      levelId: 1,
      building: "test",
      surfaceId: "floor",
      pointFeet: [19.5, 5, 0],
      geographic: [0, 0],
      kind: "portal",
    },
  ];
  d.edges = [
    {
      id: "crossing",
      from: "landing",
      to: "other",
      kind: "door",
      lengthMetres: 1,
      pointsFeet: [
        [19.5, 5, 0],
        [21, 5, 0],
      ],
      roomKeys: ["a", "b"],
      evidence: "native-door",
      accessible: "unknown",
      enabled: true,
    },
  ];
  const before = JSON.stringify(d);
  assert.equal(run(d).status, "rectangle");
  assert.equal(JSON.stringify(d), before);
});
test("shared boundaries cannot shift and result is independent of record order", () => {
  const a = room("a", notched()),
    b = room("b", [
      [9, 9.5],
      [11, 9.5],
      [11, 12],
      [9, 12],
    ]);
  const d = dataset([a, b]);
  const reversed = { ...d, records: [b, a] };
  assert.deepEqual(
    [...generalizeRooms(d)].sort(),
    [...generalizeRooms(reversed)].sort(),
  );
  assert.equal(run(d).status, "retained");
});
test("unresolved boundaries and circulation are retained; stale display outlines are ignored", () => {
  const d = dataset([room("a", notched())]);
  d.presentation = {
    version: 1,
    generator: "reviter/native-room-presentation-1",
    sourceModelSha256: "test",
    junctionToleranceFeet: 0.1,
    rooms: [],
    diagnostics: [{ roomKey: "a", reason: "open", levelId: 1 } as never],
  };
  assert.equal(run(d).reason, "unresolved-native-boundary");
  d.presentation.sourceModelSha256 = "foreign";
  assert.equal(run(d).status, "rectangle");
  d.presentation.sourceModelSha256 = "test";
  d.presentation.diagnostics = [];
  d.presentation.rooms = [
    {
      roomKey: "a",
      levelId: 1,
      sourceGeometryKey: "stale",
      interiorRingsFeet: [box(100, 100, 5, 5)],
      blockPartsFeet: [],
      boundarySource: "native-wall-enclosure",
      boundaryElementIds: [],
      sourceCoverage: 1,
      cellCoverage: 1,
    },
  ];
  assert.equal(run(d).status, "rectangle");
  assert.ok(run(d).partsFeet[0][0].every((p) => p[0] < 30));
});
test("actual PT MPL becomes four corners with its two existing door connections and neighbours intact", () => {
  const d = structuredClone(actual) as unknown as IndoorDataset,
    a = d.records.find((r) => r.number === "10-1034")!,
    before = JSON.stringify(d),
    results = generalizeRooms(d),
    shape = results.get(a.key)!;
  assert.equal(shape.sourceVertices, 44);
  assert.equal(shape.displayVertices, 4);
  assert.equal(shape.status, "rectangle");
  assert.equal(d.doors!.filter((d) => d.roomKeys.includes(a.key)).length, 2);
  for (const b of d.records.filter((b) => b.key !== a.key))
    assert.equal(
      pc.difference(
        pc.intersection(shape.partsFeet, [b.ringsFeet]),
        pc.intersection([a.ringsFeet], [b.ringsFeet]),
      ).length,
      0,
    );
  const feature = {
    type: "Feature" as const,
    properties: { key: a.key, color: "#ffe09d", height: 0.6 },
    geometry: { type: "MultiPolygon" as const, coordinates: [a.ringsFeet] },
  };
  const output = generalizedRoomGeometry(d, {
    type: "FeatureCollection",
    features: [feature],
  });
  assert.equal(output.features[0].geometry.coordinates[0][0].length, 5);
  assert.equal(output.features[0].properties?.height, 0.6);
  assert.equal(JSON.stringify(d), before);
});

test("removing a bay cannot erase a shared neighbour boundary", () => {
  const a = room("a", [
    [0, 0],
    [20, 0],
    [20, 10],
    [11, 10],
    [11, 10.5],
    [9, 10.5],
    [9, 10],
    [0, 10],
  ]);
  const d = dataset([a, room("b", box(9, 10.5, 2, 2))]);
  assert.equal(run(d).reason, "shared-boundary");
});
test("filling a recess cannot create a new neighbour contact across a gap", () => {
  const d = dataset([room("a", notched()), room("b", box(9, 10, 2, 2))]);
  assert.equal(run(d).reason, "new-neighbour-contact");
});
test("doorway threshold patches retain their own geometry when they share a room key", () => {
  const d = dataset([room("a", notched())]);
  const original = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { key: "a", circulation: true },
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: [[box(19, 4, 2, 2)]],
        },
      },
    ],
  };
  assert.deepEqual(generalizedRoomGeometry(d, original), original);
});

test("connected native door markers retain their footprint and rise only as a thin roof marker", () => {
  const d = dataset([room("a", notched())]);
  d.doors = [
    {
      id: "door",
      nativeElementId: 1,
      levelId: 1,
      roomKeys: ["a"],
      pointFeet: [20, 5],
      state: "connected",
    },
  ];
  const f = {
    type: "Feature" as const,
    properties: { id: "door", base: 2 },
    geometry: { type: "Polygon" as const, coordinates: [box(19.9, 4, 0.5, 2)] },
  };
  const before = JSON.stringify(d),
    out = generalizedRoomDoorways(
      d,
      { type: "FeatureCollection", features: [f] },
      0.6,
    ).features[0];
  assert.deepEqual(out.geometry, f.geometry);
  assert.equal(out.properties?.base, 2.6);
  assert.equal(out.properties?.height, 2.61);
  assert.equal(JSON.stringify(d), before);
});
