import {
  add,
  compare,
  div,
  mul,
  orient2d,
  rational,
  sub,
} from "./vendor/native-rational-overlay-arithmetic.mjs";

export type CorridorChainPoint = [number, number];
export type CorridorFitChain = {
  id: string;
  from: string | number;
  to: string | number;
  points: readonly CorridorChainPoint[];
  protectedIndices?: readonly number[];
};

type FitRefusal = {
  chainId: string;
  reason:
    | "unsupported-chain"
    | "intersection-retained-original"
    | "intersection-without-checked-fallback";
};

const same = (a: CorridorChainPoint, b: CorridorChainPoint) =>
  a[0] === b[0] && a[1] === b[1];
const clone = (points: readonly CorridorChainPoint[]): CorridorChainPoint[] =>
  points.map((point) => [...point]);
const samePath = (
  a: readonly CorridorChainPoint[],
  b: readonly CorridorChainPoint[],
) => a.length === b.length && a.every((point, i) => same(point, b[i]));

type ExactPoint = [ReturnType<typeof rational>, ReturnType<typeof rational>];
type ChainContact = {
  pair: string;
  start: ExactPoint;
  end: ExactPoint;
  key: string;
};
const pointKey = (point: ExactPoint) =>
  point.map((value) => `${value.n}/${value.d}`).join(",");
const pointOnContact = (point: ExactPoint, contact: ChainContact) =>
  orient2d(...contact.start, ...contact.end, ...point) === 0 &&
  [0, 1].every(
    (axis) =>
      compare(point[axis], contact.start[axis]) *
        compare(point[axis], contact.end[axis]) <=
      0,
  );
const retainedContact = (contact: ChainContact, original: ChainContact) =>
  contact.pair === original.pair &&
  pointOnContact(contact.start, original) &&
  pointOnContact(contact.end, original);

