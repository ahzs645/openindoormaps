import { useEffect, useRef, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { RouteCalculation, RouteRequest } from "./route-calculation";
import { RouteWorkerClient } from "./route-worker-client";
import { floorDiagnostic } from "./floor-diagnostics";
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
  /** The visitor showed routing intent (directions opened, a start or
   * destination picked). Large datasets warm routes only after this. */
  intent = false,
) {
  const [client] = useState(
    () =>
      new RouteWorkerClient(() => {
        // Named so its teardown can be observed (see heavy-worker-schedule).
        const name = heavyWorkerName("route");
        return trackedHeavyWorker(
          heavyWorkerSchedule,
          name,
          new Worker(new URL("route-calculation.worker.ts", import.meta.url), {
            type: "module",
            name,
          }),
        );
      }),
  );
  const [result, setResult] = useState<{
    data: IndoorDataset;
    start: string;
    end: string;
    mode: RouteRequest["mode"];
    value?: RouteCalculation;
    error?: string;
  }>();
  const [preparation, setPreparation] = useState<{
    data: IndoorDataset;
    mode: RouteRequest["mode"];
    error?: string;
  }>();
  useEffect(() => () => client.dispose(), [client]);
  // Floor preparation never runs beside background route work: stop any
  // warmup the worker is still computing (including one orphaned by an
  // effect cleanup) unless a user route request is active.
  useEffect(
    () =>
      heavyWorkerSchedule.subscribe(() => {
        if (
          heavyWorkerSchedule.busy("floor") &&
          !heavyWorkerSchedule.busy("route") &&
          client.abandonBackgroundWarmup()
        )
          floorDiagnostic("route:warmup-stopped-for-floor");
      }),
    [client],
  );
  // Latched per dataset: once intent was shown, keep the warm graph.
  const intentFor = useRef<IndoorDataset | undefined>(undefined);
  if (intent && data) intentFor.current = data;
  const warm =
    !!data && (automaticRouteWarmup(data) || intentFor.current === data);
  // Whether a route is on screen: a shown route keeps its warm worker.
  const routeShown = useRef(false);
  routeShown.current = !!start && !!end;
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
        preparation = client.request(data, "", "", mode);
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
        // The worker was released for floor preparation; routes are cold
        // again until the restarted warmup completes.
        onAbandoned: () => {
          floorDiagnostic("route:released-for-floor");
          if (active) setPreparation(undefined);
        },
        releaseIdle: () => {
          if (routeShown.current || !client.hasResidentData(data)) return false;
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
  useEffect(() => {
    if (!data || !start) return;
    let active = true;
    let request: ReturnType<RouteWorkerClient["request"]> | undefined;
    let release = () => {};
    const track = (request: ReturnType<RouteWorkerClient["request"]>) =>
      void request.promise
        .then((value) => {
          if (active) setResult({ data, start, end, mode, value });
        })
        .catch((error: unknown) => {
          if (active)
            setResult({
              data,
              start,
              end,
              mode,
              error: error instanceof Error ? error.message : String(error),
            });
        });
    // A user request runs now unless it would clone the dataset into a fresh
    // route worker while a floor is being prepared; then it starts right after.
    const waiting = heavyWorkerSchedule.when(
      routeRequestReady(heavyWorkerSchedule, !client.hasResidentData(data)),
      () => {
        release = heavyWorkerSchedule.begin("route");
        floorDiagnostic("route:request", { destination: !!end });
        request = client.request(data, start, end, mode);
        void request.promise.then(release, release);
        track(request);
      },
    );
    return () => {
      active = false;
      waiting();
      release();
      // Keep graph/coverage preparation warm through effect cleanup. Actual
      // destination calculations still stop their CPU work immediately.
      request?.cancel(!end);
    };
  }, [client, data, start, end, mode]);
  const current =
    result &&
    result.data === data &&
    result.start === start &&
    result.end === end &&
    result.mode === mode
      ? result
      : undefined;
  const coverage =
    result?.data === data && result?.start === start && result?.mode === mode
      ? result.value?.reachable
      : undefined;
  const prepared =
    preparation?.data === data && preparation?.mode === mode
      ? preparation
      : undefined;
  const completedCalculation = result?.data === data && result?.mode === mode;
  return {
    route: current?.value?.route ?? null,
    diagnostic: current?.value?.diagnostic,
    error: current?.error ?? prepared?.error,
    reachable: coverage,
    arrivals: current?.value?.arrivals,
    calculating: !!data && !!start && !!end && !current,
    // Large datasets warm on intent: no "preparing" state before that.
    preparing:
      !!data && (warm || !!start) && !prepared && !completedCalculation,
    deferred: !!data && !warm,
  };
}
