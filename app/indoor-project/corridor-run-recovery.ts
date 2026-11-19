import type { IndoorEdge } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import {
  corridorGuideLength,
  MAX_SHARED_CORRIDOR_APPROACH_FEET,
} from "./shared-corridor-guides";

type Guide = PreparedRouting["guides"][number];
type Point = [number, number, number];
type Anchor = { point: Point; approach: Point[] };
const key = (p: Point) => JSON.stringify(p);
const equal = (p: Point, q: Point) => p.every((v, i) => v === q[i]);

/** Continue a locally straight core across an existing pair of source walks sharing a doorway terminal. A proposed
 * doorway station is the intersection of its normal with the missing span.
 * Commit a pair atomically after both complete guides pass native replay. */
export function recoverCorridorRuns(
  edges: readonly IndoorEdge[],
  saved: Guide[],
  missing: ReadonlySet<string>,
  doorNormal: (terminal: string) => readonly number[] | undefined,
  qualifies: (edge: IndoorEdge, guide: Guide) => boolean,
): Guide[] {
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const stops = new Map<string, Map<string, Anchor>>();
  const neighbors = new Map<string, Map<string, Point>>();
  function join(from: Point, to: Point) {
    if (equal(from, to)) return;
    const id = key(from),
      adj = neighbors.get(id) ?? new Map<string, Point>();
    adj.set(key(to), to);
    neighbors.set(id, adj);
  }
  for (const guide of saved) {
    const edge = edgeById.get(guide.edgeId);
    if (!edge || !guide.hallwayJoins) continue;
    const [a, b] = guide.hallwayJoins,
      p = guide.pointsFeet;
    for (let i = a; i < b; i++) {
      join(p[i], p[i + 1]);
      join(p[i + 1], p[i]);
    }
    for (const [node, approach] of [
      [edge.from, p.slice(0, a + 1)],
      [edge.to, p.slice(b).reverse()],
    ] as const) {
      const point = approach.at(-1)!,
        choices = stops.get(node) ?? new Map<string, Anchor>();
      if (!choices.has(key(point)))
        choices.set(key(point), { point, approach });
      stops.set(node, choices);
    }
  }
  const components = new Map<string, string>();
  for (const root of neighbors.keys()) {
    if (components.has(root)) continue;
    const queue = [root];
    components.set(root, root);
    for (const id of queue)
      for (const next of neighbors.get(id)!.keys())
        if (!components.has(next)) {
          components.set(next, root);
          queue.push(next);
        }
  }
  function anchor(id: string) {
    const options = stops.get(id);
    if (options?.size !== 1) return;
    const value = options.values().next().value!;
    return neighbors.get(key(value.point))?.size === 1 ? value : undefined;
  }
  function continues(a: Point, b: Point) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    // Continuity is a proposal heuristic. Both whole strips and their
    // authorized doorway approaches must pass the exact physical predicate.
    return (
      len > 0 &&
      [...(neighbors.get(key(a))?.values() ?? [])].some((p) => {
        const x = a[0] - p[0],
          y = a[1] - p[1];
        return x * dx + y * dy >= 0.9 * Math.hypot(x, y) * len;
      })
    );
  }
  function gap(a: Anchor, b: Anchor) {
    return (
      components.get(key(a.point)) !== components.get(key(b.point)) &&
      continues(a.point, b.point) &&
      continues(b.point, a.point)
    );
  }
  function doorwayJoin(
    p: Point,
    first: Point,
    last: Point,
    normal: readonly number[],
  ) {
    const dx = last[0] - first[0],
      dy = last[1] - first[1];
    const denominator = dx * normal[1] - dy * normal[0];
    if (Math.abs(denominator) < 1e-10) return;
    const u =
      ((p[0] - first[0]) * normal[1] - (p[1] - first[1]) * normal[0]) /
      denominator;
    if (!(u > 0 && u < 1)) return;
    const point: Point = [first[0] + u * dx, first[1] + u * dy, first[2]];
    if (corridorGuideLength([p, point]) > MAX_SHARED_CORRIDOR_APPROACH_FEET)
      return;
    return point;
  }
  function propose(edge: IndoorEdge, a: Anchor, b: Anchor): Guide | undefined {
    if (equal(a.point, b.point)) return;
    const pointsFeet = [...a.approach, ...b.approach.slice().reverse()];
    if (
      !equal(pointsFeet[0], edge.pointsFeet[0]) ||
      !equal(pointsFeet.at(-1)!, edge.pointsFeet.at(-1)!)
    )
      return;
    if (
      corridorGuideLength(pointsFeet) >
      1.15 * corridorGuideLength(edge.pointsFeet) +
        0.6 +
        2 * MAX_SHARED_CORRIDOR_APPROACH_FEET
    )
      return;
    const guide: Guide = {
      edgeId: edge.id,
      kind: "shared-corridor",
      pointsFeet,
      hallwayJoins: [a.approach.length - 1, a.approach.length],
    };
    return qualifies(edge, guide) ? guide : undefined;
  }
  const found = new Map<string, Guide>();
  // Two independently prepared ends at the same original doorway terminal can
  // force a through walker off the hallway and back. Give both ends the same
  // junction, retaining the old hallway vertices and the real door approach.
  const sourceGuides = new Map<string, Guide[]>();
  for (const guide of saved) {
    const edge = edgeById.get(guide.edgeId);
    if (!edge || !guide.hallwayJoins) continue;
    for (const terminal of [edge.from, edge.to]) {
      const list = sourceGuides.get(terminal) ?? [];
      list.push(guide);
      sourceGuides.set(terminal, list);
    }
  }
  for (const [id, choices] of stops) {
    if (choices.size !== 2) continue;
    const [a, b] = [...choices.values()];
    if (
      neighbors.get(key(a.point))?.size !== 1 ||
      neighbors.get(key(b.point))?.size !== 1 ||
      !gap(a, b) ||
      !equal(a.approach[0], b.approach[0])
    )
      continue;
    const normal = doorNormal(id),
      terminal = a.approach[0];
    if (!normal) continue;
    const common = doorwayJoin(terminal, a.point, b.point, normal);
    if (!common) continue;
    const group = sourceGuides.get(id)!;
    const checked: Guide[] = [];
    for (const initial of group) {
      const guide = found.get(initial.edgeId) ?? initial;
      const edge = edgeById.get(initial.edgeId)!;
      const [first, last] = guide.hallwayJoins!;
      if (first === last || edge.from === edge.to) break;
      const from = edge.from === id;
      const points = from
        ? [terminal, common, ...guide.pointsFeet.slice(first)]
        : [...guide.pointsFeet.slice(0, last + 1), common, terminal];
      const next: Guide = {
        ...guide,
        pointsFeet: points,
        hallwayJoins: from ? [1, 2 + last - first] : [first, last + 1],
      };
      if (
        corridorGuideLength(points) >
          1.15 * corridorGuideLength(edge.pointsFeet) +
            0.6 +
            2 * MAX_SHARED_CORRIDOR_APPROACH_FEET ||
        !qualifies(edge, next)
      )
        break;
      checked.push(next);
    }
    if (checked.length === group.length)
      for (const next of checked) found.set(next.edgeId, next);
  }
  const incident = new Map<string, { edge: IndoorEdge; known: Anchor }[]>();
  for (const e of edges) {
    if (!missing.has(e.id) || !e.enabled) continue;
    const a = anchor(e.from),
      b = anchor(e.to);
    if (Boolean(a) !== Boolean(b)) {
      const id = a ? e.to : e.from,
        rows = incident.get(id) ?? [];
      rows.push({ edge: e, known: (a ?? b)! });
      incident.set(id, rows);
    }
  }
  for (const [id, rows] of incident) {
    const normal = doorNormal(id);
    if (!normal || stops.has(id)) continue;
    const pairs = [];
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i],
          b = rows[j];
        if (!gap(a.known, b.known)) continue;
        pairs.push({
          a,
          b,
          length: corridorGuideLength([a.known.point, b.known.point]),
        });
      }
    pairs.sort((u, v) => u.length - v.length);
    for (const { a, b } of pairs) {
      const p =
        a.edge.pointsFeet[
          a.edge.from === id ? 0 : a.edge.pointsFeet.length - 1
        ];
      const point = doorwayJoin(p, a.known.point, b.known.point, normal);
      if (!point) continue;
      const mid = { point, approach: equal(p, point) ? [p] : [p, point] };
      const fit = (r: typeof a) =>
        r.edge.from === id
          ? propose(r.edge, mid, r.known)
          : propose(r.edge, r.known, mid);
      const left = fit(a),
        right = fit(b);
      if (left && right) {
        found.set(left.edgeId, left);
        found.set(right.edgeId, right);
        break;
      }
    }
  }
  return [...found.values()];
}
