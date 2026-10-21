import Delaunator from "delaunator";

/** Straight hallway spines for walking surfaces.
 *
 * Each surface gets one centreline: the medial axis of its outline (Voronoi
 * vertices of the densified boundary), with short side branches pruned, pulled
 * into the fewest straight runs that stay near the axis and clear of the walls.
 * Small linking spaces between gates become straight door-to-door lines, and
 * compact open areas use spokes from their most central point. Doorways join a
 * spine by the shortest clear line, which meets a straight run square.
 *
 * Pure plan geometry in one unit (feet in practice). Every emitted segment is
 * checked to stay inside its surface; nothing is invented outside it. */
export type XY = [number, number];
export type Rings = XY[][];
export type SpineSurface = {
  /** Outer ring first, then holes. Rings are open (no repeated first point). */
  rings: Rings;
  /** A vestibule, link or other small space joining gates. */
  crossing: boolean;
};
/** A door or opening between two surfaces; `sides[0]` lies along +normal. */
export type SpineGate = {
  id: string;
  center: XY;
  normal: XY;
  halfDepth: number;
  sides: [number, number];
};
/** A doorway from a room into one surface, at its surface-side point. */
export type SpineDoorway = { id: string; point: XY; surface: number };
export type SpineSegment = { surface: number; a: XY; b: XY };
export type SpineLink = {
  kind: "gate" | "doorway";
  id: string;
  surface: number;
  /** From the door (gate centre or doorway point) to `spinePoint`. */
  points: XY[];
  spinePoint: XY;
  segment: number;
  perpendicular: boolean;
};
export type SpineResult = {
  segments: SpineSegment[];
  links: SpineLink[];
  unconnected: { kind: "gate" | "doorway"; id: string; surface: number }[];
  /** Surfaces of at least `minReportArea` that no gate or doorway reaches. */
  unreached: number[];
  stats: {
    straightCrossings: number;
    spokeAreas: number;
    straightRuns: number;
  };
};
export const HALLWAY_SPINE_DEFAULTS = {
  spacing: 0.75,
  spurFactor: 1.6,
  axisDeviation: 1.25,
  clearShare: 0.55,
  clearMax: 1.6,
  clearMin: 0.45,
  linkClearance: 0.35,
  crossingClearance: 0.3,
  compactAxisFactor: 3,
  minReportArea: 40,
};
export type HallwaySpineOptions = typeof HALLWAY_SPINE_DEFAULTS;

const dist = (a: XY, b: XY) => {
  const dx = a[0] - b[0],
    dy = a[1] - b[1];
  return Math.hypot(dx, dy);
};
function project(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l2 = dx * dx + dy * dy;
  const t =
    l2 > 0
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
      : 0;
  return { t, q: [a[0] + t * dx, a[1] + t * dy] as XY };
}
const segmentDistance = (p: XY, a: XY, b: XY) => dist(p, project(p, a, b).q);
export function ringArea(ring: readonly XY[]) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length];
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(sum / 2);
}
export const surfaceArea = (rings: Rings) =>
  ringArea(rings[0]) -
  rings.slice(1).reduce((total, hole) => total + ringArea(hole), 0);

/** Bucketed edges for point-in-surface and wall-clearance queries. */
export function indexSurface(rings: Rings) {
  const cell = 3,
    edges: [XY, XY][] = [];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      if (dist(a, b) > 1e-9) edges.push([a, b]);
    }
  const grid = new Map<string, [XY, XY][]>(),
    rows = new Map<number, [XY, XY][]>();
  const push = <K>(map: Map<K, [XY, XY][]>, key: K, edge: [XY, XY]) => {
    const list = map.get(key);
    if (list) list.push(edge);
    else map.set(key, [edge]);
  };
  for (const edge of edges) {
    const [a, b] = edge;
    const x0 = Math.floor(Math.min(a[0], b[0]) / cell),
      x1 = Math.floor(Math.max(a[0], b[0]) / cell),
      y0 = Math.floor(Math.min(a[1], b[1]) / cell),
      y1 = Math.floor(Math.max(a[1], b[1]) / cell);
    for (let y = y0; y <= y1; y++) {
      push(rows, y, edge);
      for (let x = x0; x <= x1; x++) push(grid, `${x},${y}`, edge);
    }
  }
  const inside = (p: XY) => {
    let odd = false;
    for (const [a, b] of rows.get(Math.floor(p[1] / cell)) ?? [])
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        odd = !odd;
    return odd;
  };
  /** True when every wall edge is at least `clearance` away. */
  const clear = (p: XY, clearance: number) => {
    const x0 = Math.floor((p[0] - clearance) / cell),
      x1 = Math.floor((p[0] + clearance) / cell),
      y0 = Math.floor((p[1] - clearance) / cell),
      y1 = Math.floor((p[1] + clearance) / cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (const [a, b] of grid.get(`${x},${y}`) ?? [])
          if (segmentDistance(p, a, b) < clearance) return false;
    return true;
  };
  const distanceToEdge = (p: XY) => {
    let best = Infinity;
    for (const [a, b] of edges) best = Math.min(best, segmentDistance(p, a, b));
    return best;
  };
  return { inside, clear, distanceToEdge };
}
export type SurfaceIndex = ReturnType<typeof indexSurface>;

