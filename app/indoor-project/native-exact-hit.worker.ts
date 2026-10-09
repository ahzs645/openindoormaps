import {
  createNativeExactTopologyIndex,
  nativeRationalPointInParts,
  type NativeExactTopologyIndex,
} from "./native-exact-planar-topology";
import { NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION } from "./native-rational-overlay";
import type { NativeExactHitScope } from "./native-exact-hit-client";
const worker = globalThis as unknown as {
  onmessage: (
    e: MessageEvent<
      | { kind: "init"; scopes: NativeExactHitScope[] }
      | { kind: "hit"; id: number; point: [number, number] }
    >,
  ) => void;
  postMessage: (value: unknown) => void;
};
let indexes: { index: NativeExactTopologyIndex; ids: string[] }[] = [];
worker.onmessage = ({ data }) => {
  try {
    if (data.kind === "init") {
      if (data.scopes.length > 1000)
        throw new Error("Too many native hit scopes.");
      const next = data.scopes.map((scope) => {
        const index = createNativeExactTopologyIndex(scope.topology, {
          sourceModelSha256: scope.sourceModelSha256,
          sourceGeometryKey: scope.sourceGeometryKey,
          kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
        });
        if (
          scope.faceIds.length > 100000 ||
          new Set(scope.faceIds).size !== scope.faceIds.length ||
          scope.faceIds.some((id) => !index.parts(id))
        )
          throw new Error("Stale exact native hit faces.");
        return { index, ids: scope.faceIds };
      });
      indexes = next;
      worker.postMessage({ ready: true });
    } else {
      if (
        !Number.isSafeInteger(data.id) ||
        data.id < 1 ||
        data.point.length !== 2 ||
        data.point.some((p) => !Number.isFinite(p) || Math.abs(p) > 1e7)
      )
        throw new Error("Invalid exact native hit point.");
      const faceIds = indexes.flatMap(({ index, ids }) =>
        ids.filter((id) =>
          nativeRationalPointInParts(data.point, index.parts(id)!),
        ),
      );
      worker.postMessage({ id: data.id, faceIds });
    }
  } catch (error) {
    indexes = [];
    worker.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
