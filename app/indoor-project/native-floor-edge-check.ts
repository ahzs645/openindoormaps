type Point = [number, number];
type Rings = Point[][];
/** Length of a region exterior coincident with an outer native slab edge.
 * This signals an unsealed boundary, not an indoor/outdoor certification:
 * curtain geometry may be missing, and source sections may hide enclosure. */
export function exposedNativeFloorEdgeFeet(
  region: Rings,
  ground: Rings[],
): number {
  const segments = (ring: Point[]) =>
    ring.flatMap((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-7
        ? [[a, b] as [Point, Point]]
        : [];
    });
  // Inner slab rings are real atrium/stair openings; this check never treats
  // them as gaps to close or turns their perimeter into an exterior route.
  const edges = ground.flatMap((p) => segments(p[0]));
  let total = 0;
  for (const [a, b] of segments(region[0])) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / length,
      uy = (b[1] - a[1]) / length;
    const spans: [number, number][] = [];
    for (const [c, d] of edges) {
      const cross = (p: Point) => (p[0] - a[0]) * uy - (p[1] - a[1]) * ux;
      if (Math.abs(cross(c)) > 1e-4 || Math.abs(cross(d)) > 1e-4) continue;
      const along = (p: Point) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
      const lo = Math.max(0, Math.min(along(c), along(d)));
      const hi = Math.min(length, Math.max(along(c), along(d)));
      if (hi > lo) spans.push([lo, hi]);
    }
    spans.sort((s, t) => s[0] - t[0]);
    let end = 0;
    for (const [lo, hi] of spans) {
      total += Math.max(0, hi - Math.max(end, lo));
      end = Math.max(end, hi);
    }
  }
  return total;
}
