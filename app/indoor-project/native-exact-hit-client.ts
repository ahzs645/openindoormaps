import type { NativeExactPlanarTopology } from "./native-exact-planar-topology";
export type NativeExactHitScope = {
  sourceModelSha256: string;
  sourceGeometryKey: string;
  topology: NativeExactPlanarTopology;
  faceIds: string[];
};
type HitRequest =
  | { kind: "init"; scopes: NativeExactHitScope[] }
  | { kind: "hit"; id: number; point: [number, number] };
type HitResponse =
  | { ready: true }
  | { id: number; faceIds: string[] }
  | { error: string };
export interface NativeExactHitWorker {
  onmessage: ((event: MessageEvent<HitResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(value: HitRequest): void;
  terminate(): void;
}
/** One floor snapshot owns one small worker. Exact decode/predicates stay off
 * the UI thread. New clicks cancel older replies; teardown always resolves them. */
export function startNativeExactHitClient(
  scopes: NativeExactHitScope[],
  factory: () => NativeExactHitWorker,
) {
  let active = true,
    sequence = 0;
  let worker: NativeExactHitWorker | undefined;
  let pending: { id: number; resolve: (ids: string[]) => void } | undefined;
  const finish = () => {
    pending?.resolve([]);
    pending = undefined;
  };
  const cancel = () => {
    if (!active) return;
    active = false;
    finish();
    worker?.terminate();
    worker = undefined;
  };
  try {
    worker = factory();
    worker.onmessage = ({ data }) => {
      if (!active) return;
      if ("error" in data) {
        cancel();
        return;
      }
      if ("id" in data && pending?.id === data.id) {
        pending.resolve(data.faceIds);
        pending = undefined;
      }
    };
    worker.onerror = () => cancel();
    worker.postMessage({ kind: "init", scopes });
  } catch {
    cancel();
  }
  return {
    cancel,
    hit(point: [number, number]): Promise<string[]> {
      if (!active || !worker) return Promise.resolve([]);
      finish();
      const id = ++sequence;
      return new Promise((resolve) => {
        pending = { id, resolve };
        try {
          worker!.postMessage({ kind: "hit", id, point });
        } catch {
          cancel();
        }
      });
    },
  };
}
