import type { IndoorDataset } from "./contract";
import type { FloorPreparationOptions } from "./prepared-floor";
import { floorWorkerKey } from "./floor-worker-client";
import {
  COMPLETE_FLOOR_CACHE_BYTES,
  FloorMemoryCache,
} from "./floor-memory-cache";
import { createFloorMemoryCostQuery } from "./floor-memory-cost";

/** Current strict visitor geometry uses physical heights in either camera mode.
 * Legacy and partial source datasets retain their distinct options. */
export function floorWorkerPreparationOptions(
  data: IndoorDataset,
  options: FloorPreparationOptions,
): FloorPreparationOptions {
  return data.nativeIndoorEnvelopes && data.nativeMaterialSections
    ? { ...options, relativeHeights: true }
    : options;
}

/** Bounded complete worker results, tied to immutable datasets and actual face
 * carriers. Only successful synchronous preparations are retained. No source
 * data, authoring state, Three.js resources or wire schema belongs here. */
export function createPreparedFloorCache<T>(
  prepare: (
    data: IndoorDataset,
    levels: number[],
    building: string,
    options: FloorPreparationOptions,
  ) => T,
  capacity = 12,
  maximumBytes = COMPLETE_FLOOR_CACHE_BYTES,
  memoryCostBytes = createFloorMemoryCostQuery(),
) {
  let dataset: IndoorDataset | undefined;
  const floors = new FloorMemoryCache<string, T>(capacity, maximumBytes);
  return (
    data: IndoorDataset,
    levels: number[],
    building: string,
    options: FloorPreparationOptions,
  ): T => {
    const key = floorWorkerKey(levels, building, options);
    if (dataset !== data) {
      dataset = data;
      floors.clear();
    }
    const cached = floors.get(key);
    if (cached !== undefined) return cached;
    const value = prepare(data, levels, building, options);
    floors.set(key, value, memoryCostBytes(value));
    return value;
  };
}
