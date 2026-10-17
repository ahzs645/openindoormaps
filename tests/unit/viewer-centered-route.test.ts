/** Existing centering fixtures applied to the viewer-only lane-budget copy. */
import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset, IndoorRecord, IndoorNode, IndoorEdge } from "../../app/indoor-project/contract";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import { centeredRoutePaths } from "../../app/indoor-project/viewer-centered-route";
import { findProjectRoute } from "../../app/indoor-project/viewer-routing";
import { routeLanes } from "../../app/indoor-project/viewer-route-lanes";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [[number, number], [number, number], [number, number], [number, number]] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

function fixture(angle = (27 * Math.PI) / 180): IndoorDataset {
  const rotate = ([x, y]: number[]): [number, number] => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ];
  const xyz = (p: number[]): [number, number, number] => [...rotate(p), 0];
  const room = (key: string, polygon: number[][]): IndoorRecord => ({
    key,
    number: key,
    name: "Corridor",
    building: "01",
    levelId: 1,
    elevationFeet: 0,
    elevationEvidence: "fixture",
    surfaceId: key,
    circulation: true,
    stair: false,
    access: "public",
    walkable: true,
    confidence: 1,
    ringsFeet: [polygon.map((p) => rotate(p))],
    properties: {},
    arrivalNodeId: key,
  });
  const positions: {
    id: string;
    roomKey: string;
    kind: IndoorNode["kind"];
    point: number[];
  }[] = [
    { id: "a", roomKey: "a", kind: "arrival", point: [17, 1] },
    { id: "door-a", roomKey: "a", kind: "portal", point: [4, 7.5] },
    { id: "door-b", roomKey: "b", kind: "portal", point: [4, 8.5] },
    { id: "unused-side-door", roomKey: "b", kind: "portal", point: [7, 18] },
    { id: "b", roomKey: "b", kind: "arrival", point: [1, 25] },
  ];
  const edge = (
    id: string,
    from: string,
    to: string,
    points: number[][],
    roomKeys: string[],
    kind: IndoorEdge["kind"] = "walk",
  ): IndoorEdge => ({
    id,
    from,
    to,
    kind,
    pointsFeet: points.map((p) => xyz(p)),
    roomKeys,
    lengthMetres: points
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]) * 0.3048,
        0,
      ),
    evidence: "fixture",
    enabled: true,
    accessible: "yes",
  });
  return {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    source: { modelFileName: "fixture.rvt", modelSha256: "", roomsSha256: "" },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
      rmsMetres: 0,
      referenceCount: 2,
    },
    floors: [{ id: "floor", name: "Floor 1", levelIds: [1], elevationFeet: 0 }],
    nativeLevels: [{ id: 1, name: "Floor 1", elevationFeet: 0 }],
    records: [room("a", rect(0, 0, 20, 8)), room("b", rect(0, 8, 8, 22))],
    nodes: positions.map((n) => ({
      ...n,
      pointFeet: xyz(n.point),
      levelId: 1,
      building: "01",
      surfaceId: n.roomKey,
      geographic: [-122, 53],
    })),
    edges: [
      edge(
        "walk-a",
        "a",
        "door-a",
        [
          [17, 1],
          [17, 6],
          [4, 6],
          [4, 7.5],
        ],
        ["a"],
      ),
      edge(
        "door",
        "door-a",
        "door-b",
        [
          [4, 7.5],
          [4, 8.5],
        ],
        ["a", "b"],
        "door",
      ),
      edge(
        "walk-b1",
        "door-b",
        "unused-side-door",
        [
          [4, 8.5],
          [6, 8.5],
          [6, 18],
          [7, 18],
        ],
        ["b"],
      ),
      edge(
        "walk-b2",
        "unused-side-door",
        "b",
        [
          [7, 18],
          [7, 26],
          [1, 26],
          [1, 25],
        ],
        ["b"],
      ),
    ],
    walls: [
      rect(-0.2, 0, 0.2, 30),
      rect(0, -0.2, 20, 0.2),
      rect(20, 0, 0.2, 8),
      rect(8, 7.8, 12, 0.4),
      rect(0, 7.8, 8, 0.4),
      rect(7.8, 8, 0.4, 22),
      rect(0, 30, 8, 0.2),
    ].map((p, i) => ({
      kind: "wall",
      levelId: 1,
      nativeElementId: i,
      ringsFeet: [p.map((p) => rotate(p))],
    })),
    doors: [
      {
        id: "door",
        levelId: 1,
        nativeElementId: 100,
        pointFeet: rotate([4, 8]),
        footprintFeet: rect(1, 7.5, 6, 1).map((p) => rotate(p)),
        roomKeys: ["a", "b"],
        state: "connected",
      },
    ],
    issues: [],
    report: {
      recordCount: 2,
      routableArrivals: 2,
      components: 1,
      largestComponentArrivals: 2,
      unmatchedDoors: 0,
      cellSizeFeet: 0.6,
      omittedSourceLabels: 0,
    },
  };
}
function unrotate(p: number[], angle = (27 * Math.PI) / 180) {
  return [
    p[0] * Math.cos(angle) + p[1] * Math.sin(angle),
    -p[0] * Math.sin(angle) + p[1] * Math.cos(angle),
  ];
}

