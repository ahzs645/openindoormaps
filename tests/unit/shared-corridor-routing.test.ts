import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  nativeCirculationGeometryKey,
  nativeCirculationCells,
} from "../../app/indoor-project/native-circulation";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { prepareRouting } from "../../app/indoor-project/prepare-routing";
import {
  preparedSharedCorridorGuideIds,
  preparedWalkingGuides,
  validatePreparedRouting,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
import { findProjectRoute } from "../../app/indoor-project/viewer-routing";
import {
  corridorGuideLength,
  removeSharedGuideRetraces,
  straightenSharedGuideProposal,
  simplifyCheckedSharedGuide,
} from "../../app/indoor-project/shared-corridor-guides";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { projectRoutingOptionsKey } from "../../app/indoor-project/routing-options";
import {
  loadSharedCorridorPreference,
  saveSharedCorridorPreference,
} from "../../app/indoor-project/shared-corridor-preferences";
import { centerHallwayRouteEndpoints } from "../../app/indoor-project/hallway-center-endpoints";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import { hallwayPathView } from "../../app/indoor-project/hallway-path-view";

async function fixture(compact = false, hole = false) {
  await initializeNativeExactGeosOverlay();
  const d = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  ) as IndoorDataset;
  d.source.modelSha256 = "a".repeat(64);
  const ring: [number, number][] = [
    [0, 0],
    [compact ? 12 : 40, 0],
    [compact ? 12 : 40, 10],
    [0, 10],
  ];
  const original = d.records[0],
    node = d.nodes[0],
    edge = d.edges[0];
  const points: [number, number, number][] = [
    [compact ? 2 : 4, compact ? 5 : 1, 0],
    [compact ? 6 : 20, 1, 0],
    [compact ? 10 : 36, compact ? 5 : 9, 0],
  ];
  const rings = hole
    ? [
        ring,
        [
          [5, 3],
          [5, 7],
          [7, 7],
          [7, 3],
        ] as [number, number][],
      ]
    : [ring];
  d.records = ["A", "B", "C"].map((key) => ({
    ...original,
    key,
    number: key,
    name: key,
    ringsFeet: rings,
    arrivalNodeId: key,
    properties: {},
    levelId: 1,
    elevationFeet: 0,
    access: "public",
    walkable: true,
    circulation: true,
  }));
  d.nodes = d.records.map((r, i) => ({
    ...node,
    id: r.key,
    roomKey: r.key,
    pointFeet: points[i],
    levelId: 1,
    kind: "arrival",
  }));
  d.edges = [
    {
      ...edge,
      id: "AB",
      from: "A",
      to: "B",
      kind: "walk",
      roomKeys: ["A", "B", "C"],
      pointsFeet: [points[0], points[1]],
      lengthMetres: 16 * 0.3048,
      nativeCellId: "hall",
      enabled: true,
      accessible: "yes",
    },
    {
      ...edge,
      id: "BC",
      from: "B",
      to: "C",
      kind: "walk",
      roomKeys: ["A", "B", "C"],
      pointsFeet: [points[1], [points[2][0], 1, 0], points[2]],
      lengthMetres: 24 * 0.3048,
      nativeCellId: "hall",
      enabled: true,
      accessible: "yes",
    },
  ];
  d.walls = [];
  d.doors = [];
  d.issues = [];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [{ nativeElementId: 1, elevationFeet: 0, ringsFeet: rings }],
  };
  d.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "",
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [rings],
        sourceElementIds: [1],
        cutElevationsFeet: [0.1],
        evidenceSha256: "b".repeat(64),
      },
    ],
  };
  d.nativeIndoorEnvelopes.geometrySha256 = await nativeIndoorEnvelopeHash(
    d.nativeIndoorEnvelopes,
  );
  d.circulationGeometry = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    sourceGeometryKey: "",
    cells: [
      {
        id: "hall",
        exactFaceId: "hall-face",
        levelIds: [1],
        elevationFeet: 0,
        roomKeys: ["A", "B", "C"],
        nativeFloorIds: [1],
        ringsFeet: rings,
        sourceCoverage: 1,
      },
    ],
    fixtures: [],
    reviewSurfaces: [],
    preparedRoomKeys: ["A", "B", "C"],
  };
  d.circulationGeometry.sourceGeometryKey = nativeCirculationGeometryKey(d);
  // Literal independent source-floor fixture, never a rebound campus face.
  d.circulationGeometry.exactTopology = encodeNativeExactTopology(
    {
      sourceModelSha256: d.source.modelSha256,
      sourceGeometryKey: d.circulationGeometry.sourceGeometryKey,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    [{ id: "hall-face", parts: nativeRationalOverlay("union", [rings]) }],
  );
  return d;
}

