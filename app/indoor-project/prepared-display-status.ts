import type { IndoorDataset } from "./contract";
import type { FloorPreparationOptions } from "./prepared-floor";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import {
  hasPreparedDisplayArchive,
  preparedDisplayAssetRequest,
} from "./prepared-display-registry";

export type PreparedDisplayStatus =
  | { state: "none" }
  | { state: "usable" }
  | { state: "stale-engine"; assetEngine: string; runtimeEngine: string }
  | { state: "missing-scope" };

/** UI-only scalar check of the registered archive: no hashing, inflation or
 * geometry access. "usable" still means the worker must verify the dataset
 * bytes, every chunk and the exact source bindings before using the asset;
 * this only explains why a floor will be prepared live. */
export function preparedDisplayStatus(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  options: FloorPreparationOptions,
): PreparedDisplayStatus {
  if (!hasPreparedDisplayArchive(data)) return { state: "none" };
  const asset = preparedDisplayAssetRequest(data, levelIds, building, options);
  if (!asset) return { state: "missing-scope" };
  const assetEngine = asset.descriptor.binding.enginePreparationSha256;
  return assetEngine === PREPARED_DISPLAY_ENGINE_SHA256
    ? { state: "usable" }
    : {
        state: "stale-engine",
        assetEngine,
        runtimeEngine: PREPARED_DISPLAY_ENGINE_SHA256,
      };
}

const warned = new Set<string>();
/** One console line per distinct engine pair, naming both hashes. */
export function warnStalePreparedDisplay(status: PreparedDisplayStatus) {
  if (status.state !== "stale-engine") return;
  const key = `${status.assetEngine}:${status.runtimeEngine}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(
    `Prepared floor displays were built by display engine ${status.assetEngine}; this app runs engine ${status.runtimeEngine}. They are not used (the binding is exact); floors are prepared live.`,
  );
}

export const shortEngine = (sha: string) => sha.slice(0, 8);
