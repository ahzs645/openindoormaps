import type { ProgressiveManifest } from "./progressive-delivery";
import type { RouteCalculation } from "./route-calculation";
import type { ProgressiveRouteSummary } from "./progressive-route-summary";
import type { ProjectStep } from "./navigation-steps";
export type ProgressiveRouteRequest = {
  requestId: number;
  revisionSha256: string;
  delivery?: {
    url: string;
    manifest: ProgressiveManifest;
    preferHttpBrotli: boolean;
    offline: boolean;
  };
  /** Load and check this revision's routing without calculating a route. */
  prepareOnly?: true;
  start: string;
  end: string;
  mode: "public" | "accessible";
};
export type ProgressiveRouteResponse = { requestId: number } & (
  | { prepared: true }
  | {
      value: RouteCalculation;
      steps: ProjectStep[];
      summary: ProgressiveRouteSummary;
    }
  | { error: string }
);
export interface ProgressiveRouteWorker {
  onmessage: ((event: MessageEvent<ProgressiveRouteResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: ProgressiveRouteRequest): void;
  terminate(): void;
}
/** Routing bytes go directly to a worker. The UI only receives route geometry,
 * diagnostics and source-derived instructions; no full authority clone. */
export class ProgressiveRouteClient {
  private worker?: ProgressiveRouteWorker;
  private sequence = 0;
  private residentRevision?: string;
  private reject?: (error: unknown) => void;
  private preparing?: {
    requestId: number;
    settle: (error?: unknown) => void;
  };
  constructor(private readonly factory: () => ProgressiveRouteWorker) {}
  request(
    url: string,
    manifest: ProgressiveManifest,
    start: string,
    end: string,
    mode: "public" | "accessible",
    deliveryOptions: { preferHttpBrotli?: boolean; offline?: boolean } = {},
  ) {
    if (this.reject || this.residentRevision !== manifest.revisionSha256)
      this.dispose();
    // The worker finishes loading this revision before the route; the
    // preparation's own reply is no longer awaited.
    this.settlePreparation(superseded());
    const requestId = ++this.sequence;
    let reject!: (error: unknown) => void;
    const promise = new Promise<{
      value: RouteCalculation;
      steps: ProjectStep[];
      summary: ProgressiveRouteSummary;
    }>((resolve, fail) => {
      reject = fail;
      this.reject = fail;
      try {
        if (!this.worker) this.worker = this.factory();
        const worker = this.worker;
        worker.onmessage = ({ data }) => {
          if (data.requestId !== requestId || requestId !== this.sequence)
            return;
          if ("prepared" in data) return;
          this.reject = undefined;
          if ("error" in data) {
            this.dispose();
            fail(new Error(data.error));
          } else
            resolve({
              value: data.value,
              steps: data.steps,
              summary: data.summary,
            });
        };
        worker.onerror = (event) => {
          event.preventDefault();
          if (this.worker !== worker) return;
          this.dispose(
            new Error(event.message || "Directions could not start."),
          );
        };
        worker.onmessageerror = () => {
          if (this.worker === worker)
            this.dispose(new Error("Directions returned unreadable data."));
        };
        this.worker.postMessage({
          requestId,
          revisionSha256: manifest.revisionSha256,
          delivery:
            this.residentRevision === manifest.revisionSha256
              ? undefined
              : {
                  url,
                  manifest,
                  preferHttpBrotli: deliveryOptions.preferHttpBrotli === true,
                  offline: deliveryOptions.offline === true,
                },
          start,
          end,
          mode,
        });
        this.residentRevision = manifest.revisionSha256;
      } catch (error) {
        this.dispose(error);
      }
    });
    return {
      promise,
      cancel: () => {
        if (this.reject === reject) this.dispose();
      },
    };
  }
  /** Start loading this revision's routing in the background, so a later
   * request only calculates. Nothing starts while a request is pending or the
   * revision is already resident. A failed preparation releases its worker. */
  prepare(
    url: string,
    manifest: ProgressiveManifest,
    deliveryOptions: { preferHttpBrotli?: boolean; offline?: boolean } = {},
  ) {
    if (this.reject || this.residentRevision === manifest.revisionSha256)
      return { promise: Promise.resolve(), cancel: () => {} };
    this.dispose();
    const requestId = ++this.sequence;
    const promise = new Promise<void>((resolve, fail) => {
      this.preparing = {
        requestId,
        settle: (error) => (error ? fail(error) : resolve()),
      };
      try {
        const worker = (this.worker = this.factory());
        worker.onmessage = ({ data }) => {
          if (data.requestId !== requestId || requestId !== this.sequence)
            return;
          if ("error" in data) {
            const error = new Error(data.error);
            this.settlePreparation(error);
            this.dispose(error);
          } else this.settlePreparation();
        };
        worker.onerror = (event) => {
          event.preventDefault();
          if (this.worker !== worker) return;
          this.dispose(
            new Error(event.message || "Directions could not start."),
          );
        };
        worker.onmessageerror = () => {
          if (this.worker === worker)
            this.dispose(new Error("Directions returned unreadable data."));
        };
        worker.postMessage({
          requestId,
          revisionSha256: manifest.revisionSha256,
          delivery: {
            url,
            manifest,
            preferHttpBrotli: deliveryOptions.preferHttpBrotli === true,
            offline: deliveryOptions.offline === true,
          },
          prepareOnly: true,
          start: "",
          end: "",
          mode: "public",
        });
        this.residentRevision = manifest.revisionSha256;
      } catch (error) {
        this.dispose(error);
      }
    });
    return {
      promise,
      cancel: () => {
        if (this.preparing?.requestId === requestId) this.dispose();
      },
    };
  }
  /** Terminate a resident worker that has no route request in flight. */
  releaseIdle() {
    if (!this.worker || this.reject) return false;
    this.dispose();
    return true;
  }
  cancelPending() {
    if (this.reject) this.dispose();
  }
  dispose(
    reason: unknown = new DOMException(
      "Directions were cancelled.",
      "AbortError",
    ),
  ) {
    this.sequence++;
    this.worker?.terminate();
    this.worker = undefined;
    this.residentRevision = undefined;
    const reject = this.reject;
    this.reject = undefined;
    reject?.(reason);
    this.settlePreparation(reason);
  }
  private settlePreparation(error?: unknown) {
    const preparing = this.preparing;
    this.preparing = undefined;
    preparing?.settle(error);
  }
}
const TAKEN_OVER = "A route request took over preparation.";
const superseded = () => new DOMException(TAKEN_OVER, "AbortError");
/** A route request continued this preparation in the same worker. Any other
 * abort means the worker was released before routing was ready. */
export const preparationTakenOver = (error: unknown) =>
  error instanceof DOMException &&
  error.name === "AbortError" &&
  error.message === TAKEN_OVER;