test("rotated corridors resolve to two centred straight legs and one right turn, ignoring an unused side doorway", () => {
  const d = fixture(),
    before = JSON.stringify(d),
    route = findProjectRoute(d, "a", "b")!;
  assert.equal(route.paths.length, 1);
  assert.equal(route.paths[0].centered, true);
  assert.equal(route.paths[0].pointsFeet.length, 3);
  const points = route.paths[0].pointsFeet.map((p) => unrotate(p));
  for (const [i, p] of [
    [0, [17, 3.9]],
    [1, [3.9, 3.9]],
    [2, [3.9, 25]],
  ] as const)
    for (let k = 0; k < 2; k++) assert.ok(Math.abs(points[i][k] - p[k]) < 0.01);
  const [a, b, c] = route.paths[0].pointsFeet;
  assert.ok(
    Math.abs((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) <
      1e-8,
  );
  assert.ok(
    (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < 0,
    "Turn is right in walking direction",
  );
  assert.ok(route.distanceMetres < route.sourceDistanceMetres);
  assert.deepEqual(route.edges, d.edges);
  assert.equal(JSON.stringify(d), before);
  const reverse = findProjectRoute(d, "b", "a")!;
  assert.equal(reverse.paths[0].centered, true);
  assert.ok(Math.abs(reverse.distanceMetres - route.distanceMetres) < 1e-8);
});

test("centreline resolution cannot cut through a native pillar, void, staff area or divider", () => {
  for (const obstacle of ["column", "void", "staff", "divider"]) {
    const d = fixture(0);
    if (obstacle === "column" || obstacle === "divider")
      d.walls.push({
        kind: obstacle === "column" ? "column" : "wall",
        levelId: 1,
        nativeElementId: 200,
        ringsFeet: [rect(3, 14, 2, obstacle === "divider" ? 0.001 : 2)],
      });
    if (obstacle === "void") d.records[1].ringsFeet.push(rect(3, 14, 2, 2));
    if (obstacle === "staff")
      d.records.push({
        ...d.records[1],
        key: "staff",
        circulation: false,
        access: "staff",
        ringsFeet: [rect(3, 14, 2, 2)],
      });
    const r = findProjectRoute(d, "a", "b")!;
    const points = r.paths[0].pointsFeet;
    // Multiple turns can now pass around a small obstacle. No leg may cross it,
    // including a divider too thin for ordinary point sampling to detect.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        h = obstacle === "divider" ? 0.001 : 2;
      if (Math.abs(b[0] - a[0]) < 1e-7 && a[0] > 3 && a[0] < 5)
        assert.ok(
          Math.max(a[1], b[1]) <= 14 || Math.min(a[1], b[1]) >= 14 + h,
          obstacle,
        );
      if (Math.abs(b[1] - a[1]) < 1e-7 && a[1] > 14 && a[1] < 14 + h)
        assert.ok(
          Math.max(a[0], b[0]) <= 3 || Math.min(a[0], b[0]) >= 5,
          obstacle,
        );
    }
  }
});

test("a centreline needs the selected precise doorway and retains geometry-bound step-free approvals", () => {
  const d = fixture();
  const confirmed = findProjectRoute(d, "a", "b", "accessible")!;
  assert.equal(confirmed.paths[0].centered, false);
  assert.equal(confirmed.distanceMetres, confirmed.sourceDistanceMetres);
  delete d.doors![0].footprintFeet;
  assert.equal(findProjectRoute(d, "a", "b")!.paths[0].centered, false);
  d.edges[1].enabled = false;
  assert.equal(findProjectRoute(d, "a", "b"), null);
});

test("same XY on another native floor remains disconnected, and stair geometry remains intact", () => {
  const d = fixture(0);
  d.records.push({
    ...d.records[1],
    key: "upper",
    levelId: 2,
    arrivalNodeId: "upper",
    elevationFeet: 10,
  });
  d.nodes.push({
    ...d.nodes.at(-1)!,
    id: "upper",
    roomKey: "upper",
    levelId: 2,
    pointFeet: [1, 25, 10],
  });
  assert.equal(findProjectRoute(d, "a", "upper"), null);
  const stairs: IndoorEdge = {
    id: "stairs",
    from: "b",
    to: "upper",
    kind: "stairs",
    roomKeys: ["b", "upper"],
    pointsFeet: [
      [1, 25, 0],
      [2, 25, 5],
      [1, 25, 10],
    ],
    lengthMetres: 4,
    evidence: "fixture",
    enabled: true,
    accessible: "no",
  };
  d.edges.push(stairs);
  const r = findProjectRoute(d, "a", "upper")!;
  assert.deepEqual(r.paths.at(-1)!.pointsFeet, stairs.pointsFeet);
  assert.deepEqual(r.paths.at(-1)!.levelIds, [1, 2]);
  assert.equal(r.paths.at(-1)!.centered, false);
});

test("rotated serpentine corridors resolve five real corners rather than a grid zigzag", () => {
  const d = fixture(0),
    angle = (27 * Math.PI) / 180;
  const polygon = [
    [0, 0],
    [30, 0],
    [30, 20],
    [54, 20],
    [54, 50],
    [24, 50],
    [24, 44],
    [48, 44],
    [48, 26],
    [24, 26],
    [24, 6],
    [6, 6],
    [6, 30],
    [0, 30],
  ] as [number, number][];
  const source = [
    [3, 27],
    [3, 3],
    [27, 3],
    [27, 23],
    [51, 23],
    [51, 47],
    [27, 47],
  ] as [number, number][];
  const rotate = (p: number[]): [number, number] => [
    p[0] * Math.cos(angle) - p[1] * Math.sin(angle),
    p[0] * Math.sin(angle) + p[1] * Math.cos(angle),
  ];
  d.records = [
    { ...d.records[0], ringsFeet: [polygon.map((p) => rotate(p))] },
    {
      ...d.records[0],
      key: "b",
      arrivalNodeId: "b",
      ringsFeet: [polygon.map((p) => rotate(p))],
    },
  ];
  d.nodes = [d.nodes[0], d.nodes.at(-1)!].map((n, i) => ({
    ...n,
    pointFeet: [...rotate(source[i ? source.length - 1 : 0]), 0],
  }));
  d.edges = [
    {
      ...d.edges[0],
      from: "a",
      to: "b",
      roomKeys: ["a", "b"],
      pointsFeet: source.map((p) => [...rotate(p), 0]),
      lengthMetres: 150 * 0.3048,
    },
  ];
  d.doors = [];
  d.walls = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    // The polygon is CCW: the thin wall lies just outside the allowed corridor.
    const x = (dy / len) * 0.1,
      y = (-dx / len) * 0.1;
    return {
      kind: "wall" as const,
      levelId: 1,
      nativeElementId: i,
      ringsFeet: [
        [a, b, [b[0] + x, b[1] + y], [a[0] + x, a[1] + y]].map((p) =>
          rotate(p),
        ),
      ],
    };
  });
  const r = findProjectRoute(d, "a", "b")!;
  assert.equal(r.paths[0].centered, true);
  assert.equal(r.paths[0].pointsFeet.length, 7);
  const pts = r.paths[0].pointsFeet.map((p) => unrotate(p, angle));
  for (let i = 0; i < source.length; i++)
    for (let k = 0; k < 2; k++)
      assert.ok(Math.abs(pts[i][k] - source[i][k]) < 1e-6);
  const reverse = [
    ...findProjectRoute(d, "b", "a")!.paths[0].pointsFeet,
  ].reverse();
  for (let i = 0; i < reverse.length; i++)
    for (let k = 0; k < 3; k++)
      assert.ok(Math.abs(reverse[i][k] - r.paths[0].pointsFeet[i][k]) < 1e-8);
});

