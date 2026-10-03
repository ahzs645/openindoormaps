import type { IndoorDataset } from "./contract";
import {
  calculateRoute,
  type RouteRequest,
  type RouteResponse,
} from "./route-calculation";
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<RouteRequest>) => void;
  postMessage: (message: RouteResponse) => void;
};
let data: IndoorDataset | undefined;
scope.onmessage = ({ data: request }) => {
  try {
    if (request.data) data = request.data;
    if (!data) throw new Error("The route worker has no project data.");
    scope.postMessage({
      requestId: request.requestId,
      value: calculateRoute(data, request.start, request.end, request.mode),
    });
  } catch (error) {
    scope.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
