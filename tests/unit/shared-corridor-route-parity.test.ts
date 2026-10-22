import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import { encodeNativeExactTopology } from "../../app/indoor-project/native-exact-planar-topology";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
} from "../../app/indoor-project/native-rational-overlay";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import {
  preparedRoutingKey,
  preparedWalkingGuides,
  ROUTING_GUIDE_VERSION,
  withPreparedRouting,
} from "../../app/indoor-project/prepared-routing";
import { composeSharedCorridorGuide } from "../../app/indoor-project/shared-corridor-composition";
import {
  calculateRoute,
  createWorkerRouteCalculator,
} from "../../app/indoor-project/route-calculation";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { hallwayPathView } from "../../app/indoor-project/hallway-path-view";
import type { SharedGuidePoint } from "../../app/indoor-project/shared-corridor-guides";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import {
  collectFreshCandidateRoutingCache,
  writeFreshCandidateRoutingCache,
} from "../../scripts/indoor/candidate-routing-cache";
import {
  createPublishedRouteCalculator,
  decodePublishedRouteCells,
} from "../../app/indoor-project/published-route-cells";
import type { RouteResponse } from "../../app/indoor-project/route-calculation";

async function fixture(compact: boolean) {
  await initializeNativeExactGeosOverlay();
  const data = JSON.parse(
    readFileSync(
      new URL("../fixtures/prepared-walking-corridor.json", import.meta.url),
      "utf8",
    ),
  ) as IndoorDataset;
  const size = compact ? 0.25 : 1;
  const point = (x: number, y: number): SharedGuidePoint => [
    x * size,
    y * size,
    0,
  ];
  // A compact fixture still needs the full two-foot strip.
  const rings: [number, number][][] = [
    [
      [0, 0],
      [40 * size, 0],
      [40 * size, 12],
      [0, 12],
    ],
  ];
  const locations = [point(4, 2), point(20, 4), point(36, 10)];
  const originalRecord = data.records[0],
    originalNode = data.nodes[0],
    originalEdge = data.edges[0];
  data.source.modelSha256 = "a".repeat(64);
  data.records = ["A", "B", "C"].map((key) => ({
    ...originalRecord,
    key,
    number: key,
    name: "Corridor",
    ringsFeet: rings,
    arrivalNodeId: key,
    properties: {},
    levelId: 1,
    elevationFeet: 0,
    circulation: true,
    walkable: true,
    access: "public",
  }));
  data.nodes = data.records.map((record, i) => ({
    ...originalNode,
    id: record.key,
    roomKey: record.key,
    levelId: 1,
    kind: "arrival",
    pointFeet: locations[i],
  }));
  data.edges = [
    [0, 1],
    [1, 2],
  ].map(([a, b]) => ({
    ...originalEdge,
    id: `${data.nodes[a].id}${data.nodes[b].id}`,
    from: data.nodes[a].id,
    to: data.nodes[b].id,
    kind: "walk",
    pointsFeet: [
      locations[a],
      [locations[b][0], locations[a][1], 0],
      locations[b],
    ],
    roomKeys: ["A", "B", "C"],
    nativeCellId: "hall",
    enabled: true,
    accessible: "yes",
    lengthMetres: 30 * size * 0.3048,
  }));
  data.walls = [];
  data.doors = [];
  data.issues = [];
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [{ nativeElementId: 1, elevationFeet: 0, ringsFeet: rings }],
  };
  data.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
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
  data.nativeIndoorEnvelopes.geometrySha256 = await nativeIndoorEnvelopeHash(
    data.nativeIndoorEnvelopes,
  );
  data.circulationGeometry = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
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
  data.circulationGeometry.sourceGeometryKey =
    nativeCirculationGeometryKey(data);
  data.circulationGeometry.exactTopology = encodeNativeExactTopology(
    {
      sourceModelSha256: data.source.modelSha256,
      sourceGeometryKey: data.circulationGeometry.sourceGeometryKey,
      kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
    },
    [{ id: "hall-face", parts: nativeRationalOverlay("union", [rings]) }],
  );
  const guides = [
    {
      edgeId: "AB",
      kind: "shared-corridor" as const,
      pointsFeet: [
        locations[0],
        point(4, 24),
        point(10, 24),
        point(11, 24.8),
        point(10.5, 24),
        point(20, 24),
        locations[1],
      ],
      hallwayJoins: [1, 5] as [number, number],
    },
    {
      edgeId: "BC",
      kind: "shared-corridor" as const,
      pointsFeet: [locations[1], point(20, 24), point(36, 24), locations[2]],
      hallwayJoins: [1, 2] as [number, number],
    },
  ];
  // Keep the same checked wavy core at y=6 for both extents.
  for (const guide of guides)
    for (const p of guide.pointsFeet.slice(1, -1)) p[1] *= compact ? 1 : 0.25;
  return withPreparedRouting(data, {
    version: 1,
    resolverVersion: ROUTING_GUIDE_VERSION,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: preparedRoutingKey(data),
    guides,
  });
}

