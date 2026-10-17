import test from "node:test";
import assert from "node:assert/strict";
import {
  RouteWorkerClient,
  type RouteWorker,
} from "../../app/indoor-project/route-worker-client";
import {
  sameRoutePlace,
  missingRouteEntrance,
  visitorRouteFailureMessage,
} from "../../app/indoor-project/visitor-route-state";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type {
  RouteRequest,
  RouteCalculation,
} from "../../app/indoor-project/route-calculation";

class ControlledWorker implements RouteWorker {
  onmessage: RouteWorker["onmessage"] = null;
  onerror: RouteWorker["onerror"] = null;
  onmessageerror: RouteWorker["onmessageerror"] = null;
  messages: RouteRequest[] = [];
  terminated = false;
  postMessage(r: RouteRequest) {
    this.messages.push(r);
  }
  terminate() {
    this.terminated = true;
  }
  reply(value: RouteCalculation) {
    this.onmessage?.({
      data: { requestId: this.messages.at(-1)!.requestId, value },
    } as MessageEvent);
  }
}
test("missing original arrivals refuse immediately without inventing an entrance", () => {
  const data = progressiveRoutingFixture(),
    [a, b] = data.records;
  assert.equal(missingRouteEntrance(data, a.key, b.key), undefined);
  delete b.arrivalNodeId;
  assert.equal(
    missingRouteEntrance(data, a.key, b.key)?.kind,
    "missing-entrance",
  );
  assert.equal(missingRouteEntrance(data, a.key, b.key)?.reviewRoomKey, b.key);
  assert.equal(missingRouteEntrance(data, b.key, b.key), undefined);
  assert.equal(missingRouteEntrance(data, a.key, ""), undefined);
});
function setup() {
  const workers: ControlledWorker[] = [];
  const client = new RouteWorkerClient(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers, data: {} as IndoorDataset };
}
test("identical selected identities need no route; similarly named distinct identities still do", () => {
  assert.equal(sameRoutePlace("Agora", "Agora"), true);
  assert.equal(sameRoutePlace("", ""), false);
  assert.equal(sameRoutePlace("agora-on-level-a", "agora-on-level-b"), false);
});
test("completed results survive worker release without allocation and isolate returned mutations", async () => {
  const { client, workers, data } = setup();
  const first = client.request(data, "a", "b", "public");
  workers[0].reply({ route: null, reachable: new Set(["b"]) });
  (await first.promise).reachable!.clear();
  // A second result on the same worker must be stored under its own request key.
  const second = client.request(data, "a", "c", "public");
  workers[0].reply({ route: null, reachable: new Set(["c"]) });
  await second.promise;
  client.dispose();
  assert.equal(client.hasResidentWorker(), false);
  assert.equal(client.hasCompleted(data, "a", "b", "public"), true);
  const repeat = await client.request(data, "a", "b", "public").promise;
  assert.deepEqual([...repeat.reachable!], ["b"]);
  repeat.reachable!.clear();
  assert.deepEqual(
    [...(await client.request(data, "a", "b", "public").promise).reachable!],
    ["b"],
  );
  assert.deepEqual(
    [...(await client.request(data, "a", "c", "public").promise).reachable!],
    ["c"],
  );
  assert.equal(workers.length, 1);
});
test("result history is profile-bound, limited to eight, and invalidated by a new source snapshot", async () => {
  const { client, workers, data } = setup();
  for (let i = 0; i < 9; i++) {
    const job = client.request(data, "a", String(i), "public");
    workers[0].reply({ route: null });
    await job.promise;
  }
  assert.equal(client.hasCompleted(data, "a", "0", "public"), false);
  assert.equal(client.hasCompleted(data, "a", "8", "public"), true);
  assert.equal(client.hasCompleted(data, "a", "8", "accessible"), false);
  client.resetData(structuredClone(data));
  assert.equal(client.hasCompleted(data, "a", "8", "public"), false);
  assert.equal(workers[0].terminated, true);
});
test("visitor failure text preserves restricted/step-free availability without authoring prompts", () => {
  const diagnostic = {
    kind: "blocked" as const,
    message: "Open source review",
    blockers: [{ kind: "staff" as const, edgeId: "e" }],
    sourceEdgeIds: [],
  };
  assert.match(visitorRouteFailureMessage(diagnostic, "public"), /restricted/);
  assert.match(
    visitorRouteFailureMessage(diagnostic, "accessible"),
    /No confirmed step-free/,
  );
  assert.doesNotMatch(
    visitorRouteFailureMessage(diagnostic, "public"),
    /review/i,
  );
});
