import test from "node:test";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  RouteWorkerClient,
  releaseIdleRouteForReview,
  type RouteWorker,
} from "../../app/indoor-project/route-worker-client";
import type {
  RouteRequest,
  RouteResponse,
  RouteCalculation,
} from "../../app/indoor-project/route-calculation";
import {
  HeavyWorkerSchedule,
  scheduleRouteWarmup,
} from "../../app/indoor-project/heavy-worker-schedule";
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
test("changing staircase exclusions reroutes without recloning a resident map and cannot reuse a different preference result", async () => {
  const { client, workers } = setup();
  const first = client.request(data, "a", "b", "public");
  workers[0].reply({ route: null, reachable: new Set(["b"]) });
  await first.promise;
  const excluded = client.request(data, "a", "b", "public", {
    excludedNativeStairIds: [987],
  });
  assert.equal(workers.length, 1);
  assert.equal(workers[0].messages.length, 2);
  assert.equal(workers[0].messages[1].data, undefined);
  assert.deepEqual(workers[0].messages[1].options?.excludedNativeStairIds, [
    987,
  ]);
  workers[0].reply({ route: null, reachable: new Set() });
  assert.equal((await excluded.promise).reachable!.has("b"), false);
  const restored = client.request(data, "a", "b", "public");
  assert.equal((await restored.promise).reachable!.has("b"), true);
  assert.equal(workers[0].messages.length, 2);
  client.dispose();
});
test("selected endpoint responses never mask a legacy all-choices response in the client cache", async () => {
  const { client, workers } = setup();
  const selected = client.request(data, "a", "b", "public", {
    endpointMode: "inside",
  });
  workers[0].reply({ route: null, arrivals: { doorway: { route: null } } });
  await selected.promise;
  const legacy = client.request(data, "a", "b", "public");
  assert.equal(workers[0].messages.length, 2);
  workers[0].reply({
    route: null,
    arrivals: { doorway: { route: null }, hallway: { route: null } },
  });
  assert.ok((await legacy.promise).arrivals?.hallway);
  assert.equal(
    (
      await client.request(data, "a", "b", "public", { endpointMode: "inside" })
        .promise
    ).arrivals?.hallway,
    undefined,
  );
  assert.equal(workers[0].messages.length, 2);
  client.dispose();
});
test("review releases a completed user graph before warmup ever ran, retaining its returned route", async () => {
  const { client, workers } = setup();
  const schedule = new HeavyWorkerSchedule();
  const warmup = scheduleRouteWarmup(
    schedule,
    () => assert.fail("The warmup gate has not elapsed."),
    { onReady() {}, onError: (error) => assert.fail(String(error)) },
    { ms: 5000, setTimer: () => 1, clearTimer() {} },
  );
  let released = 0;
  const stop = releaseIdleRouteForReview(schedule, client, () => released++);
  const finishRoute = schedule.begin("route");
  const request = client.request(data, "a", "b", "public");
  let finishTeardown = () => {};
  let terminations = 0;
  workers[0].terminate = () => {
    workers[0].terminated = true;
    terminations++;
    // The real tracked worker announces teardown synchronously, notifying the
    // release listener again while dispose() is still on the call stack.
    finishTeardown = schedule.begin("teardown");
  };
  const actual: RouteCalculation = {
    route: {
      nodeIds: ["a", "b"],
      edges: [],
      distanceMetres: 12,
      sourceDistanceMetres: 12,
      paths: [],
      unknownAccessAreas: [],
      unknownAccessibilityEdges: 0,
    },
  };
  const snapshot = structuredClone(actual);
  workers[0].reply(actual);
  const shown = await request.promise;
  finishRoute();
  assert.equal(warmup.state(), "idle", "no warmup run owns this graph");
  const floor = schedule.begin("floor");
  assert.equal(
    workers[0].terminated,
    false,
    "floor alone retains shown routes",
  );
  floor();
  const review = schedule.begin("review");
  assert.equal(workers[0].terminated, true);
  assert.equal(client.hasResidentWorker(), false);
  assert.equal(terminations, 1, "teardown notifications do not dispose twice");
  assert.equal(released, 1);
  assert.equal(schedule.busy("teardown"), true);
  assert.deepEqual(shown, snapshot, "the displayed route remains available");
  stop();
  finishTeardown();
  review();
  warmup.dispose();
  const next = client.request(data, "b", "a", "public");
  assert.notEqual(workers[1].messages[0].data, undefined);
  workers[1].reply({ route: null });
  await next.promise;
  client.dispose();
});

