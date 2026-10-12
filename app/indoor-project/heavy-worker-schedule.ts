/** Page-wide coordination of the two heavy worker kinds that each hold a full
 * dataset clone plus GB-scale derived state: floor preparation and routing.
 *
 * All dedicated workers of a tab share one renderer process and one V8 heap
 * reservation. Browser evidence (prepared 04-128 ZIP, Chromium 141): the 3D
 * switch spawned a floor worker while the background route warmup held about
 * 2.2–2.4 GB, and the new isolate failed with "V8 javascript OOM" after
 * allocating only ~42 MB. This schedule keeps optional background work out of
 * the way of floor preparation, and never starts a fresh dataset clone into
 * one heavy worker while the other kind is busy.
 *
 * It only orders work; it never changes what a worker computes. */
export type HeavyJob = "floor" | "route" | "warmup" | "teardown";

export class HeavyWorkerSchedule {
  private counts: Record<HeavyJob, number> = {
    floor: 0,
    route: 0,
    warmup: 0,
    teardown: 0,
  };
  private listeners = new Set<() => void>();
  busy(kind: HeavyJob) {
    return this.counts[kind] > 0;
  }
  /** Marks a job active; the returned release is idempotent. */
  begin(kind: HeavyJob) {
    this.counts[kind]++;
    this.notify();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.counts[kind]--;
      this.notify();
    };
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Runs `start` as soon as `ready()` holds (now, or after a later change).
   * Returns a cancel that drops a start that has not happened yet. */
  when(ready: () => boolean, start: () => void) {
    let done = false;
    let unsubscribe = () => {};
    const attempt = () => {
      if (done || !ready()) return;
      done = true;
      unsubscribe();
      start();
    };
    unsubscribe = this.subscribe(attempt);
    attempt();
    return () => {
      done = true;
      unsubscribe();
    };
  }
  private notify() {
    for (const listener of [...this.listeners]) listener();
  }
}

/** Graph size above which routes are warmed on intent (directions opened, a
 * start/destination picked or a route requested) instead of automatically at
 * import. Generic, scalar and cheap: the warm route graph of a large native
 * dataset was measured at up to 2.8 GB, which alone leaves almost no room in
 * a tab's shared ~4 GB heap beside the page and the map. */
export const AUTOMATIC_ROUTE_WARMUP_MAX_GRAPH_ITEMS = 4000;
export function automaticRouteWarmup(data: {
  nodes?: readonly unknown[];
  edges?: readonly unknown[];
}) {
  return (
    (data.nodes?.length ?? 0) + (data.edges?.length ?? 0) <=
    AUTOMATIC_ROUTE_WARMUP_MAX_GRAPH_ITEMS
  );
}

/** Same generic scale test as the route warmup: projects whose prepared
 * floors and map sources are large enough to need memory-saving transitions. */
export function largeIndoorProject(data: {
  nodes?: readonly unknown[];
  edges?: readonly unknown[];
}) {
  return !automaticRouteWarmup(data);
}
/** Recreate the map (terminating MapLibre's tile workers) only while a new
 * floor scope is loading behind the full-screen preparation overlay, after a
 * different scope was shown, for large projects. Never during interaction. */
export function shouldRecreateMapForScope(
  shownScope: string | undefined,
  nextScope: string,
  loading: boolean,
  large: boolean,
) {
  return loading && large && !!shownScope && shownScope !== nextScope;
}

/** One schedule per page realm. */
export const heavyWorkerSchedule = new HeavyWorkerSchedule();

/** A floor request that must clone the dataset into a fresh worker waits for
 * a user route calculation; a request to a resident floor worker does not. */
export function floorPreparationReady(
  schedule: HeavyWorkerSchedule,
  freshDatasetClone: boolean,
) {
  // Never allocate a floor beside a worker that is still being torn down.
  return () =>
    !schedule.busy("teardown") &&
    (!freshDatasetClone || !schedule.busy("route"));
}
/** A user route request that must clone the dataset into a fresh route worker
 * waits for floor preparation; one to a resident route worker does not. */
export function routeRequestReady(
  schedule: HeavyWorkerSchedule,
  freshDatasetClone: boolean,
) {
  return () =>
    !freshDatasetClone ||
    (!schedule.busy("floor") && !schedule.busy("teardown"));
}