function findCorridorChainTopologyConflicts(
  input: readonly CorridorFitChain[],
  chains: readonly (readonly CorridorChainPoint[] | null)[],
  inspect?: (contact: ChainContact) => boolean,
) {
  type Segment = {
    chain: number;
    index: number;
    a: CorridorChainPoint;
    b: CorridorChainPoint;
    exactA: ExactPoint;
    exactB: ExactPoint;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  const endpoint = (segment: Segment, point: CorridorChainPoint) => {
    const chain = input[segment.chain],
      points = chains[segment.chain]!;
    if (segment.index === 0 && same(point, points[0])) return chain.from;
    if (segment.index === points.length - 2 && same(point, points.at(-1)!))
      return chain.to;
    return;
  };
  // Distinct auxiliary nodes may be linked by an explicit checked zero
  // edge. Preserve that original topology without merging unrelated nodes
  // merely because their coordinates happen to coincide.
  const aliases = new Map<string | number, string | number>();
  const ownerOf = (node: string | number): string | number => {
    const trail = [];
    let current = node;
    for (;;) {
      const parent = aliases.get(current);
      if (parent === undefined || parent === current) break;
      trail.push(current);
      current = parent;
    }
    for (const child of trail) aliases.set(child, current);
    return current;
  };
  for (const [i, chain] of input.entries()) {
    const points = chains[i];
    if (points && points.every((point) => same(point, points[0])))
      aliases.set(ownerOf(chain.to), ownerOf(chain.from));
  }
  const segments: Segment[] = chains
    .flatMap(
      (points, chain) =>
        points?.slice(1).flatMap((b, index) => {
          const a = points[index];
          return same(a, b)
            ? []
            : [
                {
                  chain,
                  index,
                  a,
                  b,
                  exactA: a.map(rational) as ExactPoint,
                  exactB: b.map(rational) as ExactPoint,
                  minX: Math.min(a[0], b[0]),
                  maxX: Math.max(a[0], b[0]),
                  minY: Math.min(a[1], b[1]),
                  maxY: Math.max(a[1], b[1]),
                },
              ];
        }) ?? [],
    )
    .sort(
      (a, b) =>
        a.minX - b.minX ||
        a.minY - b.minY ||
        a.chain - b.chain ||
        a.index - b.index,
    );
  const affected = new Set<number>();
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (
      let j = i + 1;
      j < segments.length && segments[j].minX <= a.maxX;
      j++
    ) {
      const b = segments[j];
      if (b.maxY < a.minY || b.minY > a.maxY) continue;
      const orient = (segment: Segment, point: ReturnType<typeof rational>[]) =>
        orient2d(
          segment.exactA[0],
          segment.exactA[1],
          segment.exactB[0],
          segment.exactB[1],
          point[0],
          point[1],
        );
      const p = orient(a, b.exactA),
        q = orient(a, b.exactB),
        r = orient(b, a.exactA),
        s = orient(b, a.exactB);
      if (p * q > 0 || r * s > 0) continue;
      // Collinear positive overlap is never only an allowed endpoint touch.
      const overlap =
        p === 0 &&
        q === 0 &&
        r === 0 &&
        s === 0 &&
        (Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX) ||
          Math.min(a.maxY, b.maxY) > Math.max(a.minY, b.minY));
      const adjacent = a.chain === b.chain && Math.abs(a.index - b.index) === 1;
      const sharedEndpoint = [a.a, a.b].some((point) => {
        if (!same(point, b.a) && !same(point, b.b)) return false;
        const owner = endpoint(a, point);
        const other = endpoint(b, point);
        return (
          owner !== undefined &&
          other !== undefined &&
          ownerOf(owner) === ownerOf(other)
        );
      });
      if (!overlap && (adjacent || sharedEndpoint)) continue;
      if (inspect) {
        let start: ExactPoint, end: ExactPoint;
        if (p === 0 && q === 0 && r === 0 && s === 0) {
          const axis = a.a[0] === a.b[0] ? 1 : 0;
          const first = [a.exactA, a.exactB].sort((x, y) =>
            compare(x[axis], y[axis]),
          );
          const second = [b.exactA, b.exactB].sort((x, y) =>
            compare(x[axis], y[axis]),
          );
          start =
            compare(first[0][axis], second[0][axis]) >= 0
              ? first[0]
              : second[0];
          end =
            compare(first[1][axis], second[1][axis]) <= 0
              ? first[1]
              : second[1];
        } else {
          // All operands are rational: do not round an intersection back to a
          // display coordinate before comparing its actual contact location.
          const dx = sub(a.exactB[0], a.exactA[0]),
            dy = sub(a.exactB[1], a.exactA[1]),
            ex = sub(b.exactB[0], b.exactA[0]),
            ey = sub(b.exactB[1], b.exactA[1]);
          const t = div(
            sub(
              mul(sub(b.exactA[0], a.exactA[0]), ey),
              mul(sub(b.exactA[1], a.exactA[1]), ex),
            ),
            sub(mul(dx, ey), mul(dy, ex)),
          );
          start = [
            rational(add(a.exactA[0], mul(t, dx))),
            rational(add(a.exactA[1], mul(t, dy))),
          ];
          end = start;
        }
        const pair =
          a.chain <= b.chain
            ? `${a.chain}:${b.chain}`
            : `${b.chain}:${a.chain}`;
        const contact = {
          pair,
          start,
          end,
          key: `${pair}:${pointKey(start)}:${pointKey(end)}`,
        };
        if (inspect(contact)) continue;
      }
      affected.add(a.chain);
      affected.add(b.chain);
    }
  }
  return affected;
}

/** Inspect already checked core/approach geometry together without fitting or
 * extending physical support. Only shared original endpoint identities (or
 * explicit checked zero edges) permit contact. Returns offending input indexes.
 */
export function corridorChainTopologyConflicts(
  input: readonly CorridorFitChain[],
) {
  return [
    ...findCorridorChainTopologyConflicts(
      input,
      input.map((chain) => chain.points),
    ),
  ].sort((a, b) => a - b);
}