test("shared preparation preserves the graph; actual routes use a common centre in both directions", async () => {
  const d = await fixture(),
    before = JSON.stringify(d);
  const prepared = await prepareRouting(d, { method: "shared-corridor" });
  assert.equal(JSON.stringify(d), before);
  assert.equal(prepared.report.compiledWalkingEdges, 2);
  assert.deepEqual(prepared.dataset.edges, d.edges);
  assert.deepEqual(prepared.dataset.nodes, d.nodes);
  assert.equal(preparedSharedCorridorGuideIds(prepared.dataset).size, 2);
  for (const [from, to] of [
    ["A", "B"],
    ["B", "A"],
    ["A", "C"],
    ["C", "A"],
  ]) {
    const route = findProjectRoute(prepared.dataset, from, to, "public", {
      endpointMode: "inside",
    });
    assert.ok(route);
    assert.ok(route.paths.some((p) => p.sharedCorridorGuideUsed));
    assert.deepEqual(
      route.paths[0].pointsFeet[0],
      d.nodes.find((n) => n.id === from)!.pointFeet,
    );
    assert.deepEqual(
      route.paths.at(-1)!.pointsFeet.at(-1),
      d.nodes.find((n) => n.id === to)!.pointFeet,
    );
    assert.ok(
      route.paths
        .flatMap((p) => p.pointsFeet)
        .some((p) => Math.abs(p[1] - 5) < 0.15),
    );
  }
  const journey = findProjectRoute(prepared.dataset, "A", "C")!;
  assert.equal(
    journey.paths
      .flatMap((p) => p.pointsFeet)
      .some((p) => p.every((v, i) => v === d.nodes[1].pointFeet[i])),
    false,
    "an unused intermediate arrival/doorway spur must not survive the joined shared guide",
  );
  const accessible = findProjectRoute(
    prepared.dataset,
    "A",
    "C",
    "accessible",
  )!;
  assert.ok(accessible);
  assert.ok(accessible.paths.every((p) => !p.sharedCorridorGuideUsed));
});

test("tampered wall-side guides cannot claim shared two-foot clearance; physical edits invalidate bindings", async () => {
  const d = await fixture();
  const prepared = await prepareRouting(d, { method: "shared-corridor" });
  const p = (
    prepared.dataset as IndoorDataset & { preparedRouting: PreparedRouting }
  ).preparedRouting;
  p.guides.find((g) => g.edgeId === "AB")!.pointsFeet = [
    [4, 1, 0],
    [4, 0.2, 0],
    [20, 0.2, 0],
    [20, 1, 0],
  ];
  const route = findProjectRoute(prepared.dataset, "A", "B")!;
  assert.ok(route);
  assert.ok(route.paths.every((path) => !path.sharedCorridorGuideUsed));
  prepared.dataset.walkingSupport!.floors[0].ringsFeet[0][1][0] -= 0.001;
  assert.equal(preparedWalkingGuides(prepared.dataset).size, 0);
  assert.equal(preparedSharedCorridorGuideIds(prepared.dataset).size, 0);
});

