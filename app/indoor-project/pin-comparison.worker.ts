import {
  acceptedPinPatches,
  type PinPatchDecisions,
} from "./pin-patch-decisions";
import { comparePinBoundary } from "./pin-comparison";
import type { IndoorDataset } from "./contract";
import type { NativeBoundaryPatch } from "./native-boundary-patches";
const scope = globalThis as unknown as {
  onmessage: (
    e: MessageEvent<{
      data: IndoorDataset;
      levelId: number;
      point: [number, number];
      patches: NativeBoundaryPatch[];
      accepted?: {
        decisions: PinPatchDecisions;
        recommendationId: string;
        evidenceSha256: string;
      };
    }>,
  ) => void;
  postMessage: (v: unknown) => void;
};
scope.onmessage = ({ data: r }) => {
  void (async () => {
    const patches = r.accepted
      ? await acceptedPinPatches(r.data, r.patches, r.accepted)
      : r.patches;
    return comparePinBoundary(r.data, r.levelId, r.point, patches);
  })().then(
    (result) => scope.postMessage({ result }),
    (error) =>
      scope.postMessage({
        error: error instanceof Error ? error.message : String(error),
      }),
  );
};
