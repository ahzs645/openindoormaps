import test from "node:test";
import assert from "node:assert/strict";
import { HeavyWorkerSchedule } from "../../app/indoor-project/heavy-worker-schedule";
import { afterRouteWorkerTeardown, releaseIdleRouteBeforeFloor, finishRouteBeforeQueuedFloor } from "../../app/indoor-project/route-worker-startup";

test("directions reserve work, release the idle floor, then wait for its actual teardown", async () => {
  for (const kind of ["route", "warmup"] as const) {
    const schedule = new HeavyWorkerSchedule();
    let releaseTeardown = () => {};
    const calls: string[] = [];
    const stop = schedule.subscribe(() => {
      if (schedule.busy(kind) && !schedule.busy("teardown")) {
        stop();
        calls.push("floor terminated");
        releaseTeardown = schedule.begin("teardown");
      }
    });
    const release = schedule.begin(kind);
    const request = afterRouteWorkerTeardown(schedule, () => {
      assert.equal(schedule.busy("teardown"), false);
      calls.push("route dataset posted");
      return { promise: Promise.resolve("route"), cancel() {} };
    });
    assert.deepEqual(calls, ["floor terminated"]);
    // A new floor can queue behind the reserved route. It must not deadlock
    // the route's second gate after the previous worker's heap is released.
    const queuedFloor = schedule.begin("floor");
    releaseTeardown();
    assert.equal(await request.promise, "route");
    assert.deepEqual(calls, ["floor terminated", "route dataset posted"]);
    queuedFloor();
    release();
  }
});

test("cancelling directions while waiting prevents a later dataset allocation", async () => {
  const schedule = new HeavyWorkerSchedule();
  const release = schedule.begin("teardown");
  let posts = 0;
  const request = afterRouteWorkerTeardown(schedule, () => {
    posts++;
    return { promise: Promise.resolve(null), cancel() {} };
  });
  const rejected = assert.rejects(request.promise, { name: "AbortError" });
  request.cancel();
  release();
  await rejected;
  assert.equal(posts, 0);
});

test("ready requests preserve warmup cancellation and surface startup errors", async () => {
  const schedule = new HeavyWorkerSchedule();
  let kept: boolean | undefined;
  const request = afterRouteWorkerTeardown(schedule, () => ({
    promise: Promise.resolve(42),
    cancel: (keep) => { kept = keep; },
  }));
  assert.equal(await request.promise, 42);
  request.cancel(true);
  assert.equal(kept, true);
  await assert.rejects(afterRouteWorkerTeardown(schedule, () => {
    throw new Error("Worker unavailable");
  }).promise, /Worker unavailable/);
});


test("a queued floor releases only a completed route worker and observes its teardown", () => {
  const schedule = new HeavyWorkerSchedule();
  let resident = true, released = 0;
  let finishTeardown = () => {};
  const client = {
    hasResidentWorker: () => resident,
    dispose: () => {
      resident = false;
      finishTeardown = schedule.begin("teardown");
    },
  };
  const stop = releaseIdleRouteBeforeFloor(schedule, client, () => released++);
  const finishRoute = schedule.begin("route");
  const finishFloor = schedule.begin("floor");
  assert.equal(resident, true, "an in-flight route must finish");
  finishRoute();
  assert.equal(resident, false);
  assert.equal(released, 1);
  assert.equal(schedule.busy("teardown"), true);
  finishTeardown();
  finishFloor();
  assert.equal(released, 1);
  stop();
});


test("route completion closes its worker before an earlier floor listener can allocate", () => {
  const schedule = new HeavyWorkerSchedule();
  const releaseRoute = schedule.begin("route");
  const releaseFloor = schedule.begin("floor");
  let posted = false;
  let finishTeardown = () => {};
  const stop = schedule.when(
    () => !schedule.busy("route") && !schedule.busy("teardown"),
    () => { posted = true; },
  );
  finishRouteBeforeQueuedFloor(schedule, {
    dispose: () => { finishTeardown = schedule.begin("teardown"); },
  }, true, releaseRoute);
  assert.equal(posted, false, "the old graph heap must leave first");
  finishTeardown();
  assert.equal(posted, true);
  stop();
  releaseFloor();
});