test("shared routes retain the stored overlay trunk in compact and long halls, through worker projection and reversal", async () => {
  for (const compact of [false, true]) {
    const data = await fixture(compact);
    const snapshot = JSON.stringify(data);
    const stored = [...preparedWalkingGuides(data).values()];
    assert.equal(stored.length, 2);
    const expected = composeSharedCorridorGuide([...stored[0], ...stored[1]]);
    // Exercise the JSON package round trip before the worker projection.
    // eslint-disable-next-line unicorn/prefer-structured-clone
    const workerData = JSON.parse(
      JSON.stringify(routeWorkerDataset(data)),
    ) as IndoorDataset;
    const worker = createWorkerRouteCalculator(workerData);
    for (const [start, end] of [
      ["A", "C"],
      ["C", "A"],
    ]) {
      const options = {
        endpointMode: "inside" as const,
        useSharedCorridorGuides: true,
      };
      const sync = calculateRoute(data, start, end, "public", options).route;
      const background = worker(start, end, "public", options).route;
      assert.ok(sync);
      assert.deepEqual(background, sync);
      assert.ok(sync.paths.every((path) => path.sharedCorridorGuideUsed));
      const points = sync.paths.flatMap((path, i) =>
        i ? path.pointsFeet.slice(1) : path.pointsFeet,
      );
      assert.deepEqual(
        points,
        start === "A" ? expected : expected.toReversed(),
      );
      const overlay = hallwayPathView(data, [1], "all", {
        includeSourceFeet: true,
      });
      const drawn = overlay.features.flatMap((feature) =>
        feature.properties?.pointsFeet ? [feature.properties.pointsFeet] : [],
      );
      // The three noncollinear hook segments are the regression: prior runtime
      // fitting erased these from routes while the overlay retained them.
      for (const [a, b] of [
        [stored[0][2], stored[0][3]],
        [stored[0][3], stored[0][4]],
      ])
        assert.ok(
          drawn.some(
            (segment) =>
              JSON.stringify(segment) === JSON.stringify([a, b]) ||
              JSON.stringify(segment) === JSON.stringify([b, a]),
          ),
        );
      assert.deepEqual(
        sync.edges.map((edge) => edge.id),
        start === "A" ? ["AB", "BC"] : ["BC", "AB"],
      );
    }
    const off = worker("A", "C", "public", {
      endpointMode: "inside",
      useSharedCorridorGuides: false,
    }).route;
    assert.ok(off);
    assert.ok(off.paths.every((path) => !path.sharedCorridorGuideUsed));
    assert.equal(JSON.stringify(data), snapshot);
    const stale = structuredClone(data);
    stale.records[0].access = "staff";
    assert.equal(preparedWalkingGuides(stale).size, 0);
    assert.equal(
      hallwayPathView(stale, [1], "all").features.some(
        (feature) => feature.properties?.source === "shared-guide",
      ),
      false,
    );
  }
});

test(
  "the production worker message path and published cache hydration preserve canonical shared geometry",
  { timeout: 30_000 },
  async () => {
    // eslint-disable-next-line unicorn/prefer-structured-clone
    const data = JSON.parse(
      JSON.stringify(routeWorkerDataset(await fixture(false))),
    ) as IndoorDataset;
    const run = createImmutableRoutingSession(data);
    const fresh = run(() => collectFreshCandidateRoutingCache(data));
    const directory = await mkdtemp(
      path.join(tmpdir(), "shared-route-parity-"),
    );
    let worker: Worker | undefined;
    try {
      const { receipt, cachePath } = await writeFreshCandidateRoutingCache(
        fresh,
        path.join(directory, "cache"),
      );
      const entries = decodePublishedRouteCells(
        data,
        receipt,
        new Uint8Array(await readFile(cachePath)),
      );
      const hydrated = createPublishedRouteCalculator(data, entries);
      const workerEntry = new URL(
        "../../app/indoor-project/route-calculation.worker.ts",
        import.meta.url,
      );
      const wrapper = path.join(directory, "worker.mjs");
      await writeFile(
        wrapper,
        `import { parentPort } from "node:worker_threads";
globalThis.postMessage = (response) => parentPort.postMessage(response);
await import(${JSON.stringify(workerEntry.href)});
parentPort.on("message", data => globalThis.onmessage({ data }));
parentPort.postMessage({ ready: true });
`,
      );
      worker = new Worker(wrapper, {
        execArgv: ["--import", import.meta.resolve("tsx")],
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      const [ready] = await once(worker, "message");
      assert.deepEqual(ready, { ready: true });
      let requestId = 0;
      for (const [start, end] of [
        ["A", "C"],
        ["C", "A"],
      ])
        for (const useSharedCorridorGuides of [true, false]) {
          const options = {
            endpointMode: "inside" as const,
            useSharedCorridorGuides,
          };
          const expected = calculateRoute(
            data,
            start,
            end,
            "public",
            options,
          ).route;
          const response = once(worker, "message");
          worker.postMessage({
            requestId: ++requestId,
            ...(requestId === 1 ? { data } : {}),
            start,
            end,
            mode: "public",
            options,
          });
          const [message] = (await response) as [RouteResponse];
          assert.ok(
            "value" in message,
            "the production worker completed its ordinary message handler",
          );
          assert.deepEqual(message.value.route, expected);
          assert.deepEqual(
            hydrated(start, end, "public", options).route,
            expected,
          );
        }
    } finally {
      await worker?.terminate();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
