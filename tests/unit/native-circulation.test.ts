import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import test from "node:test";
import {
  routingSnapshot,
  withRoutingCalculation,
} from "../../app/indoor-project/routing-cache";
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
import { nativeAuthoredStairRoleFixture } from "../fixtures/native-authored-stair-role";
import { nativeAuthoredStairTreadRolesHash } from "../../app/indoor-project/native-authored-stair-treads";
type Point = [number, number];
test("scoped walk validation agrees with the full blocker set and cannot pollute it", async () => {
  const data = fixture();
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const source = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rect(0, 0, 20, 6)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4, 8],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  data.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  data.circulationGeometry!.preparedRoomKeys = ["hall"];
  const cell = data.circulationGeometry!.cells[0];
  data.edges = [
    {
      ...data.edges[0],
      id: "supported",
      nativeCellId: cell.id,
      pointsFeet: [
        [2, 2, 0],
        [18, 2, 0],
      ],
    },
    {
      ...data.edges[0],
      id: "unsupported",
      nativeCellId: cell.id,
      pointsFeet: [
        [2, 2, 0],
        [22, 2, 0],
      ],
    },
    { ...data.edges[0], id: "old-outline", nativeCellId: undefined },
  ];
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  compileLiteralFixtureTopology(data);
  const full = nativeCirculationWalkBlockers(data);
  assert.equal(full.has("supported"), false);
  assert.equal(full.has("unsupported"), true);
  assert.equal(full.has("old-outline"), true);
  for (const edge of data.edges)
    assert.deepEqual(
      [...nativeCirculationWalkBlockers(data, [edge])],
      [...full].filter((id) => id === edge.id),
    );
  assert.deepEqual(nativeCirculationWalkBlockers(data, []), new Set());
  assert.deepEqual(nativeCirculationWalkBlockers(data), full);
  data.circulationGeometry!.sourceGeometryKey = "stale";
  assert.deepEqual(
    [...nativeCirculationWalkBlockers(data, [data.edges[0]])],
    ["supported"],
  );
});
test("source and worker circulation bindings retain full authored physical roles and detect in-place mutation", async () => {
  const data = fixture(),
    legacyKey = nativeCirculationGeometryKey(data);
  const { routeWorkerDataset } = await import(
    "../../app/indoor-project/route-worker-dataset"
  );
  const roles = nativeAuthoredStairRoleFixture();
  data.nativeSourceStairMaterials = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    flights: [],
    authoredTreadRoles: roles,
  };
  const originalKey = nativeCirculationGeometryKey(data);
  assert.notEqual(originalKey, legacyKey);
  assert.equal(
    compilerKey(data as Parameters<typeof compilerKey>[0]),
    originalKey,
  );
  const workerData = routeWorkerDataset(data);
  assert.deepEqual(
    workerData.nativeSourceStairMaterials?.authoredTreadRoles,
    roles,
  );
  assert.equal(nativeCirculationGeometryKey(workerData), originalKey);
  // An actual primitive changes even if a stale declared SHA is retained.
  roles.runs[0].faces[0].originalTrianglesFeet[0][0][0] += 0.01;
  assert.notEqual(nativeCirculationGeometryKey(data), originalKey);
  roles.geometrySha256 = nativeAuthoredStairTreadRolesHash(roles);
  assert.equal(
    compilerKey(data as Parameters<typeof compilerKey>[0]),
    nativeCirculationGeometryKey(data),
  );
  delete data.nativeSourceStairMaterials;
  assert.equal(nativeCirculationGeometryKey(data), legacyKey);
});
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
function compileLiteralFixtureTopology(data: IndoorDataset) {
  if (!data.nativeIndoorEnvelopes || !data.circulationGeometry) return;
  // These rectangles are literal independent test geometry, not old prepared
  // campus cells being rebound. Production always regenerates from originals.
  const geometry = data.circulationGeometry;
  geometry.exactTopology = encodeNativeExactTopology(
    {
      sourceModelSha256: data.source.modelSha256,
      sourceGeometryKey: geometry.sourceGeometryKey,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    geometry.cells.map((c) => {
      c.exactFaceId = `fixture-face:${c.id}`;
      return {
        id: c.exactFaceId,
        parts: nativeRationalOverlay("union", [c.ringsFeet]),
      };
    }),
  );
}
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
  compileLiteralFixtureTopology(data);
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
      compileLiteralFixtureTopology(d);
    },
    (d: IndoorDataset) => {
      d.records[1].circulation = false;
      d.circulationGeometry!.sourceGeometryKey =
        nativeCirculationGeometryKey(d);
      compileLiteralFixtureTopology(d);
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
      compileLiteralFixtureTopology(d);
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
  compileLiteralFixtureTopology(data);
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

test("strict native evidence never restores legacy route or contour surfaces after a stale mutation", async () => {
  const data = fixture();
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const source = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rect(0, 0, 20, 6)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4, 8],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  data.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  assert.equal(nativeCirculationGeometryKey(data), compilerKey(data));
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  compileLiteralFixtureTopology(data);
  assert.ok(nativeCirculationSurfaces(data, data.records).cells.length);
  assert.ok(
    nativeCirculationWalkBlockers(data).has("walk"),
    "legacy outline branches require native regeneration",
  );
  const snapshot = routingSnapshot(data);
  const beforeAperture = nativeCirculationGeometryKey(data);
  data.doorAperturePatchState = { regenerated: true, sourceGeometryKey: "[]" };
  assert.equal(nativeCirculationGeometryKey(data), compilerKey(data));
  assert.notEqual(
    nativeCirculationGeometryKey(data),
    beforeAperture,
    "checked cap-aperture composition binds native cells",
  );
  assert.notEqual(
    routingSnapshot(data),
    snapshot,
    "an aperture state mutation invalidates private policy binding",
  );
  delete data.doorAperturePatchState;
  data.nativeIndoorEnvelopes.levels[0]!.partsFeet[0]![0]![0]![0] += 0.1;
  assert.notEqual(
    routingSnapshot(data),
    snapshot,
    "mutable authoring graph and guide caches recheck envelope geometry",
  );
  assert.deepEqual(nativeCirculationCells(data), []);
  assert.deepEqual(
    nativeCirculationSurfaces(data, data.records).rings,
    [],
    "old source outlines cannot return as physical routing geometry",
  );
  assert.ok(nativeCirculationWalkBlockers(data).has("walk"));
});

