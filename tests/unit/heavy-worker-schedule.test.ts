import assert from "node:assert/strict";
import test from "node:test";
import {
  floorPreparationReady,
  HeavyWorkerSchedule,
  routeRequestReady,
  scheduleRouteWarmup,
  type WarmupRun,
} from "../../app/indoor-project/heavy-worker-schedule";
import { RouteWorkerClient } from "../../app/indoor-project/route-worker-client";
import type { IndoorDataset } from "../../app/indoor-project/contract";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const abortError = () =>
  new DOMException("Route calculation cancelled.", "AbortError");
function controllableWarmups() {
  const runs: {
    resolve: () => void;
    reject: (e: unknown) => void;
    abandoned: boolean;
  }[] = [];
  const run = (): WarmupRun => {
    let resolve!: () => void, reject!: (e: unknown) => void;
    const promise = new Promise<void>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    const entry = { resolve, reject, abandoned: false };
    runs.push(entry);
    return {
      promise,
      abandon: () => {
        entry.abandoned = true;
        reject(abortError()); // terminating the worker rejects its request
      },
    };
  };
  return { runs, run };
}

test("warmup waits while a floor is preparing, then starts once", async () => {
  const schedule = new HeavyWorkerSchedule();
  const { runs, run } = controllableWarmups();
  const releaseFloor = schedule.begin("floor");
  let ready = 0;
  const warmup = scheduleRouteWarmup(schedule, run, {
    onReady: () => ready++,
    onError: assert.fail,
  });
  assert.equal(runs.length, 0, "no warmup during floor preparation");
  releaseFloor();
  assert.equal(runs.length, 1);
  assert(schedule.busy("warmup"));
  // Unrelated schedule changes never start a second warmup.
  schedule.begin("route")();
  assert.equal(runs.length, 1, "no double warmup");
  runs[0].resolve();
  await flush();
  assert.equal(ready, 1);
  assert.equal(warmup.state(), "done");
  assert.equal(schedule.busy("warmup"), false);
  schedule.begin("floor")();
  assert.equal(runs.length, 1, "a completed warmup is not repeated");
  warmup.dispose();
});

test("floor preparation terminates a background-only warmup, which restarts when the floor is ready", async () => {
  const schedule = new HeavyWorkerSchedule();
  const { runs, run } = controllableWarmups();
  let ready = 0,
    abandoned = 0;
  const warmup = scheduleRouteWarmup(schedule, run, {
    onReady: () => ready++,
    onError: assert.fail,
    onAbandoned: () => abandoned++,
  });
  assert.equal(runs.length, 1);
  const releaseFloor = schedule.begin("floor");
  assert.equal(runs[0].abandoned, true, "worker terminated before floor work");
  assert.equal(abandoned, 1);
  assert.equal(schedule.busy("warmup"), false, "no stale warmup token");
  await flush();
  assert.equal(runs.length, 1, "not restarted while the floor is busy");
  releaseFloor();
  assert.equal(runs.length, 2, "restarted after the floor is ready");
  runs[1].resolve();
  await flush();
  assert.equal(ready, 1);
  warmup.dispose();
});

test("a user route request keeps the warmup's worker; floor work does not terminate it", async () => {
  const schedule = new HeavyWorkerSchedule();
  const { runs, run } = controllableWarmups();
  const warmup = scheduleRouteWarmup(schedule, run, {
    onReady: () => {},
    onError: assert.fail,
  });
  const releaseRoute = schedule.begin("route");
  const releaseFloor = schedule.begin("floor");
  assert.equal(runs[0].abandoned, false);
  // The user request superseded the warmup reply (AbortError) in the same
  // worker: that completes the warmup without a restart.
  runs[0].reject(abortError());
  await flush();
  assert.equal(warmup.state(), "done");
  releaseRoute();
  releaseFloor();
  assert.equal(runs.length, 1);
  warmup.dispose();
});

test("fresh dataset clones wait for the other heavy worker kind; resident workers do not", () => {
  const schedule = new HeavyWorkerSchedule();
  const releaseRoute = schedule.begin("route");
  assert.equal(floorPreparationReady(schedule, true)(), false);
  assert.equal(floorPreparationReady(schedule, false)(), true);
  releaseRoute();
  assert.equal(floorPreparationReady(schedule, true)(), true);
  const releaseFloor = schedule.begin("floor");
  assert.equal(routeRequestReady(schedule, true)(), false);
  assert.equal(routeRequestReady(schedule, false)(), true);
  // A queued user route starts as soon as the floor is ready.
  let started = 0;
  const cancel = schedule.when(
    routeRequestReady(schedule, true),
    () => started++,
  );
  assert.equal(started, 0);
  releaseFloor();
  assert.equal(started, 1);
  schedule.begin("floor")();
  assert.equal(started, 1, "started once");
  cancel();
  // A cancelled queued start never runs.
  const block = schedule.begin("floor");
  let late = 0;
  const drop = schedule.when(routeRequestReady(schedule, true), () => late++);
  drop();
  block();
  assert.equal(late, 0);
});

