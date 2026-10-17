import type { IndoorDataset } from "./contract";
import type { NativeExploreResult } from "./native-explore";
import type { FloorPreparationOptions, PreparedFloor } from "./prepared-floor";
import {
  decodePreparedDisplayAsset,
  encodePreparedDisplayAsset,
  preparedDisplayDatasetSha256,
  PREPARED_DISPLAY_ASSET_LIMITS,
} from "./prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import {
  preparedDisplayOptions,
  type PreparedDisplayAssetRequest,
} from "./prepared-display-registry";
import { RESIDENT_FLOOR_CACHE_BYTES } from "./resident-floor-cache-budget";

const binding = (
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  options: FloorPreparationOptions,
) => ({
  version: 1 as const,
  datasetSha256: preparedDisplayDatasetSha256(data),
  enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  levelIds: [...new Set(levelIds)].sort((a, b) => a - b),
  building,
  windowMode: data.windowDisplay?.mode ?? "none",
  options: preparedDisplayOptions(data, options),
});

/** Worker-only serialization of a completed floor. This private page-lifetime
 * cache never registers an imported archive or grants source validation. The
 * client retains it only for the same immutable dataset object and full key;
 * restore additionally checks actual source bytes, engine, scope and options.
 * Reuse the bounded, checksummed subtree codec to preserve shared geometry.
 */
export function packResidentFloor(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  options: FloorPreparationOptions,
  value: PreparedFloor,
  faces: NativeExploreResult,
) {
  if (options.nativeFaces) return;
  const packed = encodePreparedDisplayAsset(
    { preparedFloor: value, nativeFaces: faces },
    binding(data, levelIds, building, options),
    {
      ...PREPARED_DISPLAY_ASSET_LIMITS,
      aggregateStoredBytes: RESIDENT_FLOOR_CACHE_BYTES,
    },
  );
  const asset: PreparedDisplayAssetRequest = {
    descriptor: packed.descriptor,
    blobs: Object.fromEntries(packed.blobs),
  };
  const memoryCostBytes =
    JSON.stringify(packed.descriptor).length * 2 +
    [...packed.blobs.values()].reduce((n, b) => n + b.byteLength + 256, 0);
  return { asset, memoryCostBytes };
}

/** Only for bytes produced by packResidentFloor in this mounted viewer. The
 * source has already passed normal import and preparation. External prepared
 * assets still use loadPreparedDisplayAsset and its full source comparisons.
 */
export async function restoreResidentFloor(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  options: FloorPreparationOptions,
  asset: PreparedDisplayAssetRequest,
) {
  if (options.nativeFaces)
    throw new Error("A resident floor cannot replace supplied native faces.");
  return decodePreparedDisplayAsset(
    asset.descriptor,
    binding(data, levelIds, building, options),
    (sha) => asset.blobs[sha],
  );
}
