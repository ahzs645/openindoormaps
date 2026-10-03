import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeCirculationGeometryKey,
  nativeCirculationWalkBlockers,
  nativeCirculationCells,
  nativeCirculationSurfaces,
  validateNativeCirculationGeometry,
} from "../../app/indoor-project/native-circulation";
import { nativeCirculationGeometryKey as compilerKey } from "../../../reviter/lib/reviter/native-circulation-geometry.ts";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
import { centeredRoutePaths } from "../../app/indoor-project/centered-route";
import { openingSpanCrossings } from "../../app/indoor-project/opening-span";
import {
  containsRoomPoint,
  nativeRouteBlocker,
} from "../../../reviter/lib/reviter/room-directory.ts";
import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import type { IndoorDataset } from "../../app/indoor-project/contract";
type Point = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
function fixture(): IndoorDataset {
  const data = {
    source: { modelSha256: "a".repeat(64) },
    records: [
      {
        key: "hall",
        number: "H",
        name: "Corridor",
        building: "B",
        levelId: 1,
        elevationFeet: 0,
        surfaceId: "B:1:0",
        circulation: true,
        stair: false,
        walkable: true,
        access: "unknown",
        ringsFeet: [rect(1, 1, 19, 3)],
        properties: {},
      },
    ],
    walls: [],
    doors: [],
    nativeLevels: [{ id: 1, name: "Level 1", elevationFeet: 0 }],
    floors: [{ id: "1", levelIds: [1], elevationFeet: 0, name: "Level 1" }],
    nodes: [
      { id: "a", roomKey: "hall", pointFeet: [2, 2, 0], levelId: 1 },
      { id: "b", roomKey: "hall", pointFeet: [18, 2, 0], levelId: 1 },
    ],
    edges: [
      {
        id: "walk",
        from: "a",
        to: "b",
        kind: "walk",
        roomKeys: ["hall"],
        pointsFeet: [
          [2, 2, 0],
          [2, 5, 0],
          [18, 5, 0],
          [18, 2, 0],
        ],
        enabled: true,
        lengthMetres: 7,
        accessible: "unknown",
      },
    ],
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
    },
    walkingSupport: {
      version: 1,
      sourceModelSha256: "a".repeat(64),
      floors: [
        {
          nativeElementId: 100,
          elevationFeet: 0,
          ringsFeet: [rect(0, 0, 20, 6)],
        },
      ],
    },
  } as unknown as IndoorDataset;
  data.records[0].ringsFeet = [
    [
      [0.4, 0.4],
      [8, 0.4],
      [8, 4],
      [12, 4],
      [12, 0.4],
      [19.6, 0.4],
      [19.6, 5.6],
      [0.4, 5.6],
    ],
  ];
  data.walls = [
    {
      kind: "wall",
      nativeElementId: 101,
      levelId: 1,
      ringsFeet: [rect(0, -0.4, 20, 0)],
    },
    {
      kind: "wall",
      nativeElementId: 102,
      levelId: 1,
      ringsFeet: [rect(0, 6, 20, 6.4)],
    },
  ];
  data.circulationGeometry = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: nativeCirculationGeometryKey(data),
    cells: [
      {
        id: "native-cell",
        levelIds: [1],
        elevationFeet: 0,
        roomKeys: ["hall"],
        nativeFloorIds: [100],
        ringsFeet: [rect(0, 0, 20, 6)],
        sourceCoverage: 0.688,
      },
    ],
  };
  return data;
}
test("runtime and compiler bindings match; geometry/access edits and foreign floor proofs invalidate cells", () => {
  const data = fixture();
  assert.equal(
    nativeCirculationGeometryKey(data),
    compilerKey({ ...data, rampDisplay: undefined }),
  );
  validateNativeCirculationGeometry(data);
  assert.equal(nativeCirculationCells(data).length, 1);
  data.records[0].name = "A better label";
  assert.equal(nativeCirculationCells(data).length, 1);
  data.records[0].ringsFeet = [rect(0, 0, 1, 1)];
  assert.equal(nativeCirculationCells(data).length, 0);
  const wrong = fixture();
  wrong.circulationGeometry!.cells[0].nativeFloorIds = [101];
  assert.throws(
    () => validateNativeCirculationGeometry(wrong),
    /floor ownership/,
  );
  const foreign = fixture();
  foreign.circulationGeometry!.sourceModelSha256 = "b".repeat(64);
  assert.throws(
    () => validateNativeCirculationGeometry(foreign),
    /native circulation/,
  );
});
test("display and route refinement consume native cells while semantic source rings remain unchanged", () => {
  const data = fixture(),
    before = JSON.stringify(data);
  const surface = nativeCirculationSurfaces(data, data.records);
  assert.deepEqual(surface.rings, [
    data.circulationGeometry!.cells[0].ringsFeet,
  ]);
  const display = projectDisplayGeometry(data, [1], "all", "", true, false);
  assert.ok(
    display.areas.features.some(
      (f) => f.properties?.boundarySource === "prepared-native-circulation",
    ),
  );
  assert.ok(!display.areas.features.some((f) => f.id === "hall"));
  const selectedDisplay = projectDisplayGeometry(
    data,
    [1],
    "all",
    "hall",
    true,
    false,
  );
  const cellFeature = selectedDisplay.areas.features.find(
    (f) => f.properties?.nativeCellId === "native-cell",
  )!;
  assert.deepEqual(cellFeature.properties?.roomKeys, ["hall"]);
  assert.equal(cellFeature.properties?.selected, true);
  const paths = centeredRoutePaths(data, data.edges, ["a", "b"]);
  assert.ok(
    paths.some((p) => p.nativeCirculationUsed),
    JSON.stringify(paths),
  );
  assert.deepEqual(
    paths[0].pointsFeet,
    [
      [2, 2, 0],
      [18, 2, 0],
    ],
    "clear native floor removes the false trace notch while retaining both fixed anchors",
  );
  assert.equal(containsRoomPoint([10, 2], data.records[0].ringsFeet[0]), false);
  const legacy = { ...data, circulationGeometry: undefined };
  assert.ok(
    centeredRoutePaths(legacy, legacy.edges, ["a", "b"])[0].pointsFeet.length >
      2,
    "trace-only routing must detour around the same false notch",
  );
  assert.equal(JSON.stringify(data), before);
});
test("a rebuilt cell branch cannot keep routing after its source geometry becomes stale", () => {
  const data = fixture();
  data.edges[0].nativeCellId = "native-cell";
  assert.equal(projectRoutingGraph(data).adjacency.get("a")?.length, 1);
  data.records[0].ringsFeet = [rect(0, 0, 1, 1)];
  assert.equal(projectRoutingGraph(data).adjacency.get("a")?.length ?? 0, 0);
  assert.ok(
    projectRoutingGraph(data)
      .allAdjacency.get("a")?.[0]
      .blockers.some((b) => b.kind === "native-circulation-proof"),
  );
});