test("disposal releases tokens and ignores late warmup replies; releases are idempotent", async () => {
  const schedule = new HeavyWorkerSchedule();
  const { runs, run } = controllableWarmups();
  let ready = 0;
  const warmup = scheduleRouteWarmup(schedule, run, {
    onReady: () => ready++,
    onError: assert.fail,
  });
  assert(schedule.busy("warmup"));
  warmup.dispose();
  assert.equal(schedule.busy("warmup"), false);
  runs[0].resolve();
  await flush();
  assert.equal(ready, 0, "a disposed controller publishes nothing");
  schedule.begin("floor")();
  assert.equal(runs.length, 1, "a disposed controller never restarts");
  const release = schedule.begin("floor");
  release();
  release();
  assert.equal(schedule.busy("floor"), false);
  const second = schedule.begin("floor");
  assert(schedule.busy("floor"));
  second();
});

test("a warmup failure is reported once and not retried in a loop", async () => {
  const schedule = new HeavyWorkerSchedule();
  const { runs, run } = controllableWarmups();
  const errors: unknown[] = [];
  const warmup = scheduleRouteWarmup(schedule, run, {
    onReady: assert.fail,
    onError: (e) => errors.push(e),
  });
  runs[0].reject(new Error("graph failed"));
  await flush();
  assert.equal(errors.length, 1);
  schedule.begin("floor")();
  assert.equal(runs.length, 1);
  warmup.dispose();
});

test("the route client reports a resident dataset only for its live worker snapshot", async () => {
  const workers: { terminated: boolean }[] = [];
  const client = new RouteWorkerClient(() => {
    const w = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminated: false,
      postMessage() {},
      terminate() {
        w.terminated = true;
      },
    };
    workers.push(w);
    return w;
  });
  const data = {} as IndoorDataset;
  assert.equal(client.hasResidentData(data), false);
  const warm = client.request(data, "", "", "public");
  const cancelled = assert.rejects(warm.promise, { name: "AbortError" });
  assert.equal(client.hasResidentData(data), true);
  assert.equal(client.hasResidentData({} as IndoorDataset), false);
  warm.cancel(); // abandon: terminates the worker
  await cancelled;
  assert.equal(workers[0].terminated, true);
  assert.equal(client.hasResidentData(data), false);
  client.dispose();
});

test("route work releases an idle resident floor worker, never one with a request in flight", async () => {
  const { releaseWhenOthersStart } = await import(
    "../../app/indoor-project/heavy-worker-schedule"
  );
  const schedule = new HeavyWorkerSchedule();
  let inFlight = true,
    resident = true,
    released = 0;
  const stop = releaseWhenOthersStart(
    schedule,
    ["route", "warmup"],
    () => resident && !inFlight,
    () => {
      resident = false;
      released++;
    },
  );
  const warm = schedule.begin("warmup");
  assert.equal(released, 0, "a preparing floor worker is kept");
  warm();
  inFlight = false;
  schedule.begin("floor")();
  assert.equal(released, 0, "floor work alone never releases itself");
  const route = schedule.begin("route");
  assert.equal(released, 1, "idle floor worker released for a route");
  route();
  schedule.begin("warmup")();
  assert.equal(released, 1, "nothing left to release");
  stop();
});

test("a completed warm route worker is released for floor preparation and re-warmed afterwards", async () => {
  const schedule = new HeavyWorkerSchedule();
  const { runs, run } = controllableWarmups();
  let resident = false,
    ready = 0,
    abandoned = 0;
  const warmup = scheduleRouteWarmup(
    schedule,
    () => {
      resident = true;
      return run();
    },
    {
      onReady: () => ready++,
      onError: assert.fail,
      onAbandoned: () => abandoned++,
      releaseIdle: () => {
        const had = resident;
        resident = false;
        return had;
      },
    },
  );
  runs[0].resolve();
  await flush();
  assert.equal(ready, 1);
  // A user route keeps the warm worker even while a floor prepares.
  const route = schedule.begin("route");
  const floorWithRoute = schedule.begin("floor");
  assert.equal(resident, true);
  floorWithRoute();
  route();
  const floor = schedule.begin("floor");
  assert.equal(resident, false, "idle warm worker released");
  assert.equal(abandoned, 1);
  assert.equal(runs.length, 1, "no warmup while the floor prepares");
  floor();
  assert.equal(runs.length, 2, "re-warmed once the floor is ready");
  runs[1].resolve();
  await flush();
  assert.equal(ready, 2);
  warmup.dispose();
});
