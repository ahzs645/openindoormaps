import type { IndoorEdge } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
type Guide = PreparedRouting["guides"][number];
type Point = Guide["pointsFeet"][number];
const key = (p: Point) => JSON.stringify(p);

/** Remove a degree-two approach bend only if every guide that traverses it
 * has the same two neighbors and passes complete replay after the change.
 * A published stop, source endpoint or branch intersection is never removed. */
export function straightenSharedDoorGuideBends(
  edges: readonly IndoorEdge[],
  guides: Guide[],
  corridorDoor: (node: string) => boolean,
  allowed: (edge: IndoorEdge, guide: Guide) => boolean,
) {
  const source = new Map(edges.map((e) => [e.id, e])),
    protectedPoints = new Set<string>(),
    candidates = new Set<string>(),
    updated = new Map(guides.map((g) => [g.edgeId, g]));
  for (const g of guides) {
    const e = source.get(g.edgeId),
      joins = g.hallwayJoins;
    if (!e || !joins) continue;
    for (const i of [0, joins[0], joins[1], g.pointsFeet.length - 1])
      protectedPoints.add(key(g.pointsFeet[i]));
    if (joins[1] - joins[0] < 2) continue;
    for (const [id, i, sign] of [
      [e.from, joins[0], 1],
      [e.to, joins[1], -1],
    ] as const) {
      if (!corridorDoor(id)) continue;
      const [p, q, r] = [0, 1, 2].map((n) => g.pointsFeet[i + sign * n]);
      const ax = q[0] - p[0],
        ay = q[1] - p[1],
        bx = r[0] - q[0],
        by = r[1] - q[1];
      // The angle is a proposal screen. The actual decision is exact geometry.
      if (ax * bx + ay * by < 0.94 * Math.hypot(ax, ay) * Math.hypot(bx, by))
        candidates.add(key(q));
    }
  }
  for (const k of [...candidates].sort()) {
    if (protectedPoints.has(k)) continue;
    const changes: Guide[] = [];
    const neighborPairs = new Set<string>();
    let eligible = true;
    for (const g of updated.values()) {
      const i = g.pointsFeet.findIndex((p) => key(p) === k);
      if (i === -1) continue;
      const j = g.hallwayJoins;
      if (
        !j ||
        i <= j[0] ||
        i >= j[1] ||
        g.pointsFeet.findLastIndex((p) => key(p) === k) !== i
      ) {
        eligible = false;
        break;
      }
      neighborPairs.add(
        JSON.stringify(
          [key(g.pointsFeet[i - 1]), key(g.pointsFeet[i + 1])].sort(),
        ),
      );
      if (neighborPairs.size !== 1) {
        eligible = false;
        break;
      }
      changes.push({
        ...g,
        pointsFeet: g.pointsFeet.filter((_, n) => n !== i),
        hallwayJoins: [j[0], j[1] - 1],
      });
    }
    if (
      eligible &&
      changes.length > 0 &&
      changes.every((g) => {
        const edge = source.get(g.edgeId);
        return !!edge && allowed(edge, g);
      })
    )
      for (const g of changes) updated.set(g.edgeId, g);
  }
  return guides.map((g) => updated.get(g.edgeId)!);
}