test("review release protects an active user request and catches an already active review", async () => {
  const { client, workers } = setup();
  const schedule = new HeavyWorkerSchedule();
  const finishRoute = schedule.begin("route");
  const request = client.request(data, "a", "b", "public");
  const review = schedule.begin("review");
  let released = 0;
  const stop = releaseIdleRouteForReview(schedule, client, () => released++);
  assert.equal(workers[0].terminated, false);
  workers[0].reply({ route: null });
  await request.promise;
  finishRoute();
  assert.equal(workers[0].terminated, true);
  assert.equal(released, 1);
  stop();
  const next = client.request(data, "b", "a", "public");
  workers[1].reply({ route: null });
  await next.promise;
  const stopLate = releaseIdleRouteForReview(
    schedule,
    client,
    () => released++,
  );
  assert.equal(
    workers[1].terminated,
    true,
    "registration checks current review",
  );
  assert.equal(released, 2);
  stopLate();
  review();
});

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
  assert.equal(workers[0].terminated, true);
  assert.notEqual(workers[1].messages[0].data, undefined);
  workers[1].reply({ route: null });
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
  assert.notEqual(workers[1].messages[0].data, undefined);
  workers[1].reply({ route: null });
  await retry.promise;
  client.dispose();
});

test("import or clear releases a completed dataset even before new route endpoints are chosen", async () => {
  const { client, workers } = setup();
  const route = client.request(data, "a", "b", "public");
  workers[0].reply({ route: null });
  await route.promise;
  client.resetData(data);
  assert.equal(workers[0].terminated, false, "same snapshot keeps graph reuse");
  const imported = {} as IndoorDataset;
  client.resetData(imported);
  assert.equal(workers[0].terminated, true);
  const next = client.request(imported, "c", "d", "accessible");
  assert.notEqual(workers[1].messages[0].data, undefined);
  workers[1].reply({ route: null });
  await next.promise;
  // The required argument models clearing the imported project.
  // eslint-disable-next-line unicorn/no-useless-undefined
  client.resetData(undefined);
  assert.equal(workers[1].terminated, true);
});

test("snapshot reset cancels pending work and rejects stale replies", async () => {
  const { client, workers } = setup();
  const route = client.request(data, "a", "b", "public");
  const cancelled = assert.rejects(route.promise, { name: "AbortError" });
  client.resetData({} as IndoorDataset);
  workers[0].reply({ route: null });
  await cancelled;
  assert.equal(workers[0].terminated, true);
  client.dispose();
});

test("a real destination reuses an in-flight same-snapshot warmup and ignores its stale reply", async () => {
  const { client, workers } = setup();
  const preparation = client.request(data, "", "", "public");
  const cancelled = assert.rejects(preparation.promise, { name: "AbortError" });
  const preparedId = workers[0].messages[0].requestId;
  const request = client.request(data, "a", "b", "public");
  await cancelled;
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, false);
  assert.equal(workers[0].messages[1].data, undefined);
  workers[0].reply({ route: null }, preparedId);
  const actual = { route: null, reachable: new Set(["b"]) };
  workers[0].reply(actual);
  assert.equal(await request.promise, actual);
  client.dispose();
});

test("choosing a destination retains in-flight departure coverage but rejects its stale result", async () => {
  const { client, workers } = setup();
  const coverage = client.request(data, "a", "", "public");
  const cancelled = assert.rejects(coverage.promise, { name: "AbortError" });
  const coverageId = workers[0].messages[0].requestId;
  const route = client.request(data, "a", "b", "public");
  await cancelled;
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, false);
  assert.equal(workers[0].messages[1].data, undefined);
  workers[0].reply({ route: null, reachable: new Set(["wrong"]) }, coverageId);
  const current = { route: null, reachable: new Set(["b"]) };
  workers[0].reply(current);
  assert.equal(await route.promise, current);
  client.dispose();
});

test("effect cleanup retains same-snapshot coverage preparation and rejects its stale reply before the next destination", async () => {
  const { client, workers } = setup();
  const coverage = client.request(data, "a", "", "public");
  const rejected = assert.rejects(coverage.promise, { name: "AbortError" }),
    oldId = workers[0].messages[0].requestId;
  coverage.cancel(true);
  await rejected;
  assert.equal(workers[0].terminated, false);
  const destination = client.request(data, "a", "b", "public");
  assert.equal(workers.length, 1);
  assert.equal(workers[0].messages[1].data, undefined);
  workers[0].reply({ route: null, reachable: new Set(["obsolete"]) }, oldId);
  const actual = { route: null, reachable: new Set(["b"]) };
  workers[0].reply(actual);
  assert.equal(await destination.promise, actual);
  const next = client.request(data, "b", "c", "public"),
    cancelled = assert.rejects(next.promise, { name: "AbortError" });
  next.cancel(true);
  await cancelled;
  assert.equal(
    workers[0].terminated,
    true,
    "the preparation option never retains a cancelled actual destination route",
  );
  client.dispose();
});
