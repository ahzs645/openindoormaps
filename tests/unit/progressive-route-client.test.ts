import assert from "node:assert/strict";
import test from "node:test";
import {
  ProgressiveRouteClient,
  preparationTakenOver,
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

const url = "https://example.test/map.json";
const routeReply = (worker: Worker, index: number) =>
  worker.reply({
    requestId: worker.requests[index].requestId,
    value: { route: null },
    steps: [],
    summary: { transitPlaces: [] },
  });
test("preparation loads a revision without a route, and the next request only calculates", async () => {
  const workers: Worker[] = [];
  const client = new ProgressiveRouteClient(() => {
    const worker = new Worker();
    workers.push(worker);
    return worker;
  });
  const prepared = client.prepare(url, manifest, { offline: true });
  assert.equal(workers.length, 1);
  const message = workers[0].requests[0];
  assert.equal(message.prepareOnly, true);
  assert.equal(message.delivery?.manifest, manifest);
  assert.equal(message.delivery?.offline, true);
  assert.equal(message.start, "");
  workers[0].reply({ requestId: message.requestId, prepared: true });
  await prepared.promise;
  // Resident: a second preparation and the route reuse the same worker.
  await client.prepare(url, manifest).promise;
  assert.equal(workers[0].requests.length, 1);
  const route = client.request(url, manifest, "a", "b", "public");
  assert.equal(workers.length, 1);
  assert.equal(workers[0].requests[1].delivery, undefined);
  assert.equal(workers[0].requests[1].prepareOnly, undefined);
  routeReply(workers[0], 1);
  await route.promise;
  client.dispose();
});
test("a route request takes over an unfinished preparation in the same worker", async () => {
  const worker = new Worker(),
    client = new ProgressiveRouteClient(() => worker);
  const prepared = client.prepare(url, manifest);
  const takenOver = assert.rejects(prepared.promise, (error: unknown) =>
    preparationTakenOver(error),
  );
  const route = client.request(url, manifest, "a", "b", "public");
  assert.equal(worker.terminated, false);
  assert.equal(worker.requests[1].delivery, undefined);
  // The preparation's own late reply cannot resolve the route.
  worker.reply({ requestId: worker.requests[0].requestId, prepared: true });
  routeReply(worker, 1);
  await takenOver;
  await route.promise;
  // Nothing starts beside a pending request.
  const pending = client.request(url, manifest, "b", "a", "public");
  await client.prepare(url, manifest).promise;
  assert.equal(worker.requests.length, 3);
  routeReply(worker, 2);
  await pending.promise;
  client.dispose();
});
test("a failed or cancelled preparation releases its worker; the next request reloads", async () => {
  const workers: Worker[] = [];
  const client = new ProgressiveRouteClient(() => {
    const worker = new Worker();
    workers.push(worker);
    return worker;
  });
  const failed = client.prepare(url, manifest);
  workers[0].reply({
    requestId: workers[0].requests[0].requestId,
    error: "Directions source checksum mismatch.",
  });
  await assert.rejects(failed.promise, /checksum mismatch/);
  assert.equal(workers[0].terminated, true);
  const cancelled = client.prepare(url, manifest);
  const released = assert.rejects(
    cancelled.promise,
    (error: unknown) =>
      error instanceof DOMException &&
      error.name === "AbortError" &&
      !preparationTakenOver(error),
  );
  cancelled.cancel();
  await released;
  assert.equal(workers[1].terminated, true);
  const route = client.request(url, manifest, "a", "b", "public");
  assert.equal(workers.length, 3);
  assert.equal(workers[2].requests[0].delivery?.manifest, manifest);
  routeReply(workers[2], 0);
  await route.promise;
  client.dispose();
});
test("only an idle resident worker is released for floor work", async () => {
  const worker = new Worker(),
    client = new ProgressiveRouteClient(() => worker);
  assert.equal(client.releaseIdle(), false);
  const route = client.request(url, manifest, "a", "b", "public");
  assert.equal(client.releaseIdle(), false);
  assert.equal(worker.terminated, false);
  routeReply(worker, 0);
  await route.promise;
  assert.equal(client.releaseIdle(), true);
  assert.equal(worker.terminated, true);
});
