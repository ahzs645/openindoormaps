import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRooms } from "../../app/indoor-project/package";
import {
  BoundaryEvidenceWorkerClient,
  type BoundaryEvidenceRequest,
  type BoundaryEvidenceResponse,
  type BoundaryEvidenceWorker,
} from "../../app/indoor-project/boundary-evidence-worker-client";

const data = {} as IndoorDataset;
const rooms = { annotations: [] } as unknown as ProjectRooms;
class ControlledWorker implements BoundaryEvidenceWorker {
  onmessage: BoundaryEvidenceWorker["onmessage"] = null;
  onerror: BoundaryEvidenceWorker["onerror"] = null;
  onmessageerror: BoundaryEvidenceWorker["onmessageerror"] = null;
  messages: BoundaryEvidenceRequest[] = [];
  terminated = false;
  postMessage(request: BoundaryEvidenceRequest) {
    this.messages.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(value: Map<string, string>, requestId = this.messages[0].requestId) {
    this.onmessage?.({
      data: { requestId, value },
    } as MessageEvent<BoundaryEvidenceResponse>);
  }
}
function setup() {
  const workers: ControlledWorker[] = [];
  const client = new BoundaryEvidenceWorkerClient(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

test("visitor snapshots and cache reads start no audit; an explicit review request does", async () => {
  const { client, workers } = setup();
  client.resetData(data, rooms);
  assert.equal(client.peek(data, rooms), undefined);
  assert.equal(workers.length, 0);
  const request = client.request(data, rooms);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].messages[0].data, data);
  assert.equal(workers[0].messages[0].rooms, rooms);
  const value = new Map([["room", "Reviewed native wall faces"]]);
  workers[0].reply(value);
  assert.equal(await request.promise, value);
  assert.equal(workers[0].terminated, true, "release the large worker heap");
  assert.equal(client.peek(data, rooms), value);
  assert.equal(await client.request(data, rooms).promise, value);
  assert.equal(
    workers.length,
    1,
    "another selection reuses completed evidence",
  );
  client.dispose();
});

test("authoring edits invalidate completed evidence on either snapshot identity", async () => {
  const { client, workers } = setup();
  const first = client.request(data, rooms);
  const original = new Map([["room", "original"]]);
  workers[0].reply(original);
  await first.promise;
  const editedRooms = { ...rooms };
  client.resetData(data, editedRooms);
  assert.equal(client.peek(data, rooms), undefined);
  assert.equal(client.peek(data, editedRooms), undefined);
  const next = client.request(data, editedRooms);
  const revised = new Map([["room", "revised"]]);
  workers[1].reply(revised);
  assert.equal(await next.promise, revised);
  assert.equal(client.peek(data, editedRooms), revised);
  client.resetData({ ...data }, editedRooms);
  assert.equal(client.peek(data, editedRooms), undefined);
  client.dispose();
});

test("closing or changing review terminates CPU work and rejects late or mismatched replies", async () => {
  const { client, workers } = setup();
  const old = client.request(data, rooms);
  const cancelled = assert.rejects(old.promise, { name: "AbortError" });
  old.cancel();
  await cancelled;
  assert.equal(workers[0].terminated, true);
  const freshData = { ...data };
  const next = client.request(freshData, rooms);
  workers[0].reply(new Map([["room", "stale"]]));
  workers[1].reply(new Map([["room", "wrong request"]]), -1);
  assert.equal(client.peek(data, rooms), undefined);
  assert.equal(client.peek(freshData, rooms), undefined);
  const value = new Map([["room", "current"]]);
  workers[1].reply(value);
  assert.equal(await next.promise, value);
  old.cancel();
  assert.equal(client.peek(freshData, rooms), value);
  client.dispose();
  assert.equal(client.peek(freshData, rooms), undefined);
});

test("worker failures stay explicit and permit retry without a UI-thread fallback", async () => {
  let starts = 0;
  const worker = new ControlledWorker();
  const client = new BoundaryEvidenceWorkerClient(() => {
    if (++starts === 1) throw new Error("Worker unavailable");
    return worker;
  });
  await assert.rejects(
    client.request(data, rooms).promise,
    /Worker unavailable/,
  );
  const failed = client.request(data, rooms);
  worker.onmessage?.({
    data: {
      requestId: worker.messages.at(-1)!.requestId,
      error: "Audit rejected",
    },
  } as MessageEvent<BoundaryEvidenceResponse>);
  await assert.rejects(failed.promise, /Audit rejected/);
  const crashed = client.request(data, rooms);
  let prevented = false;
  worker.onerror?.({
    message: "Audit crashed",
    preventDefault() {
      prevented = true;
    },
  } as ErrorEvent);
  await assert.rejects(crashed.promise, /Audit crashed/);
  assert.equal(prevented, true);
  const unreadable = client.request(data, rooms);
  worker.onmessageerror?.({} as MessageEvent);
  await assert.rejects(unreadable.promise, /unreadable data/);
  const retry = client.request(data, rooms);
  worker.reply(
    new Map([["room", "verified"]]),
    worker.messages.at(-1)!.requestId,
  );
  assert.equal((await retry.promise).get("room"), "verified");
  client.dispose();
});