test("split corridor legs retain the native doorway at a portal inside its wall", () => {
  const d = fixture(0);
  const door = d.edges.find((e) => e.kind === "door")!;
  // Force the full-floor fallback, with the opposite corridor portal inside
  // the wall thickness but inside the verified native door aperture.
  d.walls.push({
    levelId: 1,
    kind: "column",
    nativeElementId: 991,
    ringsFeet: [rect(16.9, 0.9, 0.2, 0.2)],
  });
  d.nodes.find((n) => n.id === "door-b")!.pointFeet = [4, 8.1, 0];
  door.pointsFeet[1] = [4, 8.1, 0];
  d.edges.find((e) => e.id === "walk-b1")!.pointsFeet[0] = [4, 8.1, 0];
  const before = JSON.stringify(d);
  const route = findProjectRoute(d, "a", "b")!;
  const corridor = route.paths.find((p) => p.edgeIds.includes("walk-b1"))!;
  assert.equal(corridor.centered, true);
  assert.ok(corridor.pointsFeet.length < 6);
  assert.deepEqual(corridor.pointsFeet[0], [4, 8.1, 0]);
  assert.deepEqual(
    route.paths.find((p) => p.edgeIds.includes("door"))!.pointsFeet,
    door.pointsFeet,
  );
  assert.equal(JSON.stringify(d), before);
});

