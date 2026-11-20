import * as DMath from "./deterministic-math";
import type { CorridorXY } from "./corridor-centerline";
import { corridorChainTopologyContacts } from "./corridor-chain-fit";
import {
  corridorSegmentProjection,
  type CorridorApproachProposal,
} from "./corridor-terminal-approach";

/** Drawing thresholds of the straight-run pass. They only choose which
 * proposals are made; every proposal still needs the caller's exact support
 * and the complete-network topology check. */
export const CORRIDOR_RUN_FIT = Object.freeze({
  /** A run continues through a vertex whose straightest pair of lanes
   * deflects by less than this. Larger deflections are genuine corners. */
  passThroughDegrees: 30,
  /** Lane heading at a vertex: towards the point this far along the lane. */
  directionFeet: 4,
  /** A dead-end lane no longer than this whose end only receives door
   * branches is a destination branch: it never splits or ends a run. */
  spurFeet: 12,
  minRunFeet: 6,
  /** Cross sections every `sampleFeet`, none within `endClearanceFeet` of a
   * run end, and none wider than `maxSectionFeet` on either side. */
  sampleFeet: 2,
  endClearanceFeet: 2,
  maxSectionFeet: 20,
  /** A straight piece is proposed only if every retained cross-section
   * midpoint lies within this of it, and every current lane vertex within
   * `rawToleranceFeet`. Otherwise the piece is split (few-segment fit). */
  midpointToleranceFeet: 1,
  rawToleranceFeet: 2.5,
  minPieceFeet: 8,
  /** Up to 2^maxDepth straight pieces per run section. */
  maxDepth: 3,
  /** No junction or run end moves further than this. */
  maxShiftFeet: 3,
  /** A run is kept if it lengthens a required route by more than this. */
  detourRatio: 1.15,
  detourFeet: 3,
  /** A branch meeting a run within this of 90 degrees is perpendicular. */
  perpendicularDegrees: 10,
});

export type CorridorRunChain = {
  from: number;
  to: number;
  points: CorridorXY[];
};
export type CorridorRunJoin = { vertex: number; approach: CorridorXY[] };
export type CorridorRunTerminal = {
  id: string;
  point: CorridorXY;
  approachDirection?: CorridorXY;
};
/** A complete checked guide retained outside this primary network. Its core
 * and original terminal approaches constrain proposals; it supplies no new
 * graph junction or physical/access authority. */
export type CorridorRetainedPath = {
  id: string;
  from: string;
  to: string;
  points: readonly CorridorXY[];
};

export type CorridorRunFitStatistics = {
  retainedPaths: number;
  strokes: number;
  cycles: number;
  shortRuns: number;
  candidateRuns: number;
  fittedRuns: number;
  unchangedRuns: number;
  keptRuns: Record<string, number>;
  straightPieces: number;
  pieceHistogram: Record<string, number>;
  movedVertices: number;
  removedStations: number;
  removedSpurs: number;
  trimmedEnds: number;
  reattachedTerminals: number;
  perpendicularBranches: number;
  keptBranches: number;
};

/** Sine of the smallest bend placed at a line intersection (2 degrees). */
const MIN_BEND_SINE = 0.034_899_496_702_500_97;
/** Points of a terminal approach (terminal, at most one elbow, join). */
const MAX_APPROACH_POINTS = 3;
/** Exact checks spent on one door branch before its run is kept. */
const MAX_BRANCH_PROPOSALS = 12;
const same = (a: CorridorXY, b: CorridorXY) => a[0] === b[0] && a[1] === b[1];
const copy = (p: CorridorXY): CorridorXY => [p[0], p[1]];
const length = (path: readonly CorridorXY[]) =>
  path
    .slice(1)
    .reduce(
      (sum, p, i) => sum + DMath.hypot(p[0] - path[i][0], p[1] - path[i][1]),
      0,
    );
const cross = (a: CorridorXY, b: CorridorXY) => a[0] * b[1] - a[1] * b[0];
/** Point and unit tangent `distance` along a polyline (clamped). */
function along(path: readonly CorridorXY[], distance: number) {
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const step = DMath.hypot(b[0] - a[0], b[1] - a[1]);
    if (step === 0) continue;
    const tangent: CorridorXY = [(b[0] - a[0]) / step, (b[1] - a[1]) / step];
    if (travelled + step >= distance || i === path.length - 1) {
      const t = Math.max(0, Math.min(1, (distance - travelled) / step));
      return {
        point: [
          a[0] + t * (b[0] - a[0]),
          a[1] + t * (b[1] - a[1]),
        ] as CorridorXY,
        tangent,
      };
    }
    travelled += step;
  }
  return null;
}
/** Interior crossing of two segments by more than a micro-foot on both
 * sides. A join computed on a receiving segment can sit a rounding error past
 * it; such contacts (and any real touch) are left to the exact topology
 * check of the complete network, which every accepted run passes. */
