import type { IndoorDataset } from "./contract";
import { routeWorkerDataset } from "./route-worker-dataset";
import type {
  RouteCalculation,
  RouteRequest,
  RouteResponse,
} from "./route-calculation";
export interface RouteWorker {
  onmessage: ((event: MessageEvent<RouteResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: RouteRequest): void;
  terminate(): void;
}
type Pending = {
  id: number;
  warmup: boolean;
  resolve: (value: RouteCalculation) => void;
  reject: (reason: unknown) => void;
};
/** The UI supplies immutable dataset snapshots. A source edit sends a new one;
 * an endpoint/profile change reuses the worker's verified graph. Cancelling a
 * pending route terminates its CPU work, rather than queueing outdated routes. */
export class RouteWorkerClient {
  private worker?: RouteWorker;
  private workerData?: IndoorDataset;
  private pending?: Pending;
  /** Id of a background warmup (no endpoints) the worker is still computing,
   * even after its caller stopped waiting for it (effect cleanup). */
  private warmingId?: number;
  private sequence = 0;
  constructor(private readonly factory: () => RouteWorker) {}
  /** Scalar: does a live worker already hold this dataset snapshot? */
  hasResidentData(data: IndoorDataset) {
    return !!this.worker && this.workerData === data;
  }
  /** Terminate the worker if its only work is a background warmup (pending
   * or orphaned by an effect cleanup). A user route request keeps it.
   * Returns whether a worker was stopped. */
  abandonBackgroundWarmup() {
    if (this.warmingId === undefined) return false;
    if (this.pending && !(this.pending.id === this.warmingId)) return false;
    this.stop();
    return true;
  }
  /** Imports/clears may leave no route endpoints. Release the previous cloned
   * graph immediately, rather than retaining it until another route is requested. */
  resetData(data: IndoorDataset | undefined) {
    if (this.workerData && this.workerData !== data) this.stop();
  }
  private stop(
    reason: unknown = new DOMException(
      "Route calculation cancelled.",
      "AbortError",
    ),
  ) {
    const pending = this.pending;
    this.pending = undefined;
    this.warmingId = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.workerData = undefined;
    pending?.reject(reason);
  }
  request(
    data: IndoorDataset,
    start: string,
    end: string,
    mode: RouteRequest["mode"],
  ) {
    if (this.pending) {
      if (this.pending.warmup && this.workerData === data) {
        // Finishing this same-snapshot graph is useful to the queued request.
        // Reject its obsolete readiness reply without rebuilding the worker.
        this.pending.reject(
          new DOMException("Route preparation superseded.", "AbortError"),
        );
        this.pending = undefined;
      } else this.stop();
    }
    const id = ++this.sequence;
    let resolve!: Pending["resolve"], reject!: Pending["reject"];
    const promise = new Promise<RouteCalculation>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    this.pending = { id, warmup: !end, resolve, reject };
    try {
      if (!this.worker) {
        const worker = this.factory();
        this.worker = worker;
        worker.onmessage = ({ data: response }) => {
          if (this.worker === worker && response.requestId === this.warmingId)
            this.warmingId = undefined;
          const pending = this.pending;
          if (
            this.worker !== worker ||
            !pending ||
            response.requestId !== pending.id
          )
            return;
          if ("error" in response) {
            this.stop(new Error(response.error));
            return;
          }
          this.pending = undefined;
          pending.resolve(response.value);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          if (this.worker === worker)
            this.stop(
              new Error(event.message || "Route calculation could not start."),
            );
        };
        worker.onmessageerror = () => {
          if (this.worker === worker)
            this.stop(new Error("Route calculation returned unreadable data."));
        };
      }
      if (!start && !end) this.warmingId = id;
      this.worker.postMessage({
        requestId: id,
        data: this.workerData === data ? undefined : routeWorkerDataset(data),
        start,
        end,
        mode,
      });
      this.workerData = data;
    } catch (error) {
      this.stop(error);
    }
    return {
      promise,
      cancel: (keepPreparation = false) => {
        if (this.pending?.id !== id) return;
        if (keepPreparation && this.pending.warmup) {
          // React cleans up a start-only effect before choosing a destination.
          // Reject its obsolete reply, retaining the same-snapshot graph work.
          const pending = this.pending;
          this.pending = undefined;
          pending.reject(
            new DOMException("Route preparation superseded.", "AbortError"),
          );
        } else this.stop();
      },
    };
  }
  dispose() {
    this.stop();
  }
}
