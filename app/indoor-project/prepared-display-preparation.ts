import type { IndoorDataset } from "./contract";
import { nativePhysicalDisplayPlanes } from "./native-display-planes";
import { deriveNativeExplore } from "./native-explore";
import { floorWorkerPreparationOptions } from "./prepared-floor-cache";
import { prepareFloor, type FloorPreparationOptions } from "./prepared-floor";
import {
  encodePreparedDisplayAsset,
  preparedDisplayDatasetSha256,
} from "./prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import { loadPreparedDisplayAsset } from "./prepared-display-loader";
import {
  preparedDisplayOptions,
  type PreparedDisplayArchive,
} from "./prepared-display-registry";
/** Match the visitor map's initial settings. Camera height modes share these
 * footprints; changing a setting invalidates this variant instead of guessing. */
export const visitorDisplayDefaultOptions: FloorPreparationOptions = {
  showPillars: true,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
  showStructures: false,
  showDoorwayRecesses: false,
  review: false,
  simplifyGeometry: false,
};
export function preparedDisplayScopes(
  data: IndoorDataset,
  includeNativeLevels = false,
) {
  if (data.nativeExploreMapping?.version !== 3)
    throw new Error(
      "Pre-generated native display requires a validated exact native mapping (version 3).",
    );
  const scopes = new Map<string, number[]>();
  const publishedLevels = new Set(
    data.nativeExploreMapping.levels.map((level) => level.levelId),
  );
  const unavailableScopes: number[][] = [];
  const addScope = (levels: number[]) => {
    if (!levels.length || levels.some((level) => !publishedLevels.has(level))) {
      unavailableScopes.push(levels);
      return;
    }
    scopes.set(JSON.stringify(levels), levels);
  };
  for (const floor of data.floors) {
    addScope(floor.levelIds);
    for (const plane of nativePhysicalDisplayPlanes(data, floor.id))
      addScope(plane.levelIds);
  }
  if (includeNativeLevels)
    for (const level of data.nativeExploreMapping.levels)
      addScope([level.levelId]);
  if (!scopes.size || scopes.size > 32)
    throw new Error(
      "Prepared display scope inventory is empty or exceeds the archive bound.",
    );
  return { scopes: [...scopes.values()], unavailableScopes };
}
export async function prepareDatasetDisplayAssets(
  data: IndoorDataset,
  options: {
    includeNativeLevels?: boolean;
    onScope?: (scope: {
      levelIds: number[];
      preparationMs: number;
      verificationMs: number;
      chunks: number;
      logicalBytes: number;
    }) => void;
  } = {},
) {
  const { scopes, unavailableScopes } = preparedDisplayScopes(
    data,
    options.includeNativeLevels ?? false,
  );
  const datasetSha256 = preparedDisplayDatasetSha256(data),
    archive: PreparedDisplayArchive = {
      version: 1,
      descriptors: [],
      blobs: {},
    };
  const timings: {
    levelIds: number[];
    preparationMs: number;
    verificationMs: number;
    chunks: number;
    logicalBytes: number;
  }[] = [];
  for (const levelIds of scopes) {
    const started = performance.now(),
      nativeFaces = await deriveNativeExplore(data, levelIds, "all");
    const preparedFloor = prepareFloor(data, levelIds, "all", {
      ...floorWorkerPreparationOptions(data, visitorDisplayDefaultOptions),
      nativeFaces,
    });
    const asset = encodePreparedDisplayAsset(
      { nativeFaces, preparedFloor },
      {
        version: 1,
        datasetSha256,
        enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
        levelIds,
        building: "all",
        windowMode: data.windowDisplay?.mode ?? "none",
        options: preparedDisplayOptions(data, visitorDisplayDefaultOptions),
      },
    );
    const preparationMs = performance.now() - started;
    archive.descriptors.push(asset.descriptor);
    for (const [sha, bytes] of asset.blobs) archive.blobs[sha] = bytes;
    const verificationStart = performance.now();
    const restored = await loadPreparedDisplayAsset(
      data,
      levelIds,
      "all",
      { descriptor: asset.descriptor, blobs: archive.blobs },
      visitorDisplayDefaultOptions,
    );
    if (!restored)
      throw new Error(
        "Prepared display replay did not match its source scope.",
      );
    // Streaming checksums compare the full exact graph without a giant string.
    if (
      preparedDisplayDatasetSha256(restored) !==
      preparedDisplayDatasetSha256({ nativeFaces, preparedFloor })
    )
      throw new Error(
        "Prepared display replay changed source geometry or metadata.",
      );
    timings.push({
      levelIds,
      preparationMs,
      verificationMs: performance.now() - verificationStart,
      chunks: asset.descriptor.chunks.length,
      logicalBytes: asset.descriptor.logicalJsonBytes,
    });
    options.onScope?.(timings.at(-1)!);
    (globalThis as { gc?: () => void }).gc?.();
  }
  return {
    archive,
    datasetSha256,
    unavailableScopes,
    timings,
    defaultOptions: visitorDisplayDefaultOptions,
  };
}
