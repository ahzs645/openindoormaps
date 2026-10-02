import type { IndoorDataset } from "./contract";
import type {
  FloorPreparationOptions,
  FloorPreparationRequest,
  FloorPreparationResponse,
  PreparedFloor,
} from "./prepared-floor";

// Keep the key builder lightweight: importing prepareFloor here would pull
// polygon processing into every worker client at runtime.
export const floorWorkerKey = (
  levels: number[],
  building: string,
  o: FloorPreparationOptions,
) =>
  JSON.stringify([
    [...new Set(levels)].sort((a, b) => a - b),
    building,
    o.relativeHeights ?? false,
    o.showPillars,
    o.showPassThroughPlaces,
    o.showVestibuleDoors,
    o.showStructures,
    o.review,
    o.simplifyGeometry,
  ]);

export interface FloorWorker {
  onmessage: ((event: MessageEvent<FloorPreparationResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: FloorPreparationRequest): void;
  terminate(): void;
}
const abort = () =>
  new DOMException("Floor preparation was cancelled.", "AbortError");
type Pending = {
  id: number;
  data: IndoorDataset;
  key: string;
  resolve: (value: PreparedFloor) => void;
  reject: (reason: unknown) => void;
};

/** One worker per mounted map, with bounded caches tied to immutable datasets.
 * Cancellation terminates active CPU work instead of queueing obsolete floors.
 * Completed floors survive worker restarts; edited/imported datasets never reuse
 * another dataset's presentation. */
export class FloorWorkerClient {
  private worker?: FloorWorker;
  private workerData?: IndoorDataset;
  private pending?: Pending;
  private sequence = 0;
  private cache = new WeakMap<IndoorDataset, Map<string, PreparedFloor>>();
  constructor(
    private readonly factory: () => FloorWorker,
    private readonly capacity = 12,
  ) {}

  peek(data: IndoorDataset, key: string) {
    const floors = this.cache.get(data),
      value = floors?.get(key);
    if (value) {
      floors!.delete(key);
      floors!.set(key, value);
    }
    return value;
  }
  private stop(reason: unknown = abort()) {
    const pending = this.pending;
    this.pending = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.workerData = undefined;
    pending?.reject(reason);
  }
  request(
    data: IndoorDataset,
    levels: number[],
    building: string,
    options: FloorPreparationOptions,
  ) {
    const key = floorWorkerKey(levels, building, options);
    // A map's previous effect cancels before its replacement starts. Also stop
    // here so callers cannot accidentally queue two competing floor requests.
    if (this.pending) this.stop();
    const cached = this.peek(data, key);
    if (cached) return { promise: Promise.resolve(cached), cancel: () => {} };
    const id = ++this.sequence;
    let resolve!: Pending["resolve"], reject!: Pending["reject"];
    const promise = new Promise<PreparedFloor>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    this.pending = { id, data, key, resolve, reject };
    try {
      if (!this.worker) {
        const worker = this.factory();
        this.worker = worker;
        worker.onmessage = ({ data: response }) => {
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
          let floors = this.cache.get(pending.data);
          if (!floors) {
            floors = new Map();
            this.cache.set(pending.data, floors);
          }
          floors.set(pending.key, response.value);
          if (floors.size > this.capacity)
            floors.delete(floors.keys().next().value!);
          this.pending = undefined;
          pending.resolve(response.value);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          if (this.worker === worker)
            this.stop(
              new Error(event.message || "The floor worker could not start."),
            );
        };
        worker.onmessageerror = () => {
          if (this.worker === worker)
            this.stop(
              new Error("The floor worker returned unreadable geometry."),
            );
        };
      }
      this.worker.postMessage({
        requestId: id,
        data: this.workerData === data ? undefined : data,
        levelIds: [...levels],
        building,
        options,
      });
      this.workerData = data;
    } catch (error) {
      this.stop(error);
    }
    return {
      promise,
      cancel: () => {
        if (this.pending?.id === id) this.stop();
      },
    };
  }
  dispose() {
    this.stop();
  }
}
