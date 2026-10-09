import test from "node:test";
import assert from "node:assert/strict";
import {
  startNativeExactHitClient,
  type NativeExactHitWorker,
} from "../../app/indoor-project/native-exact-hit-client";
function fake() {
  const messages: Parameters<NativeExactHitWorker["postMessage"]>[0][] = [];
  let terminated = 0;
  const worker: NativeExactHitWorker = {
    onmessage: null,
    onerror: null,
    postMessage: (v) => messages.push(v),
    terminate: () => {
      terminated++;
    },
  };
  return {
    worker,
    messages,
    get terminated() {
      return terminated;
    },
    respond(
      v: Parameters<NonNullable<NativeExactHitWorker["onmessage"]>>[0]["data"],
    ) {
      worker.onmessage?.({ data: v } as MessageEvent);
    },
  };
}
test("new exact picks cancel stale replies without retaining work after floor teardown", async () => {
  const f = fake(),
    client = startNativeExactHitClient([], () => f.worker);
  assert.equal(f.messages[0].kind, "init");
  const first = client.hit([1, 1]),
    second = client.hit([2, 2]);
  assert.deepEqual(await first, []);
  f.respond({ id: 1, faceIds: ["old"] });
  f.respond({ id: 2, faceIds: ["current"] });
  assert.deepEqual(await second, ["current"]);
  const third = client.hit([3, 3]);
  client.cancel();
  assert.deepEqual(await third, []);
  f.respond({ id: 3, faceIds: ["stale-floor"] });
  assert.equal(f.terminated, 1);
  assert.deepEqual(await client.hit([4, 4]), []);
  client.cancel();
  assert.equal(f.terminated, 1);
});
test("failed exact worker closes pending picks without a numerical fallback", async () => {
  const f = fake(),
    client = startNativeExactHitClient([], () => f.worker),
    pending = client.hit([1, 1]);
  f.respond({ error: "Stale exact source topology" });
  assert.deepEqual(await pending, []);
  assert.equal(f.terminated, 1);
  assert.deepEqual(await client.hit([1, 1]), []);
});
test("initialization and posting failures release exact worker and pending promises", async () => {
  const bad = fake();
  bad.worker.postMessage = () => {
    throw new Error("clone failed");
  };
  const client = startNativeExactHitClient([], () => bad.worker);
  assert.equal(bad.terminated, 1);
  assert.deepEqual(await client.hit([0, 0]), []);
  const thrown = startNativeExactHitClient([], () => {
    throw new Error("worker unavailable");
  });
  assert.deepEqual(await thrown.hit([0, 0]), []);
  const f = fake(),
    live = startNativeExactHitClient([], () => f.worker);
  f.worker.postMessage = () => {
    throw new Error("post failed");
  };
  assert.deepEqual(await live.hit([0, 0]), []);
  assert.equal(f.terminated, 1);
});
