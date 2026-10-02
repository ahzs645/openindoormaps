import {
  containsRoomPoint,
  type RoomPoint,
} from "../../../reviter/lib/reviter/room-directory.ts";
export type FloorPolygon = RoomPoint[][];
const boundary = (p: RoomPoint, ring: RoomPoint[]) =>
  ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy;
    if (!length) return Math.hypot(p[0] - a[0], p[1] - a[1]) < 1e-8;
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length;
    return (
      t >= 0 &&
      t <= 1 &&
      Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 1e-8
    );
  });
const inside = (p: RoomPoint, poly: FloorPolygon) =>
  !!poly[0]?.length &&
  (containsRoomPoint(p, poly[0]) || boundary(p, poly[0])) &&
  !poly.slice(1).some((h) => containsRoomPoint(p, h) || boundary(p, h));
/** Independent complete line coverage check: split at every native slab/hole edge,
 * including collinear boundary vertices, rather than relying on spaced samples. */
export function nativeSlabsCoverSegment(
  a: RoomPoint,
  b: RoomPoint,
  polygons: FloorPolygon[],
) {
  if (
    !polygons.some((p) => inside(a, p)) ||
    !polygons.some((p) => inside(b, p))
  )
    return false;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  if (length < 1e-20) return true;
  const ts = [0, 1];
  for (const ring of polygons.flat())
    for (let i = 0; i < ring.length; i++) {
      const u = ring[i],
        v = ring[(i + 1) % ring.length],
        ex = v[0] - u[0],
        ey = v[1] - u[1],
        den = dx * ey - dy * ex;
      const ox = u[0] - a[0],
        oy = u[1] - a[1];
      if (Math.abs(den) < 1e-12) {
        if (Math.abs(ox * dy - oy * dx) < 1e-10)
          for (const q of [u, v]) {
            const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / length;
            if (t > 0 && t < 1) ts.push(t);
          }
        continue;
      }
      const t = (ox * ey - oy * ex) / den,
        k = (ox * dy - oy * dx) / den;
      if (t > 0 && t < 1 && k >= -1e-10 && k <= 1 + 1e-10) ts.push(t);
    }
  ts.sort((x, y) => x - y);
  for (let i = 1; i < ts.length; i++)
    if (ts[i] - ts[i - 1] > 1e-10) {
      const t = (ts[i] + ts[i - 1]) / 2,
        p: RoomPoint = [a[0] + dx * t, a[1] + dy * t];
      if (!polygons.some((poly) => inside(p, poly))) return false;
    }
  return true;
}
