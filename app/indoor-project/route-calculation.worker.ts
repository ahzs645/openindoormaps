import { holdHeavyWorkerLifetimeLock } from "./heavy-worker-schedule";
import { initializeNativeExactGeosOverlay } from "./native-exact-geos-overlay";
import {
  createWorkerRouteCalculator,
  type RouteRequest,
  type RouteResponse,
} from "./route-calculation";
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<RouteRequest>) => void;
  postMessage: (message: RouteResponse) => void;
};
// Released only when this worker context is destroyed: lets the UI wait for
// actual teardown after terminate() before allocating another heavy worker.
holdHeavyWorkerLifetimeLock();
let calculate: ReturnType<typeof createWorkerRouteCalculator> | undefined;
let pending = Promise.resolve();
scope.onmessage = ({ data: request }) => {
  pending = pending.then(() => handle(request));
};
async function handle(request: RouteRequest) {
  try {
    if (request.data) {
      if (request.data.nativeIndoorEnvelopes)
        await initializeNativeExactGeosOverlay();
      calculate = createWorkerRouteCalculator(request.data);
    }
    if (!calculate) throw new Error("The route worker has no project data.");
    scope.postMessage({
      requestId: request.requestId,
      value: calculate(request.start, request.end, request.mode),
    });
  } catch (error) {
    scope.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