test("strict native branches cannot borrow an adjacent cell to extend their certified face", async () => {
  const data = fixture();
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const source = {
    version: 1 as const,
    sourceModelSha256: data.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rect(0, 0, 20, 6)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4, 8],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  data.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  const cell = data.circulationGeometry!.cells[0]!;
  cell.ringsFeet = [rect(0, 0, 10, 6)];
  data.circulationGeometry!.preparedRoomKeys = ["hall"];
  data.circulationGeometry!.cells.push({
    ...cell,
    id: cell.id + ":adjacent",
    ringsFeet: [rect(10, 0, 20, 6)],
  });
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  compileLiteralFixtureTopology(data);
  data.edges[0]!.nativeCellId = cell.id;
  assert.ok(
    nativeCirculationWalkBlockers(data).has("walk"),
    "a continuous but unrelated adjacent face cannot certify this native branch",
  );
  data.edges[0]!.pointsFeet = [
    [2, 2, 0],
    [8, 2, 0],
  ];
  assert.ok(
    !nativeCirculationWalkBlockers(data).has("walk"),
    "the unchanged exact own-face route remains available",
  );
});

test("separate derived frame coordinates invalidate cells and worker caches without changing absent-descriptor legacy bytes", async () => {
  const { routeWorkerDataset } = await import(
    "../../app/indoor-project/route-worker-dataset"
  );
  const data = fixture();
  const oldKey = nativeCirculationGeometryKey(data),
    oldSnapshot = routingSnapshot(data);
  assert.equal(compilerKey(data), oldKey);
  // This is a binding-only mutation fixture, not an authorized material recipe.
  const descriptor = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    geometrySha256: "a".repeat(64),
    rows: [
      {
        partsFeet: [[rect(1, 0, 2, 1)]],
        baseElevationFeet: 0,
        topElevationFeet: 0.164,
      },
    ],
  } as unknown as NonNullable<IndoorDataset["nativeDerivedFrameReturns"]>;
  data.nativeDerivedFrameReturns = descriptor;
  const added = nativeCirculationGeometryKey(data);
  assert.notEqual(added, oldKey);
  assert.equal(compilerKey(data), added);
  assert.notEqual(routingSnapshot(data), oldSnapshot);
  assert.equal(
    nativeCirculationCells(data).length,
    0,
    "old physical cells cannot be reused after a new material layer",
  );
  const projected = routeWorkerDataset(data);
  assert.deepEqual(
    projected.nativeDerivedFrameReturns,
    descriptor,
    "routing worker retains complete finite material proof",
  );
  assert.equal(nativeCirculationGeometryKey(projected), added);
  descriptor.rows[0]!.partsFeet[0]![0]![0]![0] += 0.01;
  assert.notEqual(
    nativeCirculationGeometryKey(data),
    added,
    "changed coordinates invalidate even when declared SHA stays unchanged",
  );
  delete data.nativeDerivedFrameReturns;
  assert.equal(nativeCirculationGeometryKey(data), oldKey);
  assert.equal(routingSnapshot(data), oldSnapshot);
});