function seamFixture(): IndoorDataset {
  const data = fixture();
  data.records[0].ringsFeet = [rect(0, 0, 10, 6)];
  data.records.push({
    ...data.records[0],
    key: "other",
    ringsFeet: [rect(10, 0, 20, 6)],
  });
  data.nodes = [
    {
      ...data.nodes[0],
      id: "a",
      roomKey: "hall",
      pointFeet: [2, 3, 0],
      levelId: 1,
    },
    {
      ...data.nodes[0],
      id: "left",
      roomKey: "hall",
      pointFeet: [9.5, 1, 0],
      levelId: 1,
    },
    {
      ...data.nodes[0],
      id: "right",
      roomKey: "other",
      pointFeet: [10.5, 1, 0],
      levelId: 1,
    },
    {
      ...data.nodes[0],
      id: "b",
      roomKey: "other",
      pointFeet: [18, 3, 0],
      levelId: 1,
    },
  ];
  data.edges = [
    {
      ...data.edges[0],
      id: "in",
      from: "a",
      to: "left",
      pointsFeet: [
        [2, 3, 0],
        [9.5, 1, 0],
      ],
      lengthMetres: 3,
    },
    {
      ...data.edges[0],
      id: "opening:recovered-circulation-seam:hall:other:0:0",
      kind: "opening",
      from: "left",
      to: "right",
      roomKeys: ["hall", "other"],
      pointsFeet: [
        [9.5, 1, 0],
        [10.5, 1, 0],
      ],
      lengthMetres: 0.3048,
      openingSpan: {
        version: 1,
        sourceModelSha256: data.source.modelSha256,
        levelId: 1,
        pointsFeet: [
          [10, 0.5, 0],
          [10, 1.5, 0],
        ],
        apertureFeet: rect(9, -0.5, 11, 2.5) as [Point, Point, Point, Point],
        nativeFloorElementIds: [100],
        walkingStripWidthFeet: 2,
      },
    },
    {
      ...data.edges[0],
      id: "out",
      from: "right",
      to: "b",
      roomKeys: ["other"],
      pointsFeet: [
        [10.5, 1, 0],
        [18, 3, 0],
      ],
      lengthMetres: 3,
    },
  ];
  data.circulationGeometry!.cells[0].roomKeys.push("other");
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  return data;
}
test("semantic corridor seams within one native cell do not impose artificial crossing-point doglegs", () => {
  const data = seamFixture(),
    before = JSON.stringify(data);
  const paths = centeredRoutePaths(data, data.edges, [
    "a",
    "left",
    "right",
    "b",
  ]);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].pointsFeet, [
    [2, 3, 0],
    [18, 3, 0],
  ]);
  assert.deepEqual(
    paths[0].edgeIds,
    data.edges.map((e) => e.id),
  );
  assert.equal(
    JSON.stringify(data),
    before,
    "graph thresholds and access metadata stay unchanged",
  );
});
test("real thresholds, access changes and stale/disconnected native cells cannot be treated as semantic seams", () => {
  for (const change of [
    (d: IndoorDataset) => {
      d.edges[1].id = "opening:native-open-front";
    },
    (d: IndoorDataset) => {
      d.edges[1].direction = "from-to";
    },
    (d: IndoorDataset) => {
      d.edges[1].enabled = false;
    },
    (d: IndoorDataset) => {
      d.records[1].access = "public";
      d.circulationGeometry!.sourceGeometryKey =
        nativeCirculationGeometryKey(d);
    },
    (d: IndoorDataset) => {
      d.records[1].circulation = false;
      d.circulationGeometry!.sourceGeometryKey =
        nativeCirculationGeometryKey(d);
    },
    (d: IndoorDataset) => {
      d.circulationGeometry!.sourceModelSha256 = "b".repeat(64);
    },
    (d: IndoorDataset) => {
      d.circulationGeometry!.cells[0].ringsFeet.push(rect(9.9, 0, 10.1, 2));
    },
  ]) {
    const data = seamFixture();
    change(data);
    const paths = centeredRoutePaths(data, data.edges, [
      "a",
      "left",
      "right",
      "b",
    ]);
    assert.ok(
      paths.length > 1 || paths[0].pointsFeet.length > 2,
      JSON.stringify(data.edges[1]),
    );
  }
});

