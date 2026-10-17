import assert from "node:assert/strict";
import test from "node:test";
import {
  ProgressiveRouteClient,
  type ProgressiveRouteRequest,
  type ProgressiveRouteWorker,
  type ProgressiveRouteResponse,
} from "../../app/indoor-project/progressive-route-client";
import type { ProgressiveManifest } from "../../app/indoor-project/progressive-delivery";
class Worker implements ProgressiveRouteWorker {
  onmessage: ProgressiveRouteWorker["onmessage"] = null;
  onerror: ProgressiveRouteWorker["onerror"] = null;
  onmessageerror: ProgressiveRouteWorker["onmessageerror"] = null;
  requests: ProgressiveRouteRequest[] = [];
  terminated = false;
  postMessage(request: ProgressiveRouteRequest) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(response: ProgressiveRouteResponse) {
    this.onmessage?.({
      data: response,
    } as MessageEvent<ProgressiveRouteResponse>);
  }
}
const manifest = { revisionSha256: "a".repeat(64) } as ProgressiveManifest;
test("routing remains lazy, reuses a checked worker revision and never posts a full dataset", async () => {
  const workers: Worker[] = [];
  const client = new ProgressiveRouteClient(() => {
    const worker = new Worker();
    workers.push(worker);
    return worker;
  });
  assert.equal(workers.length, 0);
  const first = client.request(
    "https://example.test/map.json",
    manifest,
    "a",
    "b",
    "public",
  );
  assert.equal(workers.length, 1);
  const initial = workers[0].requests[0];
  assert.equal(initial.delivery?.manifest, manifest);
  assert.ok(!("data" in initial));
  workers[0].reply({
    requestId: initial.requestId,
    value: { route: null },
    steps: [],
    summary: { transitPlaces: [] },
  });
  await first.promise;
  const second = client.request(
    "https://example.test/map.json",
    manifest,
    "b",
    "a",
    "accessible",
  );
  assert.equal(workers[0].requests[1].delivery, undefined);
  workers[0].reply({
    requestId: workers[0].requests[1].requestId,
    value: { route: null },
    steps: [],
    summary: { transitPlaces: [] },
  });
  await second.promise;
  client.dispose();
  assert.equal(workers[0].terminated, true);
});
test("superseded routes terminate CPU work and stale replies cannot resolve another revision", async () => {
  const workers: Worker[] = [];
  const client = new ProgressiveRouteClient(() => {
    const worker = new Worker();
    workers.push(worker);
    return worker;
  });
  const first = client.request(
    "https://example.test/map.json",
    manifest,
    "a",
    "b",
    "public",
  );
  const rejected = assert.rejects(
    first.promise,
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
  const next = client.request(
    "https://example.test/map.json",
    { ...manifest, revisionSha256: "b".repeat(64) },
    "a",
    "c",
    "public",
  );
  assert.equal(workers[0].terminated, true);
  workers[0].reply({
    requestId: workers[0].requests[0].requestId,
    value: { route: null },
    steps: [],
    summary: { transitPlaces: [] },
  });
  workers[1].reply({
    requestId: workers[1].requests[0].requestId,
    value: { route: null },
    steps: [],
    summary: { transitPlaces: [] },
  });
  await rejected;
  await next.promise;
  client.dispose();
});
test("unreadable worker replies reject and dispose instead of leaving directions pending", async () => {
  const worker = new Worker(),
    client = new ProgressiveRouteClient(() => worker);
  const result = client.request(
    "https://example.test/map.json",
    manifest,
    "a",
    "b",
    "public",
  );
  worker.onmessageerror?.({} as MessageEvent);
  await assert.rejects(result.promise, /unreadable/);
  assert.equal(worker.terminated, true);
});

test("worker factory and postMessage failures reject and release the worker", async () => {
  const factory = new ProgressiveRouteClient(() => {
    throw new Error("Worker factory failed");
  });
  await assert.rejects(
    factory.request(
      "https://example.test/map.json",
      manifest,
      "a",
      "b",
      "public",
    ).promise,
    /factory failed/,
  );
  const worker = new Worker();
  worker.postMessage = () => {
    throw new Error("Message clone failed");
  };
  const client = new ProgressiveRouteClient(() => worker);
  await assert.rejects(
    client.request(
      "https://example.test/map.json",
      manifest,
      "a",
      "b",
      "public",
    ).promise,
    /clone failed/,
  );
  assert.equal(worker.terminated, true);
});
