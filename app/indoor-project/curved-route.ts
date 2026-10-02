type XY = [number, number];
type Section = { point: XY; width: number };
type Segment = { a: XY; b: XY; normal: XY };
export type CurvedPath = {
  points: XY[];
  ranges: { start: number; end: number }[];
};
const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix = (a: XY, b: XY, t: number): XY => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const pathLength = (points: XY[]) =>
  points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
function segmentDistance(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return distance(p, mix(a, b, t));
}
const guideDistance = (p: XY, points: XY[]) =>
  Math.min(...points.slice(1).map((b, i) => segmentDistance(p, points[i], b)));

/** Consecutive, consistently turning boundary facets supply geometric evidence
 * for a bend. A rectangle, one diagonal wall, or a raster staircase does not. */
function curvedSegments(rings: XY[][]): Segment[] {
  const result: Segment[] = [];
  for (const raw of rings) {
    const ring = raw.filter((p, i) => !i || distance(p, raw[i - 1]) > 1e-5);
    if (ring.length > 1 && distance(ring[0], ring.at(-1)!) < 1e-5) ring.pop();
    const n = ring.length;
    if (n < 6) continue;
    const turns = ring.map((p, i) => {
      const a = ring[(i + n - 1) % n],
        b = ring[(i + 1) % n];
      return Math.atan2(
        (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]),
        (p[0] - a[0]) * (b[0] - p[0]) + (p[1] - a[1]) * (b[1] - p[1]),
      );
    });
    const selected = new Set<number>();
    for (let start = 0; start < n; start++) {
      let sum = 0,
        count = 0;
      const sign = Math.sign(turns[start]);
      if (Math.abs(turns[start]) < 0.008 || Math.abs(turns[start]) > 0.39)
        continue;
      while (count < n) {
        const turn = turns[(start + count) % n];
        if (
          Math.abs(turn) > 0.39 ||
          (Math.abs(turn) > 0.008 && Math.sign(turn) !== sign)
        )
          break;
        sum += turn;
        count++;
      }
      if (count < 4 || Math.abs(sum) < Math.PI / 8) continue;
      for (let i = -1; i < count; i++) selected.add((start + i + n) % n);
    }
    for (const i of selected) {
      const a = ring[i],
        b = ring[(i + 1) % n],
        d = distance(a, b);
      if (d > 0.1)
        result.push({ a, b, normal: [-(b[1] - a[1]) / d, (b[0] - a[0]) / d] });
    }
  }
  return result;
}

type Circle = { center: XY; radius: number; support: Segment[] };
/** Recover circular construction arcs from repeated native facets. Only arcs
 * with matching local centres/radii qualify; arbitrary bends keep their trace. */
function boundaryCircles(segments: Segment[]): Circle[] {
  const circles: Circle[] = [];
  for (let i = 1; i < segments.length; i++) {
    const prior = segments[i - 1],
      next = segments[i];
    if (distance(prior.b, next.a) > 1e-5) continue;
    const a = prior.a,
      b = next.a,
      c = next.b;
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      vx = c[0] - a[0],
      vy = c[1] - a[1],
      det = 2 * (ux * vy - uy * vx);
    if (Math.abs(det) < 1e-8) continue;
    const q = ux * ux + uy * uy,
      r = vx * vx + vy * vy;
    const center: XY = [
      a[0] + (q * vy - r * uy) / det,
      a[1] + (ux * r - vx * q) / det,
    ];
    const radius = distance(center, b);
    if (radius < 3 || radius > 10_000) continue;
    let circle = circles.find(
      (c) =>
        distance(c.center, center) < 0.15 && Math.abs(c.radius - radius) < 0.15,
    );
    if (!circle) {
      circle = { center, radius, support: [] };
      circles.push(circle);
    }
    for (const segment of [prior, next])
      if (!circle.support.includes(segment)) circle.support.push(segment);
  }
  return circles.filter(
    (c) =>
      c.support.length >= 6 &&
      c.support.reduce(
        (s, segment) => s + distance(segment.a, segment.b) / c.radius,
        0,
      ) >=
        Math.PI / 8,
  );
}

