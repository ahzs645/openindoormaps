import type { IndoorDataset } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import { NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 } from "./published-route-runtime-binding";
import { matchesReviewedGuideContext } from "./reviewed-guide-bends";
import proof from "./reviewed-route-retraces.json";
import {
  corridorGuideLength,
  type SharedGuidePoint as Point,
} from "./shared-corridor-guides";
import type { PathwayArc } from "./shared-pathway-routing";

type Portion = {
  match: string;
  before: number[][];
  after: number[][];
  cell?: string;
  edgeId?: string;
  kind?: string;
};
const same = (a: Point, b: number[]) => a.every((v, i) => v === b[i]);

function reviewedPoints(arc: PathwayArc, part: Portion, reverse: boolean) {
  const { edge, passages, blockers, requiredRooms } = arc.link;
  if (
    edge.kind !== (part.kind ?? "walk") ||
    (part.kind !== undefined &&
      (part.kind !== "opening" ||
        part.edgeId !== edge.id ||
        !arc.points.every((p) => p[2] === part.before[0][2]))) ||
    passages.length > 0 ||
    blockers.length > 0 ||
    requiredRooms.length > 0 ||
    (part.cell && edge.nativeCellId !== part.cell) ||
    (part.edgeId && edge.id !== part.edgeId)
  )
    return;
  const source = reverse ? arc.points.toReversed() : arc.points;
  if (
    part.before.length === 0 ||
    part.after.length === 0 ||
    ![...part.before, ...part.after].every((p) => p[2] === part.before[0][2]) ||
    source.length < part.before.length ||
    (part.match === "full" && source.length !== part.before.length)
  )
    return;
  const first =
    part.match === "suffix" ? source.length - part.before.length : 0;
  if (!part.before.every((p, i) => same(source[first + i], p))) return;
  const points = [
    ...source.slice(0, first),
    ...(part.after as Point[]),
    ...source.slice(first + part.before.length),
  ];
  return reverse ? points.toReversed() : points;
}

/** Run after the complete directed graph witness and physical crossings pass.
 * Give the original arcs their portions of the measured walk. Keeping all link
 * objects retains even a zero-length movement's access and door dependencies. */
export function trimReviewedRouteRetraces(
  source: PathwayArc[],
  scale: number,
  certified: () => boolean,
) {
  const arcs = source.slice();
  let removedMetres = 0;
  for (const pattern of proof.patterns)
    for (const reverse of [false, true]) {
      const step = reverse ? -1 : 1,
        origin = reverse ? arcs.length - 1 : 0;
      for (let i = origin; i >= 0 && i < arcs.length; i += step) {
        if (pattern.journeyEndpoint && i !== origin) break;
        const last = i + step * (pattern.segments.length - 1);
        if (last < 0 || last >= arcs.length) break;
        const proposal: Point[][] = [];
        let cursor = reverse ? arcs[i].points.at(-1)! : arcs[i].points[0];
        for (const [j, part] of pattern.segments.entries()) {
          const slot = i + step * j,
            arc = arcs[slot],
            previous = arcs[slot - step];
          if (
            j > 0 &&
            (reverse ? previous.from !== arc.to : previous.to !== arc.from)
          )
            break;
          const points = reviewedPoints(arc, part, reverse);
          if (!points || !same(cursor, reverse ? points.at(-1)! : points[0]))
            break;
          cursor = reverse ? points[0] : points.at(-1)!;
          proposal.push(points);
        }
        const endPoint = reverse
          ? arcs[last].points[0]
          : arcs[last].points.at(-1)!;
        if (
          proposal.length !== pattern.segments.length ||
          !same(cursor, endPoint) ||
          !certified()
        )
          continue;
        for (const [j, points] of proposal.entries()) {
          const slot = i + step * j,
            arc = arcs[slot],
            metres = corridorGuideLength(points) * scale;
          removedMetres += arc.metres - metres;
          arcs[slot] = { ...arc, points, metres };
        }
      }
    }
  return { arcs, removedMetres };
}
export function reviewedRetracesAllowed(
  data: IndoorDataset,
  prepared?: PreparedRouting,
) {
  return (
    !!prepared &&
    proof.nativeStripEngineSha256 === NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 &&
    matchesReviewedGuideContext(data, prepared)
  );
}
