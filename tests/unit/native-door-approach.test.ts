import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  nativeCirculationGeometryKey,
  nativeCirculationWalkBlockers,
} from "../../app/indoor-project/native-circulation";
import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
const rect = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
function fixture() {
  const data = {
    source: { modelSha256: "model" },
    records: ["a", "b"].map((key, i) => ({
      key,
      levelId: 1,
      elevationFeet: 0,
      circulation: true,
      walkable: true,
      access: "public",
      ringsFeet: [rect(i ? 11 : 0, 0, i ? 20 : 9, 6)],
      properties: {},
    })),
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    walls: [],
    nodes: [
      { id: "a", roomKey: "a", levelId: 1, pointFeet: [3, 3, 0] },
      { id: "b", roomKey: "b", levelId: 1, pointFeet: [17, 3, 0] },
      { id: "door:0", roomKey: "a", levelId: 1, pointFeet: [9.7, 3, 0] },
      { id: "door:1", roomKey: "b", levelId: 1, pointFeet: [10.3, 3, 0] },
    ],
    doors: [
      {
        id: "door",
        nativeElementId: 30,
        levelId: 1,
        state: "connected",
        pointFeet: [10, 3],
        normalFeet: [1, 0],
        footprintFeet: rect(9, 2, 11, 4),
        roomKeys: ["a", "b"],
      },
    ],
    edges: [
      {
        id: "left",
        from: "a",
        to: "door:0",
        kind: "walk",
        enabled: true,
        roomKeys: ["a"],
        pointsFeet: [
          [3, 3, 0],
          [9.7, 3, 0],
        ],
      },
      {
        id: "right",
        from: "door:1",
        to: "b",
        kind: "walk",
        enabled: true,
        roomKeys: ["b"],
        pointsFeet: [
          [10.3, 3, 0],
          [17, 3, 0],
        ],
      },
      {
        id: "door",
        from: "door:0",
        to: "door:1",
        kind: "door",
        enabled: true,
        nativeElementId: 30,
        roomKeys: ["a", "b"],
        pointsFeet: [
          [9.7, 3, 0],
          [10.3, 3, 0],
        ],
      },
    ],
    walkingSupport: {
      version: 1,
      sourceModelSha256: "model",
      floors: [
        {
          nativeElementId: 100,
          elevationFeet: 0,
          ringsFeet: [rect(0, 0, 20, 6)],
        },
      ],
    },
    circulationGeometry: {
      version: 1,
      sourceModelSha256: "model",
      preparedRoomKeys: ["a", "b"],
      cells: ["a", "b"].map((key, i) => ({
        id: "cell:" + key,
        roomKeys: [key],
        levelIds: [1],
        elevationFeet: 0,
        nativeFloorIds: [100],
        sourceCoverage: 1,
        ringsFeet: [rect(i ? 11 : 0, 0, i ? 20 : 9, 6)],
      })),
    },
  } as unknown as IndoorDataset;
  bind(data);
  return data;
}
const bind = (d: IndoorDataset) =>
  (d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d));
test("native portal approaches inside threshold thickness join their own hallway while preserving explicit door traversal", () => {
  const d = fixture(),
    before = JSON.stringify(d);
  assert.deepEqual([...nativeCirculationWalkBlockers(d)], []);
  const g = projectRoutingGraph(d);
  assert.ok(g.adjacency.get("a")?.some((l) => l.to === "door:0"));
  assert.ok(g.adjacency.get("door:0")?.some((l) => l.edge.id === "door"));
  assert.equal(JSON.stringify(d), before);
});
test("a room-to-corridor native door supports only the corridor approach, without treating the room as circulation", () => {
  const d = fixture();
  d.records[0].circulation = false;
  bind(d);
  const blocked = nativeCirculationWalkBlockers(d);
  assert.ok(!blocked.has("right"));
  assert.ok(blocked.has("left"));
  d.records[0].access = "staff";
  bind(d);
  assert.ok(nativeCirculationWalkBlockers(d).has("right"));
});
test("threshold support cannot authorize a walk across the door or a nonincident gap shortcut", () => {
  const d = fixture();
  d.edges.push({
    ...d.edges[0],
    id: "shortcut",
    from: "a",
    to: "b",
    roomKeys: ["a", "b"],
    pointsFeet: [
      [3, 3, 0],
      [17, 3, 0],
    ],
  });
  d.edges.push({ ...d.edges[2], id: "walk-bypass", kind: "walk" });
  assert.deepEqual([...nativeCirculationWalkBlockers(d)].sort(), [
    "shortcut",
    "walk-bypass",
  ]);
});
test("closed doors, stale model support, unsupported floors and wrong native identities keep approaches blocked", () => {
  for (const change of [
    (d: IndoorDataset) => {
      d.edges[2].enabled = false;
    },
    (d: IndoorDataset) => {
      d.edges[2].nativeElementId = 31;
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.sourceModelSha256 = "foreign";
    },
    (d: IndoorDataset) => {
      d.walkingSupport!.floors[0].elevationFeet = 12;
    },
    (d: IndoorDataset) => {
      d.records[1].access = "staff";
    },
    (d: IndoorDataset) => {
      d.nodes[3].pointFeet[2] = 12;
    },
  ]) {
    const d = fixture();
    change(d);
    bind(d);
    assert.ok(nativeCirculationWalkBlockers(d).has("left"));
  }
});
test("approach support retains the exact doorway width and excludes holes, columns, fixtures and restricted third areas", () => {
  for (const kind of ["hole", "column", "fixture", "staff", "width"]) {
    const d = fixture(),
      strip = [rect(9.2, 2.8, 9.4, 3.2)];
    switch (kind) {
      case "hole": {
        d.walkingSupport!.floors[0].ringsFeet.push(strip[0]);
        break;
      }
      case "column": {
        d.walls.push({
          nativeElementId: 200,
          levelId: 1,
          kind: "column",
          ringsFeet: strip,
        });
        break;
      }
      case "fixture": {
        d.circulationGeometry!.fixtures = [
          {
            id: "fixture",
            nativeElementId: 200,
            levelIds: [1],
            elevationFeet: 0,
            heightFeet: 2,
            ringsFeet: strip,
          },
        ];
        break;
      }
      case "staff": {
        d.records.push({
          ...d.records[0],
          key: "staff",
          access: "staff",
          ringsFeet: strip,
        });
        break;
      }
      default: {
        d.edges[0].pointsFeet.splice(1, 0, [9.5, 4.01, 0]);
      }
    }
    bind(d);
    assert.ok(nativeCirculationWalkBlockers(d).has("left"), kind);
  }
});