export type WarmupRun = {
  promise: Promise<unknown>;
  /** Terminate the warmup's worker (only while no user request took it over). */
  abandon: () => void;
};
export type WarmupIdleGate = {
  ms: number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
};
/** Floor preparation must stay idle this long before a warmup starts. A
 * project import mounts the floor shortly after the route hook; starting a
 * warmup in that gap and terminating it during its dataset clone was
 * observed to leave the worker running (2.2–2.8 GB) in Chromium 141. */
export const DEFAULT_WARMUP_IDLE_GATE: WarmupIdleGate = {
  ms: 5000,
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
/** Background route warmup that yields to floor preparation.
 *
 * - Starts only while no floor preparation is active.
 * - If a floor preparation begins while no user route request is active, the
 *   route worker is terminated, whether its warmup is still running or has
 *   completed and only holds the warm graph (about 1.0–1.4 GB measured), and
 *   the warmup is restarted once floor preparation is idle again.
 * - A user route request keeps its worker; a failed warmup is not retried in
 *   a loop; two warmups never run at once. */
export function scheduleRouteWarmup(
  schedule: HeavyWorkerSchedule,
  run: () => WarmupRun,
  callbacks: {
    onReady: () => void;
    onError: (error: unknown) => void;
    onAbandoned?: () => void;
    /** Terminate an idle warm route worker; false when there is none. */
    releaseIdle?: () => boolean;
  },
  /** Floor preparation must stay idle this long before a warmup starts. A
   * project import mounts the floor shortly after the route hook; starting a
   * warmup in that gap and terminating it during its dataset clone was
   * observed to leave the worker running (2.2–2.8 GB) in Chromium 141. */
  idleGate: WarmupIdleGate = DEFAULT_WARMUP_IDLE_GATE,
) {
  let settleTimer: unknown;
  const cancelSettle = () => {
    if (settleTimer !== undefined) idleGate.clearTimer(settleTimer);
    settleTimer = undefined;
  };
  let state: "idle" | "running" | "done" = "idle";
  let failed = false;
  let current: (WarmupRun & { release: () => void; id: number }) | undefined;
  let sequence = 0;
  let disposed = false;
  // Clear before releasing: the release notifies listeners (including this
  // controller) synchronously.
  const settle = () => {
    const finished = current;
    current = undefined;
    finished?.release();
  };
  const tick = () => {
    if (disposed || failed) return;
    if (state === "done") {
      if (
        schedule.busy("floor") &&
        !schedule.busy("route") &&
        callbacks.releaseIdle?.()
      ) {
        state = "idle";
        callbacks.onAbandoned?.();
      }
      return;
    }
    if (state === "running") {
      if (current && schedule.busy("floor") && !schedule.busy("route")) {
        const abandoned = current;
        state = "idle";
        settle();
        abandoned.abandon();
        callbacks.onAbandoned?.();
      }
      return;
    }
    // A user route request already builds the graph in the same worker; a
    // warmup started meanwhile would only supersede its reply.
    if (
      schedule.busy("floor") ||
      schedule.busy("teardown") ||
      schedule.busy("route")
    ) {
      cancelSettle();
      return;
    }
    if (idleGate.ms > 0 && settleTimer !== "elapsed") {
      if (settleTimer === undefined)
        settleTimer = idleGate.setTimer(() => {
          settleTimer = "elapsed";
          tick();
        }, idleGate.ms);
      return;
    }
    settleTimer = undefined;
    state = "running";
    const id = ++sequence;
    const release = schedule.begin("warmup");
    const started = run();
    current = { ...started, release, id };
    started.promise.then(
      () => {
        if (disposed || current?.id !== id) return;
        settle();
        state = "done";
        callbacks.onReady();
      },
      (error: unknown) => {
        if (disposed || current?.id !== id) return;
        settle();
        // A user request may supersede the warmup reply while keeping its
        // graph work; that is not a failure and needs no restart.
        if (error instanceof DOMException && error.name === "AbortError") {
          state = "done";
          return;
        }
        state = "done";
        failed = true;
        callbacks.onError(error);
      },
    );
  };
  const unsubscribe = schedule.subscribe(tick);
  tick();
  return {
    state: () => state,
    dispose() {
      disposed = true;
      if (settleTimer !== "elapsed") cancelSettle();
      unsubscribe();
      settle();
    },
  };
}

/** Release an idle resident worker of one kind as soon as work of another
 * kind starts (for example: route work releases an idle floor worker).
 * `idle()` must be false while this kind has a request in flight. */
export function releaseWhenOthersStart(
  schedule: HeavyWorkerSchedule,
  others: HeavyJob[],
  idle: () => boolean,
  release: () => void,
) {
  return schedule.subscribe(() => {
    if (idle() && others.some((kind) => schedule.busy(kind))) release();
  });
}

/* ---------------------------------------------------------------------------
 * Worker teardown tracking.
 *
 * Worker.terminate() returns at once, but Chromium only forcibly stops a busy
 * worker after a grace period (measured: its Web Lock was released 2.0 s after
 * terminate() for a synthetic busy loop; the UNBC route warmup was still
 * allocating 5 s after terminate()). Its heap stays in the shared renderer
 * budget until then, so new heavy allocations must wait for actual teardown.
 * A heavy worker holds a Web Lock named after itself for its whole life; the
 * lock is released only when the worker context is destroyed.
 * ------------------------------------------------------------------------- */
export const HEAVY_WORKER_PREFIX = "oim-heavy-";
let workerSequence = 0;
/** Unique worker name; pass as `new Worker(url, { type: "module", name })`. */
export function heavyWorkerName(kind: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${HEAVY_WORKER_PREFIX}${kind}-${++workerSequence}-${random}`;
}
type LockManagerLike = {
  request: (name: string, callback: () => unknown) => Promise<unknown>;
};
const lockManager = (): LockManagerLike | undefined =>
  (
    globalThis.navigator as
      | (Navigator & { locks?: LockManagerLike })
      | undefined
  )?.locks;
/** Worker side: hold this worker's lifetime lock (no-op without a heavy name
 * or without Web Locks). Call once at module start. */
export function holdHeavyWorkerLifetimeLock(
  scope: { name?: string } = globalThis as { name?: string },
  locks: LockManagerLike | undefined = lockManager(),
) {
  const name = scope.name;
  if (!name?.startsWith(HEAVY_WORKER_PREFIX) || !locks) return false;
  void locks.request(name, () => new Promise(() => {})).catch(() => {});
  return true;
}
export type TeardownOptions = {
  locks?: LockManagerLike;
  /** Upper bound if the lock never resolves. */
  timeoutMs?: number;
  /** Fixed wait when Web Locks are unavailable. */
  fallbackMs?: number;
  /** Extra wait after the lock is free: the context is gone then, but a
   * multi-GB heap was measured to leave the renderer only 6–8 s after
   * terminate() (lock released at about 2 s). */
  releaseMs?: number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};
/** Main side: mark a terminated heavy worker as still tearing down until its
 * lifetime lock is free (or a bounded fallback elapses). */
export function trackHeavyWorkerTeardown(
  schedule: HeavyWorkerSchedule,
  name: string,
  options: TeardownOptions = {},
) {
  const locks = "locks" in options ? options.locks : lockManager();
  const setTimer =
    options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer =
    options.clearTimer ??
    ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const release = schedule.begin("teardown");
  let timer: unknown;
  const finish = () => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    release();
  };
  if (!locks) {
    timer = setTimer(finish, options.fallbackMs ?? 9000);
    return;
  }
  timer = setTimer(finish, options.timeoutMs ?? 30000);
  const released = () => {
    if (timer !== undefined) clearTimer(timer);
    const releaseMs = options.releaseMs ?? 6000;
    timer = releaseMs > 0 ? setTimer(finish, releaseMs) : undefined;
    if (releaseMs <= 0) finish();
  };
  locks.request(name, () => released()).catch(finish);
}
/** Wrap a heavy worker so terminate() is followed by teardown tracking. */
export function trackedHeavyWorker<W extends { terminate(): void }>(
  schedule: HeavyWorkerSchedule,
  name: string,
  worker: W,
  options?: TeardownOptions,
): W {
  let terminated = false;
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    terminate();
    if (terminated) return;
    terminated = true;
    trackHeavyWorkerTeardown(schedule, name, options);
  };
  return worker;
}
