import { bridgeFloorDisplayWorker } from "./floor-display-worker-bridge";
import { useCallback, useEffect, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { FloorPreparationOptions, PreparedFloor } from "./prepared-floor";
import {
  FloorWorkerClient,
  floorClientKey,
  type FloorTransport,
} from "./floor-worker-client";
import { floorDiagnostic } from "./floor-diagnostics";

export function usePreparedFloor(
  data: IndoorDataset,
  levels: number[],
  building: string,
  options: FloorPreparationOptions,
  /** nativeDisplay:false when the view does not consume the native area
   * display (3D, review): the reply then omits that carrier. */
  transport: FloorTransport = {},
) {
  const [client] = useState(
    () =>
      new FloorWorkerClient(() =>
        bridgeFloorDisplayWorker(
          new Worker(new URL("floor-presentation.worker.ts", import.meta.url), {
            type: "module",
          }),
        ),
      ),
  );
  const key = floorClientKey(levels, building, options, transport);
  const [attempt, retry] = useState(0);
  const retryFloor = useCallback(() => {
    client.dispose();
    retry((n) => n + 1);
  }, [client]);
  const [result, setResult] = useState<{
    data: IndoorDataset;
    key: string;
    value?: PreparedFloor;
    error?: string;
  }>();
  const cached = client.peek(data, key);
  useEffect(() => {
    let active = true;
    if (client.peek(data, key)) {
      floorDiagnostic("floor-main:cache-hit", { levels: levels.length });
      return;
    }
    setResult(undefined);
    const started = performance.now();
    floorDiagnostic("floor-main:request", { levels: levels.length });
    const request = client.request(data, levels, building, options, transport);
    request.promise.then(
      (value) => {
        if (active) {
          // Oversized floors are not cached by the client, and the worker
          // keeps no reference to a posted result. Keep the worker and its
          // resident source dataset: disposing it here forced every later
          // floor/mode switch to structured-clone the whole dataset again.
          floorDiagnostic("floor-main:resolved", {
            levels: levels.length,
            cached: !!client.peek(data, key),
            nativeDisplay: transport.nativeDisplay !== false,
            ms: performance.now() - started,
          });
          setResult({ data, key, value });
        }
      },
      (error) => {
        if (active && error?.name !== "AbortError")
          setResult({
            data,
            key,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      active = false;
      request.cancel();
    };
    // The key includes every level/building/geometry option, so selection,
    // camera and label updates do not restart a pending floor calculation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, data, key, attempt]);
  // Deferred, so React StrictMode's synchronous unmount/remount replay keeps
  // the in-flight worker instead of terminating and re-cloning the dataset.
  useEffect(() => () => client.release(), [client]);
  const current =
    result?.data === data && result.key === key ? result : undefined;
  return {
    value: cached ?? current?.value,
    error: current?.error,
    retry: retryFloor,
  };
}
