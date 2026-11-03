import * as DMath from "./deterministic-math";

type XY = [number, number];

/** What the composed route line may lose. Only the drawn polyline of one
 * walking run changes; the routed edge sequence never does.
 *
 *  - A hook is a vertex that turns back by more than `hookTurnDegrees` with an
 *    adjacent leg of at most `hookLegMetres`: a near out-and-back left where
 *    two per-edge polylines meet (for example a V into an intermediate side
 *    door anchor that the route passes as a graph node but never enters).
 *  - A tiny zigzag is a run of two to four consecutive vertices whose turns
 *    alternate (the largest at least `zigzagTurnDegrees`), joined by legs of
 *    at most `zigzagLegMetres`, whose net heading change is under
 *    `zigzagNetDegrees`: a sideways jog or bump. Its removed vertices must
 *    lie within `maxZigzagOffsetMetres` of the shortcut.
 *
 * A site is replaced by one straight shortcut over at most
 * `maxRemovedVertices` vertices whose removed vertices all lie within
 * `maxExcursionMetres` of it (hooks). The caller decides physical support: every
 * shortcut must pass its exact support predicate, and no protected anchor
 * (door/opening crossing, hallway stop, run endpoint) is ever removed or
 * bypassed. A site with no supported shortcut is left exactly as composed.
 */
export const ROUTE_LINE_CLEANUP_RULES = Object.freeze({
  hookTurnDegrees: 120,
  hookLegMetres: 2,
  zigzagTurnDegrees: 5,
  zigzagLegMetres: 3,
  zigzagNetDegrees: 10,
  maxRemovedVertices: 6,
  maxExcursionMetres: 2,
  maxZigzagOffsetMetres: 0.6,
});

export type RouteLineCleanupOptions = {
  metresPerFoot: number;
  /** Vertices (by original index) that must stay in the line. */
  protectedIndex?: (index: number) => boolean;
  /** Exact physical support of one replacement segment. */
  shortcutSupported: (a: XY, b: XY) => boolean;
  /** Policy of one removed excursion (original vertices from the shortcut's
   * start to its end, inclusive), e.g. that it crosses no threshold. */
  excursionAllowed?: (excursion: XY[]) => boolean;
  rules?: typeof ROUTE_LINE_CLEANUP_RULES;
};

const turnDegrees = (a: XY, b: XY, c: XY) => {
  const u: XY = [b[0] - a[0], b[1] - a[1]],
    v: XY = [c[0] - b[0], c[1] - b[1]];
  return (
    (DMath.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180) /
    Math.PI
  );
};
const distance = (a: XY, b: XY) => DMath.hypot(b[0] - a[0], b[1] - a[1]);
const offset = (p: XY, a: XY, b: XY) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-18) return distance(p, a);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2),
  );
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
};

type CleanedRouteLine = {
  points: XY[];
  hooks: number;
  zigzags: number;
  removedVertices: number;
};

/** Remove supported hooks and tiny zigzags from one planar walking run.
 * Deterministic and independent of travel direction (the run is cleaned in
 * one canonical orientation); never adds a vertex, never moves one, and never
 * lengthens the line (each shortcut is a chord of the part it replaces). */
export function cleanRouteLine(
  points: readonly XY[],
  options: RouteLineCleanupOptions,
): CleanedRouteLine {
  const reverse = JSON.stringify(points) > JSON.stringify(points.toReversed());
  if (!reverse) return cleanInOrder(points, options);
  const last = points.length - 1;
  const cleaned = cleanInOrder(points.toReversed(), {
    ...options,
    protectedIndex: options.protectedIndex
      ? (i) => options.protectedIndex!(last - i)
      : undefined,
    excursionAllowed: options.excursionAllowed
      ? (excursion) => options.excursionAllowed!(excursion.toReversed())
      : undefined,
    shortcutSupported: (a, b) => options.shortcutSupported(b, a),
  });
  return { ...cleaned, points: cleaned.points.toReversed() };
}