function nativeApproachFixture(): IndoorDataset {
  const data = seamFixture();
  const approach = data.edges[1];
  approach.id = "native-circulation:left|right";
  delete approach.openingSpan;
  approach.pointsFeet = [
    [9.5, 1, 0],
    [9.5, 2, 0],
    [10, 2, 0],
    [10, 1.5, 0],
    [10.5, 1.5, 0],
    [10.5, 1, 0],
  ];
  approach.lengthMetres = 0.9144;
  return data;
}

test("native floor approaches join centered corridor guides without anchor zigzags in either direction", () => {
  for (const reverse of [false, true]) {
    const data = nativeApproachFixture();
    const before = JSON.stringify(data);
    const edges = reverse ? [...data.edges].reverse() : data.edges;
    const ids = reverse
      ? ["b", "right", "left", "a"]
      : ["a", "left", "right", "b"];
    const paths = centeredRoutePaths(data, edges, ids);
    assert.equal(paths.length, 3);
    assert.ok(
      paths.every(
        (p) => p.centered && p.nativeFloorSupported && p.nativeCirculationUsed,
      ),
    );
    assert.deepEqual(
      paths.flatMap((p, i) => (i ? p.pointsFeet.slice(1) : p.pointsFeet)),
      reverse
        ? [
            [18, 3, 0],
            [10.5, 3, 0],
            [9.5, 3, 0],
            [2, 3, 0],
          ]
        : [
            [2, 3, 0],
            [9.5, 3, 0],
            [10.5, 3, 0],
            [18, 3, 0],
          ],
    );
    assert.deepEqual(
      paths.flatMap((p) => p.edgeIds),
      edges.map((e) => e.id),
    );
    assert.equal(JSON.stringify(data), before);
  }
});

