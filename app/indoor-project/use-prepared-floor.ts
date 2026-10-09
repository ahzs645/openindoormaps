import { bridgeFloorDisplayWorker } from "./floor-display-worker-bridge";
import { useCallback, useEffect, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { FloorPreparationOptions, PreparedFloor } from "./prepared-floor";
import { FloorWorkerClient, floorWorkerKey } from "./floor-worker-client";

export function usePreparedFloor(
  data: IndoorDataset,
  levels: number[],
  building: string,
  options: FloorPreparationOptions,
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
  const key = floorWorkerKey(levels, building, options);
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
    if (client.peek(data, key)) return;
    setResult(undefined);
    const request = client.request(data, levels, building, options);
    request.promise.then(
      (value) => {
        if (active) {
          // Oversized floors are not cached. Release their worker's full source
          // dataset and decoded payload before preparing another large scope.
          if (!client.peek(data, key)) client.dispose();
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
  useEffect(() => () => client.dispose(), [client]);
  const current =
    result?.data === data && result.key === key ? result : undefined;
  return {
    value: cached ?? current?.value,
    error: current?.error,
    retry: retryFloor,
  };
}
