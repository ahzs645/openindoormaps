import type { NativeExploreResult } from "./native-explore";
import { initializeNativeExactGeosOverlay } from "./native-exact-geos-overlay";
import { deriveNativeExplore } from "./native-explore";
import {
  prepareFloor,
  type FloorPreparationRequest,
  type FloorPreparationResponse,
} from "./prepared-floor";
import type { IndoorDataset } from "./contract";
import { loadPreparedDisplayAsset } from "./prepared-display-loader";
import {
  COMPLETE_FLOOR_CACHE_BYTES,
  FloorMemoryCache,
  NATIVE_FACE_CACHE_BYTES,
} from "./floor-memory-cache";
import { createFloorMemoryCostQuery } from "./floor-memory-cost";
import {
  createPreparedFloorCache,
  floorWorkerPreparationOptions,
} from "./prepared-floor-cache";

// Kept separate from the main thread: polygon unions and clipping must never
// run as a synchronous fallback when preparing a map floor.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<FloorPreparationRequest>) => void;
  postMessage: (
    message: FloorPreparationResponse & { nativeFaces?: NativeExploreResult },
  ) => void;
};
let data: IndoorDataset | undefined;
const memoryCostBytes = createFloorMemoryCostQuery();
const preparedFloor = createPreparedFloorCache(
  prepareFloor,
  12,
  COMPLETE_FLOOR_CACHE_BYTES,
  memoryCostBytes,
);
let nativeData: IndoorDataset | undefined;
const nativeCache = new FloorMemoryCache<
  string,
  Awaited<ReturnType<typeof deriveNativeExplore>>
>(12, NATIVE_FACE_CACHE_BYTES);
async function nativeFaces(
  dataset: IndoorDataset,
  levels: number[],
  building: string,
) {
  if (nativeData !== dataset) {
    nativeData = dataset;
    nativeCache.clear();
  }
  const orderedLevels = [...new Set(levels)].sort((a, b) => a - b);
  const key = JSON.stringify([orderedLevels, building]);
  const existing = nativeCache.get(key);
  if (existing) return existing;
  // Pending/rejected derivations never populate a complete-floor cache.
  const result = await deriveNativeExplore(dataset, orderedLevels, building);
  if (nativeData === dataset)
    nativeCache.set(key, result, memoryCostBytes(result));
  return result;
}
scope.onmessage = async ({ data: request }) => {
  try {
    if (request.data) data = request.data;
    if (!data) throw new Error("The floor worker has no project data.");
    const dataset = data;
    const saved = await loadPreparedDisplayAsset(
      dataset,
      request.levelIds,
      request.building,
      request.preparedDisplay,
      request.options,
    );
    if (saved) {
      scope.postMessage({
        requestId: request.requestId,
        value: saved.preparedFloor,
        nativeFaces: saved.nativeFaces,
        memoryCostBytes: memoryCostBytes({
          value: saved.preparedFloor,
          nativeFaces: saved.nativeFaces,
        }),
      });
      return;
    }
    if (dataset.nativeIndoorEnvelopes) await initializeNativeExactGeosOverlay();
    const faces = dataset.nativeIndoorEnvelopes
      ? await nativeFaces(dataset, request.levelIds, request.building)
      : undefined;
    const value = preparedFloor(dataset, request.levelIds, request.building, {
      ...floorWorkerPreparationOptions(dataset, request.options),
      ...(faces ? { nativeFaces: faces } : {}),
    });
    scope.postMessage({
      requestId: request.requestId,
      value,
      nativeFaces: faces,
      memoryCostBytes: memoryCostBytes({ value, nativeFaces: faces }),
    });
  } catch (error) {
    scope.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
