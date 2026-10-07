import type { IndoorDataset } from "./contract";
import type { NativeExploreResult } from "./native-explore";

export type NativeExploreResponse = {
  result?: NativeExploreResult;
  error?: string;
};
export type NativeExploreRequest = {
  data: IndoorDataset;
  levelIds: number[];
  building: string;
};
export interface NativeExploreWorker {
  onmessage: ((event: MessageEvent<NativeExploreResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: NativeExploreRequest): void;
  terminate(): void;
}
/** Each trace owns a large cloned dataset. Release it on completion as well as
 * cancellation, and never deliver a response after its floor/snapshot changes. */
export function startNativeExploreTrace(
  request: NativeExploreRequest,
  factory: () => NativeExploreWorker,
  receive: (response: NativeExploreResponse) => void,
) {
  let active = true;
  let worker: NativeExploreWorker | undefined;
  const cancel = () => {
    active = false;
    worker?.terminate();
    worker = undefined;
  };
  const finish = (response: NativeExploreResponse) => {
    if (!active) return;
    cancel();
    receive(response);
  };
  try {
    worker = factory();
    worker.onmessage = ({ data }) => {
      if (!data || (!data.result && !data.error))
        finish({
          error:
            "Native tracing returned no floor map. Retry the native floor map.",
        });
      else finish(data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish({
        error:
          event.message || "Native tracing failed. Retry the native floor map.",
      });
    };
    worker.onmessageerror = () =>
      finish({
        error:
          "Native tracing returned unreadable data. Retry the native floor map.",
      });
    worker.postMessage(request);
  } catch (error) {
    finish({ error: error instanceof Error ? error.message : String(error) });
  }
  return cancel;
}
