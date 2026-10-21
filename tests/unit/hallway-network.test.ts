import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  buildHallwayNetwork,
  createHallwayRouter,
  EDGE_STAFF,
  hallwayParts,
  type HallwayNetwork,
} from "../../app/indoor-project/hallway-network";
import { surfaceArea } from "../../app/indoor-project/hallway-spine";

type P = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
/** Two floors. Floor 1: corridors C1 (x 0–28) and C2 (x 32–60), rooms A on
 * C1 and B on C2, staff room S below joining both corridors. Floor 2:
 * corridor C3 with room D. Stairs at the west end, a lift at the east end and
 * a held (disabled) stair in the middle join the floors. */
function campus({ gate }: { gate: boolean }): IndoorDataset {
  const records: object[] = [],
    nodes: object[] = [],
    edges: object[] = [],
    cells: object[] = [];
  const room = (
    key: string,
    levelId: number,
    ring: P[],
    o: { circulation?: boolean; access?: string; arrival?: P },
  ) => {
    records.push({
      key,
      number: key,
      name: o.circulation ? "Corridor" : "Office",
      building: "01",
      levelId,
      elevationFeet: levelId * 12,
      circulation: !!o.circulation,
      stair: false,
      access: o.access ?? "unknown",
      walkable: true,
      ringsFeet: [ring],
      arrivalNodeId: o.arrival ? `arrival:${key}` : undefined,
      properties: {},
    });
    cells.push({
      id: `cell:${key}`,
      levelIds: [levelId],
      elevationFeet: levelId * 12,
      roomKeys: [key],
      ringsFeet: [ring],
    });
    if (o.arrival) node(`arrival:${key}`, levelId, o.arrival, "arrival", key);
  };
  const node = (
    id: string,
    levelId: number,
    p: P,
    kind: string,
    roomKey = "",
  ) =>
    nodes.push({
      id,
      roomKey,
      levelId,
      building: "01",
      surfaceId: "",
      pointFeet: [p[0], p[1], levelId * 12],
      geographic: [0, 0],
      kind,
    });
  const edge = (
    id: string,
    from: string,
    to: string,
    kind: string,
    pts: P[],
    o: {
      roomKeys?: string[];
      cell?: string;
      enabled?: boolean;
      metres?: number;
      level?: number;
    } = {},
  ) =>
    edges.push({
      id,
      from,
      to,
      kind,
      // As compiled: a horizontal edge is as long as its polyline.
      lengthMetres:
        o.metres ??
        pts
          .slice(1)
          .reduce(
            (t, p, i) =>
              t + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) * 0.3048,
            0,
          ),
      pointsFeet: pts.map((p) => [p[0], p[1], (o.level ?? 1) * 12]),
      roomKeys: o.roomKeys ?? [],
      nativeCellId: o.cell,
      enabled: o.enabled ?? true,
      accessible: "unknown",
    });
  /** A room on a corridor: door portals either side of the wall plus the walk inside. */
  const office = (
    key: string,
    levelId: number,
    x: number,
    corridor: string,
  ) => {
    room(key, levelId, rect(x - 5, 6.5, x + 5, 16), { arrival: [x, 11] });
    node(`${key}:in`, levelId, [x, 6.6], "portal", key);
    node(`${key}:out`, levelId, [x, 5.9], "portal", corridor);
    edge(
      `door:${key}`,
      `${key}:in`,
      `${key}:out`,
      "door",
      [
        [x, 6.6],
        [x, 5.9],
      ],
      { roomKeys: [key, corridor], level: levelId },
    );
    edge(
      `walk:${key}`,
      `arrival:${key}`,
      `${key}:in`,
      "walk",
      [
        [x, 11],
        [x, 6.6],
      ],
      { roomKeys: [key], cell: `cell:${key}`, level: levelId },
    );
  };
  room("C1", 1, rect(0, 0, 28, 6), { circulation: true });
  room("C2", 1, rect(32, 0, 60, 6), { circulation: true });
  room("C3", 2, rect(0, 0, 60, 6), { circulation: true });
  office("A", 1, 13, "C1");
  office("B", 1, 47, "C2");
  office("D", 2, 32, "C3");
  // Staff room joining both corridors from below.
  room("S", 1, rect(22, -12, 38, -0.5), { access: "staff", arrival: [30, -6] });
  for (const [side, x, corridor] of [
    ["w", 25, "C1"],
    ["e", 35, "C2"],
  ] as const) {
    node(`S:${side}:in`, 1, [x, -0.6], "portal", "S");
    node(`S:${side}:out`, 1, [x, 0.1], "portal", corridor);
    edge(
      `door:S:${side}`,
      `S:${side}:in`,
      `S:${side}:out`,
      "door",
      [
        [x, -0.6],
        [x, 0.1],
      ],
      { roomKeys: ["S", corridor] },
    );
    edge(
      `walk:S:${side}`,
      "arrival:S",
      `S:${side}:in`,
      "walk",
      [
        [30, -6],
        [x, -0.6],
      ],
      { roomKeys: ["S"], cell: "cell:S" },
    );
  }
  if (gate) {
    node("g:w", 1, [27.9, 3], "portal", "C1");
    node("g:e", 1, [32.1, 3], "portal", "C2");
    edge(
      "door:C1-C2",
      "g:w",
      "g:e",
      "door",
      [
        [27.9, 3],
        [32.1, 3],
      ],
      { roomKeys: ["C1", "C2"] },
    );
  }
  // The compiler's own walks along each hallway, between the nodes it reaches.
  const hallway = (cell: string, level: number, chain: [string, P][]) =>
    chain.slice(1).forEach(([id, p], i) =>
      edge(`walk:${cell}:${i}`, chain[i][0], id, "walk", [chain[i][1], p], {
        roomKeys: [cell],
        cell: `cell:${cell}`,
        level,
      }),
    );
  hallway("C1", 1, [
    ["st:1", [2, 3]],
    ["A:out", [13, 5.9]],
    ["held:1", [20, 3]],
    ["S:w:out", [25, 0.1]],
    ...(gate ? ([["g:w", [27.9, 3]]] as [string, P][]) : []),
  ]);
  hallway("C2", 1, [
    ...(gate ? ([["g:e", [32.1, 3]]] as [string, P][]) : []),
    ["S:e:out", [35, 0.1]],
    ["B:out", [47, 5.9]],
    ["lift:1", [58, 3]],
  ]);
  hallway("C3", 2, [
    ["st:2", [2, 3]],
    ["held:2", [20, 3]],
    ["D:out", [32, 5.9]],
    ["lift:2", [58, 3]],
  ]);
  // A room on C3 whose door the compiler never walks to from the hallway.
  office("X", 2, 45, "C3");
  // Vertical links.
  node("st:1", 1, [2, 3], "stair");
  node("st:2", 2, [2, 3], "stair");
  edge(
    "stairs:west",
    "st:1",
    "st:2",
    "stairs",
    [
      [2, 3],
      [2, 3],
    ],
    { metres: 8 },
  );
  node("lift:1", 1, [58, 3], "connector");
  node("lift:2", 2, [58, 3], "connector");
  edge(
    "lift:east",
    "lift:1",
    "lift:2",
    "elevator",
    [
      [58, 3],
      [58, 3],
    ],
    { metres: 4 },
  );
  node("held:1", 1, [20, 3], "stair");
  node("held:2", 2, [20, 3], "stair");
  edge(
    "stairs:held",
    "held:1",
    "held:2",
    "stairs",
    [
      [20, 3],
      [20, 3],
    ],
    { metres: 1, enabled: false },
  );
  return {
    format: "reviter-indoor",
    version: 1,
    source: {
      modelFileName: "fixture.rvt",
      modelSha256: "f".repeat(64),
      roomsSha256: "e".repeat(64),
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [0, 0],
      projectionLatitude: 0,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    floors: [],
    nativeLevels: [],
    records,
    nodes,
    edges,
    walls: [],
    doors: [],
    circulationGeometry: {
      version: 1,
      sourceModelSha256: "f".repeat(64),
      sourceGeometryKey: "",
      cells,
    },
  } as unknown as IndoorDataset;
}
const kinds = (net: HallwayNetwork, edges: number[]) =>
  edges.map((i) => net.edges[i][3]);

