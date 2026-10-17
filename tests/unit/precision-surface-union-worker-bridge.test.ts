import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import {
  requestPrecisionSurfaceUnion,
  type PrecisionSurfaceUnionWorker,
} from "../../app/indoor-project/precision-surface-union-worker-bridge";
import type {
  PrecisionSurfaceUnionRequest,
  PrecisionSurfaceUnionResponse,
} from "../../app/indoor-project/precision-surface-union";
class ControlledWorker implements PrecisionSurfaceUnionWorker {
  onmessage: PrecisionSurfaceUnionWorker["onmessage"] = null;
  onerror: PrecisionSurfaceUnionWorker["onerror"] = null;
  onmessageerror: PrecisionSurfaceUnionWorker["onmessageerror"] = null;
  messages: PrecisionSurfaceUnionRequest[] = [];
  terminations = 0;
  postMessage(request: PrecisionSurfaceUnionRequest) {
    this.messages.push(request);
  }
  terminate() {
    this.terminations++;
  }
  reply(
    features = this.messages[0].features,
    requestId = this.messages[0].requestId,
  ) {
    this.onmessage?.({
      data: { requestId, features },
    } as MessageEvent<PrecisionSurfaceUnionResponse>);
  }
}
const geometry = (): MultiPolygon => ({
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
    [
      [
        [1, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 0],
      ],
    ],
  ],
});
const source = (): FeatureCollection<Polygon | MultiPolygon> => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "area",
      properties: {
        key: "area",
        height: 2.5,
        base: 1,
        floorTop: 1.025,
        privateEvidence: "never transported",
      },
      geometry: geometry(),
    },
    {
      type: "Feature",
      id: "slab",
      properties: { nativeFloor: true },
      geometry: geometry(),
    },
  ],
});
test("worker transport contains only geometry/index/id; derived FC retains original identities and properties", async () => {
  const input = source(),
    before = JSON.stringify(input),
    worker = new ControlledWorker();
  const request = requestPrecisionSurfaceUnion(
    input,
    { kind: "floor" },
    () => worker,
  );
  assert.equal(
    worker.messages[0].features.length,
    1,
    "physical native slabs never enter union",
  );
  assert.deepEqual(Object.keys(worker.messages[0].features[0]).sort(), [
    "geometry",
    "id",
    "index",
  ]);
  assert.equal(
    JSON.stringify(worker.messages[0]).includes("privateEvidence"),
    false,
  );
  const resultGeometry: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [2, 0],
          [2, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    ],
  };
  worker.reply([{ index: 0, id: "area", geometry: resultGeometry }]);
  const result = await request.promise;
  assert(result);
  assert.notEqual(result, input);
  assert.equal(result.features[0].properties, input.features[0].properties);
  assert.equal(result.features[0].id, input.features[0].id);
  assert.equal(result.features[0].geometry, resultGeometry);
  assert.equal(result.features[1], input.features[1]);
  assert.equal(JSON.stringify(input), before);
  assert.equal(worker.terminations, 1);
  request.cancel();
  assert.equal(worker.terminations, 1);
});
test("completed cache follows source and geometry scope while ignoring selection", async () => {
  const input = source(),
    workers: ControlledWorker[] = [];
  const factory = () => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  };
  const options = {
    kind: "floor" as const,
    relativeHeights: true,
    originGeographic: [-122, 53] as [number, number],
    selected: "first",
  };
  const first = requestPrecisionSurfaceUnion(input, options, factory);
  workers[0].reply();
  const value = await first.promise;
  const selectedOptions = { ...options, selected: "second" };
  assert.equal(
    await requestPrecisionSurfaceUnion(input, selectedOptions, factory).promise,
    value,
  );
  assert.equal(workers.length, 1);
  for (const [nextSource, nextOptions] of [
    [input, { ...options, kind: "room" as const }],
    [input, { ...options, relativeHeights: false }],
    [input, { ...options, originGeographic: [-121, 53] as [number, number] }],
    [structuredClone(input), options],
  ] as const) {
    const next = requestPrecisionSurfaceUnion(nextSource, nextOptions, factory);
    workers.at(-1)!.reply();
    assert.notEqual(await next.promise, value);
  }
  assert.equal(workers.length, 5);
});
test("cancellation ignores captured late replies, terminates CPU work and never caches obsolete geometry", async () => {
  const input = source(),
    worker = new ControlledWorker();
  const request = requestPrecisionSurfaceUnion(
      input,
      { kind: "floor" },
      () => worker,
    ),
    late = worker.onmessage;
  request.cancel();
  assert.equal(await request.promise, undefined);
  assert.equal(worker.terminations, 1);
  late?.({
    data: {
      requestId: worker.messages[0].requestId,
      features: worker.messages[0].features,
    },
  } as MessageEvent<PrecisionSurfaceUnionResponse>);
  const fresh = new ControlledWorker(),
    next = requestPrecisionSurfaceUnion(input, { kind: "floor" }, () => fresh);
  assert.equal(fresh.messages.length, 1);
  fresh.reply();
  assert(await next.promise);
});
test("worker errors and mismatched indexed geometry keep original caps; excluded scopes start no worker", async () => {
  const input = source();
  const unavailable = requestPrecisionSurfaceUnion(
    input,
    { kind: "floor" },
    () => {
      throw new Error("unavailable");
    },
  );
  assert.equal(await unavailable.promise, undefined);
  const worker = new ControlledWorker(),
    failed = requestPrecisionSurfaceUnion(
      input,
      { kind: "floor" },
      () => worker,
    );
  worker.reply([{ ...worker.messages[0].features[0], index: 99 }]);
  assert.equal(await failed.promise, undefined);
  assert.equal(worker.terminations, 1);
  const crash = new ControlledWorker(),
    crashed = requestPrecisionSurfaceUnion(
      input,
      { kind: "floor" },
      () => crash,
    );
  crash.onerror?.({ preventDefault() {} } as ErrorEvent);
  assert.equal(await crashed.promise, undefined);
  assert.equal(
    await requestPrecisionSurfaceUnion(
      input,
      { kind: "floor", circulationOnly: true },
      () => {
        throw new Error("must not start");
      },
    ).promise,
    input,
  );
});