test("hallway-center endpoints remove both door hooks but preserve the original graph, approaches and instructions", async () => {
  const prepared = await prepareRouting(await fixture(), {
    method: "shared-corridor",
  });
  for (const [from, to] of [
    ["A", "C"],
    ["C", "A"],
  ]) {
    const data = prepared.dataset;
    const original = findProjectRoute(data, from, to, "public", {
      endpointMode: "inside",
    })!;
    const sourcePoints = [
      original.paths[0].pointsFeet[0],
      original.paths.at(-1)!.pointsFeet.at(-1)!,
    ];
    original.departure = {
      mode: "hallway",
      pointFeet: sourcePoints[0],
      levelId: 1,
      building: "test",
      entranceEdgeId: "source-start-door",
    };
    original.arrival = {
      mode: "hallway",
      pointFeet: sourcePoints[1],
      levelId: 1,
      building: "test",
      entranceEdgeId: "source-end-door",
    };
    const before = JSON.stringify(original);
    const route = centerHallwayRouteEndpoints(data, original);
    assert.equal(JSON.stringify(original), before);
    assert.deepEqual(route.edges, original.edges);
    assert.deepEqual(route.nodeIds, original.nodeIds);
    assert.equal(route.sourceDistanceMetres, original.sourceDistanceMetres);
    assert.deepEqual(
      route.departure!.hallwayCenter!.doorPointFeet,
      sourcePoints[0],
    );
    assert.deepEqual(
      route.arrival!.hallwayCenter!.doorPointFeet,
      sourcePoints[1],
    );
    assert.deepEqual(route.departure!.pointFeet, route.paths[0].pointsFeet[0]);
    assert.deepEqual(
      route.arrival!.pointFeet,
      route.paths.at(-1)!.pointsFeet.at(-1),
    );
    assert.equal(route.paths.length, 1);
    assert.equal(route.paths[0].pointsFeet.length, 2);
    assert.ok(
      route.paths[0].pointsFeet.every((p) => Math.abs(p[1] - 5) < 1e-10),
    );
    assert.ok(Math.abs(route.distanceMetres - 32 * 0.3048) < 1e-10);
    const steps = projectNavigationSteps(data, route, from, to);
    assert.match(steps[0].message, /hallway center/);
    assert.match(steps.at(-1)!.message, /hallway center/);
    const unavailable = {
      ...original,
      paths: original.paths.map((p) => ({
        ...p,
        sharedCorridorGuideUsed: false,
      })),
    };
    assert.equal(centerHallwayRouteEndpoints(data, unavailable), unavailable);
  }
});

