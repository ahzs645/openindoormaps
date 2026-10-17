import assert from "node:assert/strict";
import test from "node:test";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import { createVerifiedProgressiveRouteCalculator } from "../../app/indoor-project/progressive-route-validation";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";

test("progressive calculator validates the entire private dataset before exposing ordinary directions", () => {
  const data = progressiveRoutingFixture();
  const original = JSON.stringify(data);
  const calculate = createVerifiedProgressiveRouteCalculator(data);
  for (const mode of ["public", "accessible"] as const) {
    const route = calculate("0", "1", mode).route;
    assert(route);
    assert.equal(route.distanceMetres, 15 * 0.3048);
  }
  assert.equal(JSON.stringify(data), original);
});
test("duplicate source identities rejected by full validation cannot be admitted by an otherwise successful route", () => {
  const data = progressiveRoutingFixture();
  data.records.push(structuredClone(data.records[0]));
  assert(
    createWorkerRouteCalculator(data)("0", "1", "public").route,
    "Calculator path checks alone do not establish structural validity",
  );
  assert.throws(
    () => createVerifiedProgressiveRouteCalculator(data),
    /Invalid indoor area/,
  );
});

test("the projected native ramp retains exact physical top evidence and passes the unchanged full validator after display bodies are omitted", async () => {
  const { certifyNativeRampCrossfall } = await import(
    "../../app/indoor-project/native-ramp-crossfall"
  );
  const { routeWorkerDataset } = await import(
    "../../app/indoor-project/route-worker-dataset"
  );
  const { validateIndoorDataset: validate } = await import(
    "../../app/indoor-project/routing"
  );
  const data = progressiveRoutingFixture();
  const edge = data.edges[0];
  edge.kind = "ramp";
  edge.nativeElementId = 11;
  const points = edge.pointsFeet;
  const triangles: [number, number, number][][] = [
    [
      [5, 4, 0],
      [20, 4, 0],
      [20, 6, 0],
    ],
    [
      [5, 4, 0],
      [20, 6, 0],
      [5, 6, 0],
    ],
  ];
  const floor = {
    elementId: 12,
    categoryId: -2_000_032,
    boundsFeet: { max: { z: 0 } },
    loops: [
      [
        [0, 0, 0],
        [30, 0, 0],
        [30, 10, 0],
        [0, 10, 0],
      ],
    ] as [number, number, number][][],
  };
  const certificate = certifyNativeRampCrossfall(triangles, [floor], points);
  assert(certificate);
  edge.nativeRampSurface = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    nativeRampId: 11,
    nativeFloorElementIds: [12],
    pointsFeet: points,
    widthCertificate: certificate,
  };
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      {
        nativeElementId: 12,
        elevationFeet: 0,
        ringsFeet: floor.loops.map((ring) =>
          ring.map((point): [number, number] => [point[0], point[1]]),
        ),
      },
    ],
  };
  data.rampDisplay = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    ramps: [
      {
        nativeElementId: 11,
        edgeId: edge.id,
        levelIds: [1],
        anchorPointFeet: points[0],
        trianglesFeet: triangles,
        bodyTrianglesFeet: triangles,
        platforms: [],
      },
    ],
  };
  const validateIndoorDataset: typeof import("../../app/indoor-project/routing").validateIndoorDataset =
    validate;
  validateIndoorDataset(data);
  const projection = structuredClone(routeWorkerDataset(data));
  assert.equal(projection.rampDisplay!.ramps.length, 1);
  assert.equal(projection.rampDisplay!.ramps[0].bodyTrianglesFeet, undefined);
  assert.deepEqual(projection.rampDisplay!.ramps[0].trianglesFeet, triangles);
  assert.deepEqual(
    projection.edges[0].nativeRampSurface,
    edge.nativeRampSurface,
  );
  assert.doesNotThrow(() => validateIndoorDataset(projection));
  const rejected = structuredClone(projection);
  rejected.rampDisplay!.ramps[0].bodyTrianglesFeet = [];
  assert.throws(() => validateIndoorDataset(rejected), /platform geometry/);
  assert(
    createVerifiedProgressiveRouteCalculator(projection)("0", "1", "public")
      .route,
  );
});

test("the existing UNBC Agora source projection validates and preserves its route while duplicate room identities are refused", async () => {
  const { readFileSync } = await import("node:fs");
  const { routeWorkerDataset } = await import(
    "../../app/indoor-project/route-worker-dataset"
  );
  const source = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/unbc-agora-washroom-navigation.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const data = structuredClone(routeWorkerDataset(source.data));
  const route = createVerifiedProgressiveRouteCalculator(data)(
    source.startKey,
    source.endKey,
    "public",
  ).route;
  assert(route);
  assert.ok(Math.abs(route.distanceMetres - 76.720_943_421_331_43) < 1e-9);
  const invalid = structuredClone(routeWorkerDataset(source.data));
  invalid.records.push(
    structuredClone(
      invalid.records.find((record) => record.key === source.startKey)!,
    ),
  );
  assert.throws(
    () => createVerifiedProgressiveRouteCalculator(invalid),
    /Invalid indoor area/,
  );
});
