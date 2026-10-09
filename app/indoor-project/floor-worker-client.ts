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

/** Transport-only request fields; they never change what the worker prepares. */
export type FloorWorkerRequest = FloorPreparationRequest & {
  /** The UI does not consume the native area display for this view (3D,
   * review or a non-native floor map). The worker still derives and checks it
   * for preparation, but omits it from the reply instead of cloning it. */
  omitNativeDisplay?: boolean;
  /** Opt-in scalar diagnostics (see floor-diagnostics.ts). */
  diagnostics?: boolean;
};
export type FloorTransport = { nativeDisplay?: boolean };
/** Client cache/request identity: the floor key plus whether the reply carries
 * its native display, so a display-only result never serves a native view. */
export const floorClientKey = (
  levels: number[],
  building: string,
  o: FloorPreparationOptions,
  transport: FloorTransport = {},
) =>
  transport.nativeDisplay === false
    ? `${floorWorkerKey(levels, building, o)}|display-only`
    : floorWorkerKey(levels, building, o);

export interface FloorWorker {
  onmessage: ((event: MessageEvent<FloorPreparationResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: FloorWorkerRequest): void;
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
  /** Cancelled by its caller; terminated on the next task unless the very same
   * request (same dataset object and key) is issued again first. */
  orphaned?: ReturnType<typeof setTimeout>;
};

/** One long-lived worker per mounted map, with bounded caches tied to
 * immutable datasets. The dataset is cloned into the worker once and stays
 * resident across floor/mode changes; completed results are never retained
 * beyond the measured cache budget. Cancellation terminates obsolete CPU work
 * (on the next task, so an immediate identical re-request - React StrictMode's
 * effect replay - adopts the in-flight calculation instead of re-cloning the
 * dataset). Edited/imported datasets never reuse another dataset's floors. */
export class FloorWorkerClient {
  private worker?: FloorWorker;
  private workerData?: IndoorDataset;
  private pending?: Pending;
  private sequence = 0;
  private cacheData?: IndoorDataset;
  private cache: FloorMemoryCache<string, PreparedFloor>;
  private releaseTimer?: ReturnType<typeof setTimeout>;
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
  /** Scalar state for tests/diagnostics: is a source dataset resident? */
  hasResidentWorker() {
    return !!this.worker && !!this.workerData;
  }
  private stop(reason: unknown = abort()) {
    const pending = this.pending;
    this.pending = undefined;
    if (pending?.orphaned) clearTimeout(pending.orphaned);
    this.worker?.terminate();
    this.worker = undefined;
    this.workerData = undefined;
    pending?.reject(reason);
  }
  private settle(pending: Pending, settle: () => void) {
    if (pending.orphaned) clearTimeout(pending.orphaned);
    this.pending = undefined;
    settle();
  }
  request(
    data: IndoorDataset,
    levels: number[],
    building: string,
    options: FloorPreparationOptions,
    transport: FloorTransport = {},
  ) {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = undefined;
    }
    const key = floorClientKey(levels, building, options, transport);
    let resolve!: Pending["resolve"], reject!: Pending["reject"];
    const promise = new Promise<PreparedFloor>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    const parked = this.pending;
    if (parked?.orphaned && parked.data === data && parked.key === key) {
      // Same calculation was cancelled in this task and requested again:
      // adopt it rather than terminating and re-cloning the source dataset.
      clearTimeout(parked.orphaned);
      parked.orphaned = undefined;
      parked.resolve = resolve;
      parked.reject = reject;
      const id = parked.id;
      return { promise, cancel: () => this.cancel(id) };
    }
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
          // An oversized result is simply not retained here; the worker and
          // its resident dataset stay available for the next floor or mode.
          if (pending.orphaned) {
            // Late reply for a cancelled request: keep it only if it fits.
            this.cache.set(
              pending.key,
              response.value,
              response.memoryCostBytes,
            );
            this.settle(pending, () => {});
            return;
          }
          this.cache.set(pending.key, response.value, response.memoryCostBytes);
          this.settle(pending, () => pending.resolve(response.value));
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
      const message: FloorWorkerRequest = {
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
      };
      if (transport.nativeDisplay === false) message.omitNativeDisplay = true;
      this.worker.postMessage(message);
      this.workerData = data;
    } catch (error) {
      this.stop(error);
    }
    return { promise, cancel: () => this.cancel(id) };
  }
  private cancel(id: number) {
    const pending = this.pending;
    if (pending?.id !== id || pending.orphaned) return;
    const reject = pending.reject;
    pending.resolve = () => {};
    pending.reject = () => {};
    pending.orphaned = setTimeout(() => {
      if (this.pending === pending && pending.orphaned) this.stop();
    }, 0);
    reject(abort());
  }
  /** Unmount: release on the next task unless the map immediately requests
   * again (StrictMode replays unmount/mount synchronously). */
  release() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = undefined;
      this.dispose();
    }, 0);
  }
  /** Explicit release (retry, tests): terminate now and drop every result. */
  dispose() {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = undefined;
    }
    this.stop();
    this.cache.clear();
    this.cacheData = undefined;
  }
}