test("same-original-slab aliases accept only certified own doorway halves, never foreign masks or floor holes", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const { nativeCellSharedFloorAlias } = await import(
    "../../app/indoor-project/native-circulation"
  );
  const data = fixture(),
    source = {
      version: 1 as const,
      sourceModelSha256: data.source.modelSha256,
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          partsFeet: [[rect(0, 0, 20, 6)]],
          sourceElementIds: [100],
          cutElevationsFeet: [4, 8],
          evidenceSha256: "b".repeat(64),
        },
      ],
    };
  data.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  data.records.push({
    ...data.records[0],
    key: "right",
    ringsFeet: [rect(10, 0, 20, 6)],
  });
  data.nodes[0].surfaceId = "original-room";
  data.nodes[1] = {
    ...data.nodes[1],
    kind: "portal",
    surfaceId: "original-door",
    pointFeet: [9.5, 2, 0],
  };
  data.nodes.push({
    ...data.nodes[1],
    id: "other",
    roomKey: "right",
    pointFeet: [10.5, 2, 0],
  });
  data.walls.push({
    kind: "wall",
    nativeElementId: 103,
    levelId: 1,
    ringsFeet: [rect(9, 0, 11, 6)],
  });
  data.doors!.push({
    id: "door",
    nativeElementId: 104,
    hostWallNativeElementId: 103,
    levelId: 1,
    state: "connected",
    roomKeys: ["hall", "right"],
    pointFeet: [10, 2],
    normalFeet: [1, 0],
    footprintFeet: rect(9, 1, 11, 3),
  } as NonNullable<IndoorDataset["doors"]>[number]);
  data.edges[0].pointsFeet = [
    [2, 2, 0],
    [9.5, 2, 0],
  ];
  data.edges[0].nativeCellId = "native-cell";
  data.edges.push({
    id: "door",
    nativeElementId: 104,
    from: "b",
    to: "other",
    kind: "door",
    evidence: "Measured original door",
    roomKeys: ["hall", "right"],
    enabled: true,
    accessible: "unknown",
    lengthMetres: 0.3048,
    pointsFeet: [
      [9.5, 2, 0],
      [10.5, 2, 0],
    ],
  });
  data.circulationGeometry!.cells[0].ringsFeet = [rect(0, 0, 9, 6)];
  data.circulationGeometry!.preparedRoomKeys = ["hall", "right"];
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  compileLiteralFixtureTopology(data);
  assert.ok(
    nativeCellSharedFloorAlias(data, data.edges[0]),
    "unchanged own portal sits outside masked face but on the same checked physical slab and enclosure",
  );
  data.walls.push({
    kind: "wall",
    nativeElementId: 105,
    levelId: 1,
    ringsFeet: [rect(9.2, 1, 9.200_000_01, 3)],
  });
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  compileLiteralFixtureTopology(data);
  assert.equal(
    nativeCellSharedFloorAlias(data, data.edges[0]),
    false,
    "arbitrarily thin foreign material blocks the entire approach",
  );
  data.walls.pop();
  data.walkingSupport!.floors[0].ringsFeet.push(rect(9.2, 1, 9.200_000_01, 3));
  data.circulationGeometry!.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  compileLiteralFixtureTopology(data);
  assert.equal(
    nativeCellSharedFloorAlias(data, data.edges[0]),
    false,
    "an actual native floor hole cannot be supplied by a source portal alias",
  );
});