test("native slab profiles constrain every new centered leg continuously and retain holes", () => {
  const d = fixture(0);
  const support = () => ({
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 123,
        elevationFeet: 0,
        ringsFeet: [rect(-1, -1, 22, 32)],
      },
    ],
  });
  d.walkingSupport = support();
  const full = findProjectRoute(d, "a", "b")!;
  assert.ok(full.paths[0].centered);
  assert.equal(full.paths[0].nativeFloorSupported, true);
  // A very thin omitted hole would fall between ordinary sampled points. Its
  // exact ring contributes segment breakpoints and forces a supported detour.
  const hole = rect(2.5, 15.013, 3, 0.007);
  d.walkingSupport.floors[0].ringsFeet.push(hole);
  const detour = findProjectRoute(d, "a", "b")!;
  assert.notDeepEqual(detour.paths[0].pointsFeet, full.paths[0].pointsFeet);
  for (const path of detour.paths.filter((p) => p.centered))
    for (let i = 1; i < path.pointsFeet.length; i++) {
      const a = path.pointsFeet[i - 1],
        b = path.pointsFeet[i];
      if ((a[1] - 15.0165) * (b[1] - 15.0165) < 0) {
        const t = (15.0165 - a[1]) / (b[1] - a[1]);
        const x = a[0] + t * (b[0] - a[0]);
        assert.ok(
          x <= 2.5 || x >= 5.5,
          "centerline cannot cross the native slab opening",
        );
      }
    }
  d.walkingSupport = support();
  d.walkingSupport.floors[0].elevationFeet = 10;
  const wrongStorey = findProjectRoute(d, "a", "b")!;
  assert.ok(
    wrongStorey.paths.every((p) => !p.centered),
    "a floor on another storey cannot authorize centering",
  );
  d.walkingSupport = support();
  d.walkingSupport.sourceModelSha256 = "stale-model";
  const stale = findProjectRoute(d, "a", "b")!;
  assert.ok(
    stale.paths.every((p) => !p.centered),
    "stale model profiles cannot authorize centering",
  );
  delete d.walkingSupport;
  assert.ok(
    findProjectRoute(d, "a", "b")!.paths.some((p) => p.centered),
    "older imports retain legacy geometry behavior without claiming native support",
  );
});

