import { gunzipSync } from "fflate";
import { PUBLISHED_PROJECT_RECEIPTS } from "./published-project-receipts";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import {
  progressiveSha256,
  validateProgressiveManifest,
  type ProgressiveManifest,
  type ProgressiveScope,
  type ProgressiveAsset,
} from "./progressive-delivery";
import {
  PREPARED_DISPLAY_ASSET_LIMITS,
  validatePreparedDisplayPayload,
  type PreparedDisplayPayload,
} from "./prepared-display-assets";
const referenceKey = "__preparedDisplaySubtreeReference";
type Wire = {
  version: number;
  pool: unknown[];
  value: unknown;
  logicalJsonSha256: string;
  logicalJsonBytes: number;
};

/** Private wire containers can be restored in place. Backward references
 * retain exactly the original sharing; no coordinates are converted. This
 * avoids keeping both a parsed tree and another full restored tree alive. */
export function restorePublishedFloorPool(raw: Wire): PreparedDisplayPayload {
  if (
    raw.version !== 1 ||
    !Array.isArray(raw.pool) ||
    raw.pool.length > PREPARED_DISPLAY_ASSET_LIMITS.poolEntries
  )
    throw new Error("Invalid published floor pool.");
  const completed: unknown[] = [];
  let nodes = 0;
  const restore = (
    value: unknown,
    maxReference: number,
    depth = 0,
  ): unknown => {
    if (
      ++nodes > PREPARED_DISPLAY_ASSET_LIMITS.nodes ||
      depth > PREPARED_DISPLAY_ASSET_LIMITS.depth
    )
      throw new Error("Published floor traversal exceeds its limits.");
    if (!value || typeof value !== "object") return value;
    if (!Array.isArray(value) && Object.hasOwn(value, referenceKey)) {
      const id = (value as Record<string, unknown>)[referenceKey];
      if (
        Object.keys(value).length !== 1 ||
        !Number.isSafeInteger(id) ||
        (id as number) < 0 ||
        (id as number) >= maxReference
      )
        throw new Error("Invalid published floor backward reference.");
      return completed[id as number];
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++)
        value[i] = restore(value[i], maxReference, depth + 1);
    } else {
      const object = value as Record<string, unknown>;
      // JSON.parse created own data properties, including any __proto__ key.
      for (const key of Object.keys(object))
        object[key] = restore(object[key], maxReference, depth + 1);
    }
    return Object.freeze(value);
  };
  for (let i = 0; i < raw.pool.length; i++)
    completed.push(restore(raw.pool[i], i));
  const value = restore(raw.value, raw.pool.length) as PreparedDisplayPayload;
  raw.pool.length = 0;
  raw.value = null;
  return value;
}

/** Only the exact publication already checked by the established decoder uses
 * this path. Chunk, expanded and pooled SHA-256 checks remain mandatory. The
 * redundant checksum of the expanded shared graph was completed at publication.
 * An unlisted revision/engine returns undefined for the ordinary decoder. */
export async function decodePublishedProgressiveFloor(
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  read: (
    asset: ProgressiveAsset,
    representation: ProgressiveAsset["representations"][number],
  ) => Promise<Uint8Array>,
  receipts = PUBLISHED_PROJECT_RECEIPTS,
): Promise<PreparedDisplayPayload | undefined> {
  const admitted = receipts.some(
    (r) =>
      r.validatorSha256 === PREPARED_DISPLAY_ENGINE_SHA256 &&
      r.progressiveRevisionSha256 === manifest.revisionSha256 &&
      r.datasetSha256 === manifest.provenance.datasetSha256 &&
      r.packageSha256 === manifest.provenance.packageSha256,
  );
  if (!admitted) return;
  validateProgressiveManifest(manifest);
  const current = manifest.scopes.find((s) => s.id === scope.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(scope))
    throw new Error("Published floor is outside the checked revision.");
  const descriptor = scope.display.descriptor;
  const pooled = new Uint8Array(descriptor.pooledJsonBytes);
  let offset = 0;
  for (let i = 0; i < descriptor.chunks.length; i++) {
    const chunk = descriptor.chunks[i],
      asset = manifest.assets[scope.display.chunkAssetIds[i]];
    const representation = asset.representations.find(
      (r) =>
        r.encoding === "gzip" &&
        r.sha256 === chunk.sha256 &&
        r.bytes === chunk.storedBytes,
    );
    if (!representation)
      throw new Error("Published floor lacks its checked carrier.");
    const stored = await read(asset, representation);
    const expanded =
      stored.length === chunk.storedBytes &&
      progressiveSha256(stored) === chunk.sha256
        ? gunzipSync(stored)
        : stored;
    if (
      expanded.length !== chunk.expandedBytes ||
      progressiveSha256(expanded) !== chunk.expandedSha256 ||
      offset + expanded.length > pooled.length
    )
      throw new Error("Published floor chunk checksum mismatch.");
    pooled.set(expanded, offset);
    offset += expanded.length;
  }
  if (
    offset !== pooled.length ||
    progressiveSha256(pooled) !== descriptor.pooledJsonSha256
  )
    throw new Error("Published floor pool checksum mismatch.");
  const wire = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(pooled),
  ) as Wire;
  if (
    wire.logicalJsonSha256 !== descriptor.logicalJsonSha256 ||
    wire.logicalJsonBytes !== descriptor.logicalJsonBytes ||
    wire.pool?.length !== descriptor.poolEntries
  )
    throw new Error(
      "Published floor pool does not match its checked descriptor.",
    );
  const value = restorePublishedFloorPool(wire);
  validatePreparedDisplayPayload(value, descriptor.binding);
  return value;
}
