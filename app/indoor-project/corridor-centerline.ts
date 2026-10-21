import Delaunator from "delaunator";
import * as DMath from "./deterministic-math";
import { createRingPointQuery } from "./ring-point-query";
import { MAX_SHARED_CORRIDOR_APPROACH_FEET } from "./shared-corridor-guides";
import { proposeStraightCorridorAxis } from "./corridor-straight-axis";

export type CorridorXY = [number, number];
export type CorridorCenterlineTerminal = {
  id: string;
  point: CorridorXY;
  /** Original doorway normal, oriented from the threshold into this owner. */
  approachDirection?: CorridorXY;
};
export type CorridorCenterlineRoute = {
  points: CorridorXY[];
  /** Indices of the hallway joins; original doorway branches stay in points. */
  hallwayJoins: [number, number];
};

/** A sampled boundary Voronoi graph proposes shared corridor lanes. Neither
 * triangulation nor numerical containment supplies physical authority. Every
 * used core segment and each original terminal approach must pass the caller's
 * continuous clearance predicate; failures leave the existing solver available.
 * Auxiliary vertices never replace or identify original source graph nodes.
 */
export function createCorridorCenterline(
  rings: CorridorXY[][],
  terminals: readonly CorridorCenterlineTerminal[],
  supported: (path: CorridorXY[], terminalId?: string) => boolean,
  options: {
    spacingFeet?: number;
    maxSites?: number;
    maxAttachments?: number;
  } = {},
) {
  const spacing = options.spacingFeet ?? 2;
  const maxSites = options.maxSites ?? 25_000;
  if (!Number.isFinite(spacing) || spacing <= 0 || maxSites < 4)
    throw new Error("Invalid corridor sampling budget");
  const sites: CorridorXY[] = [];
  const unique = new Set<string>();
  const add = (p: CorridorXY) => {
    if (!p.every(Number.isFinite))
      throw new Error("Invalid corridor coordinate");
    const key = `${p[0]},${p[1]}`;
    if (!unique.has(key)) {
      unique.add(key);
      sites.push(p);
    }
  };
  let exceeded = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const count = Math.max(
        1,
        Math.ceil(DMath.hypot(b[0] - a[0], b[1] - a[1]) / spacing),
      );
      if (sites.length + count > maxSites) {
        exceeded = true;
        break;
      }
      for (let j = 0; j < count; j++)
        add([
          a[0] + ((b[0] - a[0]) * j) / count,
          a[1] + ((b[1] - a[1]) * j) / count,
        ]);
    }
    if (exceeded) break;
  }
  const vertices: CorridorXY[] = [];
  const coreEdges: [number, number][] = [];
  const coreChecks = new Map<number, boolean>();
  const joins = new Map<string, { vertex: number; approach: CorridorXY[] }>();
  const missing: string[] = [];
  const segments = new Map<number, { fraction: number; vertex: number }[]>();
  const queries = rings.map(createRingPointQuery);
  const contains = (p: CorridorXY) =>
    !!queries[0]?.(p) && !queries.slice(1).some((q) => q(p));
  if (!exceeded && sites.length >= 4) {
    const triangulation = Delaunator.from(sites);
    const triangleVertex = new Int32Array(
      triangulation.triangles.length / 3,
    ).fill(-1);
    for (let i = 0; i < triangulation.triangles.length; i += 3) {
      const a = sites[triangulation.triangles[i]],
        b = sites[triangulation.triangles[i + 1]],
        c = sites[triangulation.triangles[i + 2]];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        ex = c[0] - a[0],
        ey = c[1] - a[1];
      const denominator = 2 * (dx * ey - dy * ex);
      if (denominator === 0) continue;
      const db = dx * dx + dy * dy,
        dc = ex * ex + ey * ey;
      const p: CorridorXY = [
        a[0] + (ey * db - dy * dc) / denominator,
        a[1] + (dx * dc - ex * db) / denominator,
      ];
      if (!p.every(Number.isFinite) || !contains(p)) continue;
      triangleVertex[i / 3] = vertices.length;
      vertices.push(p);
    }
    for (let i = 0; i < triangulation.halfedges.length; i++) {
      const other = triangulation.halfedges[i];
      if (other < i) continue;
      const a = triangleVertex[Math.floor(i / 3)],
        b = triangleVertex[Math.floor(other / 3)];
      if (a < 0 || b < 0 || a === b) continue;
      if (
        contains([
          (vertices[a][0] + vertices[b][0]) / 2,
          (vertices[a][1] + vertices[b][1]) / 2,
        ])
      )
        coreEdges.push([a, b]);
    }
  }
  const coreSupported = (index: number) => {
    const saved = coreChecks.get(index);
    if (saved !== undefined) return saved;
    const [a, b] = coreEdges[index];
    const valid = supported([vertices[a], vertices[b]]);
    coreChecks.set(index, valid);
    return valid;
  };
  const terminalIds = new Set<string>();
  for (const terminal of terminals) {
    if (terminalIds.has(terminal.id))
      throw new Error("Duplicate corridor terminal");
    terminalIds.add(terminal.id);
    const candidates = coreEdges
      .flatMap(([a, b], edge) => {
        const first = vertices[a],
          last = vertices[b];
        const dx = last[0] - first[0],
          dy = last[1] - first[1],
          squared = dx * dx + dy * dy;
        if (squared === 0) return [];
        const fraction = Math.max(
          0,
          Math.min(
            1,
            ((terminal.point[0] - first[0]) * dx +
              (terminal.point[1] - first[1]) * dy) /
              squared,
          ),
        );
        const p: CorridorXY = [
          first[0] + fraction * dx,
          first[1] + fraction * dy,
        ];
        return [
          {
            edge,
            fraction,
            point: p,
            distance: DMath.hypot(
              p[0] - terminal.point[0],
              p[1] - terminal.point[1],
            ),
          },
        ];
      })
      .sort((a, b) => a.distance - b.distance || a.edge - b.edge)
      .slice(0, options.maxAttachments ?? 64);
    let attached = false;
    for (const candidate of candidates) {
      if (candidate.distance > MAX_SHARED_CORRIDOR_APPROACH_FEET) continue;
      if (!coreSupported(candidate.edge)) continue;
      const approaches: CorridorXY[][] = [[terminal.point, candidate.point]];
      if (terminal.approachDirection) {
        const [nx, ny] = terminal.approachDirection;
        const magnitude = DMath.hypot(nx, ny);
        if (magnitude > 0)
          for (const distance of [0.5, 1, 2, 3])
            approaches.push([
              terminal.point,
              [
                terminal.point[0] + (nx / magnitude) * distance,
                terminal.point[1] + (ny / magnitude) * distance,
              ],
              candidate.point,
            ]);
      }
      const approach = approaches.find((p) => supported(p, terminal.id));
      if (!approach) continue;
      const vertex = vertices.length;
      vertices.push(candidate.point);
      joins.set(terminal.id, { vertex, approach: approach.map((p) => [...p]) });
      const list = segments.get(candidate.edge) ?? [];
      list.push({ fraction: candidate.fraction, vertex });
      segments.set(candidate.edge, list);
      attached = true;
      break;
    }
    if (!attached) missing.push(terminal.id);
  }
  const adjacency: { to: number; edge: number; length: number }[][] =
    vertices.map(() => []);
  const connect = (a: number, b: number, edge: number) => {
    const length = DMath.hypot(
      vertices[b][0] - vertices[a][0],
      vertices[b][1] - vertices[a][1],
    );
    adjacency[a].push({ to: b, edge, length });
    adjacency[b].push({ to: a, edge, length });
  };
  coreEdges.forEach(([a, b], edge) => {
    const ordered = [
      { fraction: 0, vertex: a },
      ...(segments.get(edge) ?? []),
      { fraction: 1, vertex: b },
    ].sort((x, y) => x.fraction - y.fraction || x.vertex - y.vertex);
    for (let i = 1; i < ordered.length; i++)
      connect(ordered[i - 1].vertex, ordered[i].vertex, edge);
  });
  // Remove only auxiliary dead ends with no original terminal. A loop or a
  // path between attached terminals survives, even before its lazy exact check.
  const protectedVertices = new Set(
    [...joins.values()].map((join) => join.vertex),
  );
  const degree = adjacency.map((links) => links.length);
  const removed = new Uint8Array(vertices.length);
  const leaves = degree.flatMap((d, i) =>
    d <= 1 && !protectedVertices.has(i) ? [i] : [],
  );
  for (let i = 0; i < leaves.length; i++) {
    const v = leaves[i];
    if (removed[v]) continue;
    removed[v] = 1;
    for (const link of adjacency[v])
      if (
        !removed[link.to] &&
        --degree[link.to] <= 1 &&
        !protectedVertices.has(link.to)
      )
        leaves.push(link.to);
  }
  const anchors = new Set(
    degree.flatMap((d, i) =>
      !removed[i] && (d !== 2 || protectedVertices.has(i)) ? [i] : [],
    ),
  );
  type Chain = {
    from: number;
    to: number;
    raw: CorridorXY[];
    checked: boolean;
    points?: CorridorXY[] | null;
    length?: number;
  };
  const chains: Chain[] = [];
  const sharedAdjacency: { to: number; chain: number }[][] = vertices.map(
    () => [],
  );
  const seen = new Set<string>();
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const a of anchors)
    for (const first of adjacency[a]) {
      if (removed[first.to] || seen.has(pairKey(a, first.to))) continue;
      let previous = a,
        current = first.to;
      const raw = [vertices[a], vertices[current]];
      seen.add(pairKey(previous, current));
      while (!anchors.has(current)) {
        const next = adjacency[current].find(
          (link) => !removed[link.to] && link.to !== previous,
        );
        if (!next) break;
        previous = current;
        current = next.to;
        if (seen.has(pairKey(previous, current))) break;
        seen.add(pairKey(previous, current));
        raw.push(vertices[current]);
      }
      const chain = chains.length;
      chains.push({ from: a, to: current, raw, checked: false });
      sharedAdjacency[a].push({ to: current, chain });
      sharedAdjacency[current].push({ to: a, chain });
    }
  // Fit the SAME shared chain once for every journey using it. Straightening
  // stays within 0.15 feet of its boundary-Voronoi proposal and must pass the
  // exact strip predicate; true bends, islands and narrow obstacles remain.
  const fit = (raw: CorridorXY[]): CorridorXY[] | null => {
    const points = raw.filter(
      (p, i) => !i || p[0] !== raw[i - 1][0] || p[1] !== raw[i - 1][1],
    );
    const a = points[0],
      b = points.at(-1)!;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      squared = dx * dx + dy * dy;
    let maximum = 0,
      split = Math.floor(points.length / 2);
    for (let i = 1; i < points.length - 1; i++) {
      const t =
        squared > 0
          ? Math.max(
              0,
              Math.min(
                1,
                ((points[i][0] - a[0]) * dx + (points[i][1] - a[1]) * dy) /
                  squared,
              ),
            )
          : 0;
      const ex = points[i][0] - a[0] - t * dx,
        ey = points[i][1] - a[1] - t * dy,
        error = ex * ex + ey * ey;
      if (error > maximum) {
        maximum = error;
        split = i;
      }
    }
    if (maximum <= 0.15 * 0.15 && supported([a, b])) return [a, b];
    if (points.length <= 2) return null;
    const left = fit(points.slice(0, split + 1)),
      right = fit(points.slice(split));
    return left && right ? [...left, ...right.slice(1)] : null;
  };
  const geometry = (index: number) => {
    const chain = chains[index];
    if (!chain.checked) {
      chain.points = fit(chain.raw);
      chain.checked = true;
      chain.length = chain.points
        ?.slice(1)
        .reduce(
          (sum, p, i) =>
            sum +
            DMath.hypot(p[0] - chain.points![i][0], p[1] - chain.points![i][1]),
          0,
        );
    }
    return chain.points;
  };
  const straightAxis = exceeded ? null : proposeStraightCorridorAxis(rings);
  const straightApproaches = new Map<string, CorridorXY[]>();
  if (straightAxis)
    for (const terminal of terminals) {
      const point = straightAxis.project(terminal.point);
      if (
        DMath.hypot(
          point[0] - terminal.point[0],
          point[1] - terminal.point[1],
        ) > MAX_SHARED_CORRIDOR_APPROACH_FEET
      )
        continue;
      const candidates: CorridorXY[][] = [[terminal.point, point]];
      if (terminal.approachDirection) {
        const [nx, ny] = terminal.approachDirection,
          magnitude = DMath.hypot(nx, ny);
        if (magnitude > 0)
          for (const distance of [0.5, 1, 2, 3])
            candidates.push([
              terminal.point,
              [
                terminal.point[0] + (nx / magnitude) * distance,
                terminal.point[1] + (ny / magnitude) * distance,
              ],
              point,
            ]);
      }
      const approach = candidates.find((p) => supported(p, terminal.id));
      if (approach) straightApproaches.set(terminal.id, approach);
    }
  const compose = (
    start: CorridorXY[],
    core: CorridorXY[],
    end: CorridorXY[],
  ): CorridorCenterlineRoute => {
    const points: CorridorXY[] = [];
    const append = (p: CorridorXY) => {
      if (points.length === 0 || p.some((v, k) => v !== points.at(-1)![k]))
        points.push(p);
    };
    start.forEach(append);
    const first = points.length - 1;
    core.forEach(append);
    const last = points.length - 1;
    end.toReversed().forEach(append);
    return { points, hallwayJoins: [first, last] };
  };
  function routeDetails(
    from: string,
    to: string,
  ): CorridorCenterlineRoute | null {
    const straightStart = straightApproaches.get(from),
      straightEnd = straightApproaches.get(to);
    if (
      straightStart &&
      straightEnd &&
      supported([straightStart.at(-1)!, straightEnd.at(-1)!])
    )
      return compose(
        straightStart,
        [straightStart.at(-1)!, straightEnd.at(-1)!],
        straightEnd,
      );
    const start = joins.get(from),
      end = joins.get(to);
    if (!start || !end) return null;
    const distances = new Float64Array(vertices.length).fill(Infinity);
    const previous = new Int32Array(vertices.length).fill(-1);
    const previousChain = new Int32Array(vertices.length).fill(-1);
    const heap: { vertex: number; distance: number; rank: number }[] = [];
    const heuristic = (v: number) =>
      DMath.hypot(
        vertices[v][0] - vertices[end.vertex][0],
        vertices[v][1] - vertices[end.vertex][1],
      );
    const push = (vertex: number, distance: number) => {
      const item = { vertex, distance, rank: distance + heuristic(vertex) };
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].rank <= item.rank) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const first = heap[0],
        last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const left = i * 2 + 1,
            right = left + 1;
          let next = i;
          if (left < heap.length && heap[left].rank < heap[next].rank)
            next = left;
          if (right < heap.length && heap[right].rank < heap[next].rank)
            next = right;
          if (next === i) break;
          [heap[next], heap[i]] = [heap[i], heap[next]];
          i = next;
        }
      }
      return first;
    };
    distances[start.vertex] = 0;
    push(start.vertex, 0);
    let expanded = 0;
    while (heap.length > 0 && expanded++ < 100_000) {
      const current = pop();
      if (current.distance !== distances[current.vertex]) continue;
      if (current.vertex === end.vertex) break;
      for (const link of sharedAdjacency[current.vertex]) {
        if (!geometry(link.chain)) continue;
        const distance = current.distance + chains[link.chain].length!;
        if (distance >= distances[link.to]) continue;
        distances[link.to] = distance;
        previous[link.to] = current.vertex;
        previousChain[link.to] = link.chain;
        push(link.to, distance);
      }
    }
    if (!Number.isFinite(distances[end.vertex])) return null;
    const backwards: CorridorXY[][] = [];
    for (let v = end.vertex; previous[v] !== -1; v = previous[v]) {
      const chain = chains[previousChain[v]],
        points = chain.points!;
      backwards.push(chain.from === previous[v] ? points : points.toReversed());
    }
    return compose(
      start.approach,
      backwards.reverse().flatMap((path) => path.slice(1)),
      end.approach,
    );
  }
  return {
    vertices,
    coreEdges,
    joins,
    missing,
    route: (from: string, to: string) => routeDetails(from, to)?.points ?? null,
    routeDetails,
    statistics: () => ({
      sites: sites.length,
      budgetExceeded: exceeded,
      proposedVertices: vertices.length,
      proposedCoreEdges: coreEdges.length,
      sharedChains: chains.length,
      fittedChains: chains.filter((c) => c.checked && c.points).length,
      checkedCoreEdges: coreChecks.size,
      supportedCoreEdges: [...coreChecks.values()].filter(Boolean).length,
      attachedTerminals: joins.size,
      missingTerminals: missing.length,
      straightAxisProposed: !!straightAxis,
      straightAxisTerminals: straightApproaches.size,
    }),
  };
}
