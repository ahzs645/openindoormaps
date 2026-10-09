import type { IndoorDataset } from "./contract";
import type { FloorPreparationOptions } from "./prepared-floor";
import type {
  PreparedDisplayAssetDescriptor,
  PreparedDisplayOptions,
} from "./prepared-display-assets";

/** Compressed, checksummed display entries stay outside source dataset JSON. */
export type PreparedDisplayArchive = {
  version: 1;
  descriptors: PreparedDisplayAssetDescriptor[];
  blobs: Record<string, Uint8Array>;
};
export type PreparedDisplayAssetRequest = {
  descriptor: PreparedDisplayAssetDescriptor;
  blobs: Record<string, Uint8Array>;
};
const archives = new WeakMap<IndoorDataset, PreparedDisplayArchive>();

/** Lightweight UI registration only. Workers validate all source/engine bytes. */
export function registerPreparedDisplayArchive(
  data: IndoorDataset,
  archive: PreparedDisplayArchive | undefined,
) {
  if (archive) archives.set(data, archive);
  else archives.delete(data);
}

export function preparedDisplayOptions(
  data: IndoorDataset,
  options: FloorPreparationOptions,
): PreparedDisplayOptions {
  return {
    relativeHeights:
      data.nativeIndoorEnvelopes && data.nativeMaterialSections
        ? true
        : (options.relativeHeights ?? false),
    showPillars: options.showPillars,
    showPassThroughPlaces: options.showPassThroughPlaces,
    showVestibuleDoors: options.showVestibuleDoors,
    showStructures: options.showStructures,
    showDoorwayRecesses: options.showDoorwayRecesses ?? true,
    review: options.review,
    simplifyGeometry: options.simplifyGeometry,
  };
}
const sameOptions = (a: PreparedDisplayOptions, b: PreparedDisplayOptions) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((key) => a[key] === b[key]);

/** Scalar lookup never hashes a dataset, inflates an entry or traverses geometry. */
export function preparedDisplayAssetRequest(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  options?: FloorPreparationOptions,
): PreparedDisplayAssetRequest | undefined {
  const archive = archives.get(data);
  if (!archive || options?.nativeFaces) return undefined;
  const normalized = options && preparedDisplayOptions(data, options);
  const descriptor = archive.descriptors.find(
    ({ binding }) =>
      binding.building === building &&
      binding.windowMode === (data.windowDisplay?.mode ?? "none") &&
      binding.levelIds.length === levelIds.length &&
      binding.levelIds.every((id, index) => id === levelIds[index]) &&
      (!normalized || sameOptions(binding.options, normalized)),
  );
  if (!descriptor) return undefined;
  const blobs: Record<string, Uint8Array> = {};
  for (const chunk of descriptor.chunks) {
    const blob = archive.blobs[chunk.sha256];
    if (!blob) return undefined;
    blobs[chunk.sha256] = blob;
  }
  return { descriptor, blobs };
}
