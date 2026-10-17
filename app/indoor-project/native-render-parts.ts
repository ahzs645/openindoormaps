import { createNativeContainedDisplay } from "./native-contained-display";
import { createPolygonBoundsQuery } from "./polygon-bounds-query";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";
import { freezeNativeRationalParts } from "./native-exact-planar-topology";
import {
  nativeRationalOverlay,
  Rational,
  nativeRationalScalarToIEEE,
  type NativeRationalParts,
  type NativeRationalOverlayInput,
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

// Drawing reconstruction is deterministic from these complete coordinate
// carriers. Presentation clones can share it, but array identity alone never
// certifies unchanged geometry. Limit retained strings and rational vertices
// explicitly; this cache supplies no floor, hit, access or routing authority.
const reconstruction = new Map<
  string,
  { parts: NativeRationalParts; bytes: number }
>();
const RECONSTRUCTION_BYTES = 32 * 1024 * 1024;
let reconstructionBytes = 0;

/** Strictly distant ramp cuts cannot affect this exact drawing. Numeric paint
 * alone is used only when it is the entire existing reconstruction input.
 * Exact carriers and every positive residual retain rational bounds; unknown
 * or malformed carriers still reach the original reconstruction/validation. */
export function nativeRenderPartsMayIntersect(
  properties: Record<string, unknown> | null | undefined,
  cuts: NativeRationalOverlayInput,
): boolean {
  if (!Array.isArray(properties?.nativeDisplayPartsFeet)) return true;
  try {
    if (Array.isArray(properties.nativeDisplayExactParts))
      return (
        nativeRationalIntersectionOperand(
          cuts,
          restored(properties.nativeDisplayExactParts as StoredParts),
        ).length > 0
      );
    const residual = properties.nativeDisplayResidualParts as
      | StoredParts
      | undefined;
    if (
      residual?.length &&
      nativeRationalIntersectionOperand(cuts, restored(residual)).length > 0
    )
      return true;
    return createPolygonBoundsQuery()(
      properties.nativeDisplayPartsFeet as Parts,
      cuts as Parts,
    );
  } catch {
    return true;
  }
}

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
  let key: string | undefined;
  try {
    key = JSON.stringify([
      properties.nativeDisplayPartsFeet,
      properties.nativeDisplayResidualParts ?? null,
    ]);
  } catch {
    // Unknown non-JSON inputs still reach the original exact kernel.
  }
  const saved = key === undefined ? undefined : reconstruction.get(key);
  if (saved) {
    reconstruction.delete(key!);
    reconstruction.set(key!, saved);
    return saved.parts;
  }
  const pieces = nativeRationalOverlay(
    "union",
    properties.nativeDisplayPartsFeet as Parts,
  );
  const residual = properties.nativeDisplayResidualParts as
    | StoredParts
    | undefined;
  const parts = freezeNativeRationalParts(
    residual?.length
      ? nativeRationalOverlay("union", pieces, restored(residual))
      : pieces,
  );
  const bytes =
    (key?.length ?? 0) * 2 +
    parts.reduce(
      (sum, part) => sum + part.reduce((n, ring) => n + ring.length * 128, 0),
      0,
    );
  if (key !== undefined && bytes <= RECONSTRUCTION_BYTES) {
    while (
      reconstruction.size >= 128 ||
      reconstructionBytes + bytes > RECONSTRUCTION_BYTES
    ) {
      const oldest = reconstruction.keys().next().value!;
      reconstructionBytes -= reconstruction.get(oldest)!.bytes;
      reconstruction.delete(oldest);
    }
    reconstruction.set(key, { parts, bytes });
    reconstructionBytes += bytes;
  }
  return parts;
}
