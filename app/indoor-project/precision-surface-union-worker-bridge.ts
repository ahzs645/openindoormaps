import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type {
  IndexedPrecisionSurfaceGeometry,
  PrecisionSurfaceUnionRequest,
  PrecisionSurfaceUnionResponse,
} from "./precision-surface-union";

type Surfaces = FeatureCollection<Polygon | MultiPolygon>;
export type PrecisionSurfaceUnionOptions = {
  kind: "floor" | "room";
  relativeHeights?: boolean;
  circulationOnly?: boolean;
  originGeographic?: [number, number];
};
export interface PrecisionSurfaceUnionWorker {
  onmessage:
    | ((event: MessageEvent<PrecisionSurfaceUnionResponse>) => void)
    | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: PrecisionSurfaceUnionRequest): void;
  terminate(): void;
}
const completed = new WeakMap<Surfaces, Map<string, Surfaces>>();
let sequence = 0;
const createWorker = (): PrecisionSurfaceUnionWorker =>
  new Worker(new URL("precision-surface-union.worker.ts", import.meta.url), {
    type: "module",
  });

/** The main thread transports prepared geometry only; it never imports or
 * runs an overlay. Completed render copies belong to the immutable source FC
 * and geometry scope, independently of selection/paint. A failed or cancelled
 * request resolves undefined so the caller can keep its original caps. */
export function requestPrecisionSurfaceUnion(
  surfaces: Surfaces,
  options: PrecisionSurfaceUnionOptions,
  factory: () => PrecisionSurfaceUnionWorker = createWorker,
): { promise: Promise<Surfaces | undefined>; cancel(): void } {
  const key = JSON.stringify([
    options.kind,
    !!options.relativeHeights,
    !!options.circulationOnly,
    options.originGeographic,
  ]);
  const cached = completed.get(surfaces)?.get(key);
  if (cached) return { promise: Promise.resolve(cached), cancel() {} };
  const features: IndexedPrecisionSurfaceGeometry[] = [];
  surfaces.features.forEach((feature, index) => {
    const properties = feature.properties ?? {};
    if (
      properties.nativeFloor === true ||
      feature.geometry.type !== "MultiPolygon" ||
      feature.geometry.coordinates.length <= 1 ||
      (options.circulationOnly &&
        (options.kind === "floor"
          ? properties.circulation !== true
          : properties.height !== 0))
    )
      return;
    features.push({ index, id: feature.id, geometry: feature.geometry });
  });
  if (features.length === 0)
    return { promise: Promise.resolve(surfaces), cancel() {} };
  const requestId = ++sequence;
  let active = true;
  let worker: PrecisionSurfaceUnionWorker | undefined;
  let resolve!: (value: Surfaces | undefined) => void;
  const promise = new Promise<Surfaces | undefined>((finish) => {
    resolve = finish;
  });
  const finish = (value?: Surfaces) => {
    if (!active) return;
    active = false;
    const stopped = worker;
    worker = undefined;
    if (stopped) {
      stopped.onmessage = null;
      stopped.onerror = null;
      stopped.onmessageerror = null;
      stopped.terminate();
    }
    resolve(value);
  };
  try {
    worker = factory();
    worker.onmessage = ({ data: response }) => {
      if (!active || response.requestId !== requestId) return;
      if ("error" in response || response.features.length !== features.length) {
        finish();
        return;
      }
      const geometries = new Map(
        response.features.map((feature) => [feature.index, feature]),
      );
      if (
        geometries.size !== features.length ||
        features.some((feature) => {
          const result = geometries.get(feature.index);
          return (
            !result ||
            result.id !== feature.id ||
            result.geometry.type !== "MultiPolygon"
          );
        })
      ) {
        finish();
        return;
      }
      const value: Surfaces = {
        ...surfaces,
        features: surfaces.features.map((feature, index) => {
          const result = geometries.get(index);
          return result ? { ...feature, geometry: result.geometry } : feature;
        }),
      };
      let variants = completed.get(surfaces);
      if (!variants) completed.set(surfaces, (variants = new Map()));
      if (variants.size >= 8) variants.delete(variants.keys().next().value!);
      variants.set(key, value);
      finish(value);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
    };
    worker.onmessageerror = () => finish();
    worker.postMessage({ requestId, features });
  } catch {
    finish();
  }
  return { promise, cancel: () => finish() };
}