test("source directions and exact terminal positions remain authoritative", async () => {
  const d = await fixture();
  d.edges[0].direction = "from-to";
  d.circulationGeometry!.sourceGeometryKey = nativeCirculationGeometryKey(d);
  d.circulationGeometry!.exactTopology!.sourceGeometryKey =
    d.circulationGeometry!.sourceGeometryKey;
  // Rebuild the literal independent test descriptor after its policy change.
  const ring = d.walkingSupport!.floors[0].ringsFeet;
  d.circulationGeometry!.exactTopology = encodeNativeExactTopology(
    {
      sourceModelSha256: d.source.modelSha256,
      sourceGeometryKey: d.circulationGeometry!.sourceGeometryKey,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    [{ id: "hall-face", parts: nativeRationalOverlay("union", [ring]) }],
  );
  const prepared = await prepareRouting(d, { method: "shared-corridor" });
  assert.ok(findProjectRoute(prepared.dataset, "A", "C"));
  assert.equal(findProjectRoute(prepared.dataset, "C", "A"), null);
  const metadata = (
    prepared.dataset as IndoorDataset & { preparedRouting: PreparedRouting }
  ).preparedRouting;
  metadata.guides[0].pointsFeet[0][0] += 1e-10;
  assert.equal(
    preparedSharedCorridorGuideIds(prepared.dataset).has(
      metadata.guides[0].edgeId,
    ),
    false,
  );
  (metadata.guides[0] as { kind: string }).kind = "unrecognized";
  assert.throws(
    () => validatePreparedRouting(prepared.dataset),
    /Invalid prepared/,
  );
});

test("scoped enumeration uses the same physical/policy binding and retains restrictions", async () => {
  const d = await fixture();
  assert.deepEqual(
    nativeCirculationCells(d, { cellIds: new Set(["hall"]) }),
    nativeCirculationCells(d),
  );
  assert.deepEqual(
    nativeCirculationCells(d, { cellIds: new Set(["unrelated"]) }),
    [],
  );
  d.records[0].access = "staff";
  assert.deepEqual(
    nativeCirculationCells(d, { cellIds: new Set(["hall"]) }),
    [],
    "a stale scope must not restore changed access",
  );
});

test("exact retraces remove unused spurs while preserving fixed outer endpoints and non-retraced bends", () => {
  const path: [number, number, number][] = [
    [0, 5, 0],
    [10, 5, 0],
    [10, 1, 0],
    [10, 5, 0],
    [20, 5, 0],
    [20, 9, 0],
  ];
  const result = removeSharedGuideRetraces(path);
  assert.deepEqual(result, [
    [0, 5, 0],
    [10, 5, 0],
    [20, 5, 0],
    [20, 9, 0],
  ]);
  assert.ok(corridorGuideLength(result) < corridorGuideLength(path));
  assert.equal(path.length, 6);
});

test("switching shared guides off and back on reuses a calculator without poisoning its guide cache", async () => {
  const prepared = await prepareRouting(await fixture(), {
    method: "shared-corridor",
  });
  const calculate = createWorkerRouteCalculator(prepared.dataset);
  const on = () =>
    calculate("A", "C", "public", {
      endpointMode: "inside",
      useSharedCorridorGuides: true,
    }).route!;
  assert.ok(on().paths.some((p) => p.sharedCorridorGuideUsed));
  const off = calculate("A", "C", "public", {
    endpointMode: "inside",
    useSharedCorridorGuides: false,
  }).route!;
  assert.ok(off);
  assert.ok(off.paths.every((p) => !p.sharedCorridorGuideUsed));
  assert.ok(on().paths.some((p) => p.sharedCorridorGuideUsed));
  assert.equal(preparedSharedCorridorGuideIds(prepared.dataset).size, 2);
  assert.notEqual(
    projectRoutingOptionsKey({ useSharedCorridorGuides: true }),
    projectRoutingOptionsKey({ useSharedCorridorGuides: false }),
  );
  assert.throws(
    () =>
      projectRoutingOptionsKey({
        useSharedCorridorGuides: "yes" as unknown as boolean,
      }),
    /preference/,
  );
});

test("the corridor setting defaults on and persists independently for each model", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const a = "a".repeat(64),
      b = "b".repeat(64);
    assert.equal(loadSharedCorridorPreference(a), true);
    saveSharedCorridorPreference(a, false);
    assert.equal(loadSharedCorridorPreference(a), false);
    assert.equal(loadSharedCorridorPreference(b), true);
    saveSharedCorridorPreference(a, true);
    assert.equal(loadSharedCorridorPreference(a), true);
    saveSharedCorridorPreference("unbound", false);
    assert.equal(loadSharedCorridorPreference("unbound"), true);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("compact vestibule routes straighten through intermediate arrival anchors, while holes veto the chord", async () => {
  for (const hole of [false, true]) {
    const data = await fixture(true, hole);
    const before = JSON.stringify(data);
    const prepared = await prepareRouting(data, { method: "shared-corridor" });
    for (const [from, to] of [
      ["A", "C"],
      ["C", "A"],
    ]) {
      const route = findProjectRoute(prepared.dataset, from, to, "public")!;
      assert.ok(route);
      const points = route.paths.flatMap((p, i) =>
        i ? p.pointsFeet.slice(1) : p.pointsFeet,
      );
      if (hole) {
        assert.ok(
          points.length > 2,
          "the real floor hole cannot be averaged away",
        );
        assert.ok(route.distanceMetres > 8 * 0.3048);
      } else {
        assert.equal(points.length, 2);
        assert.ok(points.every((p) => p[1] === 5));
      }
    }
    assert.equal(JSON.stringify(data), before);
  }
});

test("path view uses bound shared guides on the selected floor, drops repeated segments and cannot include held stairs", async () => {
  const prepared = await prepareRouting(await fixture(), {
    method: "shared-corridor",
  });
  const data = prepared.dataset;
  const paths = hallwayPathView(data, [1], "all");
  assert.ok(paths.features.length > 0);
  assert.equal(
    new Set(paths.features.map((f) => JSON.stringify(f.geometry.coordinates)))
      .size,
    paths.features.length,
  );
  assert.equal(hallwayPathView(data, [999], "all").features.length, 0);
  assert.equal(hallwayPathView(data, [1], "absent").features.length, 0);
  data.edges[0].enabled = false;
  assert.equal(
    hallwayPathView(data, [1], "all").features.length,
    0,
    "an edited source invalidates the saved guide binding",
  );
});

test("short reverse hooks are proposed for cleanup; long U-shaped halls and vertical endpoints are retained", () => {
  const hook: [number, number, number][] = [
    [0, 5, 0],
    [10, 5, 0],
    [11, 5.3, 0],
    [10.3, 5, 0],
    [20, 5, 0],
  ];
  const before = JSON.stringify(hook);
  assert.deepEqual(straightenSharedGuideProposal(hook), [
    [0, 5, 0],
    [20, 5, 0],
  ]);
  assert.equal(JSON.stringify(hook), before);
  const bend: [number, number, number][] = [
    [0, 0, 0],
    [20, 0, 0],
    [21, 10, 0],
    [0, 10, 0],
  ];
  assert.deepEqual(straightenSharedGuideProposal(bend), bend);
  const vertical: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 1],
    [0, 0, 2],
  ];
  assert.deepEqual(straightenSharedGuideProposal(vertical), vertical);
});