test("a rehashed prepared carrier cannot erase a current original floor hole or foreign material", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const d = fixture(),
    source = {
      version: 1 as const,
      sourceModelSha256: d.source.modelSha256,
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          partsFeet: [[rect(0, 0, 20, 6)]],
          sourceElementIds: [100],
          cutElevationsFeet: [4, 8],
          evidenceSha256: "b".repeat(64),
        },
      ],
    };
  d.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  d.circulationGeometry!.preparedRoomKeys = ["hall"];
  d.edges[0].nativeCellId = d.circulationGeometry!.cells[0].id;
  d.edges[0].pointsFeet = [
    [2, 2, 0],
    [18, 2, 0],
  ];
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  compileLiteralFixtureTopology(d);
  assert.ok(!nativeCirculationWalkBlockers(d).has("walk"));
  // Independently current physical floor changes; malicious recomputation of
  // the prepared checksum still cannot replace actual source support.
  d.walkingSupport!.floors[0].ringsFeet.push(rect(9, 1, 9 + 1e-12, 3));
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  compileLiteralFixtureTopology(d);
  assert.ok(nativeCirculationWalkBlockers(d).has("walk"));
  d.walkingSupport!.floors[0].ringsFeet.pop();
  d.walls.push({
    levelId: 1,
    nativeElementId: 99,
    kind: "wall",
    ringsFeet: [rect(9, 1, 9 + 1e-12, 3)],
  });
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  compileLiteralFixtureTopology(d);
  assert.ok(nativeCirculationWalkBlockers(d).has("walk"));
});
test("source-face majority keeps contained restricted identities unavailable despite forged public roomKeys", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const d = fixture(),
    source = {
      version: 1 as const,
      sourceModelSha256: d.source.modelSha256,
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          partsFeet: [[rect(0, 0, 20, 6)]],
          sourceElementIds: [100],
          cutElevationsFeet: [4, 8],
          evidenceSha256: "b".repeat(64),
        },
      ],
    };
  d.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  d.records.push({
    ...d.records[0],
    key: "private",
    access: "staff",
    circulation: false,
    ringsFeet: [rect(3, 3, 4, 4)],
  });
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  compileLiteralFixtureTopology(d);
  assert.deepEqual(nativeCirculationCells(d), []);
  d.records.at(-1)!.ringsFeet = [rect(3, 3, 3.125, 3.125)];
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  compileLiteralFixtureTopology(d);
  assert.deepEqual(
    nativeCirculationCells(d),
    [],
    "a wholly contained 0.015625 square-foot restricted identity still vetoes the shared face",
  );
  d.records.at(-1)!.access = "public";
  d.records.at(-1)!.walkable = false;
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  compileLiteralFixtureTopology(d);
  assert.deepEqual(
    nativeCirculationCells(d),
    [],
    "a positive nonwalkable claim cannot disappear below a numerical area cutoff",
  );
});
test("protected access intersection retains tiny native holes, tangency and complete face majority", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const epsilon = 2 ** -40;
  const cases = [
    {
      name: "an identity entirely in a tiny excluded hole has no material overlap",
      face: [rect(0, 0, 20, 10), rect(10, 2, 10 + epsilon, 2 + epsilon)],
      identity: rect(10, 2, 10 + epsilon, 2 + epsilon),
      blocked: false,
    },
    {
      name: "half of a tiny identity outside the hole still reaches the exact majority",
      face: [rect(0, 0, 20, 10), rect(10, 2, 10 + epsilon, 2 + epsilon)],
      identity: rect(10 - epsilon, 2, 10 + epsilon, 2 + epsilon),
      blocked: true,
    },
    {
      name: "a finite outer tangency is not a positive-area access claim",
      face: [rect(0, 0, 20, 10), rect(1, 1, 10, 9)],
      identity: rect(20, 0, 21, 10),
      blocked: false,
    },
    {
      name: "a pruned distant hole still reduces the whole face majority denominator",
      face: [rect(0, 0, 20, 10), rect(1, 1, 10, 9)],
      identity: rect(11, 0, 60, 10),
      blocked: true,
    },
  ];
  for (const example of cases) {
    const d = fixture();
    const source = {
      version: 1 as const,
      sourceModelSha256: d.source.modelSha256,
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          partsFeet: [[rect(0, 0, 80, 12)]],
          sourceElementIds: [100],
          cutElevationsFeet: [4, 8],
          evidenceSha256: "b".repeat(64),
        },
      ],
    };
    d.nativeIndoorEnvelopes = {
      ...source,
      geometrySha256: await nativeIndoorEnvelopeHash(source),
    };
    d.circulationGeometry!.cells[0].ringsFeet = example.face;
    d.records.push({
      ...d.records[0],
      key: "protected",
      access: "staff",
      circulation: false,
      ringsFeet: [example.identity],
    });
    d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
    compileLiteralFixtureTopology(d);
    assert.equal(
      withRoutingCalculation(d, () => nativeCirculationCells(d).length === 0),
      example.blocked,
      example.name,
    );
  }
});
test("operation-local normalized protected identity is invalidated by in-place identity and access edits", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const d = fixture();
  const source = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rect(0, 0, 80, 12)]],
        sourceElementIds: [100],
        cutElevationsFeet: [4, 8],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  d.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  const identity: IndoorDataset["records"][number] = {
    ...d.records[0],
    key: "protected",
    access: "staff",
    circulation: false,
    ringsFeet: [rect(3, 3, 4, 4)],
  };
  d.records.push(identity);
  const cells = () => {
    d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
    compileLiteralFixtureTopology(d);
    return withRoutingCalculation(d, () => nativeCirculationCells(d));
  };
  assert.equal(cells().length, 0);
  const expanded = rect(19, 3, 60, 4);
  identity.ringsFeet[0].forEach((point, i) => {
    point[0] = expanded[i][0];
    point[1] = expanded[i][1];
  });
  assert.equal(
    cells().length,
    1,
    "the old normalized one-square-foot claim cannot survive a new calculation",
  );
  identity.ringsFeet = [rect(3, 3, 4, 4)];
  identity.access = "public";
  assert.equal(
    cells().length,
    1,
    "a changed public access policy is rechecked",
  );
  identity.access = "staff";
  assert.equal(
    cells().length,
    0,
    "restoring staff access restores the exact veto",
  );
});
test("rehashed native face cannot erase independently replayed original typed tread material", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const d = fixture(),
    source = {
      version: 1 as const,
      sourceModelSha256: d.source.modelSha256,
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          partsFeet: [[rect(0, 0, 20, 6)]],
          sourceElementIds: [100],
          cutElevationsFeet: [4, 8],
          evidenceSha256: "b".repeat(64),
        },
      ],
    };
  d.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  const roles = nativeAuthoredStairRoleFixture();
  for (const face of roles.runs[0].faces) {
    for (const t of face.originalTrianglesFeet)
      for (const p of t) {
        p[0] += 8;
        p[1] += 1;
      }
    if (face.typed) {
      face.typed.origin[0] += 8;
      face.typed.origin[1] += 1;
      for (const l of [face.typed.startLine, face.typed.endLine]) {
        l.origin[0] += 8;
        l.origin[1] += 1;
      }
    }
  }
  roles.geometrySha256 = nativeAuthoredStairTreadRolesHash(roles);
  d.nativeSourceStairMaterials = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    flights: [],
    authoredTreadRoles: roles,
  };
  d.edges[0].nativeCellId = d.circulationGeometry!.cells[0].id;
  d.edges[0].pointsFeet = [
    [2, 1.5, 0],
    [18, 1.5, 0],
  ];
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  compileLiteralFixtureTopology(d);
  assert.ok(nativeCirculationWalkBlockers(d).has("walk"));
});

