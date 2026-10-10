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
const noGate = { ms: 0, setTimer: () => 0, clearTimer: () => {} };
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
  const warmup = scheduleRouteWarmup(
    schedule,
    run,
    {
      onReady: () => ready++,
      onError: assert.fail,
    },
    noGate,
  );
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
  const warmup = scheduleRouteWarmup(
    schedule,
    run,
    {
      onReady: () => ready++,
      onError: assert.fail,
      onAbandoned: () => abandoned++,
    },
    noGate,
  );
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
  const warmup = scheduleRouteWarmup(
    schedule,
    run,
    {
      onReady: () => {},
      onError: assert.fail,
    },
    noGate,
  );
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
  const warmup = scheduleRouteWarmup(
    schedule,
    run,
    {
      onReady: () => ready++,
      onError: assert.fail,
    },
    noGate,
  );
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
  const warmup = scheduleRouteWarmup(
    schedule,
    run,
    {
      onReady: assert.fail,
      onError: (e) => errors.push(e),
    },
    noGate,
  );
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
    noGate,
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

test("an orphaned background warmup (effect cleanup) can still be stopped for floor work; a user request cannot", async () => {
  type Msg = { requestId: number };
  const workers: {
    terminated: boolean;
    messages: Msg[];
    onmessage: ((e: MessageEvent) => void) | null;
  }[] = [];
  const client = new RouteWorkerClient(() => {
    const w = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      onerror: null,
      onmessageerror: null,
      terminated: false,
      messages: [] as Msg[],
      postMessage(m: Msg) {
        w.messages.push(m);
      },
      terminate() {
        w.terminated = true;
      },
    };
    workers.push(w);
    return w as never;
  });
  const data = {} as IndoorDataset;
  const warm = client.request(data, "", "", "public");
  const superseded = assert.rejects(warm.promise, { name: "AbortError" });
  warm.cancel(true); // cleanup keeps the graph work running in the worker
  await superseded;
  assert.equal(workers[0].terminated, false);
  assert.equal(client.abandonBackgroundWarmup(), true, "orphan stopped");
  assert.equal(workers[0].terminated, true);
  // A user request queued behind a warmup keeps the worker.
  client.request(data, "", "", "public").promise.catch(() => {});
  const user = client.request(data, "room-a", "room-b", "public");
  user.promise.catch(() => {});
  assert.equal(client.abandonBackgroundWarmup(), false);
  assert.equal(workers[1].terminated, false);
  // Once the worker has answered the warmup, there is nothing to abandon.
  workers[1].onmessage?.({
    data: { requestId: workers[1].messages[0].requestId, value: {} },
  } as MessageEvent);
  user.cancel();
  assert.equal(client.abandonBackgroundWarmup(), false);
  client.dispose();
});

test("the warmup waits for floor work to stay idle for the gate period", () => {
  const schedule = new HeavyWorkerSchedule();
  const { runs, run } = controllableWarmups();
  const timers: { run: () => void; cleared: boolean }[] = [];
  const gate = {
    ms: 5000,
    setTimer: (fn: () => void) => {
      const t = { run: fn, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t: unknown) => {
      (t as { cleared: boolean }).cleared = true;
    },
  };
  const warmup = scheduleRouteWarmup(
    schedule,
    run,
    { onReady: () => {}, onError: assert.fail },
    gate,
  );
  assert.equal(runs.length, 0, "not immediately after data arrives");
  assert.equal(timers.length, 1);
  // The map mounts and prepares its first floor within the gate period.
  const floor = schedule.begin("floor");
  assert.equal(timers[0].cleared, true);
  floor();
  assert.equal(timers.length, 2, "gate restarts after the floor is ready");
  timers[1].run();
  assert.equal(runs.length, 1, "starts after an idle gate period");
  warmup.dispose();
});

test("terminated heavy workers block new heavy allocations until their lifetime lock is free", async () => {
  const {
    holdHeavyWorkerLifetimeLock,
    heavyWorkerName,
    trackedHeavyWorker,
    trackHeavyWorkerTeardown,
  } = await import("../../app/indoor-project/heavy-worker-schedule");
  // A minimal lock manager: a request waits until the holder releases.
  const held = new Map<string, () => void>();
  const waiting = new Map<string, (() => void)[]>();
  const locks = {
    request(name: string, callback: () => unknown) {
      if (!held.has(name)) {
        let release!: () => void;
        const done = new Promise<void>((r) => (release = r));
        held.set(name, release);
        return Promise.resolve(callback()).then(() => done);
      }
      return new Promise((resolve) => {
        const queue = waiting.get(name) ?? [];
        queue.push(() => resolve(callback()));
        waiting.set(name, queue);
      });
    },
  };
  const destroy = (name: string) => {
    held.delete(name);
    for (const run of waiting.get(name) ?? []) run();
    waiting.delete(name);
  };
  const schedule = new HeavyWorkerSchedule();
  const name = heavyWorkerName("route");
  assert.match(name, /^oim-heavy-route-/);
  assert.notEqual(heavyWorkerName("route"), name, "names are unique");
  assert.equal(holdHeavyWorkerLifetimeLock({ name }, locks), true);
  assert.equal(holdHeavyWorkerLifetimeLock({ name: "other" }, locks), false);
  let terminations = 0;
  const releaseTimers: (() => void)[] = [];
  const worker = trackedHeavyWorker(
    schedule,
    name,
    { terminate: () => terminations++ },
    {
      locks,
      timeoutMs: 60000,
      releaseMs: 6000,
      setTimer: (run, ms) => {
        if (ms === 6000) releaseTimers.push(run);
        return 1;
      },
      clearTimer: () => {},
    },
  );
  worker.terminate();
  worker.terminate();
  assert.equal(terminations, 2, "terminate itself still runs");
  assert(schedule.busy("teardown"), "teardown pending after terminate()");
  assert.equal(floorPreparationReady(schedule, false)(), false);
  assert.equal(routeRequestReady(schedule, true)(), false);
  let posted = 0;
  schedule.when(floorPreparationReady(schedule, false), () => posted++);
  assert.equal(posted, 0, "floor request waits for the old worker to die");
  destroy(name); // the worker context is destroyed: its lock is released
  await flush();
  assert(schedule.busy("teardown"), "heap release grace after the lock");
  assert.equal(posted, 0);
  releaseTimers[0]();
  assert.equal(schedule.busy("teardown"), false);
  assert.equal(posted, 1);
  // Without Web Locks a bounded fallback wait is used.
  const timers: (() => void)[] = [];
  trackHeavyWorkerTeardown(schedule, "oim-heavy-x", {
    locks: undefined,
    setTimer: (run) => timers.push(run),
    clearTimer: () => {},
  });
  assert(schedule.busy("teardown"));
  timers[0]();
  assert.equal(schedule.busy("teardown"), false);
});

test("a warmup does not start while a worker is still being torn down", () => {
  const schedule = new HeavyWorkerSchedule();
  const { runs, run } = controllableWarmups();
  const teardown = schedule.begin("teardown");
  const warmup = scheduleRouteWarmup(
    schedule,
    run,
    { onReady: () => {}, onError: assert.fail },
    noGate,
  );
  assert.equal(runs.length, 0);
  teardown();
  assert.equal(runs.length, 1);
  warmup.dispose();
});