test("one blocked hook retains its bend without vetoing another checked cleanup, in either direction", () => {
  const original: [number, number, number][] = [
    [0, 0, 0],
    [5, 0, 0],
    [4.5, 0.2, 0],
    [10, 0, 0],
    [11, 0.2, 0],
    [10.5, 0, 0],
    [20, 0, 0],
  ];
  for (const points of [original, original.toReversed()]) {
    const snapshot = JSON.stringify(points);
    const cleaned = simplifyCheckedSharedGuide(
      points,
      (a, b) => Math.min(a[0], b[0]) >= 8,
      (trial) => trial[0].every((v, k) => v === points[0][k]),
    );
    assert.ok(
      cleaned.some((p) => p[0] === 5),
      "a blocked corner remains",
    );
    assert.ok(
      !cleaned.some((p) => p[0] === 11),
      "another independent hook is removed",
    );
    assert.equal(JSON.stringify(points), snapshot);
    assert.deepEqual(
      cleaned,
      points === original
        ? simplifyCheckedSharedGuide(
            original.toReversed(),
            (a, b) => Math.min(a[0], b[0]) >= 8,
            () => true,
          ).toReversed()
        : simplifyCheckedSharedGuide(
            original,
            (a, b) => Math.min(a[0], b[0]) >= 8,
            () => true,
          ).toReversed(),
    );
  }
});

test("cleanup retains the exact hallway stop anchors even when their outer approaches reverse", () => {
  const points: [number, number, number][] = [
    [0, 0, 0],
    [1, 1, 0],
    [5, 1, 0],
    [5.2, 1.2, 0],
    [5.1, 1, 0],
    [10, 1, 0],
    [9.5, 0, 0],
    [9, 0, 0],
  ];
  const joins = [points[1], points[5]];
  const preserve = (p: [number, number, number]) =>
    joins.some((q) => p.every((v, k) => v === q[k]));
  const numeric = straightenSharedGuideProposal(points, false, preserve);
  const result = simplifyCheckedSharedGuide(
    numeric,
    () => true,
    () => true,
    32,
    preserve,
  );
  for (const join of joins)
    assert.ok(
      result.some((p) => p.every((v, k) => v === join[k])),
      "the later hallway stop can still trim its original door approach",
    );
});
