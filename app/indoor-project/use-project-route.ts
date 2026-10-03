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
  useEffect(() => () => client.dispose(), [client]);
  useEffect(() => {
    if (!data || !start || !end) return;
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
      request.cancel();
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
  return {
    route: current?.value?.route ?? null,
    diagnostic: current?.value?.diagnostic,
    error: current?.error,
    calculating: !!data && !!start && !!end && !current,
  };
}