test("straightened native approach guides preserve building changes in directions", () => {
  const data = nativeApproachFixture();
  for (const node of data.nodes)
    node.building = node.roomKey === "hall" ? "Library" : "Agora";
  const nodeIds = ["a", "left", "right", "b"];
  const paths = centeredRoutePaths(data, data.edges, nodeIds);
  const steps = projectNavigationSteps(
    data,
    {
      edges: data.edges,
      nodeIds,
      paths,
      distanceMetres: 16 * 0.3048,
      sourceDistanceMetres: 7,
      unknownAccessAreas: [],
      unknownAccessibilityEdges: 0,
    },
    "Hall",
    "Other",
  );
  assert.deepEqual(
    [...new Set(steps.map((s) => s.building))],
    ["Library", "Agora"],
  );
  assert.ok(steps.some((s) => s.building === "Agora" && s.type === "straight"));
  assert.equal(
    steps.filter((s) => s.type === "turn" || s.type === "floor-change").length,
    0,
  );
});

test("native approach joins require current continuous ownership and retain physical or directed thresholds", () => {
  for (const change of [
    (d: IndoorDataset) => {
      d.edges[1].id = "unverified-opening";
    },
    (d: IndoorDataset) => {
      d.edges[1].direction = "from-to";
    },
    (d: IndoorDataset) => {
      d.edges[1].enabled = false;
    },
    (d: IndoorDataset) => {
      d.circulationGeometry!.sourceModelSha256 = "b".repeat(64);
    },
    (d: IndoorDataset) => {
      d.circulationGeometry!.cells[0].ringsFeet.push(rect(9.9, 0, 10.1, 2.5));
    },
    (d: IndoorDataset) => {
      d.records[1].access = "public";
      d.circulationGeometry!.sourceGeometryKey =
        nativeCirculationGeometryKey(d);
    },
  ]) {
    const data = nativeApproachFixture();
    change(data);
    const paths = centeredRoutePaths(data, data.edges, [
      "a",
      "left",
      "right",
      "b",
    ]);
    assert.ok(paths.length > 1, JSON.stringify(data.edges[1]));
    assert.ok(paths.some((p) => p.edgeIds.includes(data.edges[1].id)));
  }
});

test("a native approach with a certified finite aperture still crosses that aperture", () => {
  const data = nativeApproachFixture();
  data.edges[1].openingSpan = seamFixture().edges[1].openingSpan;
  const paths = centeredRoutePaths(data, data.edges, [
    "a",
    "left",
    "right",
    "b",
  ]);
  const points = paths.flatMap((p, i) =>
    i ? p.pointsFeet.slice(1) : p.pointsFeet,
  );
  const crossings = openingSpanCrossings(
    data.edges[1],
    data.edges[1].openingSpan!,
    points,
  );
  assert.ok(crossings.some((c) => c.forward));
  assert.ok(
    points.length > 2,
    "the finite threshold cannot move onto the unrestricted center lane",
  );
});

