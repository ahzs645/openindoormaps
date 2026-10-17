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
} from "../../app/indoor-project/shared-corridor-guides";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { projectRoutingOptionsKey } from "../../app/indoor-project/routing-options";
import {
  loadSharedCorridorPreference,
  saveSharedCorridorPreference,
} from "../../app/indoor-project/shared-corridor-preferences";
import { centerHallwayRouteEndpoints } from "../../app/indoor-project/hallway-center-endpoints";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";

async function fixture() {
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
    [40, 0],
    [40, 10],
    [0, 10],
  ];
  const original = d.records[0],
    node = d.nodes[0],
    edge = d.edges[0];
  const points: [number, number, number][] = [
    [4, 1, 0],
    [20, 1, 0],
    [36, 9, 0],
  ];
  d.records = ["A", "B", "C"].map((key) => ({
    ...original,
    key,
    number: key,
    name: key,
    ringsFeet: [ring],
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
      pointsFeet: [points[1], [36, 1, 0], points[2]],
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
    floors: [{ nativeElementId: 1, elevationFeet: 0, ringsFeet: [ring] }],
  };
  d.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "",
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: [[ring]],
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
        ringsFeet: [ring],
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
    [{ id: "hall-face", parts: nativeRationalOverlay("union", [[ring]]) }],
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
