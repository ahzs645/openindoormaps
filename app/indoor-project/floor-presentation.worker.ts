import { holdHeavyWorkerLifetimeLock } from "./heavy-worker-schedule";
import type { NativeExploreResult } from "./native-explore";
import { initializeNativeExactGeosOverlay } from "./native-exact-geos-overlay";
import { deriveNativeExplore } from "./native-explore";
import {
  prepareFloor,
  type FloorPreparationResponse,
  type PreparedFloor,
} from "./prepared-floor";
import type { IndoorDataset } from "./contract";
import { loadPreparedDisplayAsset } from "./prepared-display-loader";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
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
import type { FloorWorkerRequest } from "./floor-worker-client";
import {
  configureFloorDiagnostics,
  floorDiagnostic,
  floorDiagnosticsEnabled,
  timeFloorStage,
  timeFloorStageAsync,
  type FloorDiagnosticEntry,
} from "./floor-diagnostics";

// Kept separate from the main thread: polygon unions and clipping must never
// run as a synchronous fallback when preparing a map floor.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<FloorWorkerRequest>) => void;
  postMessage: (
    message:
      | (FloorPreparationResponse & { nativeFaces?: NativeExploreResult })
      | { requestId: number; diagnostic: FloorDiagnosticEntry },
  ) => void;
};
// Released only when this worker context is destroyed: lets the UI wait for
// actual teardown after terminate() before allocating another heavy worker.
holdHeavyWorkerLifetimeLock();
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
/** Structured clone runs synchronously inside postMessage. Time it as its own
 * stage so worker serialization is not attributed to preparation. */
/** Reply with the completed floor. The native display is attached unless the
 * UI said it will not render it; the retention cost covers exactly what is
 * sent. Structured clone runs synchronously inside postMessage, so it is
 * timed as its own stage rather than attributed to preparation. */
function reply(
  request: FloorWorkerRequest,
  value: PreparedFloor,
  faces: NativeExploreResult | undefined,
) {
  const requestId = request.requestId;
  const nativeFaces = request.omitNativeDisplay ? undefined : faces;
  const memoryCost = timeFloorStage(
    "floor-worker:memory-cost",
    () => memoryCostBytes(nativeFaces ? { value, nativeFaces } : { value }),
    (bytes) => ({
      requestId,
      memoryCostBytes: bytes,
      nativeDisplay: !!nativeFaces,
    }),
  );
  const message: FloorPreparationResponse & {
    nativeFaces?: NativeExploreResult;
  } = { requestId, value, memoryCostBytes: memoryCost };
  if (nativeFaces) message.nativeFaces = nativeFaces;
  timeFloorStage(
    "floor-worker:postMessage",
    () => scope.postMessage(message),
    () => ({ requestId }),
  );
}
scope.onmessage = async ({ data: request }) => {
  const requestId = request.requestId;
  configureFloorDiagnostics(request.diagnostics === true, (diagnostic) =>
    scope.postMessage({ requestId, diagnostic }),
  );
  try {
    floorDiagnostic("floor-worker:request", {
      requestId,
      datasetIncluded: !!request.data,
      levels: request.levelIds.length,
      preparedAssetOffered: !!request.preparedDisplay,
      // Scalar engine comparison only; the loader still verifies everything.
      engineMatches:
        request.preparedDisplay?.descriptor.binding.enginePreparationSha256 ===
        PREPARED_DISPLAY_ENGINE_SHA256,
      engine: PREPARED_DISPLAY_ENGINE_SHA256.slice(0, 8),
    });
    if (request.data) data = request.data;
    if (!data) throw new Error("The floor worker has no project data.");
    const dataset = data;
    const saved = await timeFloorStageAsync(
      "floor-worker:prepared-asset",
      () =>
        loadPreparedDisplayAsset(
          dataset,
          request.levelIds,
          request.building,
          request.preparedDisplay,
          request.options,
        ),
      (value) => ({ requestId, used: !!value }),
    );
    if (saved) {
      reply(request, saved.preparedFloor, saved.nativeFaces);
      return;
    }
    const offered = request.preparedDisplay?.descriptor.binding;
    if (offered)
      // Never relabel or partially trust a stale asset; say why it is unused.
      console.warn(
        offered.enginePreparationSha256 === PREPARED_DISPLAY_ENGINE_SHA256
          ? `Prepared floor display for levels ${request.levelIds.join(",")} is bound to other dataset bytes or options; preparing live.`
          : `Prepared floor display for levels ${request.levelIds.join(",")} uses display engine ${offered.enginePreparationSha256}; this worker runs ${PREPARED_DISPLAY_ENGINE_SHA256}. Preparing live.`,
      );
    if (dataset.nativeIndoorEnvelopes) await initializeNativeExactGeosOverlay();
    const faces = dataset.nativeIndoorEnvelopes
      ? await timeFloorStageAsync(
          "floor-worker:native-faces",
          () => nativeFaces(dataset, request.levelIds, request.building),
          (result) => ({ requestId, regions: result.regions.length }),
        )
      : undefined;
    const value = timeFloorStage(
      "floor-worker:prepare-floor",
      () =>
        preparedFloor(dataset, request.levelIds, request.building, {
          ...floorWorkerPreparationOptions(dataset, request.options),
          ...(faces ? { nativeFaces: faces } : {}),
        }),
      () => ({ requestId }),
    );
    reply(request, value, faces);
  } catch (error) {
    floorDiagnostic("floor-worker:error", { requestId });
    scope.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (floorDiagnosticsEnabled())
      floorDiagnostic("floor-worker:done", { requestId });
  }
};
