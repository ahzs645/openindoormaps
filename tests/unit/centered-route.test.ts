import { recoverNativeWallJunctionRepairs as sourceJoints } from "../../../reviter/lib/reviter/native-room-presentation.ts";
import { recoverNativeWallJunctionRepairs as visitorJoints } from "../../app/indoor-project/native-joint-barriers";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import { routeLanes } from "../../app/indoor-project/route-lanes";
import { centeredRoutePaths } from "../../app/indoor-project/centered-route";
import {
  createDoorPassageQuery,
  walkPassages,
} from "../../app/indoor-project/route-passages";
import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";
import type {
  IndoorDataset,
  IndoorRecord,
  IndoorEdge,
  IndoorNode,
} from "../../app/indoor-project/contract";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import { findProjectRoute } from "../../app/indoor-project/routing";
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

function spanFixture(): IndoorDataset {
  const d = fixture(0);
  const edge = d.edges.find((e) => e.id === "door")!;
  edge.kind = "opening";
  d.doors = [];
  d.walls = d.walls.filter((w) => w.nativeElementId !== 4);
  d.walls.push(
    {
      kind: "wall",
      levelId: 1,
      nativeElementId: 40,
      ringsFeet: [rect(0, 7.8, 1, 0.4)],
    },
    {
      kind: "wall",
      levelId: 1,
      nativeElementId: 41,
      ringsFeet: [rect(7, 7.8, 1, 0.4)],
    },
  );
  d.source.modelSha256 = "span-model";
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: "span-model",
    floors: [
      {
        nativeElementId: 501,
        elevationFeet: 0,
        ringsFeet: [
          [
            [0, 0],
            [20, 0],
            [20, 8],
            [8, 8],
            [8, 30],
            [0, 30],
          ],
        ],
      },
    ],
  };
  edge.openingSpan = {
    version: 1,
    sourceModelSha256: "span-model",
    levelId: 1,
    pointsFeet: [
      [2, 8, 0],
      [6, 8, 0],
    ],
    apertureFeet: rect(1, 7, 6, 2),
    nativeFloorElementIds: [501],
    walkingStripWidthFeet: 2,
  };
  return d;
}

function sourceDoorFixture(): IndoorDataset {
  const d = spanFixture(),
    edge = d.edges.find((e) => e.id === "door")!;
  edge.id = "source-door:source-dwg:fixture-section:7";
  edge.kind = "door";
  delete edge.openingSpan;
  edge.accessible = "unknown";
  for (const r of d.records)
    r.properties.dwg = { sha256: "source-dwg", sectionId: "fixture-section" };
  edge.sourceDoorProof = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    sourceSha256: "source-dwg",
    sectionId: "fixture-section",
    registrationErrorFeet: 0,
    levelId: 1,
    elevationFeet: 0,
    nativeFloorElementIds: [501],
    wallSegmentIndices: [2, 3],
    doorSymbolSegmentIndices: [7, 8],
    doorSymbolCollection: "wallSegments",
    apertureFeet: rect(1, 7, 6, 2),
    walkingStripWidthFeet: 2,
  };
  return d;
}

