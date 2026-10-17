import { gunzipSync, gzipSync } from "fflate";
import { readCheckedDownload } from "./checked-download";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import { PUBLISHED_ROUTE_CELL_RECEIPTS } from "./published-route-cell-receipts";
import type { PublishedRouteCellReceipt } from "./published-route-cells";
import {
  progressiveSha256,
  validateProgressiveManifest,
  type ProgressiveManifest,
} from "./progressive-delivery";
import type { VisitorDeliveryCache } from "./visitor-delivery-cache";

type Policy = {
  receipts: readonly PublishedRouteCellReceipt[];
  engineSha256: string;
};
type Cache = Pick<VisitorDeliveryCache, "getAsset" | "putAsset">;
const currentPolicy: Policy = {
  receipts: PUBLISHED_ROUTE_CELL_RECEIPTS,
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
};
const aborted = (signal?: AbortSignal) => signal?.throwIfAborted();

/** Transport selection only: the publisher writes the unchanged worker JSON
 * as the routing asset and checks its logical SHA against the projection SHA.
 * Saving these bytes grants no routing authority. The real worker must still
 * decode the carrier against its complete actual dataset and current engine. */
export function offlineRouteCellReceipt(
  manifest: ProgressiveManifest,
  policy: Policy = currentPolicy,
) {
  validateProgressiveManifest(manifest);
  if (manifest.provenance.enginePreparationSha256 !== policy.engineSha256)
    return;
  const route = manifest.assets[manifest.routeAssetId];
  const source = manifest.provenance.source;
  return policy.receipts.find(
    (receipt) =>
      receipt.engineSha256 === policy.engineSha256 &&
      receipt.datasetSha256 === route.logicalSha256 &&
      receipt.source.modelFileName === source.modelFileName &&
      receipt.source.modelSha256 === source.modelSha256 &&
      receipt.source.roomsSha256 === source.roomsSha256,
  );
}

function checkedCarrier(
  receipt: PublishedRouteCellReceipt,
  bytes: Uint8Array,
  allowHttpDecoded = false,
) {
  let stored = bytes;
  if (
    allowHttpDecoded &&
    bytes.length === receipt.logicalBytes &&
    progressiveSha256(bytes) === receipt.logicalSha256
  ) {
    // A host may apply Content-Encoding to .gz. Recreate only the publisher's
    // exact deterministic carrier; the compressed SHA below remains mandatory.
    stored = gzipSync(bytes, { level: 9, mtime: 0 });
  }
  if (
    stored.length !== receipt.compressedBytes ||
    progressiveSha256(stored) !== receipt.compressedSha256
  )
    throw new Error("Offline directions cache checksum mismatch.");
  // A fixed output buffer prevents an inflated body from allocating beyond
  // the publisher's bound. One extra byte makes any excess an explicit failure.
  const logical = gunzipSync(stored, {
    out: new Uint8Array(receipt.logicalBytes + 1),
  });
  if (
    logical.length !== receipt.logicalBytes ||
    progressiveSha256(logical) !== receipt.logicalSha256
  )
    throw new Error("Offline directions cache logical checksum mismatch.");
  return stored;
}

export async function verifyOfflineRouteCellCache(
  manifest: ProgressiveManifest,
  cache: Pick<Cache, "getAsset">,
  signal?: AbortSignal,
  policy: Policy = currentPolicy,
) {
  aborted(signal);
  const receipt = offlineRouteCellReceipt(manifest, policy);
  if (!receipt) return;
  const saved = await cache.getAsset(receipt.compressedSha256);
  aborted(signal);
  if (!saved)
    throw new Error("The browser did not retain the offline directions cache.");
  checkedCarrier(receipt, saved);
  return receipt;
}

/** Explicit offline download is stricter than online best-effort storage:
 * a declared cache must be present, exact and retained before completion. */
export async function saveOfflineRouteCellCache(
  manifest: ProgressiveManifest,
  options: {
    baseUrl: string;
    cache: Cache;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    offline?: boolean;
  },
  policy: Policy = currentPolicy,
) {
  aborted(options.signal);
  const receipt = offlineRouteCellReceipt(manifest, policy);
  if (!receipt) return;
  let bytes = await options.cache.getAsset(receipt.compressedSha256);
  aborted(options.signal);
  if (!bytes) {
    if (options.offline)
      throw new Error("The offline directions cache has not been downloaded.");
    const response = await (options.fetch ?? fetch)(
      new URL(receipt.url, options.baseUrl),
      { signal: options.signal },
    );
    if (!response.ok)
      throw new Error(
        `Offline directions download failed (${response.status}).`,
      );
    bytes = checkedCarrier(
      receipt,
      await readCheckedDownload(
        response,
        Math.max(receipt.compressedBytes, receipt.logicalBytes),
      ),
      true,
    );
  } else bytes = checkedCarrier(receipt, bytes);
  aborted(options.signal);
  await options.cache.putAsset(receipt.compressedSha256, bytes);
  return verifyOfflineRouteCellCache(
    manifest,
    options.cache,
    options.signal,
    policy,
  );
}