test("staff rooms are never used, even as the only way through", () => {
  const net = buildHallwayNetwork(campus({ gate: false }));
  const route = createHallwayRouter(net);
  // Step-free cannot use the west stairs, so the staff room is A's only way to B.
  assert.equal(route("A", "B", "step-free"), null);
  // Walking finds the public way: up the stairs, along floor 2, down the lift.
  const walking = route("A", "B", "walking")!;
  assert.ok(walking.edges.every((i) => !(net.edges[i][4] & EDGE_STAFF)));
  assert.ok(
    kinds(net, walking.edges).includes("stairs") &&
      kinds(net, walking.edges).includes("elevator"),
  );
  assert.ok(
    net.edges.some((e) => e[4] & EDGE_STAFF),
    "the staff room's walks are kept and flagged",
  );
});

test("a gate joins two corridor surfaces and the route follows the spine", () => {
  const net = buildHallwayNetwork(campus({ gate: true }));
  const route = createHallwayRouter(net);
  const r = route("A", "B", "walking");
  assert.ok(r);
  const used = kinds(net, r.edges);
  assert.ok(
    used.includes("spine") && used.includes("gate") && used.includes("join"),
  );
  assert.ok(
    !used.includes("walk") || used.filter((k) => k === "walk").length === 2,
    "only the two room interiors",
  );
  // Arrival A (13,11) to B (47,11) along a centred corridor: about 34 + 2 x 8 ft.
  assert.ok(r.metres > 34 * 0.3048 && r.metres < 60 * 0.3048, `${r.metres} m`);
  assert.equal(net.report.unconnected.length, 0);
});

