import { applyPublishedCirculationPaint } from "./published-circulation-paint";
import { readCheckedDownload } from "./checked-download";
import { holdHeavyWorkerLifetimeLock } from "./heavy-worker-schedule";
import {
  ProgressiveVisitorClient,
  type ProgressiveFloorRequest,
  type ProgressiveFloorResponse,
} from "./progressive-visitor-client";
import {
  decodeProgressiveFloor,
  progressiveSha256,
} from "./progressive-delivery";
import { decodePublishedProgressiveFloor } from "./published-floor-decoder";
import { decodeStoredProgressiveFloor } from "./progressive-stored-floor";
import { IndexedDbVisitorDeliveryCache } from "./visitor-delivery-cache";
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<ProgressiveFloorRequest>) => void;
  postMessage: (response: ProgressiveFloorResponse) => void;
};
holdHeavyWorkerLifetimeLock();
scope.onmessage = async ({ data: request }) => {
  try {
    const client = ProgressiveVisitorClient.fromManifest(
      request.manifestUrl,
      request.manifest,
      { preferHttpBrotli: request.preferHttpBrotli, offline: request.offline },
    );
    const floor = client.manifest.scopes.find(
      (entry) => entry.id === request.scopeId,
    );
    if (!floor)
      throw new Error("The selected floor is not in this map revision.");
    const context = await client.readPresentationContext(floor);
    const cache = new IndexedDbVisitorDeliveryCache();
    const read: Parameters<typeof decodeStoredProgressiveFloor>[2] = async (
      asset,
      representation,
    ) => {
      const saved = await cache
        .getAsset(representation.sha256)
        .catch(() => undefined);
      if (
        saved &&
        saved.length === representation.bytes &&
        progressiveSha256(saved) === representation.sha256
      )
        return saved;
      const response = await fetch(
        new URL(representation.path, request.manifestUrl),
      );
      if (!response.ok)
        throw new Error(`Floor download failed (${response.status}).`);
      const bytes = await readCheckedDownload(
        response,
        Math.max(representation.bytes, asset.logicalBytes),
      );
      if (bytes.length > Math.max(representation.bytes, asset.logicalBytes))
        throw new Error("Floor download exceeds its checked size.");
      if (
        bytes.length === representation.bytes &&
        progressiveSha256(bytes) === representation.sha256
      )
        await cache.putAsset(representation.sha256, bytes).catch(() => {});
      return bytes;
    };
    const display = request.offline
      ? ((await decodePublishedProgressiveFloor(
          client.manifest,
          floor,
          (asset) => client.readAsset(asset.id),
        )) ??
        (await decodeProgressiveFloor(client.manifest, floor, (id) =>
          client.readAsset(id),
        )))
      : ((await decodePublishedProgressiveFloor(
          client.manifest,
          floor,
          read,
        )) ??
        (await decodeStoredProgressiveFloor(client.manifest, floor, read)));
    scope.postMessage({
      display: applyPublishedCirculationPaint(display, client.manifest, floor),
      context,
    });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
