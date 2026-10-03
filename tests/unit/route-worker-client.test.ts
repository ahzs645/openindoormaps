import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  RouteWorkerClient,
  type RouteWorker,
} from "../../app/indoor-project/route-worker-client";
import type {
  RouteRequest,
  RouteResponse,
  RouteCalculation,
} from "../../app/indoor-project/route-calculation";
class ControlledWorker implements RouteWorker {
  onmessage: RouteWorker["onmessage"] = null;
  onerror: RouteWorker["onerror"] = null;
  onmessageerror: RouteWorker["onmessageerror"] = null;
  messages: RouteRequest[] = [];
  terminated = false;
  postMessage(request: RouteRequest) {
    this.messages.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(value: RouteCalculation, requestId = this.messages.at(-1)!.requestId) {
    this.onmessage?.({
      data: { requestId, value },
    } as MessageEvent<RouteResponse>);
  }
}
const data = {} as IndoorDataset;
function setup() {
  const workers: ControlledWorker[] = [];
  const client = new RouteWorkerClient(() => {
    const w = new ControlledWorker();
    workers.push(w);
    return w;
  });
  return { client, workers };
}
test("changing endpoints cancels CPU work and cannot accept obsolete routes", async () => {
  const { client, workers } = setup();
  const first = client.request(data, "old-start", "old-end", "public");
  const cancelled = assert.rejects(first.promise, { name: "AbortError" });
  const next = client.request(data, "new-start", "new-end", "accessible");
  await cancelled;
  assert.equal(workers[0].terminated, true);
  workers[0].reply({ route: null });
  const current = { route: null };
  workers[1].reply(current);
  assert.equal(await next.promise, current);
  client.dispose();
});
test("completed requests reuse a verified dataset, but imported or edited snapshots replace it", async () => {
  const { client, workers } = setup();
  const first = client.request(data, "a", "b", "public");
  workers[0].reply({ route: null });
  await first.promise;
  const second = client.request(data, "b", "a", "accessible");
  assert.equal(workers[0].messages[1].data, undefined);
  workers[0].reply({ route: null });
  await second.promise;
  const changed = {} as IndoorDataset;
  const edited = client.request(changed, "a", "b", "public");
  assert.equal(workers[0].messages[2].data, changed);
  workers[0].reply({ route: null });
  await edited.promise;
  client.dispose();
});
test("worker failures are visible and the next request starts with a fresh dataset", async () => {
  const { client, workers } = setup();
  const failed = client.request(data, "a", "b", "public");
  const rejection = assert.rejects(failed.promise, /unreadable/);
  workers[0].onmessageerror?.({} as MessageEvent);
  await rejection;
  assert.equal(workers[0].terminated, true);
  const retry = client.request(data, "a", "b", "public");
  assert.equal(workers[1].messages[0].data, data);
  workers[1].reply({ route: null });
  await retry.promise;
  client.dispose();
});
