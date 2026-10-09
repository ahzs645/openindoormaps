import { useEffect, useMemo, useRef } from "react";
import {
  startNativeExactHitClient,
  type NativeExactHitScope,
} from "./native-exact-hit-client";
/** The caller supplies a stable snapshot; import/floor changes cancel every
 * pending reply before a different floor can acquire the old click. */
export function useNativeExactHits(scopes: NativeExactHitScope[] | undefined) {
  const client = useRef<ReturnType<typeof startNativeExactHitClient>>();
  useEffect(() => {
    if (!scopes?.length) return;
    const current = startNativeExactHitClient(
      scopes,
      () =>
        new Worker(new URL("native-exact-hit.worker.ts", import.meta.url), {
          type: "module",
        }),
    );
    client.current = current;
    return () => {
      current.cancel();
      if (client.current === current) client.current = undefined;
    };
  }, [scopes]);
  return useMemo(
    () => ({
      enabled: !!scopes?.length,
      hit: (point: [number, number]) =>
        client.current?.hit(point) ?? Promise.resolve([]),
    }),
    [scopes],
  );
}