test("joining native approaches cannot straighten through a wall or column", () => {
  const data = nativeApproachFixture();
  const wall = rect(9.9, 2.5, 10.1, 5.5);
  const column = rect(12, 2.5, 13, 4.5);
  data.walls.push(
    { kind: "wall", nativeElementId: 103, levelId: 1, ringsFeet: [wall] },
    { kind: "column", nativeElementId: 104, levelId: 1, ringsFeet: [column] },
  );
  data.circulationGeometry!.cells[0].ringsFeet.push(wall, column);
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  const blocked = nativeRouteBlocker(
    { walls: [{ polygon: wall }], columns: [{ polygon: column }] },
    [],
  );
  assert.equal(blocked([2, 3], [18, 3]), true);
  const paths = centeredRoutePaths(data, data.edges, [
    "a",
    "left",
    "right",
    "b",
  ]);
  for (const path of paths)
    for (let i = 1; i < path.pointsFeet.length; i++)
      assert.equal(
        blocked(
          path.pointsFeet[i - 1].slice(0, 2) as Point,
          path.pointsFeet[i].slice(0, 2) as Point,
        ),
        false,
      );
});
test("one accepted native fragment retains the physically clipped remainder of the same source area", () => {
  const data = fixture();
  data.circulationGeometry!.preparedRoomKeys = ["hall"];
  data.circulationGeometry!.cells[0].ringsFeet = [rect(0, 0, 4, 6)];
  data.circulationGeometry!.reviewSurfaces = [
    {
      roomKey: "hall",
      levelId: 1,
      elevationFeet: 0,
      ringsFeet: [rect(12, 0, 20, 6)],
    },
  ];
  const surface = nativeCirculationSurfaces(data, data.records);
  assert.equal(surface.rings.length, 2);
  assert.deepEqual(
    surface.rings[1],
    data.circulationGeometry!.reviewSurfaces[0].ringsFeet,
  );
  const display = projectDisplayGeometry(data, [1], "all", "", true, false);
  assert.ok(
    display.areas.features.some(
      (f) => f.properties?.boundarySource === "native-floor-clipped-review",
    ),
  );
  assert.ok(
    !display.areas.features.some((f) => f.id === "hall"),
    "raw source contour cannot restore unsupported middle",
  );
  validateNativeCirculationGeometry(data);
  data.circulationGeometry!.reviewSurfaces[0].roomKey = "foreign";
  assert.throws(
    () => validateNativeCirculationGeometry(data),
    /review surface/,
  );
});
test("a legacy walk cannot cross a thin excluded fixture in a regenerated circulation area", () => {
  const data = fixture();
  data.circulationGeometry!.preparedRoomKeys = ["hall"];
  data.circulationGeometry!.cells[0].ringsFeet.push(rect(9.99, 1, 10.01, 5.5));
  const graph = projectRoutingGraph(data);
  assert.ok(!graph.adjacency.get("a")?.some((l) => l.edge.id === "walk"));
  assert.ok(
    graph.allAdjacency
      .get("a")
      ?.some((l) =>
        l.blockers.some((b) => b.kind === "native-circulation-proof"),
      ),
  );
});
test("native fixture caps render as solid blocks and invalidate with source geometry", () => {
  const data = fixture();
  data.circulationGeometry!.fixtures = [
    {
      id: "native-fixture:140:0",
      nativeElementId: 140,
      levelIds: [1],
      elevationFeet: 0,
      heightFeet: 3,
      ringsFeet: [rect(2, 2, 4, 4)],
    },
  ];
  validateNativeCirculationGeometry(data);
  const display = projectDisplayGeometry(data, [1], "all", "", true, false);
  const blocks = display.roomBlocks.features.filter(
    (f) => f.properties?.boundarySource === "prepared-native-fixture",
  );
  assert.equal(blocks.length, 1);
  assert.equal(
    display.areas.features.filter(
      (f) => f.properties?.boundarySource === "prepared-native-fixture",
    ).length,
    1,
  );
  assert.equal(blocks[0].properties?.nativeElementId, 140);
  assert.equal(blocks[0].properties?.walkable, false);
  const cap = blocks[0].geometry.coordinates[0][0];
  assert.deepEqual(cap[0], cap.at(-1));
  data.records[0].ringsFeet = [rect(1, 1, 10, 3)];
  assert.equal(
    nativeCirculationSurfaces(data, data.records).fixtures.length,
    0,
  );
  data.circulationGeometry!.fixtures![0].levelIds = [999];
  assert.throws(
    () => validateNativeCirculationGeometry(data),
    /fixture geometry/,
  );
});

test("local boundary indexing retains union support, holes, disconnected gaps and elevation isolation", () => {
  const d = fixture();
  d.circulationGeometry!.preparedRoomKeys = ["hall"];
  d.circulationGeometry!.cells[0].ringsFeet = [
    rect(0, 0, 64, 6),
    rect(31.999, 1, 32.001, 5),
  ];
  d.circulationGeometry!.reviewSurfaces = [
    {
      roomKey: "hall",
      levelId: 1,
      elevationFeet: 0,
      ringsFeet: [rect(64, 0, 96, 6)],
    },
    {
      roomKey: "hall",
      levelId: 1,
      elevationFeet: 12,
      ringsFeet: [rect(96, 0, 128, 6)],
    },
  ];
  const edge = d.edges[0];
  const walk = (id: string, pointsFeet: [number, number, number][]) => ({
    ...edge,
    id,
    pointsFeet,
  });
  d.edges = [
    walk("thin-hole", [
      [30, 3, 0],
      [34, 3, 0],
    ]),
    walk("supported-seam", [
      [62, 3, 0],
      [66, 3, 0],
    ]),
    walk("floor-boundary", [
      [64, 0, 0],
      [64, 6, 0],
    ]),
    walk("upper-floor-cannot-fill-gap", [
      [90, 3, 0],
      [110, 3, 0],
    ]),
    walk("long-segment", [
      [0, 0, 0],
      [96, 0, 0],
    ]),
  ];
  assert.deepEqual([...nativeCirculationWalkBlockers(d)].sort(), [
    "thin-hole",
    "upper-floor-cannot-fill-gap",
  ]);
  d.circulationGeometry!.reviewSurfaces[0].ringsFeet = [rect(70, 0, 96, 6)];
  assert.ok(
    nativeCirculationWalkBlockers(d).has("supported-seam"),
    "changed rings must rebuild their bounds",
  );
});
