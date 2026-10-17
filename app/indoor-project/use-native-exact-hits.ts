import { useEffect, useMemo, useRef } from "react";
import {
  startNativeExactHitClient,
  type NativeExactHitScope,
} from "./native-exact-hit-client";
/** The caller supplies a stable snapshot; import/floor changes cancel every
 * pending reply before a different floor can acquire the old click. */
export function useNativeExactHits(scopes: NativeExactHitScope[] | undefined) {
  const client = useRef<ReturnType<typeof startNativeExactHitClient>>();
  const activeScopes = useRef<NativeExactHitScope[]>();
  useEffect(() => {
    activeScopes.current = scopes;
    return () => {
      activeScopes.current = undefined;
      client.current?.cancel();
      client.current = undefined;
    };
  }, [scopes]);
  return useMemo(
    () => ({
      enabled: !!scopes?.length,
      hit: (point: [number, number]) => {
        if (!scopes?.length || activeScopes.current !== scopes)
          return Promise.resolve([]);
        // Search and route selection do not need an exact map-hit index.
        // Start it only for a real hit; init and hit retain worker FIFO order.
        client.current ??= startNativeExactHitClient(
          scopes,
          () =>
            new Worker(new URL("native-exact-hit.worker.ts", import.meta.url), {
              type: "module",
            }),
        );
        return client.current.hit(point);
      },
    }),
    [scopes],
  );
}
