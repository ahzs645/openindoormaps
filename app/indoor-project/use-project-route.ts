import { useEffect, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { RouteCalculation, RouteRequest } from "./route-calculation";
import { RouteWorkerClient } from "./route-worker-client";

export function useProjectRoute(
  data: IndoorDataset | undefined,
  start: string,
  end: string,
  mode: RouteRequest["mode"],
) {
  const [client] = useState(
    () =>
      new RouteWorkerClient(
        () =>
          new Worker(new URL("route-calculation.worker.ts", import.meta.url), {
            type: "module",
          }),
      ),
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
  useEffect(() => {
    client.resetData(data);
    setResult(undefined);
    setPreparation(undefined);
    if (!data) return;
    // Prepare the policy graph while the imported map is being explored. It is
    // off-thread, shares the route worker, and never prepares a fictitious path.
    const preparation = client.request(data, "", "", mode);
    let active = true;
    void preparation.promise
      .then(() => {
        if (active) setPreparation({ data, mode });
      })
      .catch((error: unknown) => {
        // A selected destination stays queued behind this same worker's warmup.
        // Its completed result also establishes readiness below.
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        )
          setPreparation({
            data,
            mode,
            error: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      active = false;
      preparation.cancel(true);
    };
  }, [client, data, mode]);
  useEffect(() => {
    if (!data || !start) return;
    let active = true;
    const request = client.request(data, start, end, mode);
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
    return () => {
      active = false;
      // Keep graph/coverage preparation warm through effect cleanup. Actual
      // destination calculations still stop their CPU work immediately.
      request.cancel(!end);
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
    preparing: !!data && !prepared && !completedCalculation,
  };
}
