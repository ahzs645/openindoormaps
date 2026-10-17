import { projectBoundaryEvidence } from "./boundary-evidence";
import type {
  BoundaryEvidenceRequest,
  BoundaryEvidenceResponse,
} from "./boundary-evidence-worker-client";
import { holdHeavyWorkerLifetimeLock } from "./heavy-worker-schedule";
import { initializeNativeExactGeosOverlay } from "./native-exact-geos-overlay";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<BoundaryEvidenceRequest>) => void;
  postMessage: (message: BoundaryEvidenceResponse) => void;
};
holdHeavyWorkerLifetimeLock();
scope.onmessage = async ({ data: { requestId, data, rooms } }) => {
  try {
    if (data.nativeIndoorEnvelopes) await initializeNativeExactGeosOverlay();
    scope.postMessage({
      requestId,
      value: projectBoundaryEvidence(data, rooms),
    });
  } catch (error) {
    scope.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
