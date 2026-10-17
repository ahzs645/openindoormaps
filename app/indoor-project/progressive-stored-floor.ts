import { gzipSync } from "fflate";
import {
  progressiveSha256,
  validateProgressiveManifest,
  verifyProgressiveAssetBytes,
  type ProgressiveAsset,
  type ProgressiveManifest,
  type ProgressiveScope,
} from "./progressive-delivery";
import { decodePreparedDisplayAsset } from "./prepared-display-assets";

type Representation = ProgressiveAsset["representations"][number];

/** Gzip representations already are the exact original prepared carriers.
 * Pass them straight to the established decoder instead of inflating,
 * recompressing and inflating every chunk. HTTP-decoded responses retain the
 * original checked logical-byte fallback. All original checks still run. */
export async function decodeStoredProgressiveFloor(
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  read: (
    asset: ProgressiveAsset,
    representation: Representation,
  ) => Promise<Uint8Array>,
) {
  validateProgressiveManifest(manifest);
  const current = manifest.scopes.find((s) => s.id === scope.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(scope))
    throw new Error("Prepared floor is outside this map revision.");
  const chunks = new Map(
    scope.display.descriptor.chunks.map((chunk, i) => [
      chunk.sha256,
      { chunk, asset: manifest.assets[scope.display.chunkAssetIds[i]] },
    ]),
  );
  return decodePreparedDisplayAsset(
    scope.display.descriptor,
    scope.display.descriptor.binding,
    async (hash) => {
      const found = chunks.get(hash);
      if (!found) throw new Error("Unlisted prepared floor chunk.");
      const { chunk, asset } = found;
      const representation = asset.representations.find(
        (r) => r.encoding === "gzip" && r.sha256 === hash,
      );
      if (!representation || representation.bytes !== chunk.storedBytes)
        throw new Error("Prepared floor lacks its original gzip carrier.");
      const bytes = await read(asset, representation);
      if (
        bytes.length === representation.bytes &&
        progressiveSha256(bytes) === hash
      )
        return bytes;
      // Some hosts apply Content-Encoding and fetch transparently inflates.
      verifyProgressiveAssetBytes(asset, bytes);
      const original = gzipSync(bytes, { level: 6, mtime: 0 });
      if (progressiveSha256(original) !== hash)
        throw new Error("Prepared floor carrier checksum mismatch.");
      return original;
    },
  );
}
