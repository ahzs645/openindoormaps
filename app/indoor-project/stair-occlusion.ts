import polygonClipping from "polygon-clipping";
import type { IndoorDataset } from "./contract";
type Flight = NonNullable<IndoorDataset["stairDisplay"]>["flights"][number];
type Point = [number, number];

/** Visibility only. Native treads and route polygons remain untouched. */
export function visibleTreadPolygons(
  flight: Pick<Flight, "floorOccluders">,
  tread: Flight["treads"][number],
): Point[][][] {
  const slabs = (flight.floorOccluders ?? []).filter(
    (s) => tread.elevationFeet < s.elevationFeet - 0.01,
  );
  if (slabs.length === 0) return [[tread.ringFeet]];
  const scale = 100_000;
  const local = (r: Point[]) =>
    [...r, r[0]].map(
      (p) => [Math.round(p[0] * scale), Math.round(p[1] * scale)] as Point,
    );
  try {
    return polygonClipping
      .difference(
        [local(tread.ringFeet)],
        ...slabs.map((s) => s.ringsFeet.map(local)),
      )
      .map((p) =>
        p.map((r) => r.map((q) => [q[0] / scale, q[1] / scale] as Point)),
      );
  } catch {
    // An unresolved cut must not expose a flight through a claimed solid floor.
    return [];
  }
}