test("unresolved positive native slab holes block unsafe source fallbacks and name their evidence", async () => {
  const { nativeFloorHoleCrossings } = await import(
    "../../app/indoor-project/walking-support"
  );
  const { createProjectRouteDiagnostics } = await import(
    "../../app/indoor-project/route-diagnostics"
  );
  const d = fixture(0);
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 123,
        elevationFeet: 0,
        ringsFeet: [rect(-1, -1, 22, 32), rect(-0.5, 15.013, 9, 0.007)],
      },
    ],
  };
  assert.deepEqual(
    nativeFloorHoleCrossings(d, [
      [4, 10, 0],
      [4, 20, 0],
    ]),
    [123],
  );
  assert.equal(
    findProjectRoute(d, "a", "b"),
    null,
    "a saved route crossing an exact hole is not a safe fallback",
  );
  const diagnostic = createProjectRouteDiagnostics(d).inspect("a", "b");
  assert.equal(diagnostic.kind, "blocked");
  assert.ok(diagnostic.message.includes("native floor opening"));
  assert.deepEqual(diagnostic.blockers, [
    { kind: "native-floor-hole", edgeId: "", nativeElementId: 123 },
  ]);
  assert.equal(findProjectRoute(d, "a", "b"), null);
  assert.deepEqual(
    createProjectRouteDiagnostics(d).inspect("a", "b"),
    diagnostic,
    "a cached failed route preserves its native-floor explanation",
  );
  d.walkingSupport.floors.push({
    nativeElementId: 124,
    elevationFeet: 0,
    ringsFeet: [rect(-1, 15, 11, 0.03)],
  });
  assert.deepEqual(
    nativeFloorHoleCrossings(d, [
      [4, 10, 0],
      [4, 20, 0],
    ]),
    [],
  );
  assert.ok(
    findProjectRoute(d, "a", "b"),
    "an independently supported overlapping slab can fill the same opening",
  );
  d.walkingSupport.floors = [
    {
      nativeElementId: 125,
      elevationFeet: 0,
      ringsFeet: [rect(100, 100, 10, 10)],
    },
  ];
  assert.ok(
    findProjectRoute(d, "a", "b"),
    "absence of native floor evidence is unknown, not a fabricated opening",
  );
});

test("a known floor opening triggers a safe alternate source branch instead of abandoning a viable route", () => {
  const d = fixture(0);
  d.walls = [];
  d.records[1].ringsFeet = [rect(0, 8, 20, 22)];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 123,
        elevationFeet: 0,
        ringsFeet: [rect(-1, -1, 22, 32), rect(-0.5, 15, 9, 0.1)],
      },
    ],
  };
  const alternative = {
    ...d.edges.at(-1)!,
    id: "supported-branch",
    from: "door-b",
    to: "b",
    pointsFeet: [
      [4, 8.5, 0],
      [10, 8.5, 0],
      [10, 25, 0],
      [1, 25, 0],
    ] as [number, number, number][],
    lengthMetres: 31.5 * 0.3048,
  };
  d.edges.push(alternative);
  const route = findProjectRoute(d, "a", "b")!;
  assert.ok(route);
  assert.ok(route.edges.some((edge) => edge.id === alternative.id));
  assert.ok(!route.edges.some((edge) => edge.id === "walk-b1"));
  assert.ok(route.distanceMetres > 0);
});

test("fixed stair and doorway anchors do not create microscopic orthogonal approach spurs", () => {
  const d = fixture(0);
  d.records = d.records.filter((r) => r.key === "b");
  const stair = {
    ...d.nodes[0],
    id: "stair",
    roomKey: "b",
    kind: "stair" as const,
    pointFeet: [4, 11, 0] as [number, number, number],
  };
  const door = {
    ...d.nodes[1],
    id: "door",
    roomKey: "b",
    kind: "portal" as const,
    pointFeet: [4.02, 12.2, 0] as [number, number, number],
  };
  d.nodes = [stair, door];
  const walk: IndoorEdge = {
    ...d.edges[0],
    id: "approach",
    from: stair.id,
    to: door.id,
    roomKeys: ["b"],
    pointsFeet: [stair.pointFeet, [4, 12.2, 0], door.pointFeet],
  };
  d.edges = [walk];
  const paths = centeredRoutePaths(d, d.edges, [stair.id, door.id]);
  assert.equal(paths[0].centered, true);
  assert.deepEqual(paths[0].pointsFeet, [stair.pointFeet, door.pointFeet]);
  assert.deepEqual(
    walk.pointsFeet,
    [stair.pointFeet, [4, 12.2, 0], door.pointFeet],
    "the saved stair and doorway connection remains unchanged",
  );
  d.walls.push({
    kind: "column",
    levelId: 1,
    nativeElementId: 777,
    ringsFeet: [rect(4.008, 11.595, 0.006, 0.01)],
  });
  const blocked = centeredRoutePaths(d, d.edges, [stair.id, door.id]);
  assert.ok(
    blocked[0].pointsFeet.length > 2,
    "a small native obstruction keeps the supported orthogonal approach",
  );
});

