import { createNativeContainedDisplay } from "./native-contained-display";
import {
  nativeRationalOverlay,
  Rational,
  nativeRationalScalarToIEEE,
  type NativeRationalParts,
} from "./native-rational-overlay";

type Parts = [number, number][][][];
type StoredParts = [string, string][][][];
const stored = (parts: NativeRationalParts): StoredParts =>
  parts.map((part) =>
    part.map((ring) =>
      ring.map(
        (point) => point.map((v) => `${v.n}/${v.d}`) as [string, string],
      ),
    ),
  );
const restored = (parts: StoredParts): NativeRationalParts =>
  parts.map((part) =>
    part.map((ring) =>
      ring.map(
        (point) =>
          point.map((v) => {
            const [n, d] = v.split("/");
            return new Rational(BigInt(n), BigInt(d));
          }) as NativeRationalParts[number][number][number],
      ),
    ),
  );

/** Worker presentation metadata, never an authority for hits or routes. Keep
 * native drawing coordinates before GIS projection, including every positive
 * unrepresentable remainder, so later visibility cuts need no geographic grid. */
export function nativeRenderProperties(parts: NativeRationalParts) {
  const display = createNativeContainedDisplay(parts);
  return {
    nativeDisplayExactParts: stored(display.exactParts),
    nativeDisplayPartsFeet: display.partsFeet,
    // Stroke-only coordinates of this own post-cut boundary. Compute them in
    // the preparation worker; the map never decodes rational carriers to paint
    // a border. These coordinates are not fill, hit or routing authority.
    nativeBoundaryPartsFeet: display.exactParts.map((part) =>
      part.map((ring) =>
        ring.map(([x, y]) => [
          nativeRationalScalarToIEEE(x),
          nativeRationalScalarToIEEE(y),
        ]),
      ),
    ),
    nativeDisplayResidualParts: display.exactResidualParts.map((part) =>
      part.map((ring) =>
        ring.map(
          (point) => point.map((v) => `${v.n}/${v.d}`) as [string, string],
        ),
      ),
    ) satisfies StoredParts,
  };
}

export function nativeRenderExactParts(
  properties: Record<string, unknown> | null | undefined,
): NativeRationalParts | undefined {
  if (!Array.isArray(properties?.nativeDisplayPartsFeet)) return;
  // This is the exact source of this drawing AFTER earlier visibility cuts,
  // not an original room/floor fallback. Avoid unioning thousands of paint cells.
  if (Array.isArray(properties.nativeDisplayExactParts))
    return restored(properties.nativeDisplayExactParts as StoredParts);
  const pieces = nativeRationalOverlay(
    "union",
    properties.nativeDisplayPartsFeet as Parts,
  );
  const residual = properties.nativeDisplayResidualParts as
    | StoredParts
    | undefined;
  if (!residual?.length) return pieces;
  return nativeRationalOverlay("union", pieces, restored(residual));
}
