import type { IndoorDataset } from "./contract";
import { preparedDisplayAssetRequest } from "./prepared-display-registry";
import { floorNativeFaceIdentity } from "./floor-cache-identity";
import {
  COMPLETE_FLOOR_CACHE_BYTES,
  FloorMemoryCache,
} from "./floor-memory-cache";
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
    o.showDoorwayRecesses ?? true,
    o.review,
    o.simplifyGeometry,
    floorNativeFaceIdentity(o.nativeFaces),
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
  private cacheData?: IndoorDataset;
  private cache: FloorMemoryCache<string, PreparedFloor>;
  private readonly factory: () => FloorWorker;
  constructor(
    factory: () => FloorWorker,
    capacity = 12,
    maximumBytes = COMPLETE_FLOOR_CACHE_BYTES,
  ) {
    this.factory = factory;
    this.cache = new FloorMemoryCache(capacity, maximumBytes);
  }

  peek(data: IndoorDataset, key: string) {
    return this.cacheData === data ? this.cache.get(key) : undefined;
  }
  cacheStatistics() {
    return this.cache.statistics();
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
    if (this.cacheData !== data) {
      this.cache.clear();
      this.cacheData = data;
    }
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
          // Missing/oversized costs still display successfully, but never
          // trigger a synchronous UI traversal or an unbounded retention.
          this.cache.set(pending.key, response.value, response.memoryCostBytes);
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
        preparedDisplay: preparedDisplayAssetRequest(
          data,
          levels,
          building,
          options,
        ),
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
    this.cache.clear();
    this.cacheData = undefined;
  }
}
