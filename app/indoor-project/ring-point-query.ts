type Point = [number, number];
const epsilon = 1e-8;
const bucketSize = 8;

/** Exact point-in-ring checks with a conservative vertical edge index.
 * Snapshot-local: rebuild after any source edit, including in-place edits.
 * Bins only discard edges that cannot cross the ray or touch the point. */
export function createRingPointQuery(ring: Point[]) {
  const edges = ring.map((a, i) => {
    const b = ring[(i + ring.length - 1) % ring.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    return {
      a,
      b,
      dx,
      dy,
      length: Math.hypot(dx, dy),
      minX: Math.min(a[0], b[0]) - epsilon,
      maxX: Math.max(a[0], b[0]) + epsilon,
      minY: Math.min(a[1], b[1]) - epsilon,
      maxY: Math.max(a[1], b[1]) + epsilon,
    };
  });
  const buckets = new Map<number, typeof edges>(),
    overflow: typeof edges = [];
  const indexed = edges.length >= 32;
  if (indexed)
    for (const edge of edges) {
      const lo = Math.floor(edge.minY / bucketSize),
        hi = Math.floor(edge.maxY / bucketSize);
      // Extremely long edges stay in an overflow list to bound index memory.
      if (hi - lo > 256) {
        overflow.push(edge);
        continue;
      }
      for (let y = lo; y <= hi; y++) {
        const bucket = buckets.get(y) ?? [];
        bucket.push(edge);
        buckets.set(y, bucket);
      }
    }
  return (p: Point) => {
    let inside = false;
    const scan = (candidates: typeof edges) => {
      for (const e of candidates) {
        if (p[1] < e.minY || p[1] > e.maxY) continue;
        // Preserve the original boundary tolerance and arithmetic exactly.
        const cross = (p[0] - e.a[0]) * e.dy - (p[1] - e.a[1]) * e.dx;
        if (
          Math.abs(cross) <= epsilon * e.length &&
          p[0] >= e.minX &&
          p[0] <= e.maxX
        )
          return true;
        if (
          e.a[1] > p[1] !== e.b[1] > p[1] &&
          p[0] < (e.dx * (p[1] - e.a[1])) / e.dy + e.a[0]
        )
          inside = !inside;
      }
      return false;
    };
    if (!indexed) return scan(edges) || inside;
    return (
      scan(buckets.get(Math.floor(p[1] / bucketSize)) ?? []) ||
      scan(overflow) ||
      inside
    );
  };
}