/** Fit a complete set together, before journey-specific routing or emission.
 * Original graph-node identities qualify endpoint contact; coincident numeric
 * coordinates alone cannot invent a junction. Every final segment needs the
 * caller's exact physical support. Numerical fitting grants no route policy.
 */
export function fitCheckedCorridorChains(
  input: readonly CorridorFitChain[],
  supported: (path: CorridorChainPoint[]) => boolean,
  options: { maxDeviationFeet?: number } = {},
) {
  const tolerance = options.maxDeviationFeet ?? 0.15;
  if (!Number.isFinite(tolerance) || tolerance < 0)
    throw new Error("Invalid corridor chain deviation");
  const ids = new Set<string>();
  const refusals: FitRefusal[] = [];
  let checkedSegments = 0;
  const check = (a: CorridorChainPoint, b: CorridorChainPoint) => {
    checkedSegments++;
    return supported([a, b]);
  };
  const originals = input.map((chain) => {
    if (ids.has(chain.id)) throw new Error("Duplicate corridor chain identity");
    ids.add(chain.id);
    if (
      chain.points.length < 2 ||
      chain.points.some((point) => !point.every(Number.isFinite)) ||
      chain.protectedIndices?.some(
        (index) =>
          !Number.isInteger(index) || index < 0 || index >= chain.points.length,
      ) ||
      (chain.from === chain.to && !same(chain.points[0], chain.points.at(-1)!))
    )
      throw new Error("Invalid corridor chain geometry");
    // Keep one numeric vertex per consecutive equal run. Protected positions
    // are remapped separately below, and original endpoints remain unchanged.
    const points = chain.points.filter(
      (point, i) => !i || !same(point, chain.points[i - 1]),
    );
    if (points.length === 1) points.push(points[0]);
    return clone(points);
  });
  const fit = (points: CorridorChainPoint[]): CorridorChainPoint[] | null => {
    const pending: [number, number][] = [[0, points.length - 1]];
    const result: CorridorChainPoint[] = [];
    // An explicit stack handles long native chains without recursive stack
    // overflow or repeatedly copying every remaining raw vertex.
    while (pending.length > 0) {
      const [start, end] = pending.pop()!;
      const first = points[start],
        last = points[end];
      const dx = last[0] - first[0],
        dy = last[1] - first[1],
        squared = dx * dx + dy * dy;
      let maximum = 0,
        split = Math.floor((start + end) / 2);
      for (let i = start + 1; i < end; i++) {
        const t =
          squared > 0
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((points[i][0] - first[0]) * dx +
                    (points[i][1] - first[1]) * dy) /
                    squared,
                ),
              )
            : 0;
        const ex = points[i][0] - first[0] - t * dx,
          ey = points[i][1] - first[1] - t * dy,
          error = ex * ex + ey * ey;
        if (error > maximum) {
          maximum = error;
          split = i;
        }
      }
      // A zero chord cannot erase a nonzero cycle, even at a large tolerance.
      if (
        (squared > 0 || end - start === 1) &&
        maximum <= tolerance * tolerance &&
        check(first, last)
      ) {
        if (result.length === 0) result.push(first);
        result.push(last);
        continue;
      }
      if (end - start <= 1) return null;
      pending.push([split, end], [start, split]);
    }
    return result;
  };
  const chains = input.map((chain, chainIndex) => {
    const original = originals[chainIndex];
    // Canonical orientation makes the same chain fit identically in reverse.
    const firstKey = JSON.stringify([chain.from, original[0]]),
      lastKey = JSON.stringify([chain.to, original.at(-1)]);
    const reverse =
      firstKey > lastKey ||
      (firstKey === lastKey &&
        JSON.stringify(original) > JSON.stringify(original.toReversed()));
    const points = reverse ? original.toReversed() : original;
    const protectedPoints = new Set(
      (chain.protectedIndices ?? []).map((i) =>
        JSON.stringify(chain.points[i]),
      ),
    );
    const cuts = [
      0,
      ...points.flatMap((point, i) =>
        i > 0 &&
        i < points.length - 1 &&
        protectedPoints.has(JSON.stringify(point))
          ? [i]
          : [],
      ),
      points.length - 1,
    ];
    const result: CorridorChainPoint[] = [];
    for (let i = 1; i < cuts.length; i++) {
      const fitted = fit(points.slice(cuts[i - 1], cuts[i] + 1));
      if (!fitted) {
        refusals.push({ chainId: chain.id, reason: "unsupported-chain" });
        return null;
      }
      result.push(...(i === 1 ? fitted : fitted.slice(1)));
    }
    return clone(reverse ? result.toReversed() : result);
  });

  const fallbackChecked = new Map<number, boolean>();
  const originalContacts = new Map<string, ChainContact[]>();
  findCorridorChainTopologyConflicts(input, originals, (contact) => {
    const contacts = originalContacts.get(contact.pair) ?? [];
    if (!contacts.some((prior) => prior.key === contact.key))
      contacts.push(contact);
    originalContacts.set(contact.pair, contacts);
    return true;
  });
  const retainedOriginalContacts = new Set<string>();
  const newTopologyContacts = new Set<string>();
  const allowsOriginalContact = (contact: ChainContact) => {
    const retained =
      originalContacts
        .get(contact.pair)
        ?.some((original) => retainedContact(contact, original)) ?? false;
    if (retained) retainedOriginalContacts.add(contact.key);
    else newTopologyContacts.add(contact.key);
    return retained;
  };
  let retainedOriginals = 0;
  // Reversion is monotone. Recheck the resulting complete set: an original
  // restored in one pass can intersect another chain's new chord in the next.
  for (;;) {
    retainedOriginalContacts.clear();
    const affected = findCorridorChainTopologyConflicts(
      input,
      chains,
      allowsOriginalContact,
    );
    if (affected.size === 0) break;
    let changed = false;
    for (const index of affected) {
      const original = originals[index],
        current = chains[index]!;
      if (samePath(current, original)) continue;
      let valid = fallbackChecked.get(index);
      if (valid === undefined) {
        valid = original
          .slice(1)
          .every((point, i) => check(original[i], point));
        fallbackChecked.set(index, valid);
      }
      if (valid) {
        chains[index] = clone(original);
        retainedOriginals++;
        refusals.push({
          chainId: input[index].id,
          reason: "intersection-retained-original",
        });
      } else {
        chains[index] = null;
        refusals.push({
          chainId: input[index].id,
          reason: "intersection-without-checked-fallback",
        });
      }
      changed = true;
    }
    if (changed) continue;
    // An original contact may retain its actual geometry and separate endpoint
    // identities. Only newly introduced contacts reach this refusal path.
    for (const index of affected) {
      chains[index] = null;
      refusals.push({
        chainId: input[index].id,
        reason: "intersection-without-checked-fallback",
      });
    }
  }
  return {
    chains,
    refusals,
    statistics: {
      maxDeviationFeet: tolerance,
      checkedSegments,
      originalVertices: input.reduce(
        (sum, chain) => sum + chain.points.length,
        0,
      ),
      acceptedOriginalVertices: input.reduce(
        (sum, chain, i) => sum + (chains[i] ? chain.points.length : 0),
        0,
      ),
      fittedVertices: chains.reduce(
        (sum, points) => sum + (points?.length ?? 0),
        0,
      ),
      acceptedChains: chains.filter(Boolean).length,
      refusedChains: chains.filter((points) => !points).length,
      retainedOriginals,
      originalContacts: [...originalContacts.values()].reduce(
        (sum, contacts) => sum + contacts.length,
        0,
      ),
      retainedOriginalContacts: retainedOriginalContacts.size,
      newTopologyContacts: newTopologyContacts.size,
    },
  };
}
