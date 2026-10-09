import { validateNativeCachedDrawing } from "./native-prepared-drawing-validation";
import type { IndoorDataset } from "./contract";
import type { FloorPreparationOptions } from "./prepared-floor";
import {
  decodePreparedDisplayAsset,
  preparedDisplayDatasetSha256,
  PreparedDisplayAssetError,
} from "./prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import {
  floorDiagnostic,
  timeFloorStage,
  timeFloorStageAsync,
} from "./floor-diagnostics";
import {
  preparedDisplayOptions,
  type PreparedDisplayAssetRequest,
} from "./prepared-display-registry";

/** Worker/CLI only: old or edited assets fall back to current preparation;
 * damaged matching assets remain explicit failures rather than silent repairs. */
export async function loadPreparedDisplayAsset(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  asset: PreparedDisplayAssetRequest | undefined,
  options?: FloorPreparationOptions,
) {
  if (!asset || building !== "all") return undefined;
  const binding = asset.descriptor.binding;
  const engineMatches =
    binding.enginePreparationSha256 === PREPARED_DISPLAY_ENGINE_SHA256;
  floorDiagnostic("prepared-asset:offered", {
    engineMatches,
    levels: levelIds.length,
    logicalJsonBytes: asset.descriptor.logicalJsonBytes,
    pooledJsonBytes: asset.descriptor.pooledJsonBytes,
  });
  if (
    !engineMatches ||
    binding.building !== building ||
    binding.windowMode !== (data.windowDisplay?.mode ?? "none") ||
    binding.levelIds.length !== levelIds.length ||
    binding.levelIds.some((id, i) => id !== levelIds[i])
  )
    return undefined;
  if (options) {
    const normalized = preparedDisplayOptions(data, options);
    if (
      Object.keys(normalized).length !== Object.keys(binding.options).length ||
      Object.keys(normalized).some(
        (key) => normalized[key] !== binding.options[key],
      )
    )
      return undefined;
  }
  // Source objects can be edited in place by CLI callers. Hash actual bytes
  // in this worker, rather than treating object identity as source authority.
  const datasetSha256 = timeFloorStage("prepared-asset:dataset-hash", () =>
    preparedDisplayDatasetSha256(data),
  );
  if (binding.datasetSha256 !== datasetSha256) {
    floorDiagnostic("prepared-asset:dataset-mismatch");
    return undefined;
  }
  const value = await timeFloorStageAsync("prepared-asset:decode", () =>
    decodePreparedDisplayAsset(
      asset.descriptor,
      {
        version: 1,
        datasetSha256,
        enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
        levelIds,
        building,
        windowMode: data.windowDisplay?.mode ?? "none",
        options: options
          ? preparedDisplayOptions(data, options)
          : binding.options,
      },
      (sha) => Promise.resolve(asset.blobs[sha]),
    ),
  );
  const sourceComparisonStart = performance.now();
  if (data.nativeExploreMapping?.version === 3) {
    // A cached hit-test carrier cannot replace the validated native mapping.
    const topologies = value.nativeFaces.exactTopologies ?? [];
    if (
      topologies.length !== levelIds.length ||
      new Set(topologies.map((entry) => entry.levelId)).size !== levelIds.length
    )
      throw new PreparedDisplayAssetError(
        "binding",
        "cached native mapping omitted or repeated a complete exact scope",
      );
    for (const entry of topologies) {
      if (!levelIds.includes(entry.levelId))
        throw new PreparedDisplayAssetError(
          "binding",
          "cached native mapping added an unrelated scope",
        );
      const published = data.nativeExploreMapping.levels.find(
        (level) => level.levelId === entry.levelId,
      );
      if (
        !published?.exactTopology ||
        JSON.stringify(published.exactTopology) !==
          JSON.stringify(entry.topology)
      )
        throw new PreparedDisplayAssetError(
          "binding",
          "cached exact face differs from the current native mapping",
        );
    }
    const expected = new Map<string, string | undefined>();
    for (const levelId of levelIds) {
      const level = data.nativeExploreMapping.levels.find(
        (entry) => entry.levelId === levelId,
      );
      if (!level)
        throw new PreparedDisplayAssetError(
          "binding",
          "current native mapping omitted the requested scope",
        );
      for (const region of level.regions) {
        if (typeof region.exactFaceId !== "string" || !region.exactFaceId)
          throw new PreparedDisplayAssetError(
            "binding",
            "current native region omitted its exact source identity",
          );
        expected.set(`${levelId}:${region.id}`, region.exactFaceId);
      }
    }
    const actual = new Set<string>();
    for (const region of value.nativeFaces.regions) {
      const key = `${region.levelId}:${region.id}`;
      if (
        actual.has(key) ||
        !expected.has(key) ||
        expected.get(key) !== region.exactFaceId
      )
        throw new PreparedDisplayAssetError(
          "binding",
          "cached native region changed its exact source identity",
        );
      actual.add(key);
    }
    if (actual.size !== expected.size)
      throw new PreparedDisplayAssetError(
        "binding",
        "cached native mapping omitted a positive source face",
      );
  }
  floorDiagnostic("prepared-asset:source-comparison", {
    ms: performance.now() - sourceComparisonStart,
  });
  if (data.nativeExploreMapping?.version === 3)
    timeFloorStage("prepared-asset:cached-drawing-validation", () =>
      validateNativeCachedDrawing(data, levelIds, value.nativeFaces, building),
    );
  return value;
}