const segmentsCross = (
  p: CorridorXY,
  q: CorridorXY,
  a: CorridorXY,
  b: CorridorXY,
) => {
  const d = (u: CorridorXY, v: CorridorXY, w: CorridorXY) =>
    (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
  const margin = (u: CorridorXY, v: CorridorXY) =>
    1e-6 * DMath.hypot(v[0] - u[0], v[1] - u[1]);
  const m = margin(a, b),
    n = margin(p, q);
  const dp = d(a, b, p),
    dq = d(a, b, q),
    da = d(p, q, a),
    db = d(p, q, b);
  return (
    dp * dq < 0 &&
    da * db < 0 &&
    Math.min(Math.abs(dp), Math.abs(dq)) > m &&
    Math.min(Math.abs(da), Math.abs(db)) > n
  );
};
const conflictKey = (first: string, second: string) =>
  JSON.stringify([first, second].sort());

type Line = { origin: CorridorXY; direction: CorridorXY };
const project = (line: Line, p: CorridorXY): CorridorXY => {
  const t =
    (p[0] - line.origin[0]) * line.direction[0] +
    (p[1] - line.origin[1]) * line.direction[1];
  return [
    line.origin[0] + t * line.direction[0],
    line.origin[1] + t * line.direction[1],
  ];
};
const offset = (line: Line, p: CorridorXY) =>
  Math.abs(
    cross(line.direction, [p[0] - line.origin[0], p[1] - line.origin[1]]),
  );
/** Principal direction of points about `center`. */
function principal(points: readonly CorridorXY[], center: CorridorXY) {
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of points) {
    const x = p[0] - center[0],
      y = p[1] - center[1];
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  if (xx === 0 && yy === 0) return null;
  const angle = 0.5 * DMath.atan2(2 * xy, xx - yy);
  return [DMath.cos(angle), DMath.sin(angle)] as CorridorXY;
}

/** Straight corridor runs between real junctions.
 *
 * The checked shared network is decomposed into runs: lanes joined through
 * vertices where the straightest continuation deflects by less than
 * `passThroughDegrees`. Short dead-end lanes that only receive door branches
 * (destination branches) neither split nor end a run, and terminal joins on a
 * run are not junctions. Each run is fitted with one straight line (or a few
 * straight pieces) through its cross-section midpoints, constrained through
 * any vertex an earlier run already placed; genuine corners end runs, and
 * every lane, island side and loop is kept (a run is never merged with a
 * parallel lane). Junctions on the run are projected onto the fit, and every
 * door branch of the run is re-proposed against the fitted run, preferring a
 * branch that meets it at a right angle (the join slides along the run).
 *
 * This is a proposal per run. A run is replaced only if every new run piece
 * and every changed neighbouring lane piece passes `supported`, every moved
 * door branch passes `supported(path, terminalId)`, and the complete network
 * (every lane and door branch) gains no topology conflict. Otherwise that run
 * keeps its current checked geometry and the next run is tried. Original
 * terminals and their positions are never changed.
 */
export function fitCorridorRuns(input: {
  rings: readonly (readonly CorridorXY[])[];
  vertices: readonly CorridorXY[];
  chains: readonly CorridorRunChain[];
  joins: ReadonlyMap<string, CorridorRunJoin>;
  terminals: readonly CorridorRunTerminal[];
  supported: (path: CorridorXY[], terminalId?: string) => boolean;
  proposals: (
    terminal: CorridorRunTerminal,
    a: CorridorXY,
    b: CorridorXY,
  ) => CorridorApproachProposal[];
  maxApproachFeet: number;
  /** Original edges whose terminals must stay connected; a run may not
   * lengthen their shared-lane route beyond `detourRatio`/`detourFeet`. */
  requiredEdges?: readonly { from: string; to: string }[];
  retainedPaths?: readonly CorridorRetainedPath[];
}) {
  const P = CORRIDOR_RUN_FIT;
  const vertices = input.vertices.map(copy);
  type Chain = CorridorRunChain;
  const live = new Set<Chain>(
    input.chains.map((chain) => ({
      from: chain.from,
      to: chain.to,
      points: chain.points.map(copy),
    })),
  );
  // Contacts belong to original checked paths, not positions in the changing
  // live set. Unfitted spurs, self-loops and explicit zero lanes retain their
  // original chain identity; ordinary lanes receive their original stroke's
  // identity below. Splitting a path at a doorway must not change its lineage.
  const lineage = new WeakMap<Chain, string>(
    [...live].map((chain, i) => [chain, `chain:${i}`]),
  );
  const joins = new Map(
    [...input.joins]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, join]) => [
        id,
        { vertex: join.vertex, approach: join.approach.map(copy) },
      ]),
  );
  const terminalById = new Map(input.terminals.map((t) => [t.id, t]));
  const retained = (input.retainedPaths ?? []).map((path) => ({
    id: `retained:${path.id}`,
    from: `terminal:${path.from}` as string | number,
    to: `terminal:${path.to}` as string | number,
    points: path.points.map(copy),
  }));
  const statistics: CorridorRunFitStatistics = {
    retainedPaths: retained.length,
    strokes: 0,
    cycles: 0,
    shortRuns: 0,
    candidateRuns: 0,
    fittedRuns: 0,
    unchangedRuns: 0,
    keptRuns: {},
    straightPieces: 0,
    pieceHistogram: {},
    movedVertices: 0,
    removedStations: 0,
    removedSpurs: 0,
    trimmedEnds: 0,
    reattachedTerminals: 0,
    perpendicularBranches: 0,
    keptBranches: 0,
  };
  const keep = (reason: string) => {
    statistics.keptRuns[reason] = (statistics.keptRuns[reason] ?? 0) + 1;
  };

  const ringSegments: [CorridorXY, CorridorXY][] = input.rings.flatMap((ring) =>
    ring.map(
      (a, i) => [a, ring[(i + 1) % ring.length]] as [CorridorXY, CorridorXY],
    ),
  );
  const incidence = () => {
    const map = new Map<number, Chain[]>();
    for (const chain of live) {
      for (const vertex of chain.from === chain.to
        ? [chain.from]
        : [chain.from, chain.to]) {
        const list = map.get(vertex) ?? [];
        list.push(chain);
        map.set(vertex, list);
      }
    }
    return map;
  };
  const joinsAt = () => {
    const map = new Map<number, string[]>();
    for (const [id, join] of joins) {
      const list = map.get(join.vertex) ?? [];
      list.push(id);
      map.set(join.vertex, list);
    }
    return map;
  };
  const oriented = (chain: Chain, from: number) =>
    chain.from === from ? chain.points : chain.points.toReversed();
  /** Unit heading leaving `from` along the chain, or null if degenerate. */
  const heading = (chain: Chain, from: number) => {
    const points = oriented(chain, from);
    const total = length(points);
    if (!(total > 0)) return null;
    const target = along(points, Math.min(P.directionFeet, total))!.point;
    const dx = target[0] - points[0][0],
      dy = target[1] - points[0][1],
      size = DMath.hypot(dx, dy);
    return size > 0 ? ([dx / size, dy / size] as CorridorXY) : null;
  };

  // Vertices of a self-loop or an explicit zero-length lane keep their place.
  const pinned = new Set<number>();
  for (const chain of live)
    if (chain.from === chain.to || length(chain.points) === 0)
      pinned.add(chain.from).add(chain.to);

  /** The dead-end vertex of a destination branch, or undefined. */
  const spurEnd = (
    chain: Chain,
    degree: Map<number, Chain[]>,
    receiving: Map<number, string[]>,
  ) => {
    if (chain.from === chain.to || length(chain.points) > P.spurFeet) return;
    for (const [end, base] of [
      [chain.to, chain.from],
      [chain.from, chain.to],
    ])
      if (
        degree.get(end)!.length === 1 &&
        receiving.has(end) &&
        degree.get(base)!.length >= 3
      )
        return end;
    return;
  };

  // Decompose the current network into strokes (runs).
  type Step = { chain: Chain; forward: boolean };
  const strokes: { steps: Step[]; cycle: boolean; raw: number }[] = [];
  {
    const degree = incidence(),
      receiving = joinsAt();
    const eligible = (chain: Chain) =>
      chain.from !== chain.to &&
      length(chain.points) > 0 &&
      spurEnd(chain, degree, receiving) === undefined;
    const chainList = [...live];
    const index = new Map(chainList.map((chain, i) => [chain, i]));
    const link = new Map<string, [number, 0 | 1]>();
    const vertexOrder = [...degree.keys()].sort((a, b) => a - b);
    const limit = DMath.cos((P.passThroughDegrees * Math.PI) / 180);
    for (const vertex of vertexOrder) {
      if (pinned.has(vertex)) continue;
      const ends = degree
        .get(vertex)!
        .filter(eligible)
        .flatMap((chain) => {
          const h = heading(chain, vertex);
          const which: 0 | 1 = chain.from === vertex ? 0 : 1;
          return h ? [{ chain: index.get(chain)!, which, h }] : [];
        });
      const pairs: { score: number; x: number; y: number }[] = [];
      for (let x = 0; x < ends.length; x++)
        for (let y = x + 1; y < ends.length; y++) {
          // Straight continuation: opposite headings.
          const score =
            ends[x].h[0] * ends[y].h[0] + ends[x].h[1] * ends[y].h[1];
          if (score <= -limit) pairs.push({ score, x, y });
        }
      pairs.sort((a, b) => a.score - b.score || a.x - b.x || a.y - b.y);
      const taken = new Set<number>();
      for (const { x, y } of pairs) {
        if (taken.has(x) || taken.has(y)) continue;
        taken.add(x).add(y);
        const a = ends[x],
          b = ends[y];
        link.set(`${a.chain}:${a.which}`, [b.chain, b.which]);
        link.set(`${b.chain}:${b.which}`, [a.chain, a.which]);
      }
    }
    const seen = new Set<number>();
    for (let start = 0; start < chainList.length; start++) {
      if (seen.has(start) || !eligible(chainList[start])) continue;
      // Walk back to one end of the stroke.
      let current = start,
        end: 0 | 1 = 0,
        cycle = false;
      const visited = new Set([start]);
      for (;;) {
        const next = link.get(`${current}:${end}`);
        if (!next) break;
        if (visited.has(next[0])) {
          cycle = true;
          break;
        }
        visited.add(next[0]);
        current = next[0];
        end = (1 - next[1]) as 0 | 1;
      }
      const steps: Step[] = [];
      let c = current,
        w: 0 | 1 = end;
      for (;;) {
        seen.add(c);
        // Entering at end w, leaving through 1 - w.
        steps.push({ chain: chainList[c], forward: w === 0 });
        const next = link.get(`${c}:${1 - w}`);
        if (!next || seen.has(next[0])) break;
        c = next[0];
        w = next[1];
      }
      strokes.push({
        steps,
        cycle,
        raw: steps.reduce((sum, step) => sum + length(step.chain.points), 0),
      });
    }
    // Vertices where another stroke passes straight through are placed by
    // that stroke: a run ending there (a T stem) keeps them fixed.
  }
  statistics.strokes = strokes.length;
  for (const [i, stroke] of strokes.entries())
    for (const { chain } of stroke.steps) lineage.set(chain, `run:${i}`);
  const order = strokes
    .map((stroke, i) => ({ stroke, i }))
    .sort((a, b) => b.stroke.raw - a.stroke.raw || a.i - b.i);

  const placed = new Set<number>();
  const topologyKeys = () => {
    const items = [
      ...[...live].map((chain) => ({
        id: lineage.get(chain)!,
        from: chain.from as string | number,
        to: chain.to as string | number,
        points: chain.points,
      })),
      ...[...joins].map(([id, join]) => ({
        id: `approach:${id}`,
        from: `terminal:${id}` as string | number,
        to: join.vertex as string | number,
        points: join.approach,
      })),
      ...retained,
    ];
    // Both original path identities and the exact location must be retained.
    // A contact between two other lanes at the same point cannot authorize a
    // moved core/core or approach/core contact. Explicit shared endpoints are
    // still qualified by their graph identities in the contact inspector.
    const keys = new Set<string>();
    for (const { pair, at } of corridorChainTopologyContacts(items)) {
      const key = conflictKey(items[pair[0]].id, items[pair[1]].id);
      keys.add(`${key}@${at}`);
    }
    return keys;
  };
  let topology = topologyKeys();

  /** Cross-section midpoints of a run piece (its lane geometry). */
  const midpoints = (poly: readonly CorridorXY[]) => {
    const total = length(poly);
    const samples: { point: CorridorXY; width: number }[] = [];
    const first = Math.min(P.endClearanceFeet, total / 2),
      last = Math.max(total - P.endClearanceFeet, total / 2);
    for (let s = first; s <= last + 1e-9; s += P.sampleFeet) {
      const at = along(poly, s);
      if (!at) continue;
      const p = at.point,
        n: CorridorXY = [-at.tangent[1], at.tangent[0]];
      let plus = Infinity,
        minus = -Infinity;
      for (const [a, b] of ringSegments) {
        const e: CorridorXY = [b[0] - a[0], b[1] - a[1]];
        const denominator = cross(n, e);
        if (denominator === 0) continue;
        const w: CorridorXY = [a[0] - p[0], a[1] - p[1]];
        const u = cross(w, n) / denominator;
        if (u < 0 || u > 1) continue;
        const t = cross(w, e) / denominator;
        if (t > 1e-9 && t < plus) plus = t;
        if (t < -1e-9 && t > minus) minus = t;
      }
      if (plus > P.maxSectionFeet || -minus > P.maxSectionFeet) continue;
      const middle = (plus + minus) / 2;
      samples.push({
        point: [p[0] + middle * n[0], p[1] + middle * n[1]],
        width: plus - minus,
      });
    }
    if (samples.length === 0) return [];
    // Side openings and door recesses widen a section; drop them.
    const widths = samples.map((s) => s.width).sort((a, b) => a - b);
    const median = widths[Math.floor((widths.length - 1) / 2)];
    return samples
      .filter((s) => s.width <= median * 1.2 + 0.25)
      .map((s) => s.point);
  };

  /** Few-segment straight fit of one run section between two vertices. */
  const fitPiece = (
    poly: CorridorXY[],
    startFixed: boolean,
    endFixed: boolean,
    depth: number,
  ): CorridorXY[] | null => {
    const start = poly[0],
      end = poly.at(-1)!;
    const chord: CorridorXY = [end[0] - start[0], end[1] - start[1]];
    const chordLength = DMath.hypot(chord[0], chord[1]);
    if (!(chordLength > 0)) return null;
    let samples = midpoints(poly);
    // Too short for cross sections: the chord, checked against the lane.
    const short = samples.length < 3;
    if (short) samples = [];
    let line: Line | null = null;
    if ((startFixed && endFixed) || short)
      line = {
        origin: start,
        direction: [chord[0] / chordLength, chord[1] / chordLength],
      };
    else if (samples.length >= 2 || startFixed || endFixed) {
      const center: CorridorXY = startFixed
        ? start
        : endFixed
          ? end
          : [
              samples.reduce((sum, p) => sum + p[0], 0) / samples.length,
              samples.reduce((sum, p) => sum + p[1], 0) / samples.length,
            ];
      const direction = principal(
        samples.length > 0 ? samples : [start, end],
        center,
      );
      if (direction) line = { origin: center, direction };
    }
    const split = () => {
      if (depth >= P.maxDepth || length(poly) < 2 * P.minPieceFeet) return null;
      // Split at the lane vertex farthest from the fitted line (or the
      // chord), away from the ends.
      const reference: Line = line ?? {
        origin: start,
        direction: [chord[0] / chordLength, chord[1] / chordLength],
      };
      let best = -1,
        worst = 0,
        travelled = 0;
      const total = length(poly);
      for (let i = 1; i < poly.length - 1; i++) {
        travelled += DMath.hypot(
          poly[i][0] - poly[i - 1][0],
          poly[i][1] - poly[i - 1][1],
        );
        if (
          travelled < P.minPieceFeet / 2 ||
          total - travelled < P.minPieceFeet / 2
        )
          continue;
        const deviation = offset(reference, poly[i]);
        if (deviation > worst) {
          worst = deviation;
          best = i;
        }
      }
      if (best < 0) return null;
      // Both halves are fitted with a free end at the split; they meet at
      // the intersection of their lines (a bend), or, when nearly parallel,
      // through one short connecting piece (a jog).
      const left = fitPiece(
        poly.slice(0, best + 1),
        startFixed,
        false,
        depth + 1,
      );
      if (!left) return null;
      const right = fitPiece(poly.slice(best), false, endFixed, depth + 1);
      if (!right) return null;
      const a = left.at(-2)!,
        b = left.at(-1)!,
        c = right[0],
        d = right[1];
      const u: CorridorXY = [b[0] - a[0], b[1] - a[1]],
        v: CorridorXY = [d[0] - c[0], d[1] - c[1]];
      const denominator = cross(u, v);
      const sine =
        Math.abs(denominator) /
        (DMath.hypot(u[0], u[1]) * DMath.hypot(v[0], v[1]));
      if (sine >= MIN_BEND_SINE) {
        const t = cross([c[0] - a[0], c[1] - a[1]], v) / denominator;
        const corner: CorridorXY = [a[0] + t * u[0], a[1] + t * u[1]];
        const shift = DMath.hypot(
          corner[0] - poly[best][0],
          corner[1] - poly[best][1],
        );
        // The corner must lie ahead of both outer pieces.
        if (
          shift <= P.maxShiftFeet &&
          t > 0 &&
          (d[0] - corner[0]) * v[0] + (d[1] - corner[1]) * v[1] > 0
        )
          return [...left.slice(0, -1), corner, ...right.slice(1)];
      }
      if (same(b, c)) return [...left, ...right.slice(1)];
      return [...left, ...right];
    };
    if (!line) return split();
    // Orient along the run.
    if (line.direction[0] * chord[0] + line.direction[1] * chord[1] < 0)
      line.direction = [-line.direction[0], -line.direction[1]];
    const aligned =
      (line.direction[0] * chord[0] + line.direction[1] * chord[1]) /
        chordLength >=
      DMath.cos((P.passThroughDegrees * Math.PI) / 180);
    const fits =
      aligned &&
      samples.every((p) => offset(line!, p) <= P.midpointToleranceFeet) &&
      poly.slice(1, -1).every((p) => offset(line!, p) <= P.rawToleranceFeet);
    if (!fits) return split();
    const a = startFixed ? copy(start) : project(line, start),
      b = endFixed ? copy(end) : project(line, end);
    if (same(a, b)) return null;
    return [a, b];
  };

  /** Projection of p on polyline q: segment, fraction, point, distance. */
  const onPolyline = (q: readonly CorridorXY[], p: CorridorXY, from = 0) => {
    let best: {
      segment: number;
      fraction: number;
      point: CorridorXY;
      distance: number;
    } | null = null;
    for (let k = from; k < q.length - 1; k++) {
      const projection = corridorSegmentProjection(p, q[k], q[k + 1]);
      if (!projection) continue;
      const distance = DMath.hypot(
        projection.point[0] - p[0],
        projection.point[1] - p[1],
      );
      if (!best || distance < best.distance)
        best = { segment: k, ...projection, distance };
    }
    return best;
  };
  const position = (segment: number, fraction: number, q: CorridorXY[]) =>
    fraction === 1 && segment < q.length - 2
      ? { segment: segment + 1, fraction: 0 }
      : { segment, fraction };
  const sinPerpendicular = DMath.sin((P.perpendicularDegrees * Math.PI) / 180);
  const perpendicular = (
    path: readonly CorridorXY[],
    a: CorridorXY,
    b: CorridorXY,
  ) => {
    let i = path.length - 1;
    while (i > 0 && same(path[i - 1], path[i])) i--;
    if (i === 0) return true;
    const u: CorridorXY = [
        path[i][0] - path[i - 1][0],
        path[i][1] - path[i - 1][1],
      ],
      v: CorridorXY = [b[0] - a[0], b[1] - a[1]];
    const lu = DMath.hypot(u[0], u[1]),
      lv = DMath.hypot(v[0], v[1]);
    return Math.abs(u[0] * v[0] + u[1] * v[1]) <= sinPerpendicular * lu * lv;
  };
  const shapeOrder: Record<string, number> = {
    "door-normal": 0,
    straight: 1,
    "projected-elbow": 2,
    elbow: 3,
  };

  /** Shared-lane lengths of every required edge. Moving a run can change a
   * journey whose terminal branches did not move, so checking only terminals
   * reattached by this proposal would miss detours through that run. */
  const requiredLengths = () => {
    const edges = input.requiredEdges ?? [];
    const result = new Map<string, number>();
    if (edges.length === 0) return result;
    const adjacency = new Map<number, { to: number; length: number }[]>();
    const link = (a: number, b: number, length: number) => {
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        const list = adjacency.get(x) ?? [];
        list.push({ to: y, length });
        adjacency.set(x, list);
      }
    };
    for (const chain of live) link(chain.from, chain.to, length(chain.points));
    const sources = [...new Set(edges.map((edge) => edge.from))].sort();
    for (const source of sources) {
      const start = joins.get(source);
      const distances = new Map<number, number>();
      if (start) {
        // Small networks: a plain label-correcting search is enough.
        distances.set(start.vertex, length(start.approach));
        const queue = [start.vertex];
        while (queue.length > 0) {
          let best = 0;
          for (let i = 1; i < queue.length; i++)
            if (distances.get(queue[i])! < distances.get(queue[best])!)
              best = i;
          const vertex = queue.splice(best, 1)[0];
          const base = distances.get(vertex)!;
          for (const { to, length: step } of adjacency.get(vertex) ?? []) {
            if (base + step < (distances.get(to) ?? Infinity)) {
              distances.set(to, base + step);
              queue.push(to);
            }
          }
        }
      }
      for (const edge of edges) {
        if (edge.from !== source) continue;
        const end = joins.get(edge.to);
        const value =
          end && distances.has(end.vertex)
            ? distances.get(end.vertex)! + length(end.approach)
            : Infinity;
        result.set(`${edge.from}\u0000${edge.to}`, value);
      }
    }
    return result;
  };

  // Keep the detour budget relative to the original checked network. Comparing
  // each run only with the preceding accepted run would compound the allowance
  // along a journey crossing several fitted runs.
  const originalRequiredLengths = requiredLengths();
  let changed = false;
  for (const { stroke } of order) {
    if (stroke.cycle) {
      statistics.cycles++;
      continue;
    }
    if (stroke.raw < P.minRunFeet) {
      statistics.shortRuns++;
      continue;
    }
    statistics.candidateRuns++;
    const degree = incidence(),
      receiving = joinsAt();
    // Current vertex sequence and lane polyline of the run.
    const sequence: number[] = [];
    const raw: CorridorXY[] = [];
    const rawIndex: number[] = [];
    let broken = false;
    for (const { chain, forward } of stroke.steps) {
      if (!live.has(chain)) {
        broken = true;
        break;
      }
      const from = forward ? chain.from : chain.to,
        to = forward ? chain.to : chain.from;
      if (sequence.length === 0) {
        sequence.push(from);
        raw.push(copy(vertices[from]));
        rawIndex.push(0);
      } else if (sequence.at(-1) !== from) {
        broken = true;
        break;
      }
      const points = forward ? chain.points : chain.points.toReversed();
      for (const p of points.slice(1))
        if (!same(p, raw.at(-1)!)) raw.push(copy(p));
      sequence.push(to);
      rawIndex.push(raw.length - 1);
    }
    if (broken || new Set(sequence).size !== sequence.length) {
      keep("not-simple");
      continue;
    }
    const runChains = new Set(stroke.steps.map((step) => step.chain));
    const last = sequence.length - 1;
    // Placed vertices, pinned vertices and a run end where another run passes
    // straight through stay fixed.
    const passing = (vertex: number) => {
      const lanes = (degree.get(vertex) ?? []).filter(
        (chain) =>
          !runChains.has(chain) &&
          spurEnd(chain, degree, receiving) === undefined,
      );
      return lanes.length >= 2;
    };
    const fixed = sequence.map(
      (vertex, i) =>
        placed.has(vertex) ||
        pinned.has(vertex) ||
        ((i === 0 || i === last) && passing(vertex)),
    );
    // Fit each section between fixed vertices.
    const cuts = [
      0,
      ...sequence.flatMap((_, i) => (i > 0 && i < last && fixed[i] ? [i] : [])),
      last,
    ];
    let line: CorridorXY[] | null = [];
    for (let s = 1; s < cuts.length && line; s++) {
      const piece = fitPiece(
        raw.slice(rawIndex[cuts[s - 1]], rawIndex[cuts[s]] + 1),
        fixed[cuts[s - 1]],
        fixed[cuts[s]],
        0,
      );
      line = piece
        ? [...line, ...(line.length > 0 ? piece.slice(1) : piece)]
        : null;
    }
    if (
      !line ||
      line.length < 2 ||
      line.some((p, i) => i > 0 && same(p, line![i - 1]))
    ) {
      keep("no-straight-fit");
      continue;
    }
    const q = line;
    // Place the run's vertices on the fit.
    type Cut = {
      segment: number;
      fraction: number;
      point: CorridorXY;
      vertex: number;
      station?: number;
    };
    const stationCuts: Cut[] = [];
    let failed: string | null = null;
    let previous = 0;
    const removedStations = new Set<number>();
    const spurs = new Set<Chain>();
    const moved = new Map<number, CorridorXY>();
    for (let i = 0; i <= last && !failed; i++) {
      const vertex = sequence[i];
      let at: { segment: number; fraction: number; point: CorridorXY };
      if (i === 0) at = { segment: 0, fraction: 0, point: copy(q[0]) };
      else if (i === last)
        at = { segment: q.length - 2, fraction: 1, point: copy(q.at(-1)!) };
      else if (fixed[i]) {
        const k = q.findIndex(
          (p, j) => j >= previous && same(p, vertices[vertex]),
        );
        if (k === -1) {
          failed = "fixed-vertex-off-fit";
          break;
        }
        at = {
          ...position(Math.max(0, k - 1), k === 0 ? 0 : 1, q),
          point: copy(q[k]),
        };
      } else {
        const projection = onPolyline(q, vertices[vertex], previous);
        if (!projection) {
          failed = "projection";
          break;
        }
        at = {
          ...position(projection.segment, projection.fraction, q),
          point: projection.point,
        };
      }
      const shift = DMath.hypot(
        at.point[0] - vertices[vertex][0],
        at.point[1] - vertices[vertex][1],
      );
      if (shift > P.maxShiftFeet) {
        failed = "shift";
        break;
      }
      const prior = stationCuts.at(-1);
      if (
        prior &&
        (at.segment < prior.segment ||
          (at.segment === prior.segment && at.fraction < prior.fraction))
      ) {
        failed = "order";
        break;
      }
      previous = at.segment;
      // Destination branches at a vertex that changes are re-proposed.
      if (shift > 0 || (i > 0 && i < last && !fixed[i]))
        for (const chain of degree.get(vertex) ?? [])
          if (
            !runChains.has(chain) &&
            spurEnd(chain, degree, receiving) !== undefined
          )
            spurs.add(chain);
      const others = (degree.get(vertex) ?? []).filter(
        (chain) => !runChains.has(chain) && !spurs.has(chain),
      );
      if (i > 0 && i < last && !fixed[i] && others.length === 0) {
        removedStations.add(vertex);
        continue;
      }
      if (shift > 0) moved.set(vertex, at.point);
      stationCuts.push({ ...at, vertex, station: i });
    }
    if (failed) {
      keep(failed);
      continue;
    }
    // Door branches to re-propose: at removed or moved run vertices and at
    // the ends of removed destination branches.
    const spurEnds = new Set(
      [...spurs].map((chain) => spurEnd(chain, degree, receiving)!),
    );
    const reattach = [
      ...new Set(
        [...removedStations, ...moved.keys(), ...spurEnds].flatMap(
          (vertex) => receiving.get(vertex) ?? [],
        ),
      ),
    ].sort();
    // Neighbouring lanes follow their moved end vertices.
    const neighbours = new Map<Chain, CorridorXY[]>();
    for (const [vertex, point] of moved)
      for (const chain of degree.get(vertex) ?? []) {
        if (runChains.has(chain) || spurs.has(chain)) continue;
        const points = (neighbours.get(chain) ?? chain.points).map(copy);
        if (chain.from === vertex) points[0] = copy(point);
        if (chain.to === vertex) points[points.length - 1] = copy(point);
        neighbours.set(chain, points);
      }
    const fixedBranches = [...joins].flatMap(([id, join]) =>
      reattach.includes(id)
        ? []
        : join.approach.slice(1).map((b, k) => [join.approach[k], b] as const),
    );
    const lanePoints = (chain: Chain) => neighbours.get(chain) ?? chain.points;
    const segmentsOf = (points: readonly CorridorXY[]) =>
      points.slice(1).map((b, k) => [points[k], b] as const);
    const obstacles = [
      ...[...live].flatMap((chain) =>
        runChains.has(chain) || spurs.has(chain)
          ? []
          : segmentsOf(lanePoints(chain)),
      ),
      ...fixedBranches,
      ...segmentsOf(q),
    ];
    const placements = new Map<
      string,
      {
        segment: number;
        fraction: number;
        point: CorridorXY;
        path: CorridorXY[];
        /** Old join to `point`, when the checked branch is kept. */
        connector?: CorridorXY[];
      }
    >();
    let perpendicularBranches = 0;
    let keptBranches = 0;
    for (const id of reattach) {
      const terminal = terminalById.get(id)!;
      const candidates: {
        rank: number;
        cost: number;
        order: number;
        segment: number;
        proposal: CorridorApproachProposal;
      }[] = [];
      for (let k = 0; k < q.length - 1; k++)
        for (const proposal of input.proposals(terminal, q[k], q[k + 1])) {
          if (
            DMath.hypot(
              proposal.point[0] - terminal.point[0],
              proposal.point[1] - terminal.point[1],
            ) > input.maxApproachFeet
          )
            continue;
          candidates.push({
            rank: perpendicular(proposal.path, q[k], q[k + 1]) ? 0 : 1,
            cost: proposal.cost,
            order: shapeOrder[proposal.shape] ?? 4,
            segment: k,
            proposal,
          });
        }
      candidates.sort(
        (a, b) =>
          a.rank - b.rank ||
          a.cost - b.cost ||
          a.order - b.order ||
          a.segment - b.segment,
      );
      const blocking = [
        ...obstacles,
        ...[...placements.values()].flatMap(({ path, connector }) => [
          ...segmentsOf(path),
          ...(connector ? segmentsOf(connector) : []),
        ]),
      ];
      const clear = (path: readonly CorridorXY[]) =>
        !path
          .slice(1)
          .some((b, k) =>
            blocking.some(([u, v]) => segmentsCross(path[k], b, u, v)),
          );
      let chosen: {
        segment: number;
        fraction: number;
        point: CorridorXY;
        path: CorridorXY[];
        connector?: CorridorXY[];
      } | null = null;
      for (const candidate of candidates
        .filter((c) => c.proposal.path.length <= MAX_APPROACH_POINTS)
        .slice(0, MAX_BRANCH_PROPOSALS)) {
        const path = candidate.proposal.path;
        if (!clear(path) || !input.supported(path, id)) continue;
        chosen = {
          ...position(candidate.segment, candidate.proposal.fraction, q),
          point: copy(candidate.proposal.point),
          path: path.map(copy),
        };
        if (candidate.rank === 0) perpendicularBranches++;
        break;
      }
      if (!chosen) {
        // Keep the checked branch and its join; one short lane piece connects
        // that join to the fitted run.
        const old = joins.get(id)!.approach;
        const end = old.at(-1)!;
        // A checked branch that already crosses the fitted run ends there.
        for (let j = 0; j < old.length - 1 && !chosen; j++)
          for (let k = 0; k < q.length - 1 && !chosen; k++) {
            const a = q[k],
              b = q[k + 1];
            if (!segmentsCross(old[j], old[j + 1], a, b)) continue;
            const e: CorridorXY = [b[0] - a[0], b[1] - a[1]],
              d: CorridorXY = [
                old[j + 1][0] - old[j][0],
                old[j + 1][1] - old[j][1],
              ];
            const fraction =
              cross([old[j][0] - a[0], old[j][1] - a[1]], d) / cross(e, d);
            const point: CorridorXY = [
              a[0] + fraction * e[0],
              a[1] + fraction * e[1],
            ];
            const path = [...old.slice(0, j + 1).map(copy), point];
            // A prefix of the checked branch: only its support is rechecked;
            // its contacts are judged by the complete-network topology.
            if (input.supported(path, id)) {
              chosen = {
                ...position(k, fraction, q),
                point,
                path,
              };
              keptBranches++;
            }
          }
        const projection = chosen ? null : onPolyline(q, end);
        if (projection && projection.distance <= P.spurFeet) {
          const connector: CorridorXY[] = [copy(end), projection.point];
          const shared = [...placements.values()].find(
            (p) => p.connector && same(p.connector[0], end),
          );
          if (
            same(end, projection.point) ||
            !!shared ||
            (clear(connector) && input.supported(connector))
          ) {
            chosen = {
              ...position(projection.segment, projection.fraction, q),
              point: copy(projection.point),
              path: old.map(copy),
              ...(same(end, projection.point) ? {} : { connector }),
            };
            keptBranches++;
          }
        }
      }
      if (!chosen) {
        failed = "door-branch";
        break;
      }
      placements.set(id, chosen);
    }
    if (failed) {
      keep(failed);
      continue;
    }
    // Trim a run end that no longer receives anything.
    const allCuts: Cut[] = [...stationCuts];
    const nextVertex = vertices.length;
    const newVertices: CorridorXY[] = [];
    const vertexFor = (point: CorridorXY) => {
      const existing = allCuts.find((cut) => same(cut.point, point));
      return existing?.vertex;
    };
    for (const [, placement] of [...placements].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (vertexFor(placement.point) !== undefined) continue;
      allCuts.push({
        segment: placement.segment,
        fraction: placement.fraction,
        point: placement.point,
        vertex: nextVertex + newVertices.length,
      });
      newVertices.push(copy(placement.point));
    }
    allCuts.sort(
      (a, b) =>
        a.segment - b.segment ||
        a.fraction - b.fraction ||
        (a.station ?? Infinity) - (b.station ?? Infinity),
    );
    // Distinct vertices may not coincide.
    if (
      allCuts.some((cut, i) => i > 0 && same(cut.point, allCuts[i - 1].point))
    ) {
      keep("coincident-junctions");
      continue;
    }
    const usedAt = (cut: Cut) =>
      [...placements.values()].some((p) => same(p.point, cut.point)) ||
      (receiving.get(cut.vertex) ?? []).some((id) => !reattach.includes(id)) ||
      (degree.get(cut.vertex) ?? []).some(
        (chain) => !runChains.has(chain) && !spurs.has(chain),
      );
    let trimmed = 0;
    while (
      allCuts.length > 2 &&
      allCuts[0].station === 0 &&
      !usedAt(allCuts[0])
    ) {
      allCuts.shift();
      trimmed++;
    }
    while (
      allCuts.length > 2 &&
      allCuts.at(-1)!.station === last &&
      !usedAt(allCuts.at(-1)!)
    ) {
      allCuts.pop();
      trimmed++;
    }
    // A station vertex keeps its identity unless it moved.
    const remap = new Map<number, number>();
    for (const cut of allCuts)
      if (cut.station !== undefined && moved.has(cut.vertex)) {
        const id = nextVertex + newVertices.length;
        newVertices.push(copy(cut.point));
        remap.set(cut.vertex, id);
      }
    const idOf = (vertex: number) => remap.get(vertex) ?? vertex;
    const pieces: Chain[] = [];
    for (let i = 1; i < allCuts.length; i++) {
      const a = allCuts[i - 1],
        b = allCuts[i];
      const points: CorridorXY[] = [copy(a.point)];
      for (let k = a.segment + 1; k <= b.segment; k++)
        if (!same(q[k], points.at(-1)!) && !same(q[k], b.point))
          points.push(copy(q[k]));
      points.push(copy(b.point));
      const piece = { from: idOf(a.vertex), to: idOf(b.vertex), points };
      lineage.set(piece, lineage.get(stroke.steps[0].chain)!);
      pieces.push(piece);
    }
    // Kept branches: their old join becomes a new dead-end vertex.
    const connectorEnds = new Map<string, number>();
    for (const [, placement] of [...placements].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!placement.connector) continue;
      const key = `${placement.connector[0][0]},${placement.connector[0][1]}`;
      if (connectorEnds.has(key)) continue;
      const vertex = nextVertex + newVertices.length;
      newVertices.push(copy(placement.connector[0]));
      connectorEnds.set(key, vertex);
      const piece = {
        from: vertex,
        to: idOf(vertexFor(placement.point)!),
        points: placement.connector.map(copy),
      };
      // A new connector has no old non-junction contacts to inherit. Its real
      // endpoint identities still permit the kept approach and fitted run to
      // meet it. Reused connectors are represented by the same piece above.
      lineage.set(
        piece,
        `connector:${lineage.get(stroke.steps[0].chain)!}:${key}`,
      );
      pieces.push(piece);
    }
    const piecesSupported = pieces.every((piece) =>
      piece.points
        .slice(1)
        .every((p, k) => input.supported([piece.points[k], p])),
    );
    if (!piecesSupported) {
      keep("unsupported-run");
      continue;
    }
    const neighboursSupported = [...neighbours].every(([chain, points]) => {
      const changedSegments = points
        .slice(1)
        .map((p, k) => [points[k], p] as [CorridorXY, CorridorXY])
        .filter(
          ([a, b], k) =>
            !same(a, chain.points[k]) || !same(b, chain.points[k + 1]),
        );
      return changedSegments.every((segment) => input.supported(segment));
    });
    if (!neighboursSupported) {
      keep("unsupported-neighbour");
      continue;
    }
    // Trial network for the topology acceptance.
    const saved = {
      live: [...live],
      chains: new Map(
        [...live].map((chain) => [chain, { ...chain, points: chain.points }]),
      ),
      joins: new Map(joins),
      vertices: vertices.length,
    };
    vertices.push(...newVertices);
    for (const chain of runChains) live.delete(chain);
    for (const chain of spurs) live.delete(chain);
    for (const [chain, points] of neighbours) {
      chain.points = points;
      chain.from = idOf(chain.from);
      chain.to = idOf(chain.to);
    }
    for (const piece of pieces) live.add(piece);
    const cutVertex = (point: CorridorXY) =>
      idOf(allCuts.find((cut) => same(cut.point, point))!.vertex);
    for (const [id, placement] of placements)
      joins.set(id, {
        vertex: placement.connector
          ? connectorEnds.get(
              `${placement.connector[0][0]},${placement.connector[0][1]}`,
            )!
          : cutVertex(placement.point),
        approach: placement.path,
      });
    // Keep the joins map in identity order.
    const ordered = [...joins].sort(([a], [b]) => a.localeCompare(b));
    joins.clear();
    for (const [id, join] of ordered) joins.set(id, join);
    // Re-order live lanes deterministically (old lanes first, then pieces).
    const after = topologyKeys();
    const afterLengths = requiredLengths();
    const detour = [...originalRequiredLengths].some(
      ([key, value]) =>
        afterLengths.get(key)! > value * P.detourRatio + P.detourFeet,
    );
    const accepted = !detour && [...after].every((key) => topology.has(key));
    if (!accepted) {
      vertices.length = saved.vertices;
      live.clear();
      for (const chain of saved.live) {
        Object.assign(chain, saved.chains.get(chain));
        live.add(chain);
      }
      joins.clear();
      for (const [id, join] of saved.joins) joins.set(id, join);
      keep(detour ? "detour" : "topology");
      continue;
    }
    topology = after;
    changed = true;
    const unchanged =
      pieces.length === stroke.steps.length &&
      moved.size === 0 &&
      removedStations.size === 0 &&
      spurs.size === 0 &&
      placements.size === 0;
    if (unchanged) statistics.unchangedRuns++;
    statistics.fittedRuns++;
    statistics.straightPieces += q.length - 1;
    statistics.pieceHistogram[String(q.length - 1)] =
      (statistics.pieceHistogram[String(q.length - 1)] ?? 0) + 1;
    statistics.movedVertices += moved.size;
    statistics.removedStations += removedStations.size;
    statistics.removedSpurs += spurs.size;
    statistics.trimmedEnds += trimmed;
    statistics.reattachedTerminals += placements.size;
    statistics.perpendicularBranches += perpendicularBranches;
    statistics.keptBranches += keptBranches;
    for (const piece of pieces) placed.add(piece.from).add(piece.to);
  }
  return {
    changed,
    vertices,
    chains: [...live],
    joins,
    statistics,
  };
}
