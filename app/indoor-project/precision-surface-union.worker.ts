import {
  precisionSurfaceUnionGeometry,
  type PrecisionSurfaceUnionRequest,
  type PrecisionSurfaceUnionResponse,
} from "./precision-surface-union";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<PrecisionSurfaceUnionRequest>) => void;
  postMessage: (message: PrecisionSurfaceUnionResponse) => void;
};
scope.onmessage = ({ data: { requestId, features } }) => {
  try {
    scope.postMessage({
      requestId,
      features: features.map((feature) => ({
        ...feature,
        geometry: precisionSurfaceUnionGeometry(feature.geometry),
      })),
    });
  } catch (error) {
    scope.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
