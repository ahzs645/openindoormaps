import * as DMath from "./deterministic-math";
import {
  orient2d,
  rational,
} from "./vendor/native-rational-overlay-arithmetic.mjs";

type Point = [number, number, number];
export type PathDisplaySegment = {
  scope: string;
  pointsFeet: [Point, Point];
  edgeId: string;
  edgeIds: string[];
  nativeCellId?: string;
  role: "hallway" | "passage" | "approach" | "fallback";
  source: "shared-guide" | "saved-walk";
};
const equal = (a: Point, b: Point) => a.every((v, i) => v === b[i]);
const length = (s: PathDisplaySegment) =>
  DMath.hypot(
    s.pointsFeet[1][0] - s.pointsFeet[0][0],
    s.pointsFeet[1][1] - s.pointsFeet[0][1],
  );
const rank = (s: PathDisplaySegment) =>
  ({ hallway: 4, passage: 3, fallback: 1, approach: 0 })[s.role];

function sameLine(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
  sharedOriginalNetwork: boolean,
) {
  if (a[2] !== b[2] || c[2] !== a[2] || d[2] !== a[2]) return false;
  const ux = b[0] - a[0],
    uy = b[1] - a[1];
  const distance = DMath.hypot(ux, uy);
  if (!distance) return false;
  const cross = (p: Point) => ux * (p[1] - a[1]) - uy * (p[0] - a[0]);
  const tolerance = Math.min(
    1e-9,
    32 *
      Number.EPSILON *
      Math.max(1, ...[a, b, c, d].flatMap((p) => p.slice(0, 2).map(Math.abs))),
  );
  if (
    Math.abs(cross(c)) > tolerance * distance ||
    Math.abs(cross(d)) > tolerance * distance
  )
    return false;
  // A legacy averaged axis can differ by a few ulps. Only an ORIGINAL connected
  // segment network permits this display-only exception. Never derive a new
  // connection from trimmed/interpolated points or nearby parallel corridors.
  if (sharedOriginalNetwork) return true;
  const [ax, ay, bx, by, cx, cy, dx, dy] = [
    a[0],
    a[1],
    b[0],
    b[1],
    c[0],
    c[1],
    d[0],
    d[1],
  ].map(rational);
  return (
    orient2d(ax, ay, bx, by, cx, cy) === 0 &&
    orient2d(ax, ay, bx, by, dx, dy) === 0
  );
}

/** Union visible ink on the same saved cell/elevation, keeping all provenance.
 * This does not join source nodes, snap floors, straighten routes, or supply
 * clearance authority. Only uncovered intervals of ORIGINAL lines are drawn.
 */
export function uniquePathDisplaySegments(
  input: readonly PathDisplaySegment[],
) {
  const parent = new Map<string, string>();
  const pointKey = (s: PathDisplaySegment, p: Point) =>
    JSON.stringify([s.scope, p]);
  const edgeRoots = new Map<string, string>();
  const root = (key: string): string => {
    if (!parent.has(key)) parent.set(key, key);
    let found = key;
    while (parent.get(found) !== found) found = parent.get(found)!;
    while (key !== found) {
      const next = parent.get(key)!;
      parent.set(key, found);
      key = next;
    }
    return found;
  };
  for (const s of input) {
    const a = root(pointKey(s, s.pointsFeet[0])),
      b = root(pointKey(s, s.pointsFeet[1]));
    if (a !== b) parent.set(b, a);
    // Hidden room/arrival spurs can separate visible pieces of ONE saved
    // polyline. Its original edge identity retains that provenance; it does
    // not require drawing the hidden spur or inferring a proximity junction.
    for (const id of s.edgeIds) {
      const key = JSON.stringify([s.scope, id]),
        old = edgeRoots.get(key);
      if (old !== undefined) {
        const existing = root(old),
          current = root(a);
        if (existing !== current) parent.set(existing, current);
      }
      edgeRoots.set(key, a);
    }
  }
  const components = new WeakMap<PathDisplaySegment, string>();
  const groups = new Map<string, PathDisplaySegment[]>();
  const result: PathDisplaySegment[] = [];
  const sorted = [...input].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      length(b) - length(a) ||
      a.edgeId.localeCompare(b.edgeId),
  );
  for (const source of sorted) {
    if (equal(...source.pointsFeet)) continue;
    const group = groups.get(source.scope) ?? [];
    const component = root(pointKey(source, source.pointsFeet[0]));
    let pieces: [Point, Point][] = [source.pointsFeet];
    for (const covered of group) {
      if (pieces.length === 0) break;
      const [c, d] = covered.pointsFeet;
      const remaining: [Point, Point][] = [];
      for (const [a, b] of pieces) {
        // Broad-phase rejection must include the same ulp envelope as the
        // filtered line check. Strict bounds otherwise miss almost-vertical
        // coincident lines before their original provenance can be checked.
        const allowance = Math.min(
          1e-9,
          32 *
            Number.EPSILON *
            Math.max(
              1,
              ...[a, b, c, d].flatMap((p) => p.slice(0, 2).map(Math.abs)),
            ),
        );
        if (
          Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) >
            Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) + allowance ||
          Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) >
            Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) + allowance ||
          !sameLine(a, b, c, d, component === components.get(covered))
        ) {
          remaining.push([a, b]);
          continue;
        }
        const ux = b[0] - a[0],
          uy = b[1] - a[1],
          squared = ux * ux + uy * uy;
        if (!squared) {
          remaining.push([a, b]);
          continue;
        }
        const project = (p: Point) =>
          equal(p, a)
            ? 0
            : equal(p, b)
              ? 1
              : ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / squared;
        const lo = Math.max(0, Math.min(project(c), project(d)));
        const hi = Math.min(1, Math.max(project(c), project(d)));
        if (!(hi > lo)) {
          remaining.push([a, b]);
          continue;
        }
        covered.edgeIds = [...new Set([...covered.edgeIds, ...source.edgeIds])];
        const at = (t: number): Point => [a[0] + t * ux, a[1] + t * uy, a[2]];
        if (lo > 0) remaining.push([a, at(lo)]);
        if (hi < 1) remaining.push([at(hi), b]);
      }
      pieces = remaining;
    }
    for (const points of pieces) {
      const segment = {
        ...source,
        pointsFeet: points,
        edgeIds: [...source.edgeIds],
      };
      group.push(segment);
      components.set(segment, component);
      result.push(segment);
    }
    groups.set(source.scope, group);
  }
  return result;
}