/** Join a proved circular lane with tangent approaches. Native clearance and
 * proximity to the chosen guide veto an arc through another corridor/void. */
function circularLane(
  original: XY[],
  center: XY,
  radius: number,
  valid: (a: XY, b: XY) => boolean,
  budget: number,
): CurvedPath | null {
  if (original.length > 64) return null;
  const tangents = (p: XY): XY[] => {
    const r = distance(p, center);
    if (r < radius - 0.15) return [];
    if (Math.abs(r - radius) < 0.15) return [p];
    const angle = Math.atan2(p[1] - center[1], p[0] - center[0]),
      offset = Math.acos(radius / r);
    return [angle - offset, angle + offset].map(
      (t) =>
        [
          center[0] + radius * Math.cos(t),
          center[1] + radius * Math.sin(t),
        ] as XY,
    );
  };
  const candidates: CurvedPath[] = [];
  for (let first = 0; first < original.length - 1; first++)
    for (let last = first + 1; last < original.length; last++) {
      for (const a of tangents(original[first]))
        for (const b of tangents(original[last])) {
          const start = Math.atan2(a[1] - center[1], a[0] - center[0]),
            end = Math.atan2(b[1] - center[1], b[0] - center[0]);
          for (const sign of [-1, 1]) {
            const tangentA: XY = [
                -Math.sin(start) * sign,
                Math.cos(start) * sign,
              ],
              tangentB: XY = [-Math.sin(end) * sign, Math.cos(end) * sign];
            if (
              (a[0] - original[first][0]) * tangentA[0] +
                (a[1] - original[first][1]) * tangentA[1] <
                -1e-5 ||
              (original[last][0] - b[0]) * tangentB[0] +
                (original[last][1] - b[1]) * tangentB[1] <
                -1e-5
            )
              continue;
            const delta =
              sign *
              ((((sign * (end - start)) % (2 * Math.PI)) + 2 * Math.PI) %
                (2 * Math.PI));
            if (
              Math.abs(delta) < Math.PI / 8 ||
              Math.abs(delta) > Math.PI * 1.5
            )
              continue;
            const count = Math.ceil(Math.abs(delta) * radius);
            if (count > 2048) continue;
            const arc = Array.from({ length: count + 1 }, (_, i): XY => {
              if (i === 0) return a;
              if (i === count) return b;
              const t = start + (delta * i) / count;
              return [
                center[0] + radius * Math.cos(t),
                center[1] + radius * Math.sin(t),
              ];
            });
            if (arc.some((p) => guideDistance(p, original) > 12)) continue;
            const prefix = original.slice(0, first + 1),
              suffix = original.slice(last);
            if (distance(prefix.at(-1)!, a) < 1e-5) prefix.pop();
            if (distance(b, suffix[0]) < 1e-5) suffix.shift();
            const points = [...prefix, ...arc, ...suffix];
            if (
              pathLength(points) > budget ||
              !points.slice(1).every((p, i) => valid(points[i], p))
            )
              continue;
            // Long approaches also stay in the chosen guide's neighbourhood.
            const nearby = [
              [original[first], a],
              [b, original[last]],
            ].every(([u, v]) =>
              Array.from(
                { length: Math.ceil(distance(u, v) / 2) + 1 },
                (_, i) => mix(u, v, i / (Math.ceil(distance(u, v) / 2) || 1)),
              ).every((p) => guideDistance(p, original) <= 12),
            );
            if (!nearby) continue;
            candidates.push({
              points,
              ranges: [
                { start: prefix.length, end: prefix.length + arc.length - 1 },
              ],
            });
          }
        }
    }
  return (
    candidates.sort((a, b) => pathLength(a.points) - pathLength(b.points))[0] ??
    null
  );
}

