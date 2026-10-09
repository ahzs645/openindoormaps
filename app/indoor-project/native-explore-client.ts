import type { IndoorDataset } from "./contract";
import type { NativeExploreResult } from "./native-explore";
import {
  preparedDisplayAssetRequest,
  type PreparedDisplayAssetRequest,
} from "./prepared-display-registry";

export type NativeExploreResponse = {
  result?: NativeExploreResult;
  /** Final wall-only response leaves the already-mounted floor carrier intact. */
  walls?: NativeExploreResult["walls"];
  error?: string;
  /** False only while exact floor faces are ready and wall detail is computing. */
  complete?: boolean;
  /** Worker-only conservative cost of the complete merged floor/wall DAG. */
  memoryCostBytes?: number;
};
export type NativeExploreRequest = {
  data: IndoorDataset;
  levelIds: number[];
  building: string;
  preparedDisplay?: PreparedDisplayAssetRequest;
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
      if (!data || (!data.result && !data.walls && !data.error))
        finish({
          error:
            "Native tracing returned no floor map. Retry the native floor map.",
        });
      else if (data.result && !data.error && data.complete === false) {
        if (active) receive(data);
      } else finish(data);
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
    const preparedDisplay =
      request.preparedDisplay ??
      preparedDisplayAssetRequest(
        request.data,
        request.levelIds,
        request.building,
      );
    worker.postMessage(
      preparedDisplay ? { ...request, preparedDisplay } : request,
    );
  } catch (error) {
    finish({ error: error instanceof Error ? error.message : String(error) });
  }
  return cancel;
}