test("worker projection preserves exact carrier and immutable preparations while a later edit gets fresh validation", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const { routeWorkerDataset } = await import(
    "../../app/indoor-project/route-worker-dataset"
  );
  const { withRoutingCalculation, createImmutableRoutingSession } =
    await import("../../app/indoor-project/routing-cache");
  const { nativeCirculationExactIndex } = await import(
    "../../app/indoor-project/native-circulation"
  );
  const d = fixture(),
    source = {
      version: 1 as const,
      sourceModelSha256: d.source.modelSha256,
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          partsFeet: [[rect(0, 0, 20, 6)]],
          sourceElementIds: [100],
          cutElevationsFeet: [4, 8],
          evidenceSha256: "b".repeat(64),
        },
      ],
    };
  d.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  d.circulationGeometry!.preparedRoomKeys = ["hall"];
  d.edges[0].nativeCellId = d.circulationGeometry!.cells[0].id;
  d.edges[0].pointsFeet = [
    [2, 2, 0],
    [18, 2, 0],
  ];
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  compileLiteralFixtureTopology(d);
  const projected = structuredClone(routeWorkerDataset(d));
  assert.deepEqual(
    projected.circulationGeometry!.exactTopology,
    d.circulationGeometry!.exactTopology,
  );
  assert.equal(nativeCirculationGeometryKey(projected), compilerKey(d));
  const session = createImmutableRoutingSession(projected);
  const first = session(() => nativeCirculationExactIndex(projected));
  for (let i = 0; i < 25; i++)
    session(() => {
      assert.equal(nativeCirculationExactIndex(projected), first);
      assert.ok(!nativeCirculationWalkBlockers(projected).has("walk"));
    });
  const originalSnapshot = routingSnapshot(d);
  d.circulationGeometry!.exactTopology!.coordinates[0].x[0] = "17";
  assert.notEqual(routingSnapshot(d), originalSnapshot);
  assert.throws(
    () => withRoutingCalculation(d, () => nativeCirculationExactIndex(d)),
    /checksum|native ring|rings|polygon|hole/,
  );
});
test("worker retains current native tread vetoes but omits contained drawing buffers and never binds authoring history", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const { routeWorkerDataset } = await import(
    "../../app/indoor-project/route-worker-dataset"
  );
  const { prepareNativeContainedCellDisplay } = await import(
    "../../app/indoor-project/native-contained-cell-display"
  );
  const { createNativeExactTopologyIndex } = await import(
    "../../app/indoor-project/native-exact-planar-topology"
  );
  const d = fixture(),
    source = {
      version: 1 as const,
      sourceModelSha256: d.source.modelSha256,
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          partsFeet: [[rect(0, 0, 20, 6)]],
          sourceElementIds: [100],
          cutElevationsFeet: [4, 8],
          evidenceSha256: "b".repeat(64),
        },
      ],
    };
  d.nativeIndoorEnvelopes = {
    ...source,
    geometrySha256: await nativeIndoorEnvelopeHash(source),
  };
  d.stairDisplay = {
    version: 1,
    generator: "reviter/native-stair-display-1",
    sourceModelSha256: d.source.modelSha256,
    flights: [],
    sourceFlights: [
      {
        stairElementId: 20,
        levelIds: [1],
        buildings: ["1"],
        floorElevationFeet: 0,
        sourceGeometry: "native-cache",
        treads: [
          { runElementId: 10, elevationFeet: 1, ringFeet: rect(8, 1, 12, 2) },
        ],
      },
    ],
  };
  const key = nativeCirculationGeometryKey(d);
  d.stairDisplay.sourceFlights![0].historicalPreparedTreads = [
    { runElementId: 10, elevationFeet: 4, ringFeet: rect(0, 0, 20, 6) },
  ];
  assert.equal(nativeCirculationGeometryKey(d), key);
  assert.equal(compilerKey(d), key);
  d.circulationGeometry!.sourceGeometryKey = key;
  compileLiteralFixtureTopology(d);
  const carrier = d.circulationGeometry!.exactTopology!,
    cell = d.circulationGeometry!.cells[0];
  const parts = createNativeExactTopologyIndex(carrier, {
    sourceModelSha256: d.source.modelSha256,
    sourceGeometryKey: key,
    kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  }).parts(cell.exactFaceId!)!;
  cell.containedDisplay = prepareNativeContainedCellDisplay(
    cell.id,
    parts,
  ).display;
  const worker = routeWorkerDataset(d);
  assert.equal(
    worker.circulationGeometry!.cells[0].containedDisplay,
    undefined,
  );
  assert.deepEqual(worker.circulationGeometry!.exactTopology, carrier);
  assert.equal(nativeCirculationGeometryKey(worker), key);
  assert.deepEqual(
    worker.stairDisplay!.sourceFlights![0].treads,
    d.stairDisplay.sourceFlights![0].treads,
  );
  d.stairDisplay.sourceFlights![0].treads[0].ringFeet[0][0] += 1e-4;
  assert.notEqual(nativeCirculationGeometryKey(d), key);
});
