import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type {
  FloorPreparationRequest,
  FloorPreparationResponse,
  PreparedFloor,
  FloorPreparationOptions,
} from "../../app/indoor-project/prepared-floor";
import {
  FloorWorkerClient,
  floorWorkerKey,
  type FloorWorker,
} from "../../app/indoor-project/floor-worker-client";
const options: FloorPreparationOptions = {
  showPillars: false,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
  showStructures: false,
  review: false,
  simplifyGeometry: true,
};
const project = {} as IndoorDataset;
const floor = (id: string) => ({ id }) as unknown as PreparedFloor;
class ControlledWorker implements FloorWorker {
  onmessage: FloorWorker["onmessage"] = null;
  onerror: FloorWorker["onerror"] = null;
  onmessageerror: FloorWorker["onmessageerror"] = null;
  messages: FloorPreparationRequest[] = [];
  terminated = false;
  postMessage(message: FloorPreparationRequest) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(value: PreparedFloor, requestId = this.messages.at(-1)!.requestId) {
    this.onmessage?.({
      data: { requestId, value },
    } as MessageEvent<FloorPreparationResponse>);
  }
}
function setup(capacity = 12) {
  const workers: ControlledWorker[] = [];
  const client = new FloorWorkerClient(() => {
    const w = new ControlledWorker();
    workers.push(w);
    return w;
  }, capacity);
  return { client, workers };
}
test("rapid floor changes terminate obsolete CPU work and reject late replies", async () => {
  const { client, workers } = setup();
  const old = client.request(project, [4], "all", options);
  const cancelled = assert.rejects(old.promise, { name: "AbortError" });
  const next = client.request(project, [2], "all", options);
  await cancelled;
  assert.equal(workers[0].terminated, true);
  workers[0].reply(floor("stale"));
  assert.equal(
    client.peek(project, floorWorkerKey([4], "all", options)),
    undefined,
  );
  workers[1].reply(
    floor("wrong-generation"),
    workers[1].messages[0].requestId - 1,
  );
  const newest = floor("floor2");
  workers[1].reply(newest);
  assert.equal(await next.promise, newest);
  assert.equal(
    client.peek(project, floorWorkerKey([2], "all", options)),
    newest,
  );
  client.dispose();
  assert.equal(workers[1].terminated, true);
});
test("warm floors avoid worker uploads, but edits and changed geometry options do not reuse them", async () => {
  const { client, workers } = setup();
  const first = client.request(project, [2, 1], "all", options);
  const value = floor("one");
  workers[0].reply(value);
  await first.promise;
  assert.equal(
    await client.request(project, [1, 2, 1], "all", options).promise,
    value,
  );
  assert.equal(workers[0].messages.length, 1);
  const next = client.request(project, [3], "all", options);
  workers[0].reply(floor("three"));
  await next.promise;
  assert.equal(
    workers[0].messages[1].data,
    undefined,
    "same dataset is sent once",
  );
  const edited = {} as IndoorDataset;
  const changed = client.request(edited, [1, 2], "all", options);
  assert.equal(workers[0].messages.at(-1)!.data, edited);
  workers[0].reply(floor("edited"));
  await changed.promise;
  const setting = client.request(edited, [1, 2], "all", {
    ...options,
    relativeHeights: true,
  });
  workers[0].reply(floor("relative"));
  assert.notEqual(await setting.promise, value);
  client.dispose();
});
test("returning to a cached floor cancels an unfinished floor and bounded caching evicts oldest geometry", async () => {
  const { client, workers } = setup(2);
  for (const n of [1, 2]) {
    const job = client.request(project, [n], "all", options);
    workers[0].reply(floor(String(n)));
    await job.promise;
  }
  const active = client.request(project, [3], "all", options);
  const cancelled = assert.rejects(active.promise, { name: "AbortError" });
  await client.request(project, [1], "all", options).promise;
  await cancelled;
  assert.equal(workers[0].terminated, true);
  const fourth = client.request(project, [4], "all", options);
  workers[1].reply(floor("4"));
  await fourth.promise;
  assert.equal(
    client.peek(project, floorWorkerKey([2], "all", options)),
    undefined,
  );
  assert.ok(client.peek(project, floorWorkerKey([1], "all", options)));
  client.dispose();
});
test("worker startup/crash/message errors are recoverable without synchronous geometry fallback", async () => {
  let starts = 0;
  const worker = new ControlledWorker();
  const client = new FloorWorkerClient(() => {
    if (++starts === 1) throw new Error("Worker unavailable");
    return worker;
  });
  await assert.rejects(
    client.request(project, [1], "all", options).promise,
    /Worker unavailable/,
  );
  const retry = client.request(project, [1], "all", options);
  worker.reply(floor("retry"));
  await retry.promise;
  const crash = client.request(project, [2], "all", options);
  let prevented = false;
  worker.onerror?.({
    message: "Worker crashed",
    preventDefault() {
      prevented = true;
    },
  } as ErrorEvent);
  await assert.rejects(crash.promise, /Worker crashed/);
  assert.equal(prevented, true);
  assert.equal(worker.terminated, true);
  const another = client.request(project, [2], "all", options);
  worker.onmessageerror?.({} as MessageEvent);
  await assert.rejects(another.promise, /unreadable geometry/);
  client.dispose();
});
test("unmount cancels active work and worker-reported geometry errors do not poison retry", async () => {
  const { client, workers } = setup();
  const first = client.request(project, [1], "all", options);
  const gone = assert.rejects(first.promise, { name: "AbortError" });
  client.dispose();
  await gone;
  const second = client.request(project, [1], "all", options);
  workers[1].onmessage?.({
    data: {
      requestId: workers[1].messages[0].requestId,
      error: "Invalid geometry",
    },
  } as MessageEvent<FloorPreparationResponse>);
  await assert.rejects(second.promise, /Invalid geometry/);
  const third = client.request(project, [1], "all", options);
  workers[2].reply(floor("valid"));
  await third.promise;
  client.dispose();
});
