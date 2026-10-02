import {
  prepareFloor,
  type FloorPreparationRequest,
  type FloorPreparationResponse,
} from "./prepared-floor";
import type { IndoorDataset } from "./contract";

// Kept separate from the main thread: polygon unions and clipping must never
// run as a synchronous fallback when preparing a map floor.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<FloorPreparationRequest>) => void;
  postMessage: (message: FloorPreparationResponse) => void;
};
let data: IndoorDataset | undefined;
scope.onmessage = ({ data: request }) => {
  try {
    if (request.data) data = request.data;
    if (!data) throw new Error("The floor worker has no project data.");
    const value = prepareFloor(
      data,
      request.levelIds,
      request.building,
      request.options,
    );
    scope.postMessage({ requestId: request.requestId, value });
  } catch (error) {
    scope.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
