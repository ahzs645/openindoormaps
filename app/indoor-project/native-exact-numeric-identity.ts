import { rational, type NativeRationalParts } from "./native-rational-overlay";

/** Positive identity proof only: identical part/ring/vertex order and every
 * original IEEE value equal to its exact rational coordinate. No tolerance,
 * rounding, bounding box or declared certificate can authorize this shortcut.
 * All other representations retain their original exact overlay checks. */
export function nativeExactNumericIdentity(
  numeric: readonly (readonly (readonly (readonly number[])[])[])[],
  exact: NativeRationalParts,
): boolean {
  if (numeric.length !== exact.length) return false;
  for (let i = 0; i < exact.length; i++) {
    const a = numeric[i],
      b = exact[i];
    if (a.length !== b.length) return false;
    for (let j = 0; j < b.length; j++) {
      if (a[j].length !== b[j].length) return false;
      for (let k = 0; k < b[j].length; k++) {
        if (a[j][k].length !== 2) return false;
        for (let axis = 0; axis < 2; axis++) {
          const value = a[j][k][axis];
          if (!Number.isFinite(value)) return false;
          const actual = rational(value),
            expected = b[j][k][axis];
          if (actual.n !== expected.n || actual.d !== expected.d) return false;
        }
      }
    }
  }
  return true;
}