/** Trace local corridor cross-section midpoints beside proved curved boundaries.
 * The existing path supplies the chosen corridor/topology, not arbitrary nearby
 * shortcuts. All chords, including smoothing chords, must pass the caller's
 * continuous wall, column, room-mask, aperture and exact-height floor query.
 * Endpoints remain fixed. Failure leaves the original route untouched. */
export function curvedCorridorPath(
  original: XY[],
  boundaries: XY[][],
  section: (point: XY, normal: XY) => Section | null,
  valid: (a: XY, b: XY) => boolean,
  budget: number,
): CurvedPath | null {
  const segments = curvedSegments(boundaries);
  if (segments.length === 0 || original.length < 2) return null;
  const cloud: (Section & { normal: XY })[] = [];
  for (const { a, b, normal } of segments) {
    const count = Math.max(1, Math.ceil(distance(a, b)));
    for (let i = 0; i < count; i++) {
      const point = mix(a, b, (i + 0.5) / count);
      if (guideDistance(point, original) > 24) continue;
      for (const sign of [-1, 1]) {
        const seed: XY = [
          point[0] + sign * normal[0] * 0.1,
          point[1] + sign * normal[1] * 0.1,
        ];
        const cross = section(seed, normal);
        if (
          cross &&
          cross.width >= 3 &&
          cross.width <= 24 &&
          guideDistance(cross.point, original) <=
            Math.min(12, cross.width * 0.65) &&
          valid(cross.point, cross.point)
        )
          cloud.push({ ...cross, normal });
      }
    }
    if (cloud.length > 4096) return null;
  }
  // Side openings widen isolated cross-sections. A proved circular wall
  // supplies a stable radial frame; the median width trace keeps those outlets
  // from pulling the walking lane sideways. Every relocation remains checked.
  const circular: CurvedPath[] = [];
  for (const circle of boundaryCircles(segments)) {
    const nearby = cloud.filter((c) => {
      const r = distance(c.point, circle.center);
      const alignment = Math.abs(
        ((c.point[0] - circle.center[0]) * c.normal[0] +
          (c.point[1] - circle.center[1]) * c.normal[1]) /
          r,
      );
      return (
        alignment > 0.995 &&
        circle.support.some(
          (s) => segmentDistance(c.point, s.a, s.b) <= c.width * 0.6 + 0.2,
        )
      );
    });
    if (nearby.length < 8) continue;
    const radii = nearby
      .map((c) => distance(c.point, circle.center))
      .sort((a, b) => a - b);
    const radius = radii[Math.floor(radii.length / 2)];
    const widths = nearby.map((c) => c.width).sort((a, b) => a - b);
    const adjustment = Math.min(4, widths[Math.floor(widths.length / 4)] / 4);
    for (let offset = 0; offset <= adjustment; offset += 0.5) {
      const lanes = (offset ? [radius - offset, radius + offset] : [radius])
        .map((r) => circularLane(original, circle.center, r, valid, budget))
        .filter((lane): lane is CurvedPath => !!lane);
      if (lanes.length > 0) {
        circular.push(
          lanes.sort((a, b) => pathLength(a.points) - pathLength(b.points))[0],
        );
        break;
      }
    }
    for (const c of nearby) {
      const r = distance(c.point, circle.center);
      const p: XY = [
        circle.center[0] + ((c.point[0] - circle.center[0]) * radius) / r,
        circle.center[1] + ((c.point[1] - circle.center[1]) * radius) / r,
      ];
      if (
        distance(p, c.point) <= Math.min(3, c.width * 0.3) &&
        guideDistance(p, original) <= Math.min(12, c.width * 0.65) &&
        valid(p, p) &&
        valid(c.point, p)
      )
        c.point = p;
    }
  }
  if (circular.length > 0)
    return circular.sort(
      (a, b) => pathLength(a.points) - pathLength(b.points),
    )[0];
  if (cloud.length < 8) return null;
  const sampled: { point: XY; original: XY; moved: boolean }[] = [
    { point: original[0], original: original[0], moved: false },
  ];
  for (let i = 1; i < original.length; i++) {
    const count = Math.max(
      1,
      Math.ceil(distance(original[i - 1], original[i]) / 2),
    );
    for (let j = 1; j <= count; j++) {
      const point = mix(original[i - 1], original[i], j / count);
      // Fixed doorway/stair/arrival anchors are never projected.
      const fixed = i === original.length - 1 && j === count;
      const closest = fixed
        ? undefined
        : cloud
            .map((c) => ({ cross: c, d: distance(c.point, point) }))
            .filter(
              (c) =>
                c.d <= Math.min(12, c.cross.width * 0.65) &&
                Math.abs(
                  (point[0] - c.cross.point[0]) * -c.cross.normal[1] +
                    (point[1] - c.cross.point[1]) * c.cross.normal[0],
                ) <= 1.5 &&
                valid(point, c.cross.point),
            )
            .sort((a, b) => a.d - b.d)[0];
      sampled.push({
        point: closest?.cross.point ?? point,
        original: point,
        moved: !!closest,
      });
    }
  }
  if (sampled.length > 2048 || sampled.filter((p) => p.moved).length < 8)
    return null;
  // Relax quantization along the centre trace, never a corner elsewhere in the
  // building. Recheck all resulting chords rather than assuming a spline fits.
  for (let pass = 0; pass < 3; pass++) {
    const previous = sampled.map((p) => p.point);
    for (let i = 1; i < sampled.length - 1; i++) {
      if (!sampled[i - 1].moved || !sampled[i].moved || !sampled[i + 1].moved)
        continue;
      const p: XY = [
        (previous[i - 1][0] + 2 * previous[i][0] + previous[i + 1][0]) / 4,
        (previous[i - 1][1] + 2 * previous[i][1] + previous[i + 1][1]) / 4,
      ];
      if (valid(previous[i - 1], p) && valid(p, previous[i + 1]))
        sampled[i].point = p;
    }
  }
  // Blend back to the original safe guide at a tight approach rather than
  // joining a curved lane to a fixed doorway with an unchecked diagonal.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let i = 1; i < sampled.length; i++) {
      if (valid(sampled[i - 1].point, sampled[i].point)) continue;
      for (const j of [i - 1, i]) {
        if (!sampled[j].moved) continue;
        sampled[j].point = mix(
          sampled[j].original,
          sampled[j].point,
          pass === 7 ? 0 : 0.5,
        );
        changed = true;
      }
    }
    if (!changed) break;
  }
  const entries = sampled.filter(
    (p, i, all) => !i || distance(p.point, all[i - 1].point) > 1e-5,
  );
  const points = entries.map((p) => p.point);
  // Keep the curved shape to 0.05 ft, while removing dense straight samples.
  const simplified: XY[] = [points[0]];
  const indices = [0];
  for (let first = 0; first < points.length - 1; ) {
    let last = first + 1;
    for (let end = first + 2; end < points.length; end++) {
      if (
        points
          .slice(first + 1, end)
          .some((p) => segmentDistance(p, points[first], points[end]) > 0.05) ||
        !valid(points[first], points[end])
      )
        break;
      last = end;
    }
    simplified.push(points[last]);
    indices.push(last);
    first = last;
  }
  if (
    pathLength(simplified) > budget ||
    !simplified.slice(1).every((p, i) => valid(simplified[i], p))
  )
    return null;
  const ranges: CurvedPath["ranges"] = [];
  for (let i = 1; i < indices.length; i++) {
    const part = entries.slice(indices[i - 1], indices[i] + 1);
    if (part.filter((p) => p.moved).length < part.length / 2) continue;
    const last = ranges.at(-1);
    if (last?.end === i - 1) last.end = i;
    else ranges.push({ start: i - 1, end: i });
  }
  if (ranges.length === 0) return null;
  return { points: simplified, ranges };
}
