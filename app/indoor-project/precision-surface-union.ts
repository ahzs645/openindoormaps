import type { MultiPolygon, Polygon } from "geojson";
import {
  nativeRationalOverlay,
  nativeRationalScalarToIEEE,
  type NativeRationalOverlayInput,
} from "./native-rational-overlay";

export type IndexedPrecisionSurfaceGeometry = {
  index: number;
  id?: string | number;
  geometry: Polygon | MultiPolygon;
};
export type PrecisionSurfaceUnionRequest = {
  requestId: number;
  features: IndexedPrecisionSurfaceGeometry[];
};
export type PrecisionSurfaceUnionResponse =
  | {
      requestId: number;
      features: IndexedPrecisionSurfaceGeometry[];
    }
  | { requestId: number; error: string };

/** Rendering-only normalization of one already prepared feature. All original
 * parts participate in the same exact set union, including real holes and
 * disconnected islands. Rational intersections become numbers only at this
 * derived rendering boundary; this output never supplies source or routes. */
export function precisionSurfaceUnionGeometry(
  geometry: Polygon | MultiPolygon,
): Polygon | MultiPolygon {
  if (geometry.type !== "MultiPolygon" || geometry.coordinates.length <= 1)
    return geometry;
  const parts = nativeRationalOverlay(
    "union",
    geometry.coordinates as NativeRationalOverlayInput,
  );
  return {
    ...geometry,
    coordinates: parts.map((part) =>
      part.map((ring) =>
        ring.map(([x, y]) => [
          nativeRationalScalarToIEEE(x),
          nativeRationalScalarToIEEE(y),
        ]),
      ),
    ),
  };
}
