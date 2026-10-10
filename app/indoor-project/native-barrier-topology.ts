import * as DMath from "./deterministic-math";
type Point = [number, number];
export const NATIVE_BARRIER_TOPOLOGY_VERSION = "native-wall-contact-noding-v2";
type Rings = Point[][];

/** Preserve native face contacts when reducing numerical precision.
 * A vertex already on another barrier edge is inserted into that edge before
 * rounding so both polygons retain the same grid vertex. No real gap is closed,
 * no polygon is buffered, and original source coordinates remain unchanged.
 * 1e-7 ft is below the compiler grid and only covers floating-point contacts. */
export function nativeBarrierTopology(
  barriers: Rings[],
  grid = 1e6,
  origin: Point = [0, 0],
  contact = 1e-7,
  numericalJunction = 0,
): Rings[] {
  if (
    !Number.isFinite(numericalJunction) ||
    numericalJunction < 0 ||
    numericalJunction > 1e-9
  )
    throw new Error("Numerical junction noding is bounded to at most 1e-9 ft.");
  const cell = 16;
  type Edge = {
    id: number;
    barrier: number;
    ring: number;
    index: number;
    a: Point;
    b: Point;
    nodes: { t: number; point: Point }[];
  };
  const edges: Edge[] = [],
    buckets = new Map<string, Edge[]>();
  const key = (x: number, y: number) => `${x}:${y}`;
  for (const [barrier, rings] of barriers.entries())
    for (const [ri, ring] of rings.entries())
      for (let index = 0; index < ring.length; index++) {
        const a = ring[index],
          b = ring[(index + 1) % ring.length];
        if (a[0] === b[0] && a[1] === b[1]) continue;
        const edge: Edge = {
          id: edges.length,
          barrier,
          ring: ri,
          index,
          a,
          b,
          nodes: [],
        };
        edges.push(edge);
        for (
          let x = Math.floor(
            (Math.min(a[0], b[0]) - Math.max(contact, numericalJunction)) /
              cell,
          );
          x <=
          Math.floor(
            (Math.max(a[0], b[0]) + Math.max(contact, numericalJunction)) /
              cell,
          );
          x++
        )
          for (
            let y = Math.floor(
              (Math.min(a[1], b[1]) - Math.max(contact, numericalJunction)) /
                cell,
            );
            y <=
            Math.floor(
              (Math.max(a[1], b[1]) + Math.max(contact, numericalJunction)) /
                cell,
            );
            y++
          ) {
            const k = key(x, y),
              list = buckets.get(k);
            if (list) list.push(edge);
            else buckets.set(k, [edge]);
          }
      }
  // Numerical junctions are an explicit selection-only option, separate from
  // the compiler's established precision reduction. Cluster ORIGINAL vertices
  // only when every original pair fits the bound: a chain cannot drift a point
  // farther than that bound. The anchor is an original vertex, never an average.
  const anchors = new Map<Point, Point>();
  if (numericalJunction > 0) {
    const vertices = barriers.flatMap((rings, barrier) =>
      rings.flatMap((ring) => ring.map((point) => ({ point, barrier }))),
    );
    const pointIds = new Map(vertices.map((v, i) => [v.point, i]));
    const parents = vertices.map((_, i) => i);
    const members = new Map(vertices.map((_, i) => [i, [i]]));
    const root = (i: number): number => {
      while (parents[i] !== i) i = parents[i];
      return i;
    };
    const pairs: { a: number; b: number; distance: number }[] = [];
    const seen = new Set<string>();
    for (const [i, vertex] of vertices.entries())
      for (const edge of buckets.get(
        key(
          Math.floor(vertex.point[0] / cell),
          Math.floor(vertex.point[1] / cell),
        ),
      ) ?? []) {
        if (edge.barrier === vertex.barrier) continue;
        for (const end of [edge.a, edge.b]) {
          const j = pointIds.get(end)!;
          const pair = `${Math.min(i, j)}:${Math.max(i, j)}`;
          if (seen.has(pair)) continue;
          const distance = DMath.hypot(
            vertex.point[0] - end[0],
            vertex.point[1] - end[1],
          );
          if (distance > numericalJunction) continue;
          seen.add(pair);
          pairs.push({ a: i, b: j, distance });
        }
      }
    pairs.sort((a, b) => a.distance - b.distance || a.a - b.a || a.b - b.b);
    for (const pair of pairs) {
      const a = root(pair.a),
        b = root(pair.b);
      if (a === b) continue;
      const aa = members.get(a)!,
        bb = members.get(b)!;
      if (
        !aa.every((i) =>
          bb.every(
            (j) =>
              DMath.hypot(
                vertices[i].point[0] - vertices[j].point[0],
                vertices[i].point[1] - vertices[j].point[1],
              ) <= numericalJunction,
          ),
        )
      )
        continue;
      parents[b] = a;
      members.set(a, [...aa, ...bb]);
      members.delete(b);
    }
    for (const ids of members.values()) {
      const anchor = ids
        .map((i) => vertices[i].point)
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
      for (const i of ids) anchors.set(vertices[i].point, anchor);
    }
  }
  for (const [barrier, rings] of barriers.entries())
    for (const ring of rings)
      for (const point of ring) {
        for (const edge of buckets.get(
          key(Math.floor(point[0] / cell), Math.floor(point[1] / cell)),
        ) ?? []) {
          if (edge.barrier === barrier) continue;
          const dx = edge.b[0] - edge.a[0],
            dy = edge.b[1] - edge.a[1],
            l2 = dx * dx + dy * dy;
          const t =
            ((point[0] - edge.a[0]) * dx + (point[1] - edge.a[1]) * dy) / l2;
          const shared = anchors.get(point) ?? point;
          // A T junction uses the same original vertex on the other finite
          // edge. Endpoint contacts are included; infinite-line proximity is
          // insufficient. Both the original vertex and its anchor must remain
          // inside the independent numerical bound of that finite segment.
          if (numericalJunction > 0) {
            const finiteT = Math.max(0, Math.min(1, t));
            const anchoredT = Math.max(
              0,
              Math.min(
                1,
                ((shared[0] - edge.a[0]) * dx + (shared[1] - edge.a[1]) * dy) /
                  l2,
              ),
            );
            const closeEndpoint = [edge.a, edge.b].find(
              (end) =>
                DMath.hypot(point[0] - end[0], point[1] - end[1]) <=
                numericalJunction,
            );
            const anchoredEnd =
              closeEndpoint && (anchors.get(closeEndpoint) ?? closeEndpoint);
            const endpointWithinBound =
              !anchoredEnd ||
              DMath.hypot(
                shared[0] - anchoredEnd[0],
                shared[1] - anchoredEnd[1],
              ) <= numericalJunction;
            if (
              endpointWithinBound &&
              DMath.hypot(
                point[0] - edge.a[0] - finiteT * dx,
                point[1] - edge.a[1] - finiteT * dy,
              ) <= numericalJunction &&
              DMath.hypot(
                shared[0] - edge.a[0] - anchoredT * dx,
                shared[1] - edge.a[1] - anchoredT * dy,
              ) <= numericalJunction
            ) {
              edge.nodes.push({ t: anchoredT, point: shared });
              continue;
            }
          }
          if (t <= 0 || t >= 1) continue;
          if (
            DMath.hypot(
              point[0] - edge.a[0] - t * dx,
              point[1] - edge.a[1] - t * dy,
            ) > contact
          )
            continue;
          if (numericalJunction > 0) {
            const sharedT = Math.max(
              0,
              Math.min(
                1,
                ((shared[0] - edge.a[0]) * dx + (shared[1] - edge.a[1]) * dy) /
                  l2,
              ),
            );
            if (
              DMath.hypot(
                shared[0] - edge.a[0] - sharedT * dx,
                shared[1] - edge.a[1] - sharedT * dy,
              ) > numericalJunction
            )
              continue;
          }
          edge.nodes.push({ t, point: shared });
        }
      }
  // Intersections of original edges need one shared grid node as well. Rounding
  // each unsplit crossing independently can otherwise turn overlap contacts into
  // microscopic bypasses. Only true finite segment crossings are inserted.
  for (const edge of edges) {
    const candidates = new Set<Edge>();
    for (
      let x = Math.floor(Math.min(edge.a[0], edge.b[0]) / cell);
      x <= Math.floor(Math.max(edge.a[0], edge.b[0]) / cell);
      x++
    )
      for (
        let y = Math.floor(Math.min(edge.a[1], edge.b[1]) / cell);
        y <= Math.floor(Math.max(edge.a[1], edge.b[1]) / cell);
        y++
      )
        for (const other of buckets.get(key(x, y)) ?? [])
          if (other.id > edge.id && other.barrier !== edge.barrier)
            candidates.add(other);
    const dx = edge.b[0] - edge.a[0],
      dy = edge.b[1] - edge.a[1];
    for (const other of candidates) {
      const ex = other.b[0] - other.a[0],
        ey = other.b[1] - other.a[1],
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-14 * DMath.hypot(dx, dy) * DMath.hypot(ex, ey))
        continue;
      const ax = other.a[0] - edge.a[0],
        ay = other.a[1] - edge.a[1],
        t = (ax * ey - ay * ex) / den,
        u = (ax * dy - ay * dx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const point: Point = [edge.a[0] + t * dx, edge.a[1] + t * dy];
      if (t > 0 && t < 1) edge.nodes.push({ t, point });
      if (u > 0 && u < 1) other.nodes.push({ t: u, point });
    }
  }
  const byEdge = new Map(
    edges.map((e) => [`${e.barrier}:${e.ring}:${e.index}`, e]),
  );
  return barriers.map((rings, bi) =>
    rings.map((ring, ri) => {
      const output: Point[] = [];
      for (let i = 0; i < ring.length; i++) {
        const edge = byEdge.get(`${bi}:${ri}:${i}`);
        const points = [
          anchors.get(ring[i]) ?? ring[i],
          ...(edge?.nodes.sort((a, b) => a.t - b.t).map((n) => n.point) ?? []),
        ];
        for (const p of points) {
          const q: Point = [
            Math.round(((anchors.get(p) ?? p)[0] - origin[0]) * grid) / grid +
              origin[0],
            Math.round(((anchors.get(p) ?? p)[1] - origin[1]) * grid) / grid +
              origin[1],
          ];
          const last = output.at(-1);
          if (!last || last[0] !== q[0] || last[1] !== q[1]) output.push(q);
        }
      }
      return output;
    }),
  );
}
