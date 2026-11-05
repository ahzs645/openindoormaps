// DIAGNOSTIC COPY ONLY (tolerance ladder). Generated from lib/reviter/native-routing-contact-noding.ts
// with the 1e-7 bound lifted to 1 ft; never used by the compiler. Edit the imports to your Reviter path.
import * as DMath from "REVITER/lib/reviter/deterministic-math.ts";
import { orient2d, rational } from "REVITER/lib/reviter/vendor/native-rational-overlay-arithmetic.mjs";

type Point = [number, number];
type Rings = Point[][];

/** Binds prepared native circulation cells to this contact rule. */
export const NATIVE_ROUTING_CONTACT_NODING_VERSION =
  "native-routing-wall-contact-noding-v1:1e-7ft:outside-vertex-into-foreign-edge";
export const NATIVE_ROUTING_CONTACT_FEET = 1e-7;

/** The exact routing compiler keeps every original IEEE wall coordinate, so a
 * partition whose exported end corner misses the neighbouring wall face by one
 * floating-point step (1e-14 ft) leaves a sliver that the rational overlay
 * treats as a real opening. This applies the documented native contact rule
 * (`nativeBarrierTopology`) to that exact path without any coordinate reduction:
 * a wall vertex that lies within `contact` (1e-7 ft) of the interior of another
 * wall's edge, strictly on that wall's outside, is inserted into that edge.
 * Both walls then share the original vertex exactly.
 *
 * - The inserted vertex is an unchanged original coordinate; no coordinate is
 *   rounded, moved or averaged, and no wall is buffered.
 * - Material is only ever added, and only inside the triangle between the
 *   original edge and vertices at most `contact` from it. A gap wider than
 *   `contact` cannot be closed; vertices inside or exactly on the other wall
 *   (overlaps and exact contacts) change nothing.
 * - Only wall bodies take part. Door leaves and thresholds, floors and their
 *   holes, columns, fixtures, masks and reviewed patch walls are not inputs, so
 *   no door aperture, opening or floor hole is affected.
 * - Unchanged walls are returned as the same objects.
 */
export function nativeRoutingContactNoding<T extends Rings>(
  walls: readonly T[],
  contact = NATIVE_ROUTING_CONTACT_FEET,
): T[] {
  if (!(contact >= 0) || contact > 1)
    throw new Error("Native routing contact noding is bounded to at most 1e-7 ft.");
  const cell = 16;
  type Edge = {
    wall: number;
    ring: number;
    index: number;
    a: Point;
    b: Point;
    interiorLeft: boolean;
    nodes: { t: number; point: Point }[];
  };
  const edges: Edge[] = [],
    buckets = new Map<string, Edge[]>(),
    key = (x: number, y: number) => `${x}:${y}`;
  for (const [wall, rings] of walls.entries())
    for (const [ring, points] of rings.entries()) {
      // Shoelace about the first vertex. Interior lies left of a positive
      // outer ring and right of a positive hole.
      const o = points[0];
      let doubled = 0;
      if (o)
        for (let i = 1; i + 1 < points.length; i++)
          doubled +=
            (points[i][0] - o[0]) * (points[i + 1][1] - o[1]) -
            (points[i + 1][0] - o[0]) * (points[i][1] - o[1]);
      if (!(doubled !== 0) || !Number.isFinite(doubled)) continue;
      const interiorLeft = (ring === 0) === doubled > 0;
      for (let index = 0; index < points.length; index++) {
        const a = points[index],
          b = points[(index + 1) % points.length];
        if (a[0] === b[0] && a[1] === b[1]) continue;
        const edge: Edge = { wall, ring, index, a, b, interiorLeft, nodes: [] };
        edges.push(edge);
        for (
          let x = Math.floor((Math.min(a[0], b[0]) - contact) / cell);
          x <= Math.floor((Math.max(a[0], b[0]) + contact) / cell);
          x++
        )
          for (
            let y = Math.floor((Math.min(a[1], b[1]) - contact) / cell);
            y <= Math.floor((Math.max(a[1], b[1]) + contact) / cell);
            y++
          ) {
            const list = buckets.get(key(x, y));
            if (list) list.push(edge);
            else buckets.set(key(x, y), [edge]);
          }
      }
    }
  for (const [wall, rings] of walls.entries())
    for (const points of rings)
      for (const point of points) {
        // One edge per foreign ring: the nearest within the bound, preferring a
        // projection inside the closed edge span. A corner of an end-to-end
        // abutment projects onto the foreign end edge at t = 0 or 1.
        const best = new Map<string, { edge: Edge; t: number; distance: number; inside: boolean }>();
        for (const edge of buckets.get(
          key(Math.floor(point[0] / cell), Math.floor(point[1] / cell)),
        ) ?? []) {
          if (edge.wall === wall) continue;
          if (
            (point[0] === edge.a[0] && point[1] === edge.a[1]) ||
            (point[0] === edge.b[0] && point[1] === edge.b[1])
          )
            continue;
          const dx = edge.b[0] - edge.a[0],
            dy = edge.b[1] - edge.a[1],
            t =
              ((point[0] - edge.a[0]) * dx + (point[1] - edge.a[1]) * dy) /
              (dx * dx + dy * dy),
            clamped = Math.max(0, Math.min(1, t)),
            distance = DMath.hypot(
              point[0] - edge.a[0] - clamped * dx,
              point[1] - edge.a[1] - clamped * dy,
            );
          if (!(distance <= contact)) continue;
          const inside = t >= 0 && t <= 1,
            id = `${edge.wall}:${edge.ring}`,
            previous = best.get(id);
          if (
            previous &&
            (Number(previous.inside) > Number(inside) ||
              (previous.inside === inside && previous.distance <= distance))
          )
            continue;
          best.set(id, { edge, t: clamped, distance, inside });
        }
        for (const { edge, t } of best.values()) {
          // Exact side of the original edge: on it is already a contact,
          // inside it is an overlap; neither leaves a gap to close.
          const side = orient2d(
            rational(edge.a[0]),
            rational(edge.a[1]),
            rational(edge.b[0]),
            rational(edge.b[1]),
            rational(point[0]),
            rational(point[1]),
          );
          if (side === 0) continue;
          if (side < 0 === edge.interiorLeft) continue;
          edge.nodes.push({ t, point });
        }
      }
  const changed = new Map<string, Edge>();
  for (const edge of edges)
    if (edge.nodes.length) changed.set(`${edge.wall}:${edge.ring}:${edge.index}`, edge);
  if (!changed.size) return [...walls];
  return walls.map((rings, wall) => {
    if (!rings.some((_, ring) => rings[ring].some((__, i) => changed.has(`${wall}:${ring}:${i}`))))
      return rings;
    return rings.map((points, ring) => {
      const output: Point[] = [];
      for (let i = 0; i < points.length; i++) {
        const edge = changed.get(`${wall}:${ring}:${i}`);
        const next = [
          points[i],
          ...(edge?.nodes
            .sort((a, b) => a.t - b.t || a.point[0] - b.point[0] || a.point[1] - b.point[1])
            .map((n) => n.point) ?? []),
        ];
        for (const p of next) {
          const last = output.at(-1);
          if (!last || last[0] !== p[0] || last[1] !== p[1]) output.push(p);
        }
      }
      return output;
    }) as T;
  });
}
