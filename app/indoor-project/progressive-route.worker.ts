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
/** The last requested revision, kept so a route request can retry a failed
 * background preparation instead of reporting a missing revision. */
let delivery: ProgressiveRouteRequest["delivery"];
async function load(next: NonNullable<ProgressiveRouteRequest["delivery"]>) {
  // Replacing authority is atomic: a failed new revision must not leave
  // old route calculations paired with the new revision's instructions.
  calculator = undefined;
  data = undefined;
  revision = undefined;
  const client = ProgressiveVisitorClient.fromManifest(
    next.url,
    next.manifest,
    {
      preferHttpBrotli: next.preferHttpBrotli,
      offline: next.offline,
    },
  );
  const nextData = await client.loadRouting();
  if (nextData.nativeIndoorEnvelopes) await initializeNativeExactGeosOverlay();
  const nextCalculator = await prepareProgressiveRouteCalculator(nextData, {
    baseUrl: client.manifestUrl,
    offline: next.offline,
  });
  data = nextData;
  calculator = nextCalculator;
  revision = client.manifest.revisionSha256;
}
scope.onmessage = ({ data: request }) => {
  pending = pending.then(async () => {
    try {
      if (request.delivery) {
        delivery = request.delivery;
        await load(request.delivery);
      } else if (
        !calculator &&
        delivery?.manifest.revisionSha256 === request.revisionSha256
      )
        await load(delivery);
      if (request.prepareOnly) {
        scope.postMessage({ requestId: request.requestId, prepared: true });
        return;
      }
      if (!data || !calculator || request.revisionSha256 !== revision)
        throw new Error("Directions are missing their checked map revision.");
      // This interface displays the inside arrival only. Request that selected
      // mode explicitly instead of also solving the unused legacy hallway
      // alternative. The returned route and its physical/policy checks stay
      // identical; the full source-viewer calculator still supports all modes.
      const value = calculator(request.start, request.end, request.mode, {
        endpointMode: "inside",
      });
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
