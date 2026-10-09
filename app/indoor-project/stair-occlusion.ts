import polygonClipping from "polygon-clipping";
import type { IndoorDataset } from "./contract";
import { nativeRationalOverlay } from "./native-rational-overlay";
import { createNativeContainedDisplay } from "./native-contained-display";
import { nativeRenderProperties } from "./native-render-parts";
type Flight = NonNullable<IndoorDataset["stairDisplay"]>["flights"][number];
type Point = [number, number];

export function exactVisibleTreadDrawing(
  flight: Pick<Flight, "floorOccluders">,
  tread: Flight["treads"][number] & { ringsFeet?: Point[][] },
) {
  const slabs = (flight.floorOccluders ?? []).filter(
    (s) => tread.elevationFeet < s.elevationFeet - 0.01,
  );
  const rings = tread.ringsFeet ?? [tread.ringFeet];
  return nativeRenderProperties(
    nativeRationalOverlay(
      "difference",
      [rings],
      ...slabs.map((s) => [s.ringsFeet]),
    ),
  );
}

/** Visibility only. Native treads and route polygons remain untouched. */
export function visibleTreadPolygons(
  flight: Pick<Flight, "floorOccluders">,
  tread: Flight["treads"][number] & { ringsFeet?: Point[][] },
  exactNative = false,
): Point[][][] {
  const slabs = (flight.floorOccluders ?? []).filter(
    (s) => tread.elevationFeet < s.elevationFeet - 0.01,
  );
  const rings = tread.ringsFeet ?? [tread.ringFeet];
  if (slabs.length === 0) return [rings];
  if (exactNative) {
    const visible = nativeRationalOverlay(
      "difference",
      [rings],
      ...slabs.map((s) => [s.ringsFeet]),
    );
    return createNativeContainedDisplay(visible).partsFeet;
  }
  const scale = 100_000;
  const local = (r: Point[]) =>
    [...r, r[0]].map(
      (p) => [Math.round(p[0] * scale), Math.round(p[1] * scale)] as Point,
    );
  try {
    return polygonClipping
      .difference(rings.map(local), ...slabs.map((s) => s.ringsFeet.map(local)))
      .map((p) =>
        p.map((r) => r.map((q) => [q[0] / scale, q[1] / scale] as Point)),
      );
  } catch {
    // An unresolved cut must not expose a flight through a claimed solid floor.
    return [];
  }
}
