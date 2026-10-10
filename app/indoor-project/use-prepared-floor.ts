import { bridgeFloorDisplayWorker } from "./floor-display-worker-bridge";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { FloorPreparationOptions, PreparedFloor } from "./prepared-floor";
import {
  FloorWorkerClient,
  floorClientKey,
  type FloorTransport,
} from "./floor-worker-client";
import { floorDiagnostic } from "./floor-diagnostics";
import {
  floorPreparationReady,
  heavyWorkerSchedule,
  releaseWhenOthersStart,
} from "./heavy-worker-schedule";

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
  const sentData = useRef<IndoorDataset>();
  const pending = useRef(false);
  // Only one dataset-holding heavy worker kind stays resident: when route
  // work (warmup or a user request) starts and no floor is preparing, release
  // the idle floor worker (its dataset clone and uncollected decode garbage).
  // The shown floor stays in React state; the next floor request re-uploads.
  useEffect(
    () =>
      releaseWhenOthersStart(
        heavyWorkerSchedule,
        ["route", "warmup"],
        () => !pending.current && !!sentData.current,
        () => {
          sentData.current = undefined;
          client.dispose();
          floorDiagnostic("floor-main:released-for-route");
        },
      ),
    [client],
  );
  const retryFloor = useCallback(() => {
    client.dispose();
    sentData.current = undefined;
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
    const hit = client.peek(data, key);
    if (hit) {
      floorDiagnostic("floor-main:cache-hit", { levels: levels.length });
      // Keep the shown floor in state too: releasing the worker for routing
      // also clears the client cache.
      setResult({ data, key, value: hit });
      return;
    }
    setResult(undefined);
    const started = performance.now();
    let request: ReturnType<FloorWorkerClient["request"]> | undefined;
    let release = () => {};
    const fresh = !(client.hasResidentWorker() && sentData.current === data);
    const send = () => {
      // Marks floor preparation active first, so a background route warmup
      // yields (terminates) before this request allocates in the worker.
      release = heavyWorkerSchedule.begin("floor");
      pending.current = true;
      floorDiagnostic("floor-main:request", {
        levels: levels.length,
        freshDatasetClone: fresh,
        routeBusy: heavyWorkerSchedule.busy("route"),
      });
      request = client.request(data, levels, building, options, transport);
      sentData.current = data;
      track(request);
    };
    const track = (request: ReturnType<FloorWorkerClient["request"]>) => {
      const done = () => {
        pending.current = false;
        release();
      };
      request.promise.then(done, done);
      request.promise.then(
        (value) => {
          if (active) {
            // Oversized floors are not cached by the client, and the worker
            // keeps no reference to a posted result. The worker and its
            // dataset stay resident for the next floor/mode switch (no
            // re-clone) until route work needs the memory (see above).
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
    };
    // A fresh dataset clone into the floor worker waits for a running user
    // route calculation; a resident floor worker is used immediately.
    const waiting = heavyWorkerSchedule.when(
      floorPreparationReady(heavyWorkerSchedule, fresh),
      send,
    );
    return () => {
      active = false;
      waiting();
      pending.current = false;
      request?.cancel();
      // Released on the next task: an immediate identical re-request (React
      // StrictMode replay) must not open an idle gap that restarts warmup.
      const releaseLater = release;
      setTimeout(releaseLater, 0);
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
