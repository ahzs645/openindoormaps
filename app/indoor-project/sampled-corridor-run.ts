import type { IndoorEdge } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import {
  composeCorridorCenterlineRoute,
  type CorridorCenterlineRoute,
} from "./corridor-centerline";
import {
  corridorGuideLength,
  MAX_SHARED_CORRIDOR_APPROACH_FEET,
} from "./shared-corridor-guides";
import { corridorChainTopologyConflicts } from "./corridor-chain-fit";

type Guide = PreparedRouting["guides"][number];
type Point = Guide["pointsFeet"][number];
type XY = [number, number];
const xy = (p: Point): XY => [p[0], p[1]];
const key = (p: readonly number[]) => JSON.stringify(p);

/** Recover one existing walking edge whose two sampled components failed to
 * meet. Keep both source-bound terminal approaches. Only one straight span
 * between their assigned shared stops is proposed; full physical and policy
 * replay is mandatory. */
export function sampledCorridorRun(
  edge: IndoorEdge,
  guides: readonly Guide[],
  edgeById: ReadonlyMap<string, IndoorEdge>,
  sampled: readonly [readonly XY[], readonly XY[]],
  qualifies: (edge: IndoorEdge, guide: Guide) => boolean,
): Guide | undefined {
  const z = edge.pointsFeet[0]?.[2];
  if (
    z === undefined ||
    !edge.enabled ||
    edge.kind !== "walk" ||
    !edge.nativeCellId ||
    edge.pointsFeet.some((p) => p[2] !== z)
  )
    return;
  const existing = [new Map<string, XY[]>(), new Map<string, XY[]>()];
  const segments = new Map<string, [XY, XY]>();
  for (const g of guides) {
    const e = edgeById.get(g.edgeId),
      j = g.hallwayJoins;
    if (!e || e.nativeCellId !== edge.nativeCellId || !j) continue;
    for (const [k, n] of [edge.from, edge.to].entries()) {
      const approach =
        n === e.from
          ? g.pointsFeet.slice(0, j[0] + 1)
          : n === e.to
            ? g.pointsFeet.slice(j[1]).toReversed()
            : null;
      if (approach) {
        const pts = approach.map(xy);
        existing[k].set(key(pts.at(-1)!), pts);
      }
    }
    for (let i = j[0]; i < j[1]; i++) {
      const a = xy(g.pointsFeet[i]),
        b = xy(g.pointsFeet[i + 1]);
      if (key(a) !== key(b))
        segments.set(JSON.stringify([key(a), key(b)].sort()), [a, b]);
    }
  }
  if (existing.some((s) => s.size > 1)) return;
  const approaches = sampled.map(
    (p, k) => existing[k].values().next().value ?? p,
  );
  if (
    approaches.some(
      (p, k) =>
        p.length === 0 ||
        key(p[0]) !==
          key(xy(edge.pointsFeet[k ? edge.pointsFeet.length - 1 : 0])),
    )
  )
    return;
  const a = approaches[0].at(-1)!,
    b = approaches[1].at(-1)!;
  if (key(a) === key(b)) return;
  const span = { id: "new", from: key(a), to: key(b), points: [a, b] };
  const spanKey = JSON.stringify([span.from, span.to].sort());
  for (const [segmentKey, [u, v]] of segments) {
    // Reusing a complete saved segment keeps one physical geometry.
    if (segmentKey === spanKey) continue;
    if (
      corridorChainTopologyConflicts([
        span,
        { id: "saved", from: key(u), to: key(v), points: [u, v] },
      ]).length > 0
    )
      return;
  }
  const draft: CorridorCenterlineRoute = composeCorridorCenterlineRoute(
    approaches[0],
    [a, b],
    approaches[1],
  );
  const guide: Guide = {
    edgeId: edge.id,
    kind: "shared-corridor",
    pointsFeet: draft.points.map(([x, y]) => [x, y, z]),
    hallwayJoins: draft.hallwayJoins,
  };
  if (
    corridorGuideLength(guide.pointsFeet) >
    corridorGuideLength(edge.pointsFeet) * 1.15 +
      0.6 +
      2 * MAX_SHARED_CORRIDOR_APPROACH_FEET
  )
    return;
  return qualifies(edge, guide) ? guide : undefined;
}
