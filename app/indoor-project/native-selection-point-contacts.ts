import {
  Rational,
  type NativeRationalParts,
  type NativeRationalPoint,
} from "./native-rational-overlay";
import {
  nativeRationalAreaCompare,
  nativeRationalPointInRing,
} from "./native-exact-planar-topology";

/** Selection-only rule: native faces whose interiors meet only at isolated
 * exact points are separate selection areas. A shared boundary of positive
 * length keeps them one area. This is decided with exact rational vertex
 * identity and signed areas; no tolerance, snapping, buffering or coordinate
 * change is involved. Positive-width seams are NOT covered (they remain with
 * the reviewed contact families). Physical walls, floor holes, doors, portals,
 * routing and access are never read or changed here. */
export const NATIVE_SELECTION_POINT_CONTACT_VERSION =
  "native-selection-point-contact-split-v1";

type Ring = NativeRationalPoint[];
const key = (p: NativeRationalPoint) =>
  `${p[0].n}/${p[0].d},${p[1].n}/${p[1].d}`;
const samePoint = (a: NativeRationalPoint, b: NativeRationalPoint) =>
  a[0].n === b[0].n &&
  a[0].d === b[0].d &&
  a[1].n === b[1].n &&
  a[1].d === b[1].d;
const openRing = (r: Ring): Ring =>
  r.length > 1 && samePoint(r[0], r[r.length - 1]) ? r.slice(0, -1) : r;
/** Twice the signed area numerator/denominator (exact). */
function signedArea2(r: Ring): Rational {
  let n = 0n,
    d = 1n;
  for (let i = 0; i < r.length; i++) {
    const a = r[i],
      b = r[(i + 1) % r.length];
    // a.x*b.y - b.x*a.y
    const tn =
        a[0].n * b[1].n * b[0].d * a[1].d - b[0].n * a[1].n * a[0].d * b[1].d,
      td = a[0].d * b[1].d * b[0].d * a[1].d;
    n = n * td + tn * d;
    d = d * td;
  }
  return new Rational(n, d);
}
const toNumber = (q: Rational) => Number(q.n) / Number(q.d);
/** Signed area for orientation and ordering. A translated float sum decides
 * clearly nonzero cycles; near-zero cycles use the exact rational sum. */
function orientedArea(r: Ring): { sign: number; magnitude: number } {
  const ox = toNumber(r[0][0]),
    oy = toNumber(r[0][1]);
  let sum = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i],
      b = r[(i + 1) % r.length];
    sum +=
      (toNumber(a[0]) - ox) * (toNumber(b[1]) - oy) -
      (toNumber(b[0]) - ox) * (toNumber(a[1]) - oy);
  }
  if (Math.abs(sum) > 1e-6)
    return { sign: Math.sign(sum), magnitude: Math.abs(sum) };
  const exact = signedArea2(r);
  return { sign: sign(exact), magnitude: Math.abs(sum) };
}
const sign = (q: Rational) => (q.n < 0n ? -1 : q.n > 0n ? 1 : 0);

const delta = (
  a: NativeRationalPoint,
  b: NativeRationalPoint,
): [bigint, bigint, bigint, bigint] => [
  a[0].n * b[0].d - b[0].n * a[0].d,
  a[0].d * b[0].d,
  a[1].n * b[1].d - b[1].n * a[1].d,
  a[1].d * b[1].d,
];
/** Exact sign of cross(u, v) for rational direction vectors. */
const crossSign = (
  u: [bigint, bigint, bigint, bigint],
  v: [bigint, bigint, bigint, bigint],
) => {
  const z = u[0] * v[2] * u[3] * v[1] - u[2] * v[0] * u[1] * v[3];
  return z < 0n ? -1 : z > 0n ? 1 : 0;
};
const dotSign = (
  u: [bigint, bigint, bigint, bigint],
  v: [bigint, bigint, bigint, bigint],
) => {
  const z = u[0] * v[0] * u[3] * v[3] + u[2] * v[2] * u[1] * v[1];
  return z < 0n ? -1 : z > 0n ? 1 : 0;
};
/** Trace the closed boundary walks of one exact part as a half-edge face
 * walk: at a vertex with several outgoing boundary edges, continue with the
 * first outgoing edge clockwise from the reversed incoming edge. This keeps
 * the area on the left of every walk and never crosses an isolated touch
 * point, so lobes meeting only at points become separate closed cycles. */
