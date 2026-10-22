import Delaunator from "delaunator";
import * as DMath from "./deterministic-math";
import { createRingPointQuery } from "./ring-point-query";
import { MAX_SHARED_CORRIDOR_APPROACH_FEET } from "./shared-corridor-guides";
import { proposeStraightCorridorAxis } from "./corridor-straight-axis";
import {
  fitCheckedCorridorChains,
  corridorChainTopologyConflicts,
} from "./corridor-chain-fit";
import { CORRIDOR_COMPILER_PARAMETERS } from "./corridor-routing-parameters";
import {
  chooseCorridorTerminalAttachments,
  type CorridorAttachmentRequirement,
} from "./corridor-terminal-attachments";

export type CorridorXY = [number, number];
export const CORRIDOR_CENTERLINE_PARAMETERS = CORRIDOR_COMPILER_PARAMETERS;
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

/** Compose fixed original approaches around the canonical lane. Only an
 * exact out-and-back inside the core is redundant: it adds no segment or
 * physical movement at its coincident auxiliary nodes. Door branches and
 * genuine cycles remain unchanged, and no chord is proposed here.
 */
export function composeCorridorCenterlineRoute(
  start: readonly CorridorXY[],
  core: readonly CorridorXY[],
  end: readonly CorridorXY[],
): CorridorCenterlineRoute {
  const same = (a: CorridorXY, b: CorridorXY) => a[0] === b[0] && a[1] === b[1];
  const lane: CorridorXY[] = [start.at(-1)!];
  for (const point of core) {
    if (same(lane.at(-1)!, point)) continue;
    if (lane.length > 1 && same(lane.at(-2)!, point)) lane.pop();
    else lane.push(point);
  }
  const points: CorridorXY[] = [];
  const append = (point: CorridorXY) => {
    if (points.length === 0 || !same(points.at(-1)!, point))
      points.push([...point]);
  };
  start.forEach(append);
  const first = points.length - 1;
  lane.forEach(append);
  const last = points.length - 1;
  end.toReversed().forEach(append);
  return { points, hallwayJoins: [first, last] };
}

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
    requiredEdges?: readonly CorridorAttachmentRequirement[];
    maxDeviationFeet?: number;
  } = {},
) {
  terminals = [...terminals].sort((a, b) => a.id.localeCompare(b.id));
  const maxAttachments =
    options.maxAttachments ?? CORRIDOR_CENTERLINE_PARAMETERS.maxAttachments;
  if (
    !Number.isInteger(maxAttachments) ||
    maxAttachments < 1 ||
    maxAttachments > 4096
  )
    throw new Error("Invalid corridor attachment budget");
  const spacing =
    options.spacingFeet ?? CORRIDOR_CENTERLINE_PARAMETERS.spacingFeet;
  const maxSites = options.maxSites ?? CORRIDOR_CENTERLINE_PARAMETERS.maxSites;
  if (
    !Number.isFinite(spacing) ||
    spacing <= 0 ||
    !Number.isInteger(maxSites) ||
    maxSites < 4 ||
    maxSites > 100_000
  )
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
      .slice(0, maxAttachments);
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
  // Preserve proposal branches until checked alternatives have been assigned.
  // Pruning against only the first projection would discard a viable farther
  // receiving chain before a terminal had a chance to retry it. Unused branches
  // do not enter emitted guides, and source graph permissions remain unchanged.
  const protectedVertices = new Set(
    [...joins.values()].map((join) => join.vertex),
  );
  const degree = adjacency.map((links) => links.length);
  const removed = new Uint8Array(vertices.length);
  const anchors = new Set(
    degree.flatMap((d, i) => (d !== 2 || protectedVertices.has(i) ? [i] : [])),
  );
  const visitedProposals = new Set<number>();
  for (let first = 0; first < adjacency.length; first++) {
    if (visitedProposals.has(first) || adjacency[first].length === 0) continue;
    const component = [first];
    visitedProposals.add(first);
    for (let i = 0; i < component.length; i++)
      for (const { to } of adjacency[component[i]])
        if (!visitedProposals.has(to)) {
          visitedProposals.add(to);
          component.push(to);
        }
    // An unanchored degree-two cycle still needs one deterministic chain seed.
    if (!component.some((vertex) => anchors.has(vertex)))
      anchors.add(
        component.reduce((minimum, vertex) => Math.min(minimum, vertex), first),
      );
  }
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
  // Fit the complete checked geometry once. Final-versus-final topology
  // validation precedes every terminal retry and every emitted source guide.
  const fitting = fitCheckedCorridorChains(
    chains.map((chain, index) => ({
      id: String(index),
      from: chain.from,
      to: chain.to,
      points: chain.raw,
    })),
    (path) => supported(path),
    {
      maxDeviationFeet:
        options.maxDeviationFeet ??
        CORRIDOR_CENTERLINE_PARAMETERS.maxDeviationFeet,
    },
  );
  const geometry = (index: number) => {
    const chain = chains[index];
    if (!chain.checked) {
      chain.points = fitting.chains[index];
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
  // Finish qualification before assigning an alternative join. A raw graph
  // component can be severed by exact width checks, so raw reachability alone
  // cannot tell a terminal which receiving lane serves its original edges.
  const componentIndex = (links: readonly { from: number; to: number }[]) => {
    const parent = vertices.map((_point, index) => index);
    const root = (vertex: number): number => {
      while (parent[vertex] !== vertex) {
        parent[vertex] = parent[parent[vertex]];
        vertex = parent[vertex];
      }
      return vertex;
    };
    for (const { from, to } of links) {
      const a = root(from),
        b = root(to);
      parent[Math.max(a, b)] = Math.min(a, b);
    }
    return root;
  };
  const rawComponent = componentIndex(
    adjacency.flatMap((links, from) => links.map(({ to }) => ({ from, to }))),
  );
  const checkedChains = chains.flatMap((chain, index) => {
    const points = geometry(index);
    return points ? [{ chain, index, points }] : [];
  });
  const checkedComponent = componentIndex(
    checkedChains.map(({ chain }) => chain),
  );
  type Attachment = {
    chain: number;
    segment: number;
    fraction: number;
    point: CorridorXY;
    approach: CorridorXY[];
    component: number;
    distance: number;
    preferred: boolean;
  };
  const alternatives = new Map<string, Attachment[]>();
  let attachmentChecks = 0;
  for (const terminal of terminals) {
    const initial = joins.get(terminal.id);
    const proposals = checkedChains
      .flatMap(({ chain, index, points }) =>
        points.slice(1).flatMap((last, segment) => {
          const first = points[segment];
          const dx = last[0] - first[0],
            dy = last[1] - first[1];
          const squared = dx * dx + dy * dy;
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
          const point: CorridorXY =
            fraction === 0
              ? [...first]
              : fraction === 1
                ? [...last]
                : [first[0] + fraction * dx, first[1] + fraction * dy];
          const distance = DMath.hypot(
            point[0] - terminal.point[0],
            point[1] - terminal.point[1],
          );
          if (distance > MAX_SHARED_CORRIDOR_APPROACH_FEET) return [];
          return [
            {
              chain: index,
              segment,
              fraction,
              point,
              distance,
              component: checkedComponent(chain.from),
              preferred:
                !!initial &&
                ((segment === 0 &&
                  fraction === 0 &&
                  chain.from === initial.vertex) ||
                  (segment === points.length - 2 &&
                    fraction === 1 &&
                    chain.to === initial.vertex)),
            },
          ];
        }),
      )
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.chain - b.chain ||
          a.segment - b.segment ||
          a.fraction - b.fraction,
      );
    // Reserve an opportunity for each nearby checked component before spending
    // the remaining finite budget on more projections in the same fragment.
    const byComponent = new Map<number, typeof proposals>();
    for (const proposal of proposals) {
      const list = byComponent.get(proposal.component) ?? [];
      list.push(proposal);
      byComponent.set(proposal.component, list);
    }
    const ranked: typeof proposals = [];
    for (let rank = 0; ranked.length < maxAttachments; rank++) {
      let added = false;
      for (const list of byComponent.values())
        if (list[rank] && ranked.length < maxAttachments) {
          ranked.push(list[rank]);
          added = true;
        }
      if (!added) break;
    }
    const preferred = proposals.find((proposal) => proposal.preferred);
    if (preferred && !ranked.includes(preferred)) {
      if (ranked.length === maxAttachments) ranked.pop();
      ranked.push(preferred);
    }
    const accepted: Attachment[] = [];
    const bestApproachByComponent = new Map<number, number>();
    for (const proposal of ranked) {
      // Only one receiving join per checked component is needed by the
      // assignment. Once an approach is shorter than the next projection's
      // lower bound, more checks in that fragment cannot improve it. Retain
      // the old checked join separately for conservative partial repair.
      if (
        !proposal.preferred &&
        (bestApproachByComponent.get(proposal.component) ?? Infinity) <=
          proposal.distance
      )
        continue;
      attachmentChecks++;
      const points = chains[proposal.chain].points!;
      const a = points[proposal.segment],
        b = points[proposal.segment + 1];
      // A floating projection is a new coordinate. Recheck both receiving
      // pieces rather than inheriting the containing segment's certificate.
      if (!supported([a, proposal.point]) || !supported([proposal.point, b]))
        continue;
      const paths: CorridorXY[][] = [[terminal.point, proposal.point]];
      if (proposal.preferred && initial) paths.unshift(initial.approach);
      if (terminal.approachDirection) {
        const [nx, ny] = terminal.approachDirection;
        const magnitude = DMath.hypot(nx, ny);
        if (magnitude > 0)
          for (const distance of [0.5, 1, 2, 3])
            paths.push([
              terminal.point,
              [
                terminal.point[0] + (nx / magnitude) * distance,
                terminal.point[1] + (ny / magnitude) * distance,
              ],
              proposal.point,
            ]);
      }
      const approach = paths.find((path) => supported(path, terminal.id));
      if (approach) {
        const candidate = {
          ...proposal,
          approach,
          distance: approach
            .slice(1)
            .reduce(
              (sum, point, index) =>
                sum +
                DMath.hypot(
                  point[0] - approach[index][0],
                  point[1] - approach[index][1],
                ),
              0,
            ),
        };
        accepted.push(candidate);
        bestApproachByComponent.set(
          proposal.component,
          Math.min(
            bestApproachByComponent.get(proposal.component) ?? Infinity,
            candidate.distance,
          ),
        );
      }
    }
    accepted.sort(
      (a, b) =>
        a.distance - b.distance ||
        a.chain - b.chain ||
        a.segment - b.segment ||
        a.fraction - b.fraction,
    );
    alternatives.set(terminal.id, accepted);
  }
  const selected = chooseCorridorTerminalAttachments(
    alternatives,
    options.requiredEdges ?? [],
  );
  const initialJoins = new Map(joins);
  joins.clear();
  missing.length = 0;
  const splits = new Map<
    number,
    { segment: number; fraction: number; vertex: number }[]
  >();
  const joinVertices = new Map<string, number>();
  const terminalRawComponents = new Map<string, number>();
  for (const terminal of terminals) {
    const choice = selected.get(terminal.id);
    if (!choice) {
      missing.push(terminal.id);
      continue;
    }
    const chain = chains[choice.chain],
      points = chain.points!;
    const key = `${choice.chain}:${choice.point[0]},${choice.point[1]}`;
    let vertex =
      choice.segment === 0 && choice.fraction === 0
        ? chain.from
        : choice.segment === points.length - 2 && choice.fraction === 1
          ? chain.to
          : joinVertices.get(key);
    if (vertex === undefined) {
      vertex = vertices.length;
      vertices.push([...choice.point]);
      joinVertices.set(key, vertex);
    }
    joins.set(terminal.id, {
      vertex,
      approach: choice.approach.map((point) => [...point]),
    });
    terminalRawComponents.set(terminal.id, rawComponent(chain.from));
    const list = splits.get(choice.chain) ?? [];
    if (!list.some((split) => split.vertex === vertex))
      list.push({ segment: choice.segment, fraction: choice.fraction, vertex });
    splits.set(choice.chain, list);
  }
  const finalChains: Chain[] = [];
  for (const { chain, index, points } of checkedChains) {
    const cuts = splits.get(index) ?? [];
    let from = chain.from;
    let piece: CorridorXY[] = [[...points[0]]];
    const finish = (to: number) => {
      // Distinct checked auxiliary nodes can coincide exactly. Keep their
      // explicit zero edge (including both endpoints) for topology aliases.
      if (piece.length === 1) piece.push([...piece[0]]);
      const checked = piece
        .slice(1)
        .every((point, i) => supported([piece[i], point]));
      finalChains.push({
        from,
        to,
        raw: piece,
        checked: true,
        points: checked ? piece : null,
        length: checked
          ? piece
              .slice(1)
              .reduce(
                (sum, point, i) =>
                  sum +
                  DMath.hypot(point[0] - piece[i][0], point[1] - piece[i][1]),
                0,
              )
          : undefined,
      });
      from = to;
      piece = [[...vertices[to]]];
    };
    for (let segment = 0; segment < points.length - 1; segment++) {
      for (const cut of cuts
        .filter((cut) => cut.segment === segment)
        .sort((a, b) => a.fraction - b.fraction || a.vertex - b.vertex)) {
        if (cut.vertex === from && piece.length === 1) continue;
        const point = vertices[cut.vertex];
        if (point.some((value, k) => value !== piece.at(-1)![k]))
          piece.push([...point]);
        finish(cut.vertex);
      }
      const point = points[segment + 1];
      if (point.some((value, k) => value !== piece.at(-1)![k]))
        piece.push([...point]);
    }
    if (from !== chain.to || piece.length > 1) finish(chain.to);
  }
  const installChains = (next: Chain[]) => {
    chains.splice(0, chains.length, ...next);
    for (const links of sharedAdjacency) links.length = 0;
    while (sharedAdjacency.length < vertices.length) sharedAdjacency.push([]);
    chains.forEach((chain, index) => {
      if (!chain.points) return;
      sharedAdjacency[chain.from].push({ to: chain.to, chain: index });
      sharedAdjacency[chain.to].push({ to: chain.from, chain: index });
    });
  };
  installChains(finalChains);
  // Alternative discovery needed the complete proposal. Now that every
  // original terminal has one chosen join, remove unused checked dead ends
  // and collapse their obsolete junctions before the final shared fit.
  const live = Uint8Array.from(chains, (chain) => (chain.points ? 1 : 0));
  const finalDegree = sharedAdjacency.map((links) => links.length);
  const chosenJoins = new Set([...joins.values()].map((join) => join.vertex));
  const leaves = finalDegree.flatMap((count, vertex) =>
    count <= 1 && !chosenJoins.has(vertex) ? [vertex] : [],
  );
  for (let i = 0; i < leaves.length; i++) {
    const vertex = leaves[i];
    const link = sharedAdjacency[vertex].find((link) => live[link.chain]);
    if (!link) continue;
    live[link.chain] = 0;
    finalDegree[vertex]--;
    if (--finalDegree[link.to] <= 1 && !chosenJoins.has(link.to))
      leaves.push(link.to);
  }
  const finalAnchors = new Set(
    finalDegree.flatMap((count, vertex) =>
      count > 0 && (count !== 2 || chosenJoins.has(vertex)) ? [vertex] : [],
    ),
  );
  const condensed: Chain[] = [];
  const used = new Set<number>();
  for (const from of finalAnchors)
    for (const first of sharedAdjacency[from]) {
      if (!live[first.chain] || used.has(first.chain)) continue;
      used.add(first.chain);
      const initial = chains[first.chain];
      const path = (
        initial.from === from ? initial.points! : initial.points!.toReversed()
      ).map((point): CorridorXY => [...point]);
      let current = first.to;
      while (!finalAnchors.has(current)) {
        const next = sharedAdjacency[current].find(
          (link) => live[link.chain] && !used.has(link.chain),
        );
        if (!next) break;
        used.add(next.chain);
        const chain = chains[next.chain];
        const points =
          chain.from === current ? chain.points! : chain.points!.toReversed();
        path.push(...points.slice(1).map((point): CorridorXY => [...point]));
        current = next.to;
      }
      condensed.push({ from, to: current, raw: path, checked: false });
    }
  const canonicalFitting = fitCheckedCorridorChains(
    condensed.map((chain, index) => ({
      id: String(index),
      from: chain.from,
      to: chain.to,
      points: chain.raw,
    })),
    (path) => supported(path),
    {
      maxDeviationFeet:
        options.maxDeviationFeet ??
        CORRIDOR_CENTERLINE_PARAMETERS.maxDeviationFeet,
    },
  );
  condensed.forEach((chain, index) => {
    chain.checked = true;
    chain.points = canonicalFitting.chains[index];
    chain.length = chain.points
      ?.slice(1)
      .reduce(
        (sum, point, i) =>
          sum +
          DMath.hypot(
            point[0] - chain.points![i][0],
            point[1] - chain.points![i][1],
          ),
        0,
      );
  });
  installChains(condensed);
  const finalComponent = componentIndex(
    chains.filter((chain) => !!chain.points),
  );
  const usedCoreChains = new Set<number>();
  const usedAxisSegments = new Set<number>();
  const usedTerminals = new Set<string>();
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
  const pointKey = (point: CorridorXY) => `${point[0]},${point[1]}`;
  const orderedAxisJoins = [
    ...new Map(
      [...straightApproaches.values()].map((path) => [
        pointKey(path.at(-1)!),
        path.at(-1)!,
      ]),
    ).values(),
  ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const axisPositions = new Map(
    orderedAxisJoins.map((point, index) => [pointKey(point), index]),
  );
  const useStraightAxis =
    !!straightAxis &&
    straightApproaches.size === terminals.length &&
    orderedAxisJoins
      .slice(1)
      .every((point, index) => supported([orderedAxisJoins[index], point]));
  function resolveRouteDetails(
    from: string,
    to: string,
  ): CorridorCenterlineRoute | null {
    const straightStart = straightApproaches.get(from),
      straightEnd = straightApproaches.get(to);
    if (useStraightAxis) {
      if (!straightStart || !straightEnd) return null;
      const first = axisPositions.get(pointKey(straightStart.at(-1)!))!,
        last = axisPositions.get(pointKey(straightEnd.at(-1)!))!;
      const low = Math.min(first, last),
        high = Math.max(first, last);
      const core = orderedAxisJoins.slice(low, high + 1);
      for (let index = low; index < high; index++) usedAxisSegments.add(index);
      usedTerminals.add(from);
      usedTerminals.add(to);
      return composeCorridorCenterlineRoute(
        straightStart,
        first > last ? core.toReversed() : core,
        straightEnd,
      );
    }
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
      usedCoreChains.add(previousChain[v]);
      const chain = chains[previousChain[v]],
        points = chain.points!;
      backwards.push(chain.from === previous[v] ? points : points.toReversed());
    }
    usedTerminals.add(from);
    usedTerminals.add(to);
    return composeCorridorCenterlineRoute(
      start.approach,
      backwards.reverse().flatMap((path) => path.slice(1)),
      end.approach,
    );
  }
  const routes = new Map<string, CorridorCenterlineRoute | null>();
  function routeDetails(
    from: string,
    to: string,
  ): CorridorCenterlineRoute | null {
    const reverse = from > to;
    const first = reverse ? to : from,
      last = reverse ? from : to;
    const key = JSON.stringify([first, last]);
    if (!routes.has(key)) routes.set(key, resolveRouteDetails(first, last));
    const route = routes.get(key);
    if (!route) return null;
    return reverse
      ? {
          points: route.points.toReversed().map((point) => [...point]),
          hallwayJoins: [
            route.points.length - 1 - route.hallwayJoins[1],
            route.points.length - 1 - route.hallwayJoins[0],
          ],
        }
      : {
          points: route.points.map((point) => [...point]),
          hallwayJoins: [...route.hallwayJoins],
        };
  }
  function refusalReason(from: string, to: string) {
    if (routeDetails(from, to)) return null;
    if (exceeded) return "sampling-budget";
    const a = joins.get(from),
      b = joins.get(to);
    if (!a || !b) return "terminal-attachment";
    if (terminalRawComponents.get(from) !== terminalRawComponents.get(to))
      return "sampled-graph-disconnection";
    if (finalComponent(a.vertex) !== finalComponent(b.vertex))
      return "checked-chain-disconnection";
    return "route-search-budget";
  }
  const finalTopologyConflicts = () => {
    const topology = useStraightAxis
      ? [
          ...[...usedAxisSegments]
            .sort((a, b) => a - b)
            .map((index) => ({
              id: `axis:${index}`,
              from: `axis-node:${index}`,
              to: `axis-node:${index + 1}`,
              points: [orderedAxisJoins[index], orderedAxisJoins[index + 1]],
            })),
          ...[...usedTerminals].sort().map((id) => ({
            id: `approach:${id}`,
            from: `terminal:${id}`,
            to: `axis-node:${axisPositions.get(pointKey(straightApproaches.get(id)!.at(-1)!))!}`,
            points: straightApproaches.get(id)!,
          })),
        ]
      : [
          ...[...usedCoreChains]
            .sort((a, b) => a - b)
            .map((index) => ({
              id: `core:${index}`,
              from: chains[index].from as string | number,
              to: chains[index].to as string | number,
              points: chains[index].points!,
            })),
          ...[...usedTerminals].sort().map((id) => ({
            id: `approach:${id}`,
            from: `terminal:${id}` as string | number,
            to: joins.get(id)!.vertex as string | number,
            points: joins.get(id)!.approach,
          })),
        ];
    return corridorChainTopologyConflicts(topology).map(
      (index) => topology[index].id,
    );
  };
  return {
    vertices,
    coreEdges,
    joins,
    missing: useStraightAxis ? [] : missing,
    route: (from: string, to: string) => routeDetails(from, to)?.points ?? null,
    routeDetails,
    refusalReason,
    statistics: () => ({
      sites: sites.length,
      budgetExceeded: exceeded,
      proposedVertices: vertices.length,
      proposedCoreEdges: coreEdges.length,
      sharedChains: chains.length,
      attachmentFitting: fitting.statistics,
      attachmentFittingRefusals: fitting.refusals,
      fitting: canonicalFitting.statistics,
      fittingRefusals: canonicalFitting.refusals,
      approachTopologyConflicts: finalTopologyConflicts(),
      fittedChains: chains.filter((c) => c.checked && c.points).length,
      checkedCoreEdges: coreChecks.size,
      supportedCoreEdges: [...coreChecks.values()].filter(Boolean).length,
      attachmentChecks,
      alternativeAttachments: [...alternatives.values()].reduce(
        (sum, list) => sum + list.length,
        0,
      ),
      reattachedTerminals: terminals.filter(({ id }) => {
        const initial = initialJoins.get(id);
        const point = useStraightAxis
          ? straightApproaches.get(id)?.at(-1)
          : joins.has(id)
            ? vertices[joins.get(id)!.vertex]
            : undefined;
        return (
          !!point &&
          (!initial ||
            vertices[initial.vertex].some((value, k) => value !== point[k]))
        );
      }).length,
      requiredEdges: options.requiredEdges?.length ?? 0,
      connectedRequiredEdges: (options.requiredEdges ?? []).filter(
        ({ from, to }) =>
          useStraightAxis
            ? straightApproaches.has(from) && straightApproaches.has(to)
            : joins.has(from) &&
              joins.has(to) &&
              finalComponent(joins.get(from)!.vertex) ===
                finalComponent(joins.get(to)!.vertex),
      ).length,
      attachedTerminals: useStraightAxis ? straightApproaches.size : joins.size,
      missingTerminals: useStraightAxis ? 0 : missing.length,
      straightAxisProposed: !!straightAxis,
      straightAxisTerminals: useStraightAxis ? straightApproaches.size : 0,
    }),
  };
}
