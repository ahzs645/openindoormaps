import {
  createWorkerRouteCalculator,
  type RouteRequest,
  type RouteResponse,
} from "./route-calculation";
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<RouteRequest>) => void;
  postMessage: (message: RouteResponse) => void;
};
let calculate: ReturnType<typeof createWorkerRouteCalculator> | undefined;
scope.onmessage = ({ data: request }) => {
  try {
    if (request.data) calculate = createWorkerRouteCalculator(request.data);
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
};