/** The segment stays inside with `clearance`, except within `freeA`/`freeB`
 * of its ends, where a doorway itself governs. */
export function clearSegment(
  surface: SurfaceIndex,
  a: XY,
  b: XY,
  clearance: number,
  freeA = 0,
  freeB = 0,
) {
  const length = dist(a, b),
    steps = Math.max(1, Math.ceil(length / 0.4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      along = t * length;
    if (along < freeA || length - along < freeB) continue;
    const p: XY = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (!surface.inside(p) || !surface.clear(p, clearance)) return false;
  }
  return true;
}

type AxisGraph = {
  vertices: XY[];
  radius: number[];
  adjacency: Map<number, Set<number>>;
};
function medialAxis(
  rings: Rings,
  surface: SurfaceIndex,
  options: HallwaySpineOptions,
): AxisGraph {
  const points: XY[] = [],
    ringOf: number[] = [],
    indexOf: number[] = [],
    ringLength: number[] = [];
  rings.forEach((ring, r) => {
    let count = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        n = Math.max(1, Math.ceil(dist(a, b) / options.spacing));
      for (let k = 0; k < n; k++) {
        points.push([
          a[0] + ((b[0] - a[0]) * k) / n,
          a[1] + ((b[1] - a[1]) * k) / n,
        ]);
        ringOf.push(r);
        indexOf.push(count++);
      }
    }
    ringLength.push(count);
  });
  const graph: AxisGraph = { vertices: [], radius: [], adjacency: new Map() };
  if (points.length < 3) return graph;
  const delaunay = Delaunator.from(points),
    triangles = delaunay.triangles,
    halfedges = delaunay.halfedges;
  const centre: (XY | null)[] = [],
    radius: number[] = [];
  for (let t = 0; t < triangles.length / 3; t++) {
    const a = points[triangles[3 * t]],
      b = points[triangles[3 * t + 1]],
      c = points[triangles[3 * t + 2]];
    const d =
      2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-12) {
      centre.push(null);
      radius.push(0);
      continue;
    }
    const a2 = a[0] * a[0] + a[1] * a[1],
      b2 = b[0] * b[0] + b[1] * b[1],
      c2 = c[0] * c[0] + c[1] * c[1];
    const u: XY = [
      (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d,
      (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d,
    ];
    centre.push(surface.inside(u) ? u : null);
    radius.push(dist(u, a));
  }
  const ids = new Map<string, number>();
  const vertex = (t: number) => {
    const u = centre[t]!,
      key = `${Math.round(u[0] * 200)},${Math.round(u[1] * 200)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = graph.vertices.length;
      ids.set(key, id);
      graph.vertices.push(u);
      graph.radius.push(radius[t]);
    }
    return id;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!graph.adjacency.has(a)) graph.adjacency.set(a, new Set());
    if (!graph.adjacency.has(b)) graph.adjacency.set(b, new Set());
    graph.adjacency.get(a)!.add(b);
    graph.adjacency.get(b)!.add(a);
  };
  for (const [e, o] of halfedges.entries()) {
    if (o < e) continue;
    const t1 = Math.floor(e / 3),
      t2 = Math.floor(o / 3);
    if (!centre[t1] || !centre[t2]) continue;
    const pa = triangles[e],
      pb = triangles[e % 3 === 2 ? e - 2 : e + 1];
    if (ringOf[pa] === ringOf[pb]) {
      const n = ringLength[ringOf[pa]],
        gap = Math.abs(indexOf[pa] - indexOf[pb]);
      // Neighbouring points on one wall: a Voronoi edge running into that wall.
      if (Math.min(gap, n - gap) <= 2) continue;
    }
    link(vertex(t1), vertex(t2));
  }
  bridgeGaps(graph, surface);
  return graph;
}
/** Close breaks in the sampled axis. Near short wall stubs and small holes the
 * Voronoi edges that carry the centreline can all be filtered, leaving a loose
 * end a step short of the rest; join each loose end to the nearest vertex of
 * another piece when the gap is short and clear. */
function bridgeGaps(graph: AxisGraph, surface: SurfaceIndex) {
  const adj = graph.adjacency,
    ids = [...adj.keys()];
  const piece = new Map<number, number>();
  const root = (v: number): number => {
    let r = v;
    while (piece.get(r) !== r) r = piece.get(r)!;
    piece.set(v, r);
    return r;
  };
  for (const v of ids) piece.set(v, v);
  for (const v of ids) for (const w of adj.get(v)!) piece.set(root(v), root(w));
  const size = 3,
    grid = new Map<string, number[]>();
  const cellOf = (p: XY) => [Math.floor(p[0] / size), Math.floor(p[1] / size)];
  for (const v of ids) {
    const [gx, gy] = cellOf(graph.vertices[v]),
      k = `${gx},${gy}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(v);
  }
  const candidates: [number, number, number][] = [];
  for (const v of ids) {
    if (adj.get(v)!.size > 1) continue;
    const p = graph.vertices[v],
      reach = Math.min(size, Math.max(1.5, 1.5 * graph.radius[v])),
      [gx, gy] = cellOf(p);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const w of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const d = dist(p, graph.vertices[w]);
          if (d <= reach && root(v) !== root(w)) candidates.push([d, v, w]);
        }
  }
  candidates.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  for (const [, v, w] of candidates) {
    if (root(v) === root(w)) continue;
    const clearance = Math.min(
      0.25,
      0.5 * Math.min(graph.radius[v], graph.radius[w]),
    );
    if (!clearSegment(surface, graph.vertices[v], graph.vertices[w], clearance))
      continue;
    adj.get(v)!.add(w);
    adj.get(w)!.add(v);
    piece.set(root(v), root(w));
  }
}
/** Trim tapering ends: a dead end's axis forks into its corners, where the
 * distance to the walls falls away. A real centreline keeps its width. */
