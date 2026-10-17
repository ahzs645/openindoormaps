import { holdHeavyWorkerLifetimeLock } from "./heavy-worker-schedule";
import { initializeNativeExactGeosOverlay } from "./native-exact-geos-overlay";
import { prepareProgressiveRouteCalculator } from "./progressive-route-preparation";
import { progressiveRouteSummary } from "./progressive-route-summary";
import { projectPlaceDisplayName } from "./visitor-metadata";
import { projectNavigationSteps } from "./navigation-steps";
import { ProgressiveVisitorClient } from "./progressive-visitor-client";
import type { IndoorDataset } from "./contract";
import type {
  ProgressiveRouteRequest,
  ProgressiveRouteResponse,
} from "./progressive-route-client";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<ProgressiveRouteRequest>) => void;
  postMessage: (response: ProgressiveRouteResponse) => void;
};
holdHeavyWorkerLifetimeLock();
let data: IndoorDataset | undefined;
let revision: string | undefined;
let calculator:
  | Awaited<ReturnType<typeof prepareProgressiveRouteCalculator>>
  | undefined;
let pending = Promise.resolve();
scope.onmessage = ({ data: request }) => {
  pending = pending.then(async () => {
    try {
      if (request.delivery) {
        // Replacing authority is atomic: a failed new revision must not leave
        // old route calculations paired with the new revision's instructions.
        calculator = undefined;
        data = undefined;
        revision = undefined;
        const client = ProgressiveVisitorClient.fromManifest(
          request.delivery.url,
          request.delivery.manifest,
          {
            preferHttpBrotli: request.delivery.preferHttpBrotli,
            offline: request.delivery.offline,
          },
        );
        const nextData = await client.loadRouting();
        if (nextData.nativeIndoorEnvelopes)
          await initializeNativeExactGeosOverlay();
        const nextCalculator = await prepareProgressiveRouteCalculator(
          nextData,
          {
            baseUrl: client.manifestUrl,
            offline: request.delivery.offline,
          },
        );
        data = nextData;
        calculator = nextCalculator;
        revision = client.manifest.revisionSha256;
      }
      if (!data || !calculator || request.revisionSha256 !== revision)
        throw new Error("Directions are missing their checked map revision.");
      const value = calculator(request.start, request.end, request.mode);
      const name = (key: string) => {
        const room = data!.records.find((entry) => entry.key === key);
        return room
          ? [room.number, projectPlaceDisplayName(data!, room)]
              .filter(Boolean)
              .join(" · ")
          : key;
      };
      scope.postMessage({
        requestId: request.requestId,
        value,
        summary: progressiveRouteSummary(
          data,
          value.route,
          request.start,
          request.end,
        ),
        steps: value.route
          ? projectNavigationSteps(
              data,
              value.route,
              name(request.start),
              name(request.end),
            )
          : [],
      });
    } catch (error) {
      scope.postMessage({
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
