import { readCheckedDownload } from "./checked-download";
import { holdHeavyWorkerLifetimeLock } from "./heavy-worker-schedule";
import { initializeNativeExactGeosOverlay } from "./native-exact-geos-overlay";
import {
  createWorkerRouteCalculator,
  type RouteRequest,
  type RouteResponse,
} from "./route-calculation";
import {
  createPublishedRouteCalculator,
  decodePublishedRouteCells,
  publishedRouteCellReceipt,
} from "./published-route-cells";
import { IndexedDbVisitorDeliveryCache } from "./visitor-delivery-cache";
import { progressiveSha256 } from "./progressive-delivery";
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<RouteRequest>) => void;
  postMessage: (message: RouteResponse) => void;
};
holdHeavyWorkerLifetimeLock();
let calculate: ReturnType<typeof createWorkerRouteCalculator> | undefined;
let pending = Promise.resolve();
scope.onmessage = ({ data: request }) => {
  pending = pending.then(() => handle(request));
};
async function handle(request: RouteRequest) {
  try {
    if (request.data) {
      calculate = undefined;
      const data = request.data;
      // Do not retain the message envelope's extra dataset reference.
      request.data = undefined;
      if (data.nativeIndoorEnvelopes) await initializeNativeExactGeosOverlay();
      const receipt = publishedRouteCellReceipt(data);
      if (receipt) {
        const cache = new IndexedDbVisitorDeliveryCache();
        let bytes = await cache
          .getAsset(receipt.compressedSha256)
          .catch(() => undefined);
        if (
          bytes &&
          (bytes.length !== receipt.compressedBytes ||
            progressiveSha256(bytes) !== receipt.compressedSha256)
        )
          bytes = undefined;
        if (!bytes) {
          let response: Response | undefined;
          try {
            response = await fetch(new URL(receipt.url, location.href));
          } catch {
            // Offline without this optional cache: retain the ordinary checks.
          }
          if (response?.ok)
            bytes = await readCheckedDownload(
              response,
              Math.max(receipt.compressedBytes, receipt.logicalBytes),
            );
        }
        if (bytes) {
          const entries = decodePublishedRouteCells(data, receipt, bytes);
          calculate = createPublishedRouteCalculator(data, entries);
        } else calculate = createWorkerRouteCalculator(data);
        // Store only exact verified compressed bytes; a cache miss remains usable.
        if (
          bytes &&
          bytes.length === receipt.compressedBytes &&
          progressiveSha256(bytes) === receipt.compressedSha256
        )
          await cache.putAsset(receipt.compressedSha256, bytes).catch(() => {});
      } else calculate = createWorkerRouteCalculator(data);
    }
    if (!calculate)
      throw new Error("Directions have no checked source snapshot.");
    scope.postMessage({
      requestId: request.requestId,
      value: calculate(
        request.start,
        request.end,
        request.mode,
        request.options,
      ),
    });
  } catch (error) {
    scope.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