test("walking takes the stairs, step-free takes the lift, held stairs are never used", () => {
  const net = buildHallwayNetwork(campus({ gate: true }));
  const route = createHallwayRouter(net);
  const walking = route("A", "D", "walking")!,
    stepFree = route("A", "D", "step-free")!;
  assert.ok(kinds(net, walking.edges).includes("stairs"));
  assert.ok(!kinds(net, stepFree.edges).includes("stairs"));
  assert.ok(kinds(net, stepFree.edges).includes("elevator"));
  assert.ok(stepFree.metres > walking.metres);
  // The held stair would be far shorter; it must not appear in the network.
  assert.ok(
    !net.edges.some(
      ([a, b, , kind]) =>
        kind === "stairs" && net.nodes[a][1] === 20 && net.nodes[b][1] === 20,
    ),
  );
});

test("every room with an arrival point is routable from its own corridor", () => {
  const net = buildHallwayNetwork(campus({ gate: true }));
  for (const key of ["A", "B", "D", "S"])
    assert.ok(net.arrivals[key] !== undefined, key);
  const route = createHallwayRouter(net);
  assert.ok(route("A", "A", "walking")?.metres === 0);
});

test("a door the compiled graph never walks to from the hallway stays closed", () => {
  const net = buildHallwayNetwork(campus({ gate: true }));
  const route = createHallwayRouter(net);
  assert.ok(route("D", "B", "walking"));
  assert.equal(route("D", "X", "walking"), null);
  assert.equal(route("X", "A", "step-free"), null);
});

test("a walkable cell's hallway part leaves out the rooms that open onto it", () => {
  // One cell: a 60 x 6 ft corridor and a 10 x 10 ft office joined by a door gap.
  const cell: P[] = [
    [0, 0],
    [60, 0],
    [60, 6],
    [26, 6],
    [26, 16],
    [16, 16],
    [16, 6],
    [0, 6],
  ];
  const parts = hallwayParts([cell], [rect(0, 0, 60, 6)]);
  assert.equal(parts.length, 1);
  const area = surfaceArea(parts[0]);
  // The corridor plus the hallway's reach (1.25 ft) into the doorway.
  assert.ok(area > 360 && area < 360 + 10 * 1.3, `${area} sq ft`);
  // A cell without a usable hallway outline stays whole.
  assert.deepEqual(hallwayParts([cell], []), [[cell]]);
});