test("a source-proved door has a fixed threshold without a manufactured native element or step-free claim", async () => {
  const { routingDoorApertures } = await import(
    "../../app/indoor-project/routing-apertures"
  );
  const d = sourceDoorFixture(),
    edge = d.edges.find((e) => e.sourceDoorProof)!;
  const route = findProjectRoute(d, "a", "b")!;
  assert.ok(route);
  const fixed = route.paths.find(
    (p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id,
  )!;
  assert.ok(fixed);
  assert.equal(fixed.sourceReason, "source-door");
  assert.deepEqual(fixed.pointsFeet, edge.pointsFeet);
  assert.equal(edge.nativeElementId, undefined);
  assert.deepEqual(d.doors, []);
  assert.equal(routingDoorApertures(d)[0].nativeElementId, undefined);
  assert.ok(route.doorEdgeIds);
  assert.ok(route.doorEdgeIds.includes(edge.id));
  assert.ok(
    createDoorPassageQuery(d)(1, fixed.pointsFeet).some(
      (c) => c.edge.id === edge.id && c.forward,
    ),
  );
  assert.equal(findProjectRoute(d, "a", "b", "accessible"), null);
  edge.direction = "from-to";
  assert.equal(findProjectRoute(d, "b", "a"), null);
  edge.enabled = false;
  assert.equal(findProjectRoute(d, "a", "b"), null);
});

test("implicit walking branches cannot bypass a closed, foreign or unsupported source doorway", async () => {
  const { createProjectRouteDiagnostics } = await import(
    "../../app/indoor-project/route-diagnostics"
  );
  const d = sourceDoorFixture(),
    edge = d.edges.find((e) => e.sourceDoorProof)!;
  d.edges.push({
    ...edge,
    id: "walking-across-source-door",
    kind: "walk",
    sourceDoorProof: undefined,
  });
  assert.ok(findProjectRoute(d, "a", "b"));
  edge.enabled = false;
  assert.equal(
    findProjectRoute(d, "a", "b"),
    null,
    "a walking branch retains the actual source threshold closure",
  );
  edge.enabled = true;
  const inspector = createProjectRouteDiagnostics(d);
  (d.records[0].properties.dwg as { sha256: string }).sha256 =
    "another-drawing";
  assert.equal(findProjectRoute(d, "a", "b"), null);
  assert.ok(
    inspector.inspect("a", "b").blockers.some((b) => b.kind === "source-proof"),
  );
  (d.records[0].properties.dwg as { sha256: string }).sha256 = "source-dwg";
  assert.ok(findProjectRoute(d, "a", "b"));
  const thresholdNode = d.nodes.find((n) => n.id === edge.from)!;
  thresholdNode.pointFeet[2] += 1;
  assert.equal(
    findProjectRoute(d, "a", "b"),
    null,
    "moving a threshold to another physical height invalidates its cached source proof",
  );
  assert.ok(
    inspector.inspect("a", "b").blockers.some((b) => b.kind === "source-proof"),
  );
  thresholdNode.pointFeet[2] -= 1;
  assert.ok(findProjectRoute(d, "a", "b"));
  d.walkingSupport!.floors[0].nativeElementId = 502;
  assert.equal(
    findProjectRoute(d, "a", "b"),
    null,
    "an in-place native-floor identity edit invalidates the aperture dependency",
  );
});

test("a model-bound finite doorless span permits centering with local full-width crossing proof", async () => {
  const { openingSpanCrossings } = await import(
    "../../app/indoor-project/opening-span"
  );
  const d = spanFixture(),
    edge = d.edges.find((e) => e.id === "door")!;
  const route = findProjectRoute(d, "a", "b")!;
  assert.ok(route);
  const path = route.paths.find((p) => p.edgeIds.includes(edge.id))!;
  assert.equal(path.centered, true);
  assert.equal(path.openingSpanSupported, true);
  assert.equal(path.nativeFloorSupported, true);
  assert.ok(
    openingSpanCrossings(edge, edge.openingSpan!, path.pointsFeet).some(
      (c) => c.forward,
    ),
  );
  const reverse = findProjectRoute(d, "b", "a")!;
  assert.ok(reverse.paths.some((p) => p.openingSpanSupported));
  assert.ok(
    openingSpanCrossings(
      edge,
      edge.openingSpan!,
      reverse.paths.find((p) => p.edgeIds.includes(edge.id))!.pointsFeet,
    ).some((c) => !c.forward),
  );
  edge.direction = "from-to";
  assert.equal(findProjectRoute(d, "b", "a"), null);
  edge.enabled = false;
  assert.equal(findProjectRoute(d, "a", "b"), null);
});

test("stale spans retain legacy anchors and a thin interior floor hole cannot receive body certification", () => {
  const d = spanFixture(),
    edge = d.edges.find((e) => e.id === "door")!;
  const good = findProjectRoute(d, "a", "b")!;
  assert.ok(good.paths.some((p) => p.openingSpanSupported));
  edge.openingSpan!.sourceModelSha256 = "other-model";
  const legacy = findProjectRoute(d, "a", "b")!,
    fixed = legacy.paths.find(
      (p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id,
    )!;
  assert.deepEqual(fixed.pointsFeet, edge.pointsFeet);
  assert.equal(fixed.sourceReason, "source-opening");
  assert.ok(!legacy.paths.some((p) => p.openingSpanSupported));
  edge.openingSpan!.sourceModelSha256 = "span-model";
  edge.openingSpan!.pointsFeet = [
    [3.99, 8, 0],
    [4.01, 8, 0],
  ];
  edge.openingSpan!.apertureFeet = rect(2.99, 7, 2.02, 2);
  d.walkingSupport!.floors[0].ringsFeet.push(rect(3.5, 7.65, 0.007, 0.06));
  const narrow = findProjectRoute(d, "a", "b");
  assert.ok(
    !narrow?.paths.some((p) => p.openingSpanSupported),
    "continuous centerline support cannot certify an off-center thin hole inside the body strip",
  );
  assert.ok(narrow, "the original supported centerline remains usable");
  const narrowThreshold = narrow.paths.find(
    (p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id,
  )!;
  assert.equal(narrowThreshold.sourceReason, "source-opening");
  assert.deepEqual(narrowThreshold.pointsFeet, edge.pointsFeet);
  assert.equal(narrow.paths.filter((p) => p.centered).length, 2);
});

test("failed local footprint clipping never authorizes aperture movement or disables supported walking runs", async (t) => {
  const { default: clipping } = await import("polygon-clipping");
  const originalIntersection = clipping.intersection;
  const originalDifference = clipping.difference;
  const intermediate = new Set<unknown>();
  let failed = false;
  t.mock.method(
    clipping,
    "intersection",
    (...args: Parameters<typeof clipping.intersection>) => {
      const result = originalIntersection(...args);
      intermediate.add(result);
      return result;
    },
  );
  t.mock.method(
    clipping,
    "difference",
    (...args: Parameters<typeof clipping.difference>) => {
      if (intermediate.has(args[0])) {
        failed = true;
        throw new Error(
          "Simulated sweep-line failure after floor intersection",
        );
      }
      return originalDifference(...args);
    },
  );
  const d = spanFixture(),
    edge = d.edges.find((e) => e.id === "door")!;
  const route = findProjectRoute(d, "a", "b")!;
  assert.ok(failed);
  assert.ok(route);
  assert.ok(!route.paths.some((p) => p.openingSpanSupported));
  assert.deepEqual(
    route.paths.find((p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id)!
      .pointsFeet,
    edge.pointsFeet,
  );
  assert.equal(
    route.paths.filter((p) => p.centered && p.nativeFloorSupported).length,
    2,
  );
});

test("a compiled-out staff corridor is explained by native entrance inventory without inventing a route", async () => {
  const { createProjectRouteDiagnostics } = await import(
    "../../app/indoor-project/route-diagnostics"
  );
  const d = fixture(0);
  d.edges = d.edges.filter((e) => e.id !== "door");
  const staff: IndoorRecord = {
    ...d.records[1],
    key: "staff",
    number: "05-117",
    name: "Circulation",
    access: "staff" as const,
    arrivalNodeId: undefined,
  };
  d.records.push(staff);
  d.doors![0].roomKeys = ["a", "staff"];
  const diagnostics = createProjectRouteDiagnostics(d);
  const blocked = diagnostics.inspect("a", "b");
  assert.equal(findProjectRoute(d, "a", "b"), null);
  assert.equal(blocked.kind, "blocked");
  assert.match(blocked.message, /05-117.*staff-only.*source review/);
  assert.equal(blocked.reviewRoomKey, "staff");
  assert.deepEqual(
    blocked.sourceEdgeIds,
    [],
    "door inventory is evidence, not a fabricated source journey",
  );
  assert.deepEqual(blocked.blockers, [
    { kind: "staff", roomKey: "staff", edgeId: "door", nativeElementId: 100 },
  ]);
  staff.access = "public";
  assert.equal(
    diagnostics.inspect("a", "b").kind,
    "source-gap",
    "an access correction cannot create absent source paths",
  );
  staff.access = "staff";
  d.doors!.push({ ...d.doors![0], id: "other-door", roomKeys: ["a", "b"] });
  assert.equal(
    diagnostics.inspect("a", "b").kind,
    "source-gap",
    "a separate public entrance prevents an all-restricted explanation",
  );
});
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

test("visitor directions use resolved turns, distances and actual stair floor identities", () => {
  const d = fixture();
  const forward = findProjectRoute(d, "a", "b")!;
  const steps = projectNavigationSteps(d, forward, "Start", "End");
  assert.deepEqual(
    steps.map((s) => s.type),
    ["depart", "turn", "arrive"],
  );
  assert.equal(steps[1].turnDirection, "right");
  assert.equal(steps[1].message, "Turn right");
  assert.ok(
    Math.abs(
      steps.reduce((sum, s) => sum + s.distanceMeters, 0) -
        forward.distanceMetres,
    ) < 1e-8,
  );
  assert.equal(
    projectNavigationSteps(d, findProjectRoute(d, "b", "a")!, "End", "Start")[1]
      .turnDirection,
    "left",
  );
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
  d.floors.push({
    id: "upper",
    name: "Floor 2",
    levelIds: [2],
    elevationFeet: 10,
  });
  d.edges.push({
    id: "stairs",
    from: "b",
    to: "upper",
    kind: "stairs",
    roomKeys: ["b", "upper"],
    pointsFeet: [d.nodes[4].pointFeet, [1, 25, 10]],
    lengthMetres: 4,
    evidence: "fixture",
    enabled: true,
    accessible: "no",
  });
  const upstairs = projectNavigationSteps(
    d,
    findProjectRoute(d, "a", "upper")!,
    "Start",
    "Upstairs",
  ).find((s) => s.type === "floor-change")!;
  assert.equal(upstairs.networkType, "stairs");
  assert.equal(upstairs.fromLevel, 1);
  assert.equal(upstairs.toLevel, 2);
  assert.equal(upstairs.levelId, 2);
  assert.equal(upstairs.message, "Take stairs up to Floor 2");
  const downstairs = projectNavigationSteps(
    d,
    findProjectRoute(d, "upper", "a")!,
    "Upstairs",
    "Start",
  ).find((s) => s.type === "floor-change")!;
  assert.equal(downstairs.toLevel, 1);
  assert.equal(downstairs.levelId, 1);
  assert.match(downstairs.message, /stairs down/);
});

test("a fixed unsupported anchor preserves its doorway while other corridor runs still centre", () => {
  const d = fixture(0);
  // Simulate an existing source anchor on a native obstruction. The viewer must
  // preserve that connection, while avoiding unnecessary zigzags elsewhere.
  d.walls.push({
    levelId: 1,
    kind: "column",
    nativeElementId: 991,
    ringsFeet: [rect(16.9, 0.9, 0.2, 0.2)],
  });
  const door = d.edges.find((e) => e.kind === "door")!;
  const route = findProjectRoute(d, "a", "b")!;
  const doorPath = route.paths.find((p) => p.edgeIds.includes(door.id))!;
  assert.equal(doorPath.centered, false);
  assert.deepEqual(doorPath.pointsFeet, door.pointsFeet);
  assert.ok(
    route.paths.some((p) => p.centered && !p.edgeIds.includes(door.id)),
  );
  assert.equal(route.paths[0].centered, false);
  const reverse = findProjectRoute(d, "b", "a")!;
  assert.deepEqual(
    reverse.paths.find((p) => p.edgeIds.includes(door.id))!.pointsFeet,
    [...door.pointsFeet].reverse(),
  );
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

test("a walking branch spanning an internal native door can centre only with its enabled aperture", () => {
  for (const state of ["connected", "disabled", "unmatched", "away"] as const) {
    const d = fixture(0);
    const native = d.edges.find((e) => e.kind === "door")!;
    d.edges.splice(1, 0, {
      ...native,
      id: "internal-walk",
      kind: "walk",
      evidence: "circulation-grid",
    });
    native.lengthMetres = 100;
    if (state === "disabled") native.enabled = false;
    if (state === "unmatched") d.doors![0].state = "unmatched";
    if (state === "away") d.doors![0].footprintFeet = rect(10, 7.5, 2, 1);
    const route = findProjectRoute(d, "a", "b");
    if (state === "disabled") {
      assert.equal(
        route,
        null,
        "a walking branch must not bypass a closed native door",
      );
      assert.ok(
        !reachableProjectDestinations(projectRoutingGraph(d), "a").has("b"),
      );
      continue;
    }
    assert.ok(route);
    assert.equal(
      route.edges.some((e) => e.id === "internal-walk"),
      state === "connected",
      "an unchecked walking fallback must not license a missing native aperture",
    );
    assert.equal(
      route.edges.some((e) => e.id === "door"),
      state !== "connected",
      "retain the explicit original native portal when the walking shortcut is rejected",
    );
    if (state === "connected") {
      assert.equal(route.paths[0].centered, true);
      assert.equal(route.paths[0].pointsFeet.length, 3);
    } else {
      assert.equal(
        route.paths.find((p) => p.edgeIds.includes("door"))!.centered,
        false,
        "the original native portal remains a source path requiring aperture review",
      );
    }
  }
});

test("native doors inside walking branches retain direction, access and step-free reviews", () => {
  const d = fixture(0),
    native = d.edges.find((e) => e.kind === "door")!;
  d.edges.splice(1, 0, { ...native, id: "internal-walk", kind: "walk" });
  native.lengthMetres = 100;
  native.direction = "from-to";
  assert.ok(findProjectRoute(d, "a", "b"));
  assert.equal(findProjectRoute(d, "b", "a"), null);
  assert.ok(
    !reachableProjectDestinations(projectRoutingGraph(d), "b").has("a"),
  );
  native.direction = "both";
  native.accessible = "unknown";
  const publicRoute = findProjectRoute(d, "a", "b")!;
  assert.ok(publicRoute.doorEdgeIds!.includes(native.id));
  assert.equal(publicRoute.unknownAccessibilityEdges, 1);
  assert.equal(findProjectRoute(d, "a", "b", "accessible"), null);
  native.accessible = "yes";
  assert.ok(findProjectRoute(d, "a", "b", "accessible"));
  d.records.push({
    ...d.records[0],
    key: "third",
    circulation: false,
    arrivalNodeId: undefined,
  });
  native.roomKeys = ["a", "third"];
  const ordinaryRoute = findProjectRoute(d, "a", "b");
  assert.ok(ordinaryRoute, "connected ordinary rooms remain usable");
  assert.ok(
    ordinaryRoute.preferenceCost! > ordinaryRoute.sourceDistanceMetres,
    "ordinary rooms carry a corridor preference penalty",
  );
  d.records.at(-1)!.circulation = true;
  d.records.at(-1)!.access = "staff";
  assert.equal(
    findProjectRoute(d, "a", "b"),
    null,
    "hidden door dependencies retain staff restrictions",
  );
});

test("door dependencies ignore side lead-ins, tangents, other floors and different heights", () => {
  const d = fixture(0),
    native = d.edges.find((e) => e.kind === "door")!;
  const walk = { ...native, id: "internal-walk", kind: "walk" as const };
  d.edges.push(walk);
  assert.deepEqual(
    walkPassages(d)
      .get(walk.id)!
      .map((p) => p.edge.id),
    [native.id],
  );
  assert.equal(walkPassages(d).has("walk-b1"), false);
  walk.pointsFeet = [
    [1, 8, 0],
    [7, 8, 0],
  ];
  assert.equal(walkPassages(d).has(walk.id), false);
  walk.pointsFeet = [
    [4, 7.5, 10],
    [4, 8.5, 10],
  ];
  assert.equal(walkPassages(d).has(walk.id), false);
  walk.pointsFeet = native.pointsFeet;
  d.doors![0].levelId = 2;
  assert.equal(walkPassages(d).has(walk.id), false);
});

test("a vertex on a doorway plane preserves its crossing review without treating a tangent as a crossing", () => {
  const d = fixture(0),
    native = d.edges.find((e) => e.kind === "door")!;
  const walk = {
    ...native,
    id: "threshold-vertex",
    kind: "walk" as const,
    pointsFeet: [
      [4, 7.5, 0],
      [4, 8, 0],
      [4, 8.5, 0],
    ] as [number, number, number][],
  };
  d.edges.push(walk);
  assert.deepEqual(
    walkPassages(d)
      .get(walk.id)!
      .map((p) => [p.edge.id, p.forward]),
    [[native.id, true]],
  );
  walk.pointsFeet.reverse();
  assert.equal(walkPassages(d).get(walk.id)![0].forward, false);
  walk.pointsFeet = [
    [4, 7.5, 0],
    [4, 8, 0],
    [5, 8, 0],
    [5, 7.5, 0],
  ];
  assert.equal(walkPassages(d).has(walk.id), false);
});

test("geometry cleanup cannot open an unused closed doorway to shorten a corridor", () => {
  const d = fixture(0),
    original = findProjectRoute(d, "a", "b")!;
  const native = d.edges.find((e) => e.kind === "door")!;
  d.edges.push({
    ...native,
    id: "closed-side-door",
    from: "closed-from",
    to: "closed-to",
    roomKeys: ["a"],
    enabled: false,
    pointsFeet: [
      [9.8, 4, 0],
      [10.2, 4, 0],
    ],
  });
  d.doors!.push({
    ...d.doors![0],
    id: "closed-side-door",
    roomKeys: ["a"],
    pointFeet: [10, 4],
    footprintFeet: rect(9.8, 3, 0.4, 2),
  });
  const query = createDoorPassageQuery(d);
  assert.ok(
    original.paths.some((p) =>
      query(1, p.pointsFeet).some((v) => v.edge.id === "closed-side-door"),
    ),
    "the unrestricted shortest shape would cross the new doorway",
  );
  const route = findProjectRoute(d, "a", "b")!;
  assert.ok(route);
  assert.ok(
    route.paths.every((p) =>
      query(1, p.pointsFeet).every((v) => v.edge.id !== "closed-side-door"),
    ),
    "cleanup retains a valid alternative or the saved geometry",
  );
});

test("directions absorb tiny portal adjustments without dropping geometry, distance or real turns", () => {
  const d = fixture(0);
  const route = findProjectRoute(d, "a", "b")!;
  const points: [number, number, number][] = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 0.1, 0],
    [20, 0.1, 0],
    [20, -10, 0],
  ];
  route.paths = [
    {
      edgeIds: [d.edges[0].id],
      levelIds: [1],
      pointsFeet: points,
      centered: true,
    },
  ];
  const steps = projectNavigationSteps(d, route, "Start", "End");
  assert.deepEqual(
    steps.map((s) => s.type),
    ["depart", "turn", "arrive"],
  );
  assert.equal(steps[1].message, "Turn right");
  assert.deepEqual(steps[0].pointsFeet, points.slice(0, 4));
  assert.ok(
    Math.abs(
      steps.reduce((sum, s) => sum + s.distanceMeters, 0) - 30.2 * 0.3048,
    ) < 1e-8,
  );
  assert.deepEqual(steps.at(-1)!.pointsFeet[0], points.at(-1));
});

test("the actual UNBC Agora and Floor 4 corridor legs resolve without source zigzags or backtracking", () => {
  const cases = JSON.parse(
    readFileSync(
      new URL("../fixtures/unbc-corridor-regressions.json", import.meta.url),
      "utf8",
    ),
  ) as {
    name: string;
    data: IndoorDataset;
    edges: IndoorEdge[];
    nodeIds: string[];
    walkingEdgeIds: string[];
  }[];
  for (const c of cases) {
    const before = JSON.stringify(c.data);
    const paths = centeredRoutePaths(c.data, c.edges, c.nodeIds);
    const corridor = paths.find((p) =>
      c.walkingEdgeIds.every((id) => p.edgeIds.includes(id)),
    )!;
    assert.ok(corridor?.centered, c.name);
    assert.ok(corridor.pointsFeet.length <= 7, c.name);
    for (let i = 1; i < corridor.pointsFeet.length - 1; i++) {
      const a = corridor.pointsFeet[i - 1],
        b = corridor.pointsFeet[i],
        end = corridor.pointsFeet[i + 1],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        ex = end[0] - b[0],
        ey = end[1] - b[1];
      assert.ok(
        (dx * ex + dy * ey) / Math.hypot(dx, dy) / Math.hypot(ex, ey) > -0.99,
        `${c.name} must not double back at a portal`,
      );
    }
    assert.equal(JSON.stringify(c.data), before);
  }
});

test("the regenerated UNBC Library stair approach removes sparse-lane elbows while retaining its flight", () => {
  const c = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-stair-approach-regression.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    data: IndoorDataset;
    edges: IndoorEdge[];
    nodeIds: string[];
    start: string;
    end: string;
  };
  const before = JSON.stringify(c.data);
  const paths = centeredRoutePaths(c.data, c.edges, c.nodeIds);
  const walking = paths.find(
    (p) => p.levelIds.length === 1 && p.pointsFeet.length > 2,
  )!;
  assert.ok(walking.centered);
  assert.ok(
    walking.pointsFeet.length <= 10,
    `Sparse lane corners: ${walking.pointsFeet.length}`,
  );
  const stairs = c.edges.find((e) => e.kind === "stairs")!;
  const flight = paths.find((p) => p.edgeIds.includes(stairs.id))!;
  assert.deepEqual(flight.pointsFeet, stairs.pointsFeet);
  assert.equal(flight.centered, false);
  assert.equal(JSON.stringify(c.data), before);
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

test("the actual multi-floor UNBC detour removes raster elbows while retaining its source flights", () => {
  const c = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-large-grid-multifloor-route.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const before = JSON.stringify(c.data);
  const source = centeredRoutePaths(c.data, c.edges, c.nodeIds, false);
  const resolved = centeredRoutePaths(c.data, c.edges, c.nodeIds);
  const flatCorners = (paths: ReturnType<typeof centeredRoutePaths>) =>
    paths
      .filter((p) => p.levelIds.length === 1)
      .reduce((count, p) => count + Math.max(0, p.pointsFeet.length - 2), 0);
  assert.ok(
    flatCorners(resolved) <= 35,
    `remaining walking corners ${flatCorners(resolved)}`,
  );
  assert.ok(flatCorners(resolved) < flatCorners(source));
  for (const edge of c.edges.filter((e: IndoorEdge) => e.kind === "stairs")) {
    const actual = resolved.find((p) => p.edgeIds.includes(edge.id));
    const original = source.find((p) => p.edgeIds.includes(edge.id));
    assert.deepEqual(
      actual,
      original,
      "source flights retain actual geometry and floor identities",
    );
  }
  assert.equal(JSON.stringify(c.data), before);
});

test("visitor native-junction barrier proofs match Reviter for the actual large-grid route scope", () => {
  const c = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-large-grid-multifloor-route.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    visitorJoints(c.data.walls, c.data.doors),
    sourceJoints(c.data.walls, c.data.doors),
  );
});

test("model door direction enforces threshold reviews when host depth exceeds jamb width", () => {
  for (const angle of [0, 0.47]) {
    const d = fixture(angle),
      native = d.edges.find((e) => e.kind === "door")!;
    const rotate = ([x, y]: number[]): [number, number] => [
      x * Math.cos(angle) - y * Math.sin(angle),
      x * Math.sin(angle) + y * Math.cos(angle),
    ];
    d.doors![0].footprintFeet = rect(3, 6, 2, 4).map(rotate);
    d.doors![0].normalFeet = rotate([0, 1]);
    d.edges.splice(1, 0, { ...native, id: "deep-host-walk", kind: "walk" });
    native.lengthMetres = 100;
    const forward = findProjectRoute(d, "a", "b")!;
    assert.ok(forward);
    assert.ok(forward.doorEdgeIds!.includes(native.id));
    native.direction = "from-to";
    assert.ok(findProjectRoute(d, "a", "b"));
    assert.equal(findProjectRoute(d, "b", "a"), null);
    native.enabled = false;
    assert.equal(findProjectRoute(d, "a", "b"), null);
    assert.ok(
      !reachableProjectDestinations(projectRoutingGraph(d), "a").has("b"),
    );
  }
});

test("shared routing cache observes in-place policy, geometry and import changes", async () => {
  const { createProjectRouteDiagnostics } = await import(
    "../../app/indoor-project/route-diagnostics"
  );
  const d = fixture(0),
    graph = projectRoutingGraph(d);
  assert.equal(
    projectRoutingGraph(d),
    graph,
    "unchanged requests reuse the graph",
  );
  const inspector = createProjectRouteDiagnostics(d);
  const destinations = reachableProjectDestinations(graph, "a");
  destinations.clear();
  assert.ok(
    reachableProjectDestinations(graph, "a").has("b"),
    "callers cannot corrupt cached coverage",
  );
  const door = d.edges.find((e) => e.kind === "door")!;
  door.enabled = false;
  assert.notEqual(projectRoutingGraph(d), graph);
  assert.equal(findProjectRoute(d, "a", "b"), null);
  assert.equal(
    inspector.inspect("a", "b").kind,
    "blocked",
    "retained inspectors observe closures",
  );
  assert.ok(
    !reachableProjectDestinations(graph, "a").has("b"),
    "retained coverage handles observe closures",
  );
  door.enabled = true;
  door.direction = "from-to";
  assert.ok(findProjectRoute(d, "a", "b"));
  assert.equal(findProjectRoute(d, "b", "a"), null);
  assert.equal(inspector.inspect("b", "a").blockers[0].kind, "direction");
  door.direction = "both";
  d.records[1].access = "staff";
  assert.equal(findProjectRoute(d, "a", "b"), null);
  d.records[1].access = "public";
  const oldQuery = createDoorPassageQuery(d);
  d.doors![0].footprintFeet![0][0] -= 0.1;
  assert.notEqual(
    createDoorPassageQuery(d),
    oldQuery,
    "native aperture edits invalidate the index",
  );
  const beforeImport = projectRoutingGraph(d);
  d.records = d.records.map((r) => ({ ...r }));
  d.edges = d.edges.map((e) => ({ ...e }));
  const afterImport = projectRoutingGraph(d);
  assert.notEqual(afterImport, beforeImport);
  assert.equal(
    afterImport.records.get("a"),
    d.records[0],
    "replacement imports bind current objects",
  );
  assert.equal(afterImport.adjacency.get("a")![0].edge, d.edges[0]);
});

test("actual Agora room-to-washroom route joins native corridor axes and preserves threshold anchors", () => {
  const c = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-agora-washroom-navigation.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const before = JSON.stringify(c.data);
  const route = findProjectRoute(c.data, c.startKey, c.endKey)!;
  assert.ok(route);
  const corridor = route.paths.find((p) => p.edgeIds.length === 7)!;
  assert.ok(corridor.centered);
  assert.equal(corridor.nativeFloorSupported, true);
  assert.ok(
    route.paths.filter((p) => p.centered).every((p) => p.nativeFloorSupported),
  );
  assert.ok(
    corridor.pointsFeet.length <= 9,
    `corridor points ${corridor.pointsFeet.length}`,
  );
  assert.ok(route.distanceMetres < c.previousDistanceMetres - 3);
  for (const edge of route.edges.filter((e) =>
    ["door", "opening"].includes(e.kind),
  )) {
    const fixed = route.paths.find(
      (p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id,
    )!;
    const index = route.edges.indexOf(edge);
    const expected =
      edge.from === route.nodeIds[index]
        ? edge.pointsFeet
        : [...edge.pointsFeet].reverse();
    assert.deepEqual(
      fixed.pointsFeet,
      expected,
      "precise door and proven doorless opening anchors remain fixed",
    );
  }
  const start = c.data.nodes.find((n: IndoorNode) => n.id === route.nodeIds[0]);
  const end = c.data.nodes.find(
    (n: IndoorNode) => n.id === route.nodeIds.at(-1),
  );
  assert.deepEqual(route.paths[0].pointsFeet[0], start.pointFeet);
  assert.deepEqual(route.paths.at(-1)!.pointsFeet.at(-1), end.pointFeet);
  assert.ok(
    route.paths.every((p) => p.levelIds.length === 1 && p.levelIds[0] === 311),
  );
  const query = createDoorPassageQuery(c.data);
  const allowed = new Set(route.doorEdgeIds);
  const actualCrossings = new Set(
    route.paths.flatMap((p) =>
      query(311, p.pointsFeet).map((crossing) => crossing.edge.id),
    ),
  );
  for (const id of allowed)
    assert.ok(
      actualCrossings.has(id),
      "the selected doorway must be crossed, not merely retained as metadata",
    );
  for (const p of route.paths)
    for (const passage of query(311, p.pointsFeet))
      assert.ok(
        allowed.has(passage.edge.id),
        "cleanup cannot use an unselected native doorway",
      );
  const steps = projectNavigationSteps(c.data, route, "Bookstore", "Washroom");
  assert.ok(steps.filter((s) => s.type === "turn").length <= 10);
  assert.equal(
    JSON.stringify(c.data),
    before,
    "routing does not alter source geometry or permissions",
  );
});

test("actual Agora apertures retain fixed thresholds when local body support cannot certify movement", () => {
  const captured = JSON.parse(
    readFileSync(
      new URL("../fixtures/unbc-certified-opening-route.json", import.meta.url),
      "utf8",
    ),
  );
  const d = captured.data as IndoorDataset,
    route = findProjectRoute(d, captured.startKey, captured.endKey)!;
  assert.ok(route);
  assert.ok(
    Math.abs(route.distanceMetres - captured.fixedOpeningDistanceMetres) < 0.01,
  );
  assert.ok(route.distanceMetres < captured.baselineDistanceMetres - 9);
  assert.ok(!route.paths.some((p) => p.openingSpanSupported));
  assert.ok(
    projectNavigationSteps(d, route, "Bookstore", "Washroom").filter(
      (s) => s.type === "turn",
    ).length <= 12,
  );
  for (const edge of route.edges.filter(
    (e) => e.kind === "opening" && e.openingSpan,
  )) {
    const i = route.edges.indexOf(edge),
      fixed = route.paths.find(
        (p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id,
      )!;
    assert.equal(fixed.sourceReason, "source-opening");
    assert.deepEqual(
      fixed.pointsFeet,
      edge.from === route.nodeIds[i]
        ? edge.pointsFeet
        : [...edge.pointsFeet].reverse(),
    );
  }
  assert.ok(
    route.paths.filter((p) => p.centered).every((p) => p.nativeFloorSupported),
  );
  const query = createDoorPassageQuery(d),
    crossed = new Set(
      route.paths.flatMap((p) =>
        query(311, p.pointsFeet).map((c) => c.edge.id),
      ),
    );
  assert.ok(route.doorEdgeIds);
  assert.deepEqual([...crossed].sort(), [...route.doorEdgeIds].sort());
  const physicalDoor = route.edges.find((e) => e.id === "door:311:1736144")!;
  assert.ok(physicalDoor);
  const fixed = route.paths.find(
    (p) => p.edgeIds.length === 1 && p.edgeIds[0] === physicalDoor.id,
  )!;
  assert.ok(fixed);
  const i = route.edges.indexOf(physicalDoor);
  assert.deepEqual(
    fixed.pointsFeet,
    physicalDoor.from === route.nodeIds[i]
      ? physicalDoor.pointsFeet
      : [...physicalDoor.pointsFeet].reverse(),
  );
  physicalDoor.enabled = false;
  assert.equal(
    findProjectRoute(d, captured.startKey, captured.endKey),
    null,
    "a finite doorless span never authorizes skipping the disabled real entrance",
  );
});

test("an actual multi-opening campus leg rejects a failed clipping candidate without reverting every corridor to raster elbows", async () => {
  const { createNativeFloorHoleQuery } = await import(
    "../../app/indoor-project/walking-support"
  );
  const captured = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-campus-multi-opening-leg.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const d = captured.data as IndoorDataset;
  const paths = centeredRoutePaths(d, captured.edges, captured.nodeIds);
  assert.ok(!paths.some((p) => p.sourceReason === "centering-error"));
  assert.ok(
    paths.filter((p) => p.centered).every((p) => p.nativeFloorSupported),
  );
  assert.ok(
    paths.reduce((n, p) => n + p.pointsFeet.length, 0) <
      captured.sourcePointCount - 30,
  );
  for (const edge of captured.edges.filter(
    (e: IndoorEdge) => e.kind === "opening",
  )) {
    const i = captured.edges.indexOf(edge),
      fixed = paths.find(
        (p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id,
      )!;
    assert.equal(fixed.sourceReason, "source-opening");
    assert.equal(fixed.openingSpanSupported, undefined);
    assert.deepEqual(
      fixed.pointsFeet,
      edge.from === captured.nodeIds[i]
        ? edge.pointsFeet
        : [...edge.pointsFeet].reverse(),
    );
  }
  const query = createDoorPassageQuery(d),
    holes = createNativeFloorHoleQuery(d);
  const sourcePoints = captured.edges.flatMap((e: IndoorEdge, i: number) => {
    const oriented =
      e.from === captured.nodeIds[i]
        ? e.pointsFeet
        : [...e.pointsFeet].reverse();
    return i ? oriented.slice(1) : oriented;
  });
  const expected = query(311, sourcePoints)
    .map((p) => `${p.edge.id}:${p.forward}`)
    .sort();
  const actual = paths
    .flatMap((p) =>
      query(311, p.pointsFeet).map((c) => `${c.edge.id}:${c.forward}`),
    )
    .sort();
  assert.deepEqual(
    actual,
    expected,
    "all physical doorway dependencies and their direction remain intact",
  );
  for (const p of paths) assert.deepEqual(holes(p.pointsFeet), []);
});

test("resolved routes reuse geometry safely and invalidate native wall and anchor edits", () => {
  const d = fixture(0);
  const original = findProjectRoute(d, "a", "b")!;
  const again = findProjectRoute(d, "a", "b")!;
  assert.deepEqual(again, original);
  again.paths[0].pointsFeet[0][0] += 100;
  again.nodeIds.reverse();
  assert.deepEqual(
    findProjectRoute(d, "a", "b"),
    original,
    "returned arrays cannot corrupt cached paths",
  );
  d.walls.push({
    kind: "column",
    nativeElementId: 999,
    levelId: 1,
    ringsFeet: [rect(3, 15, 2, 3)],
  });
  const blockedLane = findProjectRoute(d, "a", "b")!;
  assert.notDeepEqual(
    blockedLane.paths,
    original.paths,
    "a new native column invalidates cached centering",
  );
  d.nodes[0].pointFeet[0] += 0.5;
  const graph = projectRoutingGraph(d);
  d.edges[0].enabled = false;
  assert.notEqual(projectRoutingGraph(d), graph);
  assert.equal(
    findProjectRoute(d, "a", "b"),
    null,
    "cached route cannot bypass a connection closure",
  );
});

test("internal generated landings without arrivals are not visitor destinations", async () => {
  const { isProjectDestination } = await import(
    "../../app/indoor-project/route-policy"
  );
  const d = fixture(0);
  const internal = {
    ...d.records[0],
    key: "landing:local:123",
    arrivalNodeId: undefined,
    properties: { generatedLanding: true, nativeFloorId: 123 },
  };
  assert.equal(isProjectDestination(internal), false);
  assert.equal(
    isProjectDestination({ ...internal, arrivalNodeId: "confirmed-approach" }),
    true,
  );
  assert.equal(
    isProjectDestination({ ...internal, properties: {} }),
    true,
    "unresolved source places stay available for review",
  );
});

test("ordinary-room preference is invariant when a physical edge is split", async () => {
  const { projectLinkCost } = await import(
    "../../app/indoor-project/routing-graph"
  );
  const d = fixture(0),
    edge = d.edges[0];
  const whole = projectLinkCost(
    { edge: { ...edge, lengthMetres: 12 }, requiredRooms: ["ordinary"] },
    "start",
    "end",
  );
  const fragments = [2, 3, 7].reduce(
    (sum, lengthMetres) =>
      sum +
      projectLinkCost(
        { edge: { ...edge, lengthMetres }, requiredRooms: ["ordinary"] },
        "start",
        "end",
      ),
    0,
  );
  assert.equal(whole, fragments);
  assert.equal(whole, 48);
  assert.equal(
    projectLinkCost(
      { edge: { ...edge, lengthMetres: 12 }, requiredRooms: ["start", "end"] },
      "start",
      "end",
    ),
    12,
  );
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

test("a native stair flight retains its own support while spanning a slab opening", () => {
  const d = fixture(0);
  d.nodes.find((n) => n.id === "b")!.levelId = 2;
  d.nodes.find((n) => n.id === "b")!.pointFeet[2] = 10;
  d.records[1].levelId = 2;
  d.records[1].elevationFeet = 10;
  const stair = {
    ...d.edges[0],
    id: "native-flight",
    kind: "stairs" as const,
    from: "a",
    to: "b",
    roomKeys: ["a", "b"],
    pointsFeet: [
      [17, 1, 0],
      [17, 4, 0],
      [1, 25, 10],
    ] as [number, number, number][],
    lengthMetres: 20,
  };
  d.edges = [stair];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 123,
        elevationFeet: 0,
        ringsFeet: [rect(-1, -1, 22, 32), rect(0, 0, 20, 30)],
      },
    ],
  };
  const route = findProjectRoute(d, "a", "b")!;
  assert.ok(route);
  assert.deepEqual(route.paths[0].pointsFeet, stair.pointsFeet);
  assert.equal(route.paths[0].sourceReason, "vertical-transition");
});

test("in-place native polygon edits cannot reuse old containment bounds", () => {
  const d = fixture(0);
  const before = findProjectRoute(d, "a", "b")!;
  for (const point of d.walls[0].ringsFeet[0]) point[0] += 4;
  const moved = findProjectRoute(d, "a", "b")!;
  assert.notDeepEqual(moved.paths, before.paths);
  for (const path of moved.paths.filter((p) => p.centered))
    for (const point of path.pointsFeet)
      assert.ok(
        !(point[0] > 3.8 && point[0] < 4 && point[1] > 0 && point[1] < 30),
        "a shifted wall is included in new containment checks",
      );
});

test("an open neighboring front cannot erase the selected native doorway from followed geometry", () => {
  const d = fixture(0);
  d.walls = d.walls.filter((wall) => ![3, 4].includes(wall.nativeElementId));
  d.doors![0].footprintFeet = rect(6, 7.5, 2, 1);
  d.doors![0].pointFeet = [7, 8];
  for (const node of d.nodes.filter(
    (n) => n.id === "door-a" || n.id === "door-b",
  ))
    node.pointFeet[0] = 7;
  for (const edge of d.edges)
    for (const point of edge.pointsFeet)
      if (point[0] === 4 && (point[1] === 7.5 || point[1] === 8.5))
        point[0] = 7;
  const route = findProjectRoute(d, "a", "b")!;
  assert.ok(route);
  const query = createDoorPassageQuery(d);
  assert.ok(
    route.paths
      .flatMap((path) => query(1, path.pointsFeet))
      .some((crossing) => crossing.edge.id === "door"),
    "the native threshold is a geometric obligation, even when another apparent front is open",
  );
  d.edges.find((edge) => edge.kind === "door")!.enabled = false;
  assert.equal(findProjectRoute(d, "a", "b"), null);
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

test("strict centering uses original ankle sections rather than a raised historical wall proxy", async () => {
  const { nativeIndoorEnvelopeHash } = await import(
    "../../app/indoor-project/native-indoor-envelopes"
  );
  const { nativeMaterialSectionsHash } = await import(
    "../../app/indoor-project/native-material-sections"
  );
  const d = fixture(0);
  d.source.modelSha256 = "a".repeat(64);
  d.records = d.records.filter((r) => r.key === "b");
  d.nodes = [
    { ...d.nodes[0], id: "start", roomKey: "b", pointFeet: [4, 11, 0] },
    { ...d.nodes[1], id: "end", roomKey: "b", pointFeet: [6.5, 20, 0] },
  ];
  d.edges = [
    {
      ...d.edges[0],
      id: "approach",
      from: "start",
      to: "end",
      roomKeys: ["b"],
      pointsFeet: [
        [4, 11, 0],
        [4, 20, 0],
        [6.5, 20, 0],
      ],
    },
  ];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 501,
        elevationFeet: 0,
        ringsFeet: [rect(0, 8, 8, 22)],
      },
    ],
  };
  const envelope = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[rect(0, 8, 8, 22)]],
        sourceElementIds: [501],
        cutElevationsFeet: [4, 8],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  d.nativeIndoorEnvelopes = {
    ...envelope,
    geometrySha256: await nativeIndoorEnvelopeHash(envelope),
  };
  const material = {
    version: 1 as const,
    sourceModelSha256: d.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 0.1,
        evidenceSha256: "c".repeat(64),
        sourceElementIds: [778],
        sections: [] as NonNullable<
          IndoorDataset["nativeMaterialSections"]
        >["levels"][0]["sections"],
      },
    ],
  };
  d.nativeMaterialSections = {
    ...material,
    geometrySha256: await nativeMaterialSectionsHash(material),
  };
  d.walls.push({
    kind: "wall",
    levelId: 1,
    nativeElementId: 778,
    ringsFeet: [rect(0, 15, 8, 0.2)],
  });
  const refresh = () => {
    d.edges[0].nativeCellId = "native";
    d.circulationGeometry = {
      version: 1,
      sourceModelSha256: d.source.modelSha256,
      sourceGeometryKey: nativeCirculationGeometryKey(d),
      cells: [
        {
          id: "native",
          exactFaceId: "literal-native-face",
          levelIds: [1],
          elevationFeet: 0,
          roomKeys: ["b"],
          nativeFloorIds: [501],
          ringsFeet: [rect(0, 8, 8, 22)],
          sourceCoverage: 1,
        },
      ],
    };
    d.circulationGeometry.exactTopology = encodeNativeExactTopology(
      {
        sourceModelSha256: d.source.modelSha256,
        sourceGeometryKey: d.circulationGeometry.sourceGeometryKey,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      },
      [
        {
          id: "literal-native-face",
          // Independent literal test face; the runtime must still intersect it
          // with current original ankle material rather than trusting the carrier.
          parts: nativeRationalOverlay("union", [[rect(0, 8, 8, 22)]]),
        },
      ],
    );
  };
  refresh();
  const original = JSON.stringify(d.walls);
  assert.ok(
    centeredRoutePaths(d, d.edges, ["start", "end"])[0].centered,
    "original certified absence keeps the lower approach available for centering",
  );
  material.levels[0].sections.push({
    nativeElementId: 778,
    categoryId: -2000011,
    kind: "wall",
    baseElevationFeet: 0,
    topElevationFeet: 8,
    partsFeet: [[rect(0, 15, 8, 0.2)]],
  });
  d.nativeMaterialSections = {
    ...material,
    geometrySha256: await nativeMaterialSectionsHash(material),
  };
  refresh();
  assert.ok(
    !centeredRoutePaths(d, d.edges, ["start", "end"])[0].centered,
    "actual ankle material cannot be crossed by centering",
  );
  assert.equal(
    JSON.stringify(d.walls),
    original,
    "historical source jamb/proxy evidence remains unchanged",
  );
});
