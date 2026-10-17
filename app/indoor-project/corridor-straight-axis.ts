import * as DMath from "./deterministic-math";
import type { CorridorXY } from "./corridor-centerline";

/** Fit one axis to the whole hallway, rather than fitting each journey. Area
 * moments avoid bias from dense wall tessellation; regularly spaced section
 * midpoints then average small doorway recesses on the two sides. This is only
 * a proposal. The caller must check the complete continuous walking strip and
 * each original doorway approach against current physical geometry. */
export function proposeStraightCorridorAxis(rings: CorridorXY[][]) {
  const reference = rings[0]?.[0];
  if (!reference) return null;
  let area = 0,
    sx = 0,
    sy = 0,
    xx = 0,
    xy = 0,
    yy = 0;
  for (const [index, ring] of rings.entries()) {
    let a = 0,
      x = 0,
      y = 0,
      x2 = 0,
      y2 = 0,
      cross = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i],
        q = ring[(i + 1) % ring.length];
      const u = p[0] - reference[0],
        v = p[1] - reference[1];
      const s = q[0] - reference[0],
        t = q[1] - reference[1];
      const k = u * t - s * v;
      a += k / 2;
      x += ((u + s) * k) / 6;
      y += ((v + t) * k) / 6;
      x2 += ((u * u + u * s + s * s) * k) / 12;
      y2 += ((v * v + v * t + t * t) * k) / 12;
      cross += ((2 * u * v + u * t + s * v + 2 * s * t) * k) / 24;
    }
    const sign = (index === 0 ? 1 : -1) * Math.sign(a);
    area += sign * a;
    sx += sign * x;
    sy += sign * y;
    xx += sign * x2;
    xy += sign * cross;
    yy += sign * y2;
  }
  if (!(area > 0)) return null;
  const cx = sx / area,
    cy = sy / area;
  const vx = xx / area - cx * cx,
    vy = yy / area - cy * cy;
  const covariance = xy / area - cx * cy;
  const spread = DMath.hypot(vx - vy, 2 * covariance);
  // Broad rooms, junctions and strongly bent halls retain the general network.
  if (vx + vy + spread < 9 * (vx + vy - spread)) return null;
  const angle = 0.5 * DMath.atan2(2 * covariance, vx - vy);
  const direction: CorridorXY = [DMath.cos(angle), DMath.sin(angle)];
  const normal: CorridorXY = [-direction[1], direction[0]];
  const coordinates = rings.map((ring) =>
    ring.map((p): CorridorXY => {
      const x = p[0] - reference[0] - cx,
        y = p[1] - reference[1] - cy;
      return [
        x * direction[0] + y * direction[1],
        x * normal[0] + y * normal[1],
      ];
    }),
  );
  const longitudinal = coordinates[0].map((p) => p[0]);
  const lo = Math.min(...longitudinal),
    hi = Math.max(...longitudinal);
  if (!(hi - lo >= 12)) return null;
  const samples: CorridorXY[] = [];
  const count = Math.min(128, Math.max(16, Math.ceil((hi - lo) / 2)));
  for (let i = 0; i < count; i++) {
    const along = lo + (hi - lo) * (0.05 + (0.9 * (i + 0.5)) / count);
    const intersections: number[] = [];
    for (const ring of coordinates)
      for (let j = 0; j < ring.length; j++) {
        const a = ring[j],
          b = ring[(j + 1) % ring.length];
        if (a[0] > along !== b[0] > along)
          intersections.push(
            a[1] + ((b[1] - a[1]) * (along - a[0])) / (b[0] - a[0]),
          );
      }
    intersections.sort((a, b) => a - b);
    // Islands and side branches must not be averaged into a shortcut.
    if (intersections.length !== 2) return null;
    samples.push([along, (intersections[0] + intersections[1]) / 2]);
  }
  const meanX = samples.reduce((sum, p) => sum + p[0], 0) / count;
  const meanY = samples.reduce((sum, p) => sum + p[1], 0) / count;
  const slope =
    samples.reduce((sum, p) => sum + (p[0] - meanX) * (p[1] - meanY), 0) /
    samples.reduce((sum, p) => sum + (p[0] - meanX) ** 2, 0);
  if (
    samples.some((p) => Math.abs(p[1] - meanY - slope * (p[0] - meanX)) > 0.75)
  )
    return null;
  const origin: CorridorXY = [
    reference[0] + cx + meanX * direction[0] + meanY * normal[0],
    reference[1] + cy + meanX * direction[1] + meanY * normal[1],
  ];
  const length = DMath.hypot(1, slope);
  const axis: CorridorXY = [
    (direction[0] + slope * normal[0]) / length,
    (direction[1] + slope * normal[1]) / length,
  ];
  return {
    origin,
    direction: axis,
    project: (p: CorridorXY): CorridorXY => {
      const distance =
        (p[0] - origin[0]) * axis[0] + (p[1] - origin[1]) * axis[1];
      return [origin[0] + distance * axis[0], origin[1] + distance * axis[1]];
    },
  };
}
