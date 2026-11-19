import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import {
  preparedWalkingGuides,
  validatePreparedRouting,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
import {
  orient2d,
  rational,
} from "../../app/indoor-project/vendor/native-rational-overlay-arithmetic.mjs";

type Point = [number, number, number];
type Guide = PreparedRouting["guides"][number];
const key = (point: Point) => JSON.stringify(point);
const compare = (a: Point, b: Point) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function interior(point: Point, a: Point, b: Point) {
  if (
    point[2] !== a[2] ||
    a[2] !== b[2] ||
    point[0] < Math.min(a[0], b[0]) ||
    point[0] > Math.max(a[0], b[0]) ||
    point[1] < Math.min(a[1], b[1]) ||
    point[1] > Math.max(a[1], b[1]) ||
    compare(point, a) === 0 ||
    compare(point, b) === 0
  )
    return false;
  return (
    orient2d(
      rational(a[0]),
      rational(a[1]),
      rational(b[0]),
      rational(b[1]),
      rational(point[0]),
      rational(point[1]),
    ) === 0
  );
}

/** Index geometry within one native cell. All route transitions continue to
 * use source node/edge IDs. Coinciding points add no permission or connection. */
export function indexCellGuides(
  cellId: string,
  records: { edge: IndoorEdge; guide: Guide }[],
) {
  const locations = new Map<string, Point>();
  for (const { guide } of records) {
    for (const point of guide.pointsFeet) locations.set(key(point), point);
  }
  const pointsFeet = [...locations.values()].sort(compare);
  const byLocation = new Map(pointsFeet.map((p, i) => [key(p), i]));
  const segmentIds = new Map<string, number>();
  const segments: [number, number][] = [];
  const interiorCache = new Map<string, number[]>();
  const core = new Set<number>();
  function parts(a: number, b: number) {
    const lo = Math.min(a, b),
      hi = Math.max(a, b);
    const interval = lo + "/" + hi;
    let split = interiorCache.get(interval);
    if (!split) {
      const indices = pointsFeet.flatMap((point, i) =>
        interior(point, pointsFeet[lo], pointsFeet[hi]) ? [i] : [],
      );
      // The coordinate table is lexicographically sorted, hence so are all
      // collinear vertices between these endpoints, even on a vertical line.
      const stations = [lo, ...indices, hi];
      split = [];
      for (let i = 1; i < stations.length; i++) {
        const first = stations[i - 1],
          last = stations[i],
          edgeKey = first + "/" + last;
        let id = segmentIds.get(edgeKey);
        if (id === undefined) {
          id = segments.push([first, last]);
          segmentIds.set(edgeKey, id);
        }
        split.push(id);
      }
      interiorCache.set(interval, split);
    }
    return a === lo
      ? split
      : split
          .slice()
          .reverse()
          .map((id) => -id);
  }
  const walks = records.map(({ edge, guide }) => {
    const [inlet, outlet] = guide.hallwayJoins!;
    const chain: number[] = [];
    let start = 0,
      end = 0;
    for (let i = 1; i < guide.pointsFeet.length; i++) {
      const a = byLocation.get(key(guide.pointsFeet[i - 1]))!;
      const b = byLocation.get(key(guide.pointsFeet[i]))!;
      if (a !== b) {
        const run = parts(a, b);
        chain.push(...run);
        if (i > inlet && i <= outlet)
          for (const id of run) core.add(Math.abs(id));
      }
      if (i === inlet) start = chain.length;
      if (i === outlet) end = chain.length;
    }
    return {
      sourceEdgeId: edge.id,
      from: edge.from,
      to: edge.to,
      direction: edge.direction ?? "both",
      accessibility: edge.accessible,
      roomKeys: edge.roomKeys,
      chain,
      hallwayRange: [start, end],
      terminalJoinPoints: [
        byLocation.get(key(guide.pointsFeet[inlet]))!,
        byLocation.get(key(guide.pointsFeet[outlet]))!,
      ],
    };
  });
  return {
    cellId,
    pointsFeet,
    segments,
    hallwaySegmentIds: [...core].sort((a, b) => a - b),
    walks,
  };
}

export function indexSharedPathways(
  data: IndoorDataset,
  prepared: PreparedRouting,
) {
  validatePreparedRouting(data);
  const usable = preparedWalkingGuides(data);
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  const cells = new Map<string, { edge: IndoorEdge; guide: Guide }[]>();
  for (const guide of prepared.guides) {
    if (guide.kind !== "shared-corridor") continue;
    const edge = edges.get(guide.edgeId);
    if (
      !edge?.enabled ||
      !edge.nativeCellId ||
      !guide.hallwayJoins ||
      !usable.has(guide.edgeId)
    )
      throw new Error(
        "Shared guide is not bound to its native source walk: " + guide.edgeId,
      );
    let records = cells.get(edge.nativeCellId);
    if (!records) cells.set(edge.nativeCellId, (records = []));
    records.push({ edge, guide });
  }
  return [...cells]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, records]) => indexCellGuides(id, records));
}