function trimTapers(graph: AxisGraph) {
  const adj = graph.adjacency;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [v, neighbours] of adj) {
      if (!adj.has(v) || neighbours.size !== 1) continue;
      const w = [...neighbours][0],
        step = dist(graph.vertices[v], graph.vertices[w]),
        rise = graph.radius[w] - graph.radius[v];
      // Coincident vertices, or a branch whose clearance grows like a corner
      // diagonal (about 0.7 ft per ft) rather than staying flat on a centreline.
      const tapering =
        step < 0.05 ||
        graph.radius[v] < 0.92 * graph.radius[w] ||
        rise > 0.3 * step;
      if (tapering && (adj.get(w)?.size ?? 0) > 1) {
        adj.get(w)!.delete(v);
        adj.delete(v);
        changed = true;
      }
    }
  }
}
function prune(graph: AxisGraph, options: HallwaySpineOptions) {
  const adj = graph.adjacency;
  for (let round = 0; round < 8; round++) {
    let removed = 0;
    for (const [v, neighbours] of adj) {
      if (!adj.has(v) || neighbours.size !== 1) continue;
      const chain = [v];
      let previous = v,
        current = [...neighbours][0],
        length = dist(graph.vertices[v], graph.vertices[current]);
      while (adj.get(current)?.size === 2) {
        const next = [...adj.get(current)!].find((x) => x !== previous)!;
        chain.push(current);
        length += dist(graph.vertices[current], graph.vertices[next]);
        previous = current;
        current = next;
      }
      if ((adj.get(current)?.size ?? 0) < 3) continue;
      if (length < options.spurFactor * graph.radius[current] + 0.5) {
        for (const x of chain) {
          for (const y of adj.get(x)!) adj.get(y)?.delete(x);
          adj.delete(x);
        }
        removed++;
      }
    }
    if (!removed) break;
  }
}
function chains(graph: AxisGraph) {
  const adj = graph.adjacency,
    out: number[][] = [],
    seen = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const walk = (start: number, first: number) => {
    const chain = [start];
    let previous = start,
      current = first;
    seen.add(key(start, first));
    while (adj.get(current)!.size === 2 && current !== start) {
      const next = [...adj.get(current)!].find((x) => x !== previous)!;
      chain.push(current);
      seen.add(key(current, next));
      previous = current;
      current = next;
    }
    chain.push(current);
    return chain;
  };
  for (const [v, neighbours] of adj)
    if (neighbours.size !== 2)
      for (const w of neighbours)
        if (!seen.has(key(v, w))) out.push(walk(v, w));
  for (const [v, neighbours] of adj)
    if (
      neighbours.size === 2 &&
      ![...neighbours].some((w) => seen.has(key(v, w)))
    )
      out.push(walk(v, [...neighbours][0]));
  return out;
}
function straighten(
  chain: number[],
  graph: AxisGraph,
  surface: SurfaceIndex,
  options: HallwaySpineOptions,
) {
  const points = chain.map((v) => graph.vertices[v]),
    radius = chain.map((v) => graph.radius[v]);
  const kept = [0];
  let i = 0;
  while (i < points.length - 1) {
    let best = i + 1;
    for (let j = points.length - 1; j > i + 1; j--) {
      let near = true,
        narrowest = Math.min(radius[i], radius[j]);
      for (let k = i + 1; k < j; k++) {
        if (
          segmentDistance(points[k], points[i], points[j]) >
          options.axisDeviation
        ) {
          near = false;
          break;
        }
        narrowest = Math.min(narrowest, radius[k]);
      }
      if (!near) continue;
      const clearance = Math.max(
        options.clearMin,
        Math.min(options.clearMax, options.clearShare * narrowest),
      );
      if (clearSegment(surface, points[i], points[j], clearance)) {
        best = j;
        break;
      }
    }
    kept.push(best);
    i = best;
  }
  return kept.map((k) => points[k]);
}

