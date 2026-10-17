import type { IndoorDataset } from "./contract";
import type { ProjectRooms } from "./package";

export type BoundaryEvidenceRequest = {
  requestId: number;
  data: IndoorDataset;
  rooms: ProjectRooms;
};
export type BoundaryEvidenceResponse =
  | { requestId: number; value: Map<string, string> }
  | { requestId: number; error: string };
export interface BoundaryEvidenceWorker {
  onmessage: ((event: MessageEvent<BoundaryEvidenceResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: BoundaryEvidenceRequest): void;
  terminate(): void;
}

/** One small completed result for the current immutable authoring snapshot.
 * Construction and cache reads never start a worker or validate geometry. */
export class BoundaryEvidenceWorkerClient {
  private sequence = 0;
  private cached?: {
    data: IndoorDataset;
    rooms: ProjectRooms;
    value: Map<string, string>;
  };
  private pending?: {
    id: number;
    worker?: BoundaryEvidenceWorker;
    reject: (reason: unknown) => void;
  };
  constructor(private readonly factory: () => BoundaryEvidenceWorker) {}
  peek(data: IndoorDataset, rooms: ProjectRooms) {
    return this.cached?.data === data && this.cached.rooms === rooms
      ? this.cached.value
      : undefined;
  }
  resetData(data?: IndoorDataset, rooms?: ProjectRooms) {
    if (this.cached?.data !== data || this.cached?.rooms !== rooms)
      this.cached = undefined;
  }
  private stop(
    reason: unknown = new DOMException(
      "Boundary evidence calculation cancelled.",
      "AbortError",
    ),
  ) {
    const pending = this.pending;
    this.pending = undefined;
    pending?.worker?.terminate();
    pending?.reject(reason);
  }
  request(data: IndoorDataset, rooms: ProjectRooms) {
    this.stop();
    this.resetData(data, rooms);
    const cached = this.peek(data, rooms);
    if (cached) return { promise: Promise.resolve(cached), cancel() {} };
    const id = ++this.sequence;
    const promise = new Promise<Map<string, string>>((resolve, reject) => {
      this.pending = { id, reject };
      try {
        const worker = this.factory();
        this.pending.worker = worker;
        worker.onmessage = ({ data: response }) => {
          if (this.pending?.worker !== worker || response.requestId !== id)
            return;
          if ("error" in response) {
            this.stop(new Error(response.error));
            return;
          }
          this.pending = undefined;
          worker.terminate();
          this.cached = { data, rooms, value: response.value };
          resolve(response.value);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          if (this.pending?.worker === worker)
            this.stop(
              new Error(event.message || "Boundary evidence could not run."),
            );
        };
        worker.onmessageerror = () => {
          if (this.pending?.worker === worker)
            this.stop(new Error("Boundary evidence returned unreadable data."));
        };
        worker.postMessage({ requestId: id, data, rooms });
      } catch (error) {
        this.stop(error);
      }
    });
    return {
      promise,
      cancel: () => {
        if (this.pending?.id === id) this.stop();
      },
    };
  }
  dispose() {
    this.stop();
    this.cached = undefined;
  }
}