function cleanInOrder(
  points: readonly XY[],
  options: RouteLineCleanupOptions,
): CleanedRouteLine {
  const rules = options.rules ?? ROUTE_LINE_CLEANUP_RULES;
  const feet = (metres: number) => metres / options.metresPerFoot;
  type Vertex = { p: XY; original: number; protected: boolean };
  const line: Vertex[] = [];
  points.forEach((p, i) => {
    const pinned =
      i === 0 || i === points.length - 1 || !!options.protectedIndex?.(i);
    const last = line.at(-1);
    if (last && last.p[0] === p[0] && last.p[1] === p[1]) {
      last.protected ||= pinned;
      return;
    }
    line.push({ p: [p[0], p[1]], original: i, protected: pinned });
  });
  let hooks = 0,
    zigzags = 0;
  const composedVertices = line.length;
  // Sites already tried without a supported shortcut, by original indices.
  const kept = new Set<string>();
  const site = (
    i: number,
  ): { first: number; last: number; kind: "hook" | "zigzag" } | undefined => {
    const hook = (j: number) => {
      if (j < 1 || j >= line.length - 1) return 0;
      const [p, q, r] = [line[j - 1].p, line[j].p, line[j + 1].p];
      const t = Math.abs(turnDegrees(p, q, r));
      return t > rules.hookTurnDegrees &&
        Math.min(distance(p, q), distance(q, r)) <= feet(rules.hookLegMetres)
        ? t
        : 0;
    };
    const here = hook(i);
    if (here > 0) {
      // Of two adjacent hook vertices, remove the sharper one (the tip).
      const next = hook(i + 1);
      return next > here && !line[i + 1].protected
        ? { first: i + 1, last: i + 1, kind: "hook" }
        : { first: i, last: i, kind: "hook" };
    }
    // A zigzag: two or three consecutive vertices joined by short legs whose
    // turns alternate and cancel. Remove the vertices between its ends (or,
    // for a two-vertex jog, its second vertex first).
    for (let j = i + 1; j <= i + 3 && j < line.length - 1; j++) {
      let net = 0,
        largest = 0,
        left = false,
        right = false;
      let short = true;
      for (let k = i; k <= j; k++) {
        const t = turnDegrees(line[k - 1].p, line[k].p, line[k + 1].p);
        net += t;
        largest = Math.max(largest, Math.abs(t));
        left ||= t > 0;
        right ||= t < 0;
        if (
          k < j &&
          distance(line[k].p, line[k + 1].p) > feet(rules.zigzagLegMetres)
        )
          short = false;
      }
      if (
        short &&
        left &&
        right &&
        largest >= rules.zigzagTurnDegrees &&
        Math.abs(net) < rules.zigzagNetDegrees
      )
        return j === i + 1
          ? { first: j, last: j, kind: "zigzag" }
          : { first: i + 1, last: j - 1, kind: "zigzag" };
    }
  };
  const shortcut = (first: number, last: number, kind: "hook" | "zigzag") => {
    const reach = feet(
      kind === "hook" ? rules.maxExcursionMetres : rules.maxZigzagOffsetMetres,
    );
    // Smallest window first, then the one closest to the site's start.
    for (
      let width = last - first + 2;
      width <= rules.maxRemovedVertices + 1;
      width++
    )
      for (let s = first - 1; s >= Math.max(0, last + 1 - width); s--) {
        const e = s + width;
        if (e >= line.length || e <= last) continue;
        const inner = line.slice(s + 1, e);
        if (inner.some((v) => v.protected)) continue;
        const a = line[s].p,
          b = line[e].p;
        if (inner.some((v) => offset(v.p, a, b) > reach)) continue;
        const excursion = line.slice(s, e + 1).map((v) => v.p);
        if (options.excursionAllowed && !options.excursionAllowed(excursion))
          continue;
        if (
          !(a[0] === b[0] && a[1] === b[1]) &&
          !options.shortcutSupported(a, b)
        )
          continue;
        return [s, e] as const;
      }
  };
  for (let i = 1; i < line.length - 1; ) {
    const found = site(i);
    if (
      !found ||
      line.slice(found.first, found.last + 1).some((v) => v.protected)
    ) {
      i++;
      continue;
    }
    const key = `${line[i - 1].original}:${line[found.first].original}:${line[found.last + 1].original}`;
    if (kept.has(key)) {
      i++;
      continue;
    }
    const window = shortcut(found.first, found.last, found.kind);
    if (!window) {
      kept.add(key);
      i++;
      continue;
    }
    const [s, e] = window;
    if (found.kind === "hook") hooks++;
    else zigzags++;
    // An exact return to the same point keeps one (possibly protected) vertex.
    const same = line[s].p[0] === line[e].p[0] && line[s].p[1] === line[e].p[1];
    if (same) line[s].protected ||= line[e].protected;
    line.splice(s + 1, same ? e - s : e - s - 1);
    i = Math.max(1, s);
  }
  return {
    points: line.map((v) => [...v.p] as XY),
    hooks,
    zigzags,
    removedVertices: composedVertices - line.length,
  };
}