/** Two entrances: one straight line. More: straight spokes from their centre. */
function straightCrossing(
  entrances: XY[],
  surface: SurfaceIndex,
  options: HallwaySpineOptions,
  free: number,
): [XY, XY][] | null {
  const unique = entrances.filter(
    (p, i) => entrances.findIndex((q) => dist(p, q) < 0.5) === i,
  );
  if (unique.length < 2) return null;
  if (unique.length === 2)
    return clearSegment(
      surface,
      unique[0],
      unique[1],
      options.crossingClearance,
      free,
      free,
    )
      ? [[unique[0], unique[1]]]
      : null;
  const hub: XY = [
    unique.reduce((t, p) => t + p[0], 0) / unique.length,
    unique.reduce((t, p) => t + p[1], 0) / unique.length,
  ];
  if (
    !surface.inside(hub) ||
    !unique.every((p) =>
      clearSegment(surface, hub, p, options.crossingClearance, 0, free),
    )
  )
    return null;
  return unique.map((p) => [hub, p]);
}

export function hallwaySpines(
  surfaces: readonly SpineSurface[],
  gates: readonly SpineGate[],
  doorways: readonly SpineDoorway[],
  overrides: Partial<HallwaySpineOptions> = {},
): SpineResult {
  const options = { ...HALLWAY_SPINE_DEFAULTS, ...overrides };
  const index = surfaces.map((s) => indexSurface(s.rings));
  const perSurface: [XY, XY][][] = surfaces.map(() => []);
  const stats = { straightCrossings: 0, spokeAreas: 0, straightRuns: 0 };
  const unreached: number[] = [];
  const entrancesOf = surfaces.map(() => [] as XY[]);
  for (const g of gates) for (const s of g.sides) entrancesOf[s].push(g.center);
  for (const d of doorways) entrancesOf[d.surface].push(d.point);
  const gateFree = Math.max(1.2, ...gates.map((g) => g.halfDepth + 0.6));

  surfaces.forEach((s, i) => {
    const entrances = entrancesOf[i];
    if (entrances.length === 0) {
      if (surfaceArea(s.rings) >= options.minReportArea) unreached.push(i);
      return;
    }
    // A crossing is drawn between its gates; doorways then join that line.
    const gateCentres = gates
      .filter((g) => g.sides.includes(i))
      .map((g) => g.center);
    if (s.crossing && gateCentres.length >= 2) {
      const lines = straightCrossing(gateCentres, index[i], options, gateFree);
      if (lines) {
        perSurface[i] = lines;
        stats.straightCrossings++;
        return;
      }
    }
    const graph = medialAxis(s.rings, index[i], options);
    if (graph.adjacency.size === 0) return;
    trimTapers(graph);
    prune(graph, options);
    let widest = 0,
      hub = -1,
      axisLength = 0;
    for (const [v, neighbours] of graph.adjacency) {
      if (graph.radius[v] > widest) {
        widest = graph.radius[v];
        hub = v;
      }
      for (const w of neighbours)
        if (w > v) axisLength += dist(graph.vertices[v], graph.vertices[w]);
    }
    if (hub >= 0 && axisLength < options.compactAxisFactor * widest) {
      const centre = graph.vertices[hub];
      if (
        entrances.every((p) =>
          clearSegment(
            index[i],
            centre,
            p,
            options.crossingClearance,
            0,
            gateFree,
          ),
        )
      ) {
        perSurface[i] = entrances.map((p) => [centre, p]);
        stats.spokeAreas++;
        return;
      }
    }
    for (const chain of chains(graph)) {
      const run = straighten(chain, graph, index[i], options);
      for (let k = 1; k < run.length; k++) {
        perSurface[i].push([run[k - 1], run[k]]);
        stats.straightRuns++;
      }
    }
  });

  const links: SpineLink[] = [],
    unconnected: SpineResult["unconnected"] = [],
    movedEnds = new Set<string>();
  const attach = (surface: number, from: XY, free: number) => {
    const candidates = perSurface[surface]
      .map(([a, b], segment) => ({ segment, ...project(from, a, b) }))
      .map((c) => ({ ...c, d: dist(from, c.q) }))
      .sort((m, n) => m.d - n.d)
      .slice(0, 8);
    for (const c of candidates)
      if (
        c.d < 1e-9 ||
        clearSegment(index[surface], from, c.q, options.linkClearance, free, 0)
      )
        return {
          segment: c.segment,
          q: c.q,
          perpendicular: c.t > 0.001 && c.t < 0.999,
        };
    return null;
  };
  for (const g of gates)
    g.sides.forEach((surface, side) => {
      const segs = perSurface[surface],
        sign = side === 0 ? 1 : -1;
      const touching = segs.findIndex(
        ([a, b]) => dist(a, g.center) < 0.05 || dist(b, g.center) < 0.05,
      );
      if (touching !== -1) {
        links.push({
          kind: "gate",
          id: g.id,
          surface,
          points: [g.center],
          spinePoint: g.center,
          segment: touching,
          perpendicular: false,
        });
        return;
      }
      for (const out of [
        g.halfDepth + 1.2,
        g.halfDepth + 2.5,
        g.halfDepth + 0.6,
      ]) {
        const entry: XY = [
          g.center[0] + g.normal[0] * sign * out,
          g.center[1] + g.normal[1] * sign * out,
        ];
        if (
          !index[surface].inside(entry) ||
          !clearSegment(
            index[surface],
            g.center,
            entry,
            0.25,
            g.halfDepth + 0.3,
            0,
          )
        )
          continue;
        // Meet a nearby free spine end straight on by moving that end to the entry.
        const end = segs
          .flatMap(([a, b], segment) => [
            { segment, at: 0 as const, q: a },
            { segment, at: 1 as const, q: b },
          ])
          .filter(
            (x) =>
              !movedEnds.has(`${surface}:${x.segment}:${x.at}`) &&
              dist(x.q, entry) < 6 &&
              segs.filter(
                ([a, b]) => dist(a, x.q) < 1e-9 || dist(b, x.q) < 1e-9,
              ).length === 1,
          )
          .sort((m, n) => dist(m.q, entry) - dist(n.q, entry))[0];
        if (end) {
          const other = segs[end.segment][end.at === 0 ? 1 : 0];
          if (
            clearSegment(index[surface], other, entry, options.linkClearance)
          ) {
            segs[end.segment][end.at] = entry;
            movedEnds.add(`${surface}:${end.segment}:${end.at}`);
            links.push({
              kind: "gate",
              id: g.id,
              surface,
              points: [g.center, entry],
              spinePoint: entry,
              segment: end.segment,
              perpendicular: true,
            });
            return;
          }
        }
        const hit = segs.length > 0 ? attach(surface, entry, 0) : null;
        if (hit) {
          links.push({
            kind: "gate",
            id: g.id,
            surface,
            points: [g.center, entry, hit.q],
            spinePoint: hit.q,
            segment: hit.segment,
            perpendicular: hit.perpendicular,
          });
          return;
        }
      }
      unconnected.push({ kind: "gate", id: g.id, surface });
    });
  for (const d of doorways) {
    const hit =
      perSurface[d.surface].length > 0 ? attach(d.surface, d.point, 1.2) : null;
    if (hit)
      links.push({
        kind: "doorway",
        id: d.id,
        surface: d.surface,
        points: [d.point, hit.q],
        spinePoint: hit.q,
        segment: hit.segment,
        perpendicular: hit.perpendicular,
      });
    else unconnected.push({ kind: "doorway", id: d.id, surface: d.surface });
  }
  // Segment indices are per surface; flatten with a stable offset.
  const offsets: number[] = [];
  let total = 0;
  for (const segs of perSurface) {
    offsets.push(total);
    total += segs.length;
  }
  for (const l of links) l.segment += offsets[l.surface];
  const segments = perSurface.flatMap((segs, surface) =>
    segs.map(([a, b]) => ({ surface, a, b })),
  );
  return { segments, links, unconnected, unreached, stats };
}
