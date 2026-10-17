import { useEffect, useMemo, useRef, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { RouteCalculation, RouteRequest } from "./route-calculation";
import {
  releaseIdleRouteForReview,
  RouteWorkerClient,
} from "./route-worker-client";
import { floorDiagnostic } from "./floor-diagnostics";
import { sameRoutePlace, missingRouteEntrance } from "./visitor-route-state";
import { projectRoutingOptionsKey } from "./routing-options";
import {
  afterRouteWorkerTeardown,
  releaseIdleRouteBeforeFloor,
  finishRouteBeforeQueuedFloor,
} from "./route-worker-startup";
import {
  automaticRouteWarmup,
  heavyWorkerName,
  heavyWorkerSchedule,
  routeRequestReady,
  scheduleRouteWarmup,
  trackedHeavyWorker,
} from "./heavy-worker-schedule";

export function useProjectRoute(
  data: IndoorDataset | undefined,
  start: string,
  end: string,
  mode: RouteRequest["mode"],
  /** Retained call compatibility; large maps now wait for both endpoints. */
  _intent = false,
  options: RouteRequest["options"] = {},
) {
  const optionsKey = projectRoutingOptionsKey(options);
  const requestOptions = useMemo(() => {
    const [
      endpointMode,
      preferHallways,
      excludedNativeStairIds,
      useSharedCorridorGuides,
    ] = JSON.parse(optionsKey);
    return {
      endpointMode,
      preferHallways,
      excludedNativeStairIds,
      useSharedCorridorGuides,
    };
  }, [optionsKey]);
  const samePlace = sameRoutePlace(start, end);
  const entranceIssue = useMemo(
    () => missingRouteEntrance(data, start, end),
    [data, start, end],
  );
  const noRouteWork = samePlace || !!entranceIssue;
  const [client] = useState(
    () =>
      new RouteWorkerClient(() => {
        // Named so its teardown can be observed (see heavy-worker-schedule).
        const name = heavyWorkerName("route");
        return trackedHeavyWorker(
          heavyWorkerSchedule,
          name,
          new Worker(
            new URL("published-route-calculation.worker.ts", import.meta.url),
            {
              type: "module",
              name,
            },
          ),
        );
      }),
  );
  const [result, setResult] = useState<{
    data: IndoorDataset;
    start: string;
    end: string;
    mode: RouteRequest["mode"];
    optionsKey: string;
    value?: RouteCalculation;
    error?: string;
  }>();
  const [preparation, setPreparation] = useState<{
    data: IndoorDataset;
    mode: RouteRequest["mode"];
    error?: string;
  }>();
  useEffect(() => () => client.dispose(), [client]);
  // Floor preparation and evidence review stop background route work: stop any
  // warmup the worker is still computing (including one orphaned by an
  // effect cleanup) unless a user route request is active.
  useEffect(
    () =>
      heavyWorkerSchedule.subscribe(() => {
        if (
          (heavyWorkerSchedule.busy("floor") ||
            heavyWorkerSchedule.busy("review")) &&
          !heavyWorkerSchedule.busy("route") &&
          client.abandonBackgroundWarmup()
        )
          floorDiagnostic(
            heavyWorkerSchedule.busy("review")
              ? "route:warmup-stopped-for-review"
              : "route:warmup-stopped-for-floor",
          );
      }),
    [client],
  );
  // A floor transition (including following a cross-floor route) needs the
  // large completed route worker's heap. The displayed route stays in state.
  useEffect(() => {
    if (!data || automaticRouteWarmup(data)) return;
    return releaseIdleRouteBeforeFloor(heavyWorkerSchedule, client, () => {
      floorDiagnostic("route:released-for-floor");
      setPreparation(undefined);
    });
  }, [client, data]);
  // Opening directions or choosing only a departure must not allocate a
  // whole-campus graph. Small maps retain their inexpensive background warmup.
  const warm = !!data && !noRouteWork && automaticRouteWarmup(data);
  // Whether a route is on screen: a shown route keeps its warm worker.
  const routeShown = useRef(false);
  routeShown.current = !noRouteWork && !!start && !!end;
  useEffect(() => {
    client.resetData(data);
    setResult(undefined);
    setPreparation(undefined);
    if (!data) return;
    if (!warm) {
      floorDiagnostic("route:warmup-deferred-until-intent");
      return;
    }
    // Prepare the policy graph while the imported map is being explored. It is
    // off-thread, shares the route worker, and never prepares a fictitious path.
    // It yields to floor preparation: both hold a dataset clone and GB-scale
    // state in the same renderer heap (see heavy-worker-schedule.ts).
    let active = true;
    let preparation: ReturnType<RouteWorkerClient["request"]> | undefined;
    const warmup = scheduleRouteWarmup(
      heavyWorkerSchedule,
      () => {
        floorDiagnostic("route:warmup-start", {
          freshDatasetClone: !client.hasResidentData(data),
        });
        preparation = afterRouteWorkerTeardown(heavyWorkerSchedule, () =>
          client.request(data, "", "", mode),
        );
        const own = preparation;
        return {
          promise: own.promise,
          // Terminates the worker only while this warmup is still its job.
          abandon: () => own.cancel(),
        };
      },
      {
        onReady: () => {
          floorDiagnostic("route:warmup-ready");
          if (active) setPreparation({ data, mode });
        },
        // The worker was released for floor preparation or review; routes are
        // cold again until the restarted warmup completes.
        onAbandoned: () => {
          floorDiagnostic(
            heavyWorkerSchedule.busy("review")
              ? "route:released-for-review"
              : "route:released-for-floor",
          );
          if (active) setPreparation(undefined);
        },
        releaseIdle: () => {
          if (
            (routeShown.current && !heavyWorkerSchedule.busy("review")) ||
            !client.hasResidentData(data)
          )
            return false;
          // Review needs exclusive heap space. The displayed route stays in
          // React state even when its completed worker graph is released.
          client.dispose();
          return true;
        },
        onError: (error) => {
          // A selected destination stays queued behind this same worker's
          // warmup. Its completed result also establishes readiness below.
          if (active)
            setPreparation({
              data,
              mode,
              error: error instanceof Error ? error.message : String(error),
            });
        },
      },
    );
    return () => {
      active = false;
      warmup.dispose();
      preparation?.cancel(true);
    };
  }, [client, data, mode, warm]);
  useEffect(
    () =>
      releaseIdleRouteForReview(heavyWorkerSchedule, client, () => {
        floorDiagnostic("route:released-for-review");
        setPreparation(undefined);
      }),
    [client],
  );
  useEffect(() => {
    if (noRouteWork) {
      client.dispose();
      return;
    }
    if (!data || !start || (!end && !automaticRouteWarmup(data))) return;
    let active = true;
    let request: ReturnType<RouteWorkerClient["request"]> | undefined;
    let release = () => {};
    const track = (request: ReturnType<RouteWorkerClient["request"]>) =>
      void request.promise
        .then((value) => {
          if (active) setResult({ data, start, end, mode, optionsKey, value });
        })
        .catch((error: unknown) => {
          if (active)
            setResult({
              data,
              start,
              end,
              mode,
              optionsKey,
              error: error instanceof Error ? error.message : String(error),
            });
        });
    if (client.hasCompleted(data, start, end, mode, requestOptions)) {
      request = client.request(data, start, end, mode, requestOptions);
      track(request);
      return () => {
        active = false;
        request?.cancel();
      };
    }
    // A user request runs now unless it would clone the dataset into a fresh
    // route worker while a floor is being prepared; then it starts right after.
    const waiting = heavyWorkerSchedule.when(
      routeRequestReady(heavyWorkerSchedule, !client.hasResidentData(data)),
      () => {
        release = heavyWorkerSchedule.begin("route");
        floorDiagnostic("route:request", { destination: !!end });
        request = afterRouteWorkerTeardown(heavyWorkerSchedule, () =>
          client.request(data, start, end, mode, requestOptions),
        );
        const done = () =>
          finishRouteBeforeQueuedFloor(
            heavyWorkerSchedule,
            client,
            !automaticRouteWarmup(data),
            release,
          );
        void request.promise.then(done, done);
        track(request);
      },
    );
    return () => {
      active = false;
      waiting();
      // Terminate first, so a queued floor observes teardown before this
      // route slot opens. Keep start-only preparation only when no floor waits.
      request?.cancel(!end && !heavyWorkerSchedule.busy("floor"));
      finishRouteBeforeQueuedFloor(
        heavyWorkerSchedule,
        client,
        !automaticRouteWarmup(data),
        release,
      );
    };
  }, [client, data, start, end, mode, noRouteWork, optionsKey, requestOptions]);
  const current =
    result &&
    result.data === data &&
    result.start === start &&
    result.end === end &&
    result.mode === mode &&
    result.optionsKey === optionsKey
      ? result
      : undefined;
  const coverage =
    result?.data === data &&
    result?.start === start &&
    result?.mode === mode &&
    result.optionsKey === optionsKey
      ? result.value?.reachable
      : undefined;
  const prepared =
    preparation?.data === data && preparation?.mode === mode
      ? preparation
      : undefined;
  const completedCalculation =
    result?.data === data &&
    result?.mode === mode &&
    result.optionsKey === optionsKey;
  return {
    route: noRouteWork ? null : (current?.value?.route ?? null),
    diagnostic:
      entranceIssue ?? (samePlace ? undefined : current?.value?.diagnostic),
    error: noRouteWork ? undefined : (current?.error ?? prepared?.error),
    reachable: noRouteWork ? undefined : coverage,
    arrivals: noRouteWork ? undefined : current?.value?.arrivals,
    calculating: !!data && !noRouteWork && !!start && !!end && !current,
    // Large datasets prepare only once both endpoints are selected.
    preparing:
      !!data &&
      !noRouteWork &&
      (warm || (!!start && !!end)) &&
      !prepared &&
      !completedCalculation,
    deferred: !!data && !warm,
  };
}