test("short native stair vestibules use a direct supported approach without inventing an axis elbow", () => {
  const d = fixture(0);
  d.records = d.records.filter((r) => r.key === "b");
  d.records[0].stair = true;
  d.nodes = [
    {
      ...d.nodes[0],
      id: "stair",
      roomKey: "b",
      kind: "stair",
      pointFeet: [4, 11, 0],
    },
    {
      ...d.nodes[1],
      id: "door",
      roomKey: "b",
      kind: "portal",
      pointFeet: [6.5, 20, 0],
    },
  ];
  const [start, end] = d.nodes;
  d.edges = [
    {
      ...d.edges[0],
      id: "vestibule",
      from: start.id,
      to: end.id,
      roomKeys: ["b"],
      pointsFeet: [start.pointFeet, [4, 20, 0], end.pointFeet],
    },
  ];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 8, 8, 22)],
      },
    ],
  };
  d.circulationGeometry = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    sourceGeometryKey: nativeCirculationGeometryKey(d),
    cells: [
      {
        id: "landing",
        levelIds: [1],
        elevationFeet: 0,
        roomKeys: ["b"],
        nativeFloorIds: [100],
        ringsFeet: [rect(0, 8, 8, 22)],
        sourceCoverage: 1,
      },
    ],
  };
  const paths = centeredRoutePaths(d, d.edges, [start.id, end.id]);
  assert.deepEqual(paths[0].pointsFeet, [start.pointFeet, end.pointFeet]);
  assert.equal(paths[0].nativeFloorSupported, true);
  d.walls.push({
    kind: "column",
    levelId: 1,
    nativeElementId: 778,
    ringsFeet: [rect(5.15, 15.4, 0.2, 0.2)],
  });
  d.circulationGeometry.sourceGeometryKey = nativeCirculationGeometryKey(d);
  const blocked = centeredRoutePaths(d, d.edges, [start.id, end.id]);
  assert.ok(
    blocked[0].pointsFeet.length > 2,
    "a pillar prevents the direct landing shortcut",
  );
  delete d.circulationGeometry;
  const legacy = centeredRoutePaths(d, d.edges, [start.id, end.id]);
  assert.ok(
    legacy[0].pointsFeet.length > 2,
    "raw source outlines alone cannot enable a direct landing shortcut",
  );
});

test("sparse lanes prefer fewer real turns within budget and retain a shorter alternative for a tighter budget", () => {
  const segments = [
    [
      [0, 0],
      [2, 0],
    ],
    [
      [2, 0],
      [2, 2],
    ],
    [
      [2, 2],
      [8, 2],
    ],
    [
      [8, 2],
      [8, 0],
    ],
    [
      [8, 0],
      [10, 0],
    ],
    [
      [0, 0],
      [0, 6],
    ],
    [
      [0, 6],
      [10, 6],
    ],
    [
      [10, 6],
      [10, 0],
    ],
  ];
  const supported = (a: number[], b: number[]) =>
    segments.some(([s, e]) => {
      const on = (p: number[]) =>
        Math.abs(
          (p[0] - s[0]) * (e[1] - s[1]) - (p[1] - s[1]) * (e[0] - s[0]),
        ) < 1e-8 &&
        p[0] >= Math.min(s[0], e[0]) &&
        p[0] <= Math.max(s[0], e[0]) &&
        p[1] >= Math.min(s[1], e[1]) &&
        p[1] <= Math.max(s[1], e[1]);
      return on(a) && on(b);
    });
  const xs = [0, 2, 8, 10],
    ys = [0, 2, 6];
  assert.deepEqual(routeLanes(xs, ys, [0, 0], [10, 0], supported, 23), [
    [0, 0],
    [0, 6],
    [10, 6],
    [10, 0],
  ]);
  assert.deepEqual(routeLanes(xs, ys, [0, 0], [10, 0], supported, 16), [
    [0, 0],
    [2, 0],
    [2, 2],
    [8, 2],
    [8, 0],
    [10, 0],
  ]);
  assert.equal(routeLanes(xs, ys, [0, 0], [10, 0], supported, 13), null);
});