function boundaryCycles(rings: Ring[]): Ring[] {
  const from: NativeRationalPoint[] = [],
    to: NativeRationalPoint[] = [];
  const out = new Map<string, number[]>();
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      if (samePoint(a, b)) continue;
      const k = key(a);
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(from.length);
      from.push(a);
      to.push(b);
    }
  const used = Array.from({ length: from.length }).fill(false);
  const cycles: Ring[] = [];
  for (let start = 0; start < from.length; start++) {
    if (used[start]) continue;
    const cycle: Ring = [];
    let e = start;
    for (let guard = 0; guard <= from.length; guard++) {
      used[e] = true;
      cycle.push(from[e]);
      const v = to[e];
      const options = (out.get(key(v)) ?? []).filter(
        (c) => !used[c] || c === start,
      );
      if (options.length === 0) break;
      let next = options[0];
      if (options.length > 1) {
        const back = delta(from[e], v);
        // Clockwise-first from `back` == largest counter-clockwise angle.
        const half = (d: ReturnType<typeof delta>) => {
          const c = crossSign(back, d);
          return c > 0 || (c === 0 && dotSign(back, d) > 0) ? 0 : 1;
        };
        next = options.reduce((best, c) => {
          const db = delta(to[best], v),
            dc = delta(to[c], v),
            hb = half(db),
            hc = half(dc);
          if (hb !== hc) return hc > hb ? c : best;
          return crossSign(db, dc) > 0 ? c : best;
        });
      }
      if (next === start) break;
      e = next;
    }
    if (cycle.length >= 3) cycles.push(cycle);
  }
  return cycles;
}
function interiorWitnessInside(hole: Ring, outer: Ring): 0 | 1 | -1 {
  for (const p of hole) {
    const s = nativeRationalPointInRing(p, outer);
    if (s !== -1) return s;
  }
  for (let i = 0; i < hole.length; i++) {
    const a = hole[i],
      b = hole[(i + 1) % hole.length];
    const m: NativeRationalPoint = [
      new Rational(a[0].n * b[0].d + b[0].n * a[0].d, 2n * a[0].d * b[0].d),
      new Rational(a[1].n * b[1].d + b[1].n * a[1].d, 2n * a[1].d * b[1].d),
    ];
    const s = nativeRationalPointInRing(m, outer);
    if (s !== -1) return s;
  }
  return -1;
}
export type NativeSelectionPointContactSplit = {
  parts: NativeRationalParts;
  /** Number of input parts whose interior was disconnected at isolated points. */
  splitParts: number;
  /** Input parts kept whole because a component could not be certified. */
  undecidedParts: number;
};
/** Returns each exact part decomposed into its interior-connected components.
 * Parts without exact repeated vertices are returned unchanged (same object).
 * Every split is verified by exact area equality; otherwise the part is kept
 * whole (conservative: never over-splits on an uncertified case). */
export function splitNativeSelectionPointContacts(
  parts: NativeRationalParts,
): NativeSelectionPointContactSplit {
  let splitParts = 0,
    undecidedParts = 0;
  const out: NativeRationalParts = [];
  for (const part of parts) {
    const rings = part.map(openRing);
    const closed = part.map((r) => r.length > 1 && samePoint(r[0], r[r.length - 1]));
    const seen = new Set<string>();
    let repeated = false;
    for (const r of rings) {
      const local = new Set<string>();
      for (const p of r) {
        const k = key(p);
        if (local.has(k) || seen.has(k)) repeated = true;
        local.add(k);
      }
      for (const k of local) seen.add(k);
    }
    if (!repeated || rings.length === 0) {
      out.push(part);
      continue;
    }
    const outerSign = orientedArea(rings[0]).sign;
    const outers: { ring: Ring; area: number; holes: Ring[] }[] = [];
    const holes: Ring[] = [];
    for (const c of boundaryCycles(rings)) {
      const { sign: s, magnitude: a } = orientedArea(c);
      if (!s) continue;
      if (s === outerSign) outers.push({ ring: c, area: a, holes: [] });
      else holes.push(c);
    }
    if (outers.length <= 1) {
      out.push(part);
      continue;
    }
    let undecided = false;
    // Float bounds only prune impossible containers (with an outward margin);
    // the decision itself is the exact point-in-ring test.
    const box = (r: Ring) => {
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const p of r) {
        const x = Number(p[0].n) / Number(p[0].d),
          y = Number(p[1].n) / Number(p[1].d);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      return [x0 - 1e-6, y0 - 1e-6, x1 + 1e-6, y1 + 1e-6];
    };
    const ordered = outers
      .map((o) => ({ o, b: box(o.ring) }))
      .sort((a, b) => a.o.area - b.o.area);
    for (const h of holes) {
      const hb = box(h);
      let best: (typeof outers)[number] | undefined;
      for (const { o, b } of ordered) {
        if (b[0] > hb[0] || b[1] > hb[1] || b[2] < hb[2] || b[3] < hb[3])
          continue;
        const inside = interiorWitnessInside(h, o.ring);
        if (inside === -1) {
          undecided = true;
          break;
        }
        if (inside === 1) {
          best = o;
          break;
        }
      }
      if (undecided) break;
      if (!best) {
        undecided = true;
        break;
      }
      best.holes.push(h);
    }
    const close = (r: Ring, i: number): Ring =>
      closed[i] || closed[0] ? [...r, r[0]] : r;
    const pieces: NativeRationalParts = undecided
      ? []
      : outers.map((o) => [
          close(o.ring, 0),
          ...o.holes.map((h) => close(h, 1)),
        ]);
    if (!undecided && nativeRationalAreaCompare([part], pieces) !== 0)
      undecided = true;
    if (undecided) {
      undecidedParts++;
      out.push(part);
      continue;
    }
    splitParts++;
    out.push(...pieces);
  }
  return { parts: splitParts ? out : parts, splitParts, undecidedParts };
}
