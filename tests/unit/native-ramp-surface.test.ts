import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract.ts";
import { certifyNativeRampCrossfall } from "../../app/indoor-project/native-ramp-crossfall.ts";
import {
  validNativeRampSurfaceBinding,
  validatedNativeRampSurface,
} from "../../app/indoor-project/native-ramp-surface.ts";
import {
  routingSnapshot,
  withRoutingCalculation,
} from "../../app/indoor-project/routing-cache.ts";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset.ts";
import { readFileSync } from "node:fs";
import { projectLinkPolicy } from "../../app/indoor-project/route-policy.ts";
const fixture = () => {
  const data = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-agora-washroom-navigation.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).data as IndoorDataset;
  const model = data.source.modelSha256,
    points: [[number, number, number], [number, number, number]] = [
      [0, 0, 0],
      [10, 0, 1],
    ],
    triangles: [number, number, number][][] = [
      [
        [0, -1, 0],
        [10, -1, 1],
        [10, 1, 1],
      ],
      [
        [0, -1, 0],
        [10, 1, 1],
        [0, 1, 0],
      ],
    ];
  const floor = {
    elementId: 12,
    categoryId: -2000032,
    boundsFeet: { max: { z: 0 } },
    loops: [
      [
        [-2, -2, 0],
        [-1, -2, 0],
        [-1, 2, 0],
        [-2, 2, 0],
      ],
    ] as [number, number, number][][],
  };
  const edge = {
    ...data.edges[0]!,
    id: "ramp",
    kind: "ramp" as const,
    nativeElementId: 11,
    pointsFeet: points,
  };
  edge.nativeRampSurface = {
    version: 1,
    sourceModelSha256: model,
    nativeRampId: 11,
    nativeFloorElementIds: [12],
    pointsFeet: points,
    widthCertificate: certifyNativeRampCrossfall(triangles, [floor], points)!,
  };
  data.edges = [edge];
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: model,
    floors: [
      {
        nativeElementId: 12,
        elevationFeet: 0,
        ringsFeet: floor.loops.map((r) => r.map((p) => [p[0], p[1]])),
      },
    ],
  } as IndoorDataset["walkingSupport"];
  data.rampDisplay = {
    version: 1,
    sourceModelSha256: model,
    ramps: [
      {
        edgeId: edge.id,
        nativeElementId: 11,
        levelIds: [1],
        anchorPointFeet: points[0],
        trianglesFeet: triangles,
        bodyTrianglesFeet: triangles,
        platforms: [{ nativeElementId: 13, trianglesFeet: triangles }],
      },
    ],
  };
  return { data, edge };
};
test("ramp profiles independently recheck original top faces and stale in-place edits invalidate snapshots", () => {
  const { data, edge } = fixture();
  assert.equal(validNativeRampSurfaceBinding(data, edge), true);
  assert.equal(validatedNativeRampSurface(data, edge), true);
  const before = routingSnapshot(data);
  data.rampDisplay!.ramps[0]!.trianglesFeet[0]![0]![2] += 0.02;
  assert.notEqual(routingSnapshot(data), before);
  assert.equal(
    withRoutingCalculation(data, () => validatedNativeRampSurface(data, edge)),
    false,
    "saved certificate cannot authorize altered physical top faces",
  );
  const fresh = fixture();
  fresh.edge.nativeRampSurface!.widthCertificate.maximumCrossfallRatio = 0.5;
  assert.equal(validatedNativeRampSurface(fresh.data, fresh.edge), false);
  const moved = fixture();
  moved.edge.pointsFeet = structuredClone(moved.edge.pointsFeet);
  moved.edge.pointsFeet[0]![2] += 0.02;
  assert.equal(validNativeRampSurfaceBinding(moved.data, moved.edge), false);
});
test("worker keeps only independently required ramp top faces; unknown access is retained", () => {
  const { data, edge } = fixture();
  edge.accessible = "unknown";
  const beforeDisplay = routingSnapshot(data);
  data.rampDisplay!.ramps[0]!.displayTrianglesFeet = [
    [
      [100, 100, 100],
      [101, 100, 100],
      [100, 101, 100],
    ],
  ];
  assert.equal(
    routingSnapshot(data),
    beforeDisplay,
    "visual clipping never replaces physical route inventory",
  );
  assert.equal(validatedNativeRampSurface(data, edge), true);
  const worker = routeWorkerDataset(data);
  assert.equal(worker.edges[0]!.accessible, "unknown");
  assert.deepEqual(
    worker.rampDisplay!.ramps[0]!.trianglesFeet,
    data.rampDisplay!.ramps[0]!.trianglesFeet,
  );
  assert.equal(worker.rampDisplay!.ramps[0]!.displayTrianglesFeet, undefined);
  assert.deepEqual(worker.rampDisplay!.ramps[0]!.bodyTrianglesFeet, []);
  assert.deepEqual(worker.rampDisplay!.ramps[0]!.platforms, []);
  assert.equal(validatedNativeRampSurface(worker, worker.edges[0]!), true);
  const policy = (mode: "public" | "accessible") =>
    projectLinkPolicy(
      new Map(worker.records.map((r) => [r.key, r])),
      worker.edges[0]!,
      [],
      true,
      mode,
      worker.source.modelSha256,
      worker,
      new Set(),
      new Set(),
    ).blockers.map((b) => b.kind);
  assert.equal(policy("public").includes("source-proof"), false);
  assert.equal(
    policy("accessible").includes("step-free"),
    true,
    "native geometry proof cannot certify unknown step-free access",
  );
  worker.edges[0]!.nativeRampSurface!.widthCertificate.maximumCrossfallRatio = 0.5;
  assert.equal(
    policy("public").includes("source-proof"),
    true,
    "public routes must reject an altered width certificate",
  );
});
