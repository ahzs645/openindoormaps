import type { HeavyWorkerSchedule } from "./heavy-worker-schedule";

export type DeferredRouteRequest<T> = {
  promise: Promise<T>;
  cancel: (keepPreparation?: boolean) => void;
};

/** Reserving route/warmup work can synchronously terminate an idle floor
 * worker. Wait again after that reservation: its heap is still alive until
 * teardown completes. Do not wait for newly queued floor work here, since
 * that work already waits for the route's reservation. */
export function afterRouteWorkerTeardown<T>(
  schedule: HeavyWorkerSchedule,
  send: () => DeferredRouteRequest<T>,
): DeferredRouteRequest<T> {
  let request: DeferredRouteRequest<T> | undefined;
  let reject!: (reason: unknown) => void;
  let stopWaiting = () => {};
  const promise = new Promise<T>((resolve, fail) => {
    reject = fail;
    stopWaiting = schedule.when(
      () => !schedule.busy("teardown"),
      () => {
        try {
          request = send();
          request.promise.then(resolve, fail);
        } catch (error) {
          fail(error);
        }
      },
    );
  });
  return {
    promise,
    cancel(keepPreparation = false) {
      stopWaiting();
      if (request) request.cancel(keepPreparation);
      else
        reject(
          new DOMException("Route calculation cancelled.", "AbortError"),
        );
    },
  };
}

/** A displayed route is a small result in React state; it does not need the
 * completed worker's large graph while another floor is being loaded. */
export function releaseIdleRouteBeforeFloor(
  schedule: HeavyWorkerSchedule,
  client: { hasResidentWorker(): boolean; dispose(): void },
  onReleased: () => void,
) {
  const changed = () => {
    if (
      schedule.busy("floor") &&
      !schedule.busy("route") &&
      client.hasResidentWorker()
    ) {
      client.dispose();
      onReleased();
    }
  };
  const stop = schedule.subscribe(changed);
  changed();
  return stop;
}

/** Dispose before releasing the route slot: a queued floor's readiness
 * listener may run before the idle-worker listener in the same notification. */
export function finishRouteBeforeQueuedFloor(
  schedule: HeavyWorkerSchedule,
  client: { dispose(): void },
  large: boolean,
  release: () => void,
) {
  if (large && schedule.busy("floor")) client.dispose();
  release();
}
