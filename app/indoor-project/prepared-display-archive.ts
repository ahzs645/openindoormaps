import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  PREPARED_DISPLAY_ASSET_LIMITS,
  validatePreparedDisplayAssetDescriptor,
} from "./prepared-display-assets";
import type { PreparedDisplayArchive } from "./prepared-display-registry";

export type PreparedDisplayIndexEntry = {
  path: string;
  bytes: number;
  sha256: string;
};
export const PREPARED_DISPLAY_INDEX_PATH = "viewer/display/index.json";
export const PREPARED_DISPLAY_INDEX_LIMIT = 1024 * 1024;
const chunkPattern = /^viewer\/display\/([a-f0-9]{64})\.bin$/;
const digest = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
export const preparedDisplayChunkPath = (hash: string) =>
  `viewer/display/${hash}.bin`;
export function preparedDisplayArchiveEntryLimit(
  path: string,
): number | undefined {
  return path === PREPARED_DISPLAY_INDEX_PATH
    ? PREPARED_DISPLAY_INDEX_LIMIT
    : chunkPattern.test(path)
      ? PREPARED_DISPLAY_ASSET_LIMITS.storedChunkBytes
      : undefined;
}

/** Package worker checks compressed bytes and metadata only. Inflation and
 * complete logical graph checks remain lazy in the selected floor worker. */
export function readPreparedDisplayArchive(
  entry: PreparedDisplayIndexEntry | undefined,
  files: Record<string, Uint8Array>,
): PreparedDisplayArchive | undefined {
  const listed = Object.keys(files).filter((path) =>
    path.startsWith("viewer/display/"),
  );
  if (!entry) {
    if (listed.length) throw new Error("Unlisted prepared display entries.");
    return undefined;
  }
  const bytes = files[PREPARED_DISPLAY_INDEX_PATH];
  if (
    entry.path !== PREPARED_DISPLAY_INDEX_PATH ||
    !bytes ||
    bytes.length > PREPARED_DISPLAY_INDEX_LIMIT ||
    entry.bytes !== bytes.length ||
    digest(bytes) !== entry.sha256
  )
    throw new Error("Damaged prepared display index.");
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "descriptors,version"
  )
    throw new Error("Invalid prepared display index.");
  const index = value as PreparedDisplayArchive;
  if (
    index.version !== 1 ||
    !Array.isArray(index.descriptors) ||
    !index.descriptors.length ||
    index.descriptors.length > 32
  )
    throw new Error("Invalid prepared display descriptor inventory.");
  const blobs: Record<string, Uint8Array> = {};
  const bindings = new Set<string>();
  const paths = new Set([PREPARED_DISPLAY_INDEX_PATH]);
  let stored = 0;
  for (const descriptor of index.descriptors) {
    validatePreparedDisplayAssetDescriptor(descriptor);
    if (bindings.has(descriptor.bindingSha256))
      throw new Error("Duplicate prepared display scope binding.");
    bindings.add(descriptor.bindingSha256);
    for (const chunk of descriptor.chunks) {
      const path = preparedDisplayChunkPath(chunk.sha256),
        blob = files[path];
      if (
        !blob ||
        blob.length !== chunk.storedBytes ||
        digest(blob) !== chunk.sha256
      )
        throw new Error("Damaged prepared display chunk.");
      paths.add(path);
      if (!blobs[chunk.sha256]) {
        blobs[chunk.sha256] = blob;
        stored += blob.length;
      }
    }
  }
  if (stored > PREPARED_DISPLAY_ASSET_LIMITS.aggregateStoredBytes)
    throw new Error("Prepared display archive exceeds its stored budget.");
  if (listed.some((path) => !paths.has(path)))
    throw new Error("Unlisted prepared display chunk.");
  return { version: 1, descriptors: index.descriptors, blobs };
}

export function serializePreparedDisplayArchive(
  archive: PreparedDisplayArchive,
) {
  const files: Record<string, Uint8Array> = {};
  const index = new TextEncoder().encode(
    JSON.stringify({ version: 1, descriptors: archive.descriptors }),
  );
  const entry = {
    path: PREPARED_DISPLAY_INDEX_PATH,
    bytes: index.length,
    sha256: digest(index),
  };
  files[entry.path] = index;
  for (const descriptor of archive.descriptors)
    for (const chunk of descriptor.chunks) {
      const bytes = archive.blobs[chunk.sha256];
      if (!bytes)
        throw new Error("Missing prepared display chunk during export.");
      files[preparedDisplayChunkPath(chunk.sha256)] = bytes;
    }
  readPreparedDisplayArchive(entry, files);
  return { entry, files };
}
