import {
  rational,
  nativeRationalScalarToIEEE,
  type NativeRationalParts,
} from "./native-rational-overlay";
import {
  compare,
  sub,
  mul,
} from "./vendor/native-rational-overlay-arithmetic.mjs";
import { createNativeContainedDisplay } from "./native-contained-display";

/** A complete convex source polygon whose every coordinate is exactly IEEE
 * representable is already a contained drawing piece. No new vertex, Boolean,
 * crop or triangulation is needed. Other parts use the full contained-cell API.
 * This shortcut never supplies routing or source geometry. */
export function nativeContainedWallDrawing(parts: NativeRationalParts) {
  return parts.flatMap((part) => {
    if (part.length === 1 && part[0].length <= 128) {
      const ring = part[0];
      const numeric = ring.map(
        (p) => p.map(nativeRationalScalarToIEEE) as [number, number],
      );
      const exact = numeric.every((p, i) =>
        p.every(
          (n, j) =>
            Number.isFinite(n) && compare(rational(n), ring[i][j]) === 0,
        ),
      );
      if (exact) {
        // Test every source vertex against every edge, rather than treating
        // consistent adjacent turns as proof for an arbitrary self-crossing ring.
        let orientation = 0;
        let convex = true;
        for (let i = 0; i < ring.length && convex; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          for (const p of ring) {
            const side = compare(
              sub(
                mul(sub(b[0], a[0]), sub(p[1], a[1])),
                mul(sub(b[1], a[1]), sub(p[0], a[0])),
              ),
              rational(0),
            );
            if (!side) continue;
            if (orientation && side !== orientation) {
              convex = false;
              break;
            }
            orientation = side;
          }
        }
        if (convex && orientation) return [[numeric]];
      }
    }
    return createNativeContainedDisplay([part]).partsFeet;
  });
}
