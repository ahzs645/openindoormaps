import { useEffect, useState } from "react";
import type { IndoorDataset } from "./contract";
import type { ProjectRooms } from "./package";
import { BoundaryEvidenceWorkerClient } from "./boundary-evidence-worker-client";
import {
  heavyWorkerName,
  heavyWorkerSchedule,
  reviewRequestReady,
  trackedHeavyWorker,
} from "./heavy-worker-schedule";

/** The selected authoring inspector alone needs this whole-project audit.
 * Visitor import and map exploration never start it on the UI thread. */
export function useBoundaryEvidence(
  data: IndoorDataset | undefined,
  rooms: ProjectRooms | undefined,
  visible: boolean,
) {
  const [client] = useState(
    () =>
      new BoundaryEvidenceWorkerClient(() => {
        const name = heavyWorkerName("boundary-evidence");
        return trackedHeavyWorker(
          heavyWorkerSchedule,
          name,
          new Worker(new URL("boundary-evidence.worker.ts", import.meta.url), {
            type: "module",
            name,
          }),
        );
      }),
  );
  const [result, setResult] = useState<{
    data: IndoorDataset;
    rooms: ProjectRooms;
    value?: Map<string, string>;
    error?: string;
  }>();
  useEffect(() => () => client.dispose(), [client]);
  useEffect(() => {
    client.resetData(data, rooms);
    setResult(undefined);
    if (!visible || !data || !rooms) return;
    const value = client.peek(data, rooms);
    if (value) {
      setResult({ data, rooms, value });
      return;
    }
    let active = true;
    let release = () => {};
    let cancelStart = () => {};
    let request:
      | ReturnType<BoundaryEvidenceWorkerClient["request"]>
      | undefined;
    const waiting = heavyWorkerSchedule.when(
      reviewRequestReady(heavyWorkerSchedule),
      () => {
        // Reserve first so optional resident workers release their heaps and
        // incoming floor/route requests wait until the evidence worker is gone.
        release = heavyWorkerSchedule.begin("review");
        cancelStart = heavyWorkerSchedule.when(
          () => !heavyWorkerSchedule.busy("teardown"),
          () => {
            request = client.request(data, rooms);
            void request.promise.then(
              (value) => {
                if (active) setResult({ data, rooms, value });
                release();
              },
              (error: unknown) => {
                if (active)
                  setResult({
                    data,
                    rooms,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                release();
              },
            );
          },
        );
      },
    );
    return () => {
      active = false;
      waiting();
      cancelStart();
      request?.cancel();
      release();
    };
  }, [client, data, rooms, visible]);
  return result?.data === data && result?.rooms === rooms ? result : undefined;
}
