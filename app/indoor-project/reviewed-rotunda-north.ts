import type { IndoorDataset } from "./contract";
import type { ProjectRoutingGraph } from "./routing-graph";
import type { SharedPathwayStop, PathwayArc } from "./shared-pathway-routing";
import type { PreparedRouting } from "./prepared-routing";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";
import { reviewedRotundaPassage } from "./reviewed-rotunda-role";
import {
  corridorRunAvoidsOtherBranches,
  reviewedCorridorStripSupported,
} from "./native-public-corridor-strip";

type XY = [number, number];
type Guide = PreparedRouting["guides"][number];
const rotunda = {
  cell: "native-cell:14.435696:563",
  floor: 14.435695538057743,
  level: 694,
};
const corridor07 = { cell: "native-cell:0.000000:71", floor: 0, level: 311 };
type Scope = typeof rotunda;
const westKey = "rm-311-399064f64ec1",
  eastKey = "rm-311-8e1b19ddd9ef";
function reviewedScope(
  data: IndoorDataset,
  scope: Scope,
  records: ProjectRoutingGraph["records"],
) {
  if (scope === rotunda)
    return reviewedRotundaPassage(data, records.get("rm-694-07de695d7751"));
  const west = records.get(westKey),
    east = records.get(eastKey);
  return (
    scope === corridor07 &&
    data.source.modelSha256 ===
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" &&
    data.source.roomsSha256 ===
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9" &&
    west?.number === "07-163" &&
    east?.number === "07-113A" &&
    east.access === "public" &&
    [west, east].every(
      (r) =>
        r.walkable &&
        r.circulation &&
        r.access !== "staff" &&
        r.levelId === scope.level &&
        r.elevationFeet === scope.floor,
    )
  );
}
const lift = "connector:unbc-04-lift:1",
  corridor = "arrival:rm-694-3399eaf6e0a1";
type Run = { from: string; to: string; fromStop: XY; toStop: XY; corner?: XY };
const runs: Run[] = [
  {
    from: "door:694:2126282:0",
    to: lift,
    fromStop: [-67.9607865391003, 384.6411469924106],
    toStop: [-72.45758915232564, 360.4967220017079],
  },
  {
    from: "door:694:2126257:0",
    to: corridor,
    fromStop: [-92.92979687344237, 379.29753236151777],
    toStop: [-86.14009625532167, 364.373994589135],
    corner: [-93.72, 374.04],
  },
];
const corridor07Runs: Run[] = [
  {
    from:
      "opening:recovered-circulation-seam:" +
      westKey +
      ":" +
      eastKey +
      ":2:59:1",
    to: "arrival:" + eastKey,
    fromStop: [22.661683650948312, 309.5424568550392],
    corner: [21.5, 301.5],
    toStop: [51.56498735706141, 301.01801240738564],
  },
];
export function rotundaRunAvoidsOtherBranches(
  points: XYZ[],
  guides: Iterable<Guide>,
) {
  return corridorRunAvoidsOtherBranches(points, guides, rotunda.cell);
}

/** All of the strip lies in one original physical face. No door half,
 * wall allowance or room-identity exemption is granted at either end. */
export function rotundaNorthernStripSupported(
  data: IndoorDataset,
  points: XYZ[],
) {
  return (
    points.length <= 3 &&
    reviewedRotundaPassage(
      data,
      data.records.find((r) => r.number === "04-259"),
    ) &&
    reviewedCorridorStripSupported(
      data,
      rotunda.cell,
      rotunda.level,
      rotunda.floor,
      points,
    )
  );
}
/** The native witnesses already join these public terminals. Their normal
 * sampled guides were rejected between distinct components. Route only
 * the measured span between previously bound hallway stations, preserving
 * the exact original direction and dependencies. */
export function buildReviewedCorridorRuns(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  guides: ReadonlyMap<string, Guide>,
  station: (
    id: string,
    at: XY,
    departure: boolean,
    cell: string,
  ) => SharedPathwayStop | undefined,
  usable: (edgeId: string) => boolean,
  vertex: (s: SharedPathwayStop) => string,
) {
  const arcs: PathwayArc[] = [];
  for (const scope of [rotunda, corridor07]) {
    if (!reviewedScope(data, scope, graph.records)) continue;
    const { cell, floor, level } = scope;
    for (const run of scope === rotunda ? runs : corridor07Runs) {
      const edgeId = cell + ":walk:" + [run.from, run.to].sort().join("|");
      if (guides.has(edgeId)) continue;
      const points: XYZ[] = [
        run.fromStop,
        ...(run.corner ? [run.corner] : []),
        run.toStop,
      ].map(([x, y]) => [x, y, floor]);
      let physical: boolean | undefined;
      for (const forward of [true, false]) {
        const from = forward ? run.from : run.to,
          to = forward ? run.to : run.from;
        const link = graph.adjacency
          .get(from)
          ?.find((l) => l.to === to && l.edge.id === edgeId);
        if (
          !link ||
          link.blockers.length ||
          link.requiredRooms.length ||
          link.passages.length
        )
          continue;
        const e = link.edge;
        if (
          !e.enabled ||
          e.kind !== "walk" ||
          e.nativeCellId !== cell ||
          e.from !== run.from ||
          e.to !== run.to ||
          e.accessible === "yes" ||
          e.pointsFeet.some((p) => p[2] !== floor)
        )
          continue;
        const first = station(
            from,
            forward ? run.fromStop : run.toStop,
            true,
            cell,
          ),
          last = station(to, forward ? run.toStop : run.fromStop, false, cell);
        if (!first || !last) continue;
        const check = () => {
          if (!usable(first.guideEdgeId) || !usable(last.guideEdgeId))
            return false;
          if (physical === undefined)
            physical =
              corridorRunAvoidsOtherBranches(points, guides.values(), cell) &&
              reviewedCorridorStripSupported(
                data,
                cell,
                level,
                floor,
                points,
              ) &&
              reviewedCorridorStripSupported(
                data,
                cell,
                level,
                floor,
                points.toReversed(),
              );
          return physical;
        };
        arcs.push({
          from: vertex(first),
          to: vertex(last),
          sourceFrom: from,
          sourceTo: to,
          link,
          points: forward ? points : points.toReversed(),
          metres:
            corridorGuideLength(points) *
            data.alignment.horizontalMetresPerFoot,
          validateReviewedRun: check,
        });
      }
    }
  }
  return arcs;
}
