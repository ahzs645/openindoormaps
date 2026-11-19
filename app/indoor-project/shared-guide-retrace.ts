import type { PathwayArc } from "./shared-pathway-routing";
import {
  corridorGuideLength,
  type SharedGuidePoint as Point,
} from "./shared-corridor-guides";
import {
  orient2d,
  rational,
} from "./vendor/native-rational-overlay-arithmetic.mjs";

type Segment = { start: Point; end: Point; owner: number };
const same = (a: Point, b: Point) => a.every((value, i) => value === b[i]);

// Return how far b→c runs back along a→b. A strict exact collinearity
// check keeps parallel lanes and tiny real corners intact.
function reversal(a: Point, b: Point, c: Point) {
  if (a[2] !== b[2] || b[2] !== c[2]) return;
  if (same(a, c)) return "all";
  const axis = a[0] === b[0] ? 1 : 0;
  if (
    a[axis] === b[axis] ||
    Math.sign(a[axis] - b[axis]) !== Math.sign(c[axis] - b[axis])
  )
    return;
  if (
    orient2d(
      rational(a[0]),
      rational(a[1]),
      rational(b[0]),
      rational(b[1]),
      rational(c[0]),
      rational(c[1]),
    ) !== 0
  )
    return;
  return Math.abs(c[axis] - b[axis]) < Math.abs(a[axis] - b[axis])
    ? "part"
    : "past";
}

/** Remove only exact reversals inside consecutive checked, passage-free
 * walks in the same native cell. Each surviving segment stays on its
 * original walked guide. A completely consumed edge keeps a zero-length
 * point and its original source identity for policy and instructions. */
export function trimSharedGuideRetraces(
  arcs: PathwayArc[],
  eligible: (arc: PathwayArc) => boolean,
  noPhysicalCrossings: (arc: PathwayArc) => boolean,
  metresPerFoot: number,
) {
  const result = [...arcs];
  let removedMetres = 0;
  for (let first = 0; first < arcs.length; ) {
    const head = arcs[first];
    if (!head.points.length || !eligible(head)) {
      first++;
      continue;
    }
    const cell = head.link.edge.nativeCellId;
    let end = first + 1;
    while (end < arcs.length) {
      const arc = arcs[end];
      if (
        !eligible(arc) ||
        !arc.points.length ||
        arc.link.edge.nativeCellId !== cell ||
        !same(arcs[end - 1].points.at(-1)!, arc.points[0])
      )
        break;
      end++;
    }
    const segments: Segment[] = [];
    let changed = false;
    for (let i = first; i < end; i++) {
      const points = arcs[i].points;
      for (let j = 1; j < points.length; j++) {
        let a = points[j - 1];
        const b = points[j];
        while (!same(a, b)) {
          const last = segments.at(-1);
          const overlap = last && reversal(last.start, last.end, b);
          if (!overlap) {
            segments.push({ start: a, end: b, owner: i });
            break;
          }
          changed = true;
          if (overlap === "part") {
            last!.end = b;
            break;
          }
          a = segments.pop()!.start;
        }
      }
    }
    if (changed && arcs.slice(first, end).every(noPhysicalCrossings)) {
      let cursor = head.points[0],
        next = 0;
      for (let i = first; i < end; i++) {
        const points = [cursor];
        while (next < segments.length && segments[next].owner === i) {
          cursor = segments[next++].end;
          points.push(cursor);
        }
        const metres = corridorGuideLength(points) * metresPerFoot;
        removedMetres += arcs[i].metres - metres;
        result[i] = { ...arcs[i], points, metres };
      }
    }
    first = end;
  }
  return { arcs: result, removedMetres };
}
