import type { IndoorDataset } from "./contract";
import { readCheckedDownload } from "./checked-download";
import {
  createPublishedRouteCalculator,
  decodePublishedRouteCells,
  publishedRouteCellReceipt,
} from "./published-route-cells";
import { progressiveSha256 } from "./progressive-delivery";
import { createVerifiedProgressiveRouteCalculator } from "./progressive-route-validation";
import {
  IndexedDbVisitorDeliveryCache,
  type VisitorDeliveryCache,
} from "./visitor-delivery-cache";

type Options = {
  baseUrl: string;
  offline?: boolean;
  fetch?: typeof fetch;
  cache?: Pick<VisitorDeliveryCache, "getAsset" | "putAsset">;
};

/** Only an exact compiled publication may reuse checked source intersections
 * and policies. The worker supplies a real, freshly downloaded routing dataset;
 * search/display summaries never enter this constructor. Its dataset remains
 * privately worker-owned and immutable, never a mutable editor object. Missing caches retain
 * full validation, while present corrupt carriers fail rather than being
 * interpreted as permission to skip checks. The optional policy is publisher/
 * unit-test injection only; no worker message can supply it. */
export async function prepareProgressiveRouteCalculator(
  data: IndoorDataset,
  options: Options,
  policy?: Parameters<typeof publishedRouteCellReceipt>[1],
) {
  const receipt = publishedRouteCellReceipt(data, policy);
  if (!receipt) return createVerifiedProgressiveRouteCalculator(data);

  let cache = options.cache;
  if (!cache) {
    try {
      cache = new IndexedDbVisitorDeliveryCache();
    } catch {
      // Storage can be unavailable without making network viewing unusable.
    }
  }
  let bytes = await cache
    ?.getAsset(receipt.compressedSha256)
    .catch(() => undefined);
  if (!bytes && !options.offline) {
    let response: Response | undefined;
    try {
      response = await (options.fetch ?? fetch)(
        new URL(receipt.url, options.baseUrl),
      );
    } catch {
      // An unavailable optional cache still needs ordinary full validation.
    }
    if (response?.ok)
      bytes = await readCheckedDownload(
        response,
        Math.max(receipt.compressedBytes, receipt.logicalBytes),
      );
  }
  if (!bytes) return createVerifiedProgressiveRouteCalculator(data);

  // This existing decoder checks the complete carrier/logical hashes, source,
  // whole dataset/engine receipt, topology, inventory, policies and graph guards.
  // Its failure is deliberately not caught or converted into a cache miss.
  const entries = decodePublishedRouteCells(data, receipt, bytes);
  const calculate = createPublishedRouteCalculator(data, entries);
  if (
    bytes.length === receipt.compressedBytes &&
    progressiveSha256(bytes) === receipt.compressedSha256
  )
    await cache?.putAsset(receipt.compressedSha256, bytes).catch(() => {});
  return calculate;
}
