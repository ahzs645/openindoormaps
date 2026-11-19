import type { IndoorDataset } from "./contract";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";
import type { PreparedRouting } from "./prepared-routing";
import type { ProjectRoutingGraph } from "./routing-graph";
import {
  corridorRunAvoidsOtherBranches,
  reviewedCorridorStripSupported,
} from "./native-public-corridor-strip";
import type { PathwayArc } from "./shared-pathway-routing";

const office = "rm-694-d302635a3d75";
const cell = "native-cell:14.435696:669";
const level = 694;
const floor = 14.435695538057743;
const lab = "rm-694-ec366a5a4b83",
  westOffice = "rm-694-ec396e5a4b85";
const walk = (a: string, b: string) =>
  cell + ":walk:" + [a, b].sort().join("|");
const east = "door:694:1499373:1",
  west = "door:694:1499432:0",
  north = "door:694:1499426:0";
const owners = new Map<string, string[]>();
for (const terminal of [
  "door:694:1499404:1",
  "door:694:1499406:1",
  "door:694:2200269:1",
  "door:694:1499372:0",
])
  owners.set(walk(east, terminal), [office]);
for (const terminal of ["door:694:1499431:0", "door:694:2199884:0"])
  owners.set(walk(west, terminal), [lab, westOffice]);

/** The shared corridor cores clear the enclosed spaces that constrain their
 * door approaches. Only the saved station-to-station portions can qualify.
 * Each two-foot strip is independently checked against all room identities. */
export function reviewedOfficeApproachCore(data: IndoorDataset) {
  if (
    data.source.modelSha256 !==
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" ||
    data.source.roomsSha256 !==
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9"
  )
    return undefined;
  for (const [key, number, name] of [
    [office, "10-2006", "Office"],
    [lab, "10-2054", "Research Lab"],
    [westOffice, "10-2056", "Office"],
  ]) {
    const room = data.records.find((r) => r.key === key);
    if (
      room?.number !== number ||
      room.name !== name ||
      room.levelId !== level ||
      room.circulation
    )
      return undefined;
  }
  return (arc: PathwayArc): PathwayArc => {
    const { link } = arc;
    const { edge } = link;
    const required = owners.get(edge.id);
    if (
      !required ||
      edge.kind !== "walk" ||
      !edge.enabled ||
      edge.nativeCellId !== cell ||
      link.blockers.length ||
      link.passages.length ||
      link.requiredRooms.length !== required.length ||
      !required.every((id) => link.requiredRooms.includes(id))
    )
      return arc;
    let valid: boolean | undefined;
    const check = () =>
      (valid ??= reviewedCorridorStripSupported(
        data,
        cell,
        level,
        floor,
        arc.points,
      ));
    return {
      ...arc,
      link: { ...link, requiredRooms: [] },
      validateReviewedRun: check,
    };
  };
}

/** Complete the missing public source walk on corridor 10-2026 between its
 * existing hallway stations. Both adjacent guides must be usable in the
 * direction of travel. No approach or room endpoint is added. */
export function reviewedWestHallwayRun(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  guides: ReadonlyMap<string, PreparedRouting["guides"][number]>,
  cores: ReadonlyMap<string, PathwayArc[]>,
  usable: (a: PathwayArc) => boolean,
) {
  const result: PathwayArc[] = [];
  const source = walk(west, north);
  if (guides.has(source)) return result;
  const stations = [
    {
      id: west,
      guide: walk(west, "door:694:2199884:0"),
      point: [75.27686498374166, 814.6029580976241, floor] as XYZ,
    },
    {
      id: north,
      guide: walk(north, "door:694:2199932:0"),
      point: [79.0642620344057, 820.7008410894616, floor] as XYZ,
    },
  ];
  for (const [start, end] of [stations, stations.toReversed()]) {
    const link = graph.adjacency
      .get(start.id)
      ?.find((l) => l.to === end.id && l.edge.id === source);
    if (
      !link ||
      !link.edge.enabled ||
      link.edge.nativeCellId !== cell ||
      link.edge.kind !== "walk" ||
      link.edge.accessible === "yes" ||
      link.requiredRooms.length ||
      link.passages.length ||
      link.blockers.length
    )
      continue;
    const same = (a: XYZ, b: XYZ) => a.every((v, i) => v === b[i]);
    const first = cores
      .get(start.guide)
      ?.find(
        (a) =>
          a.sourceTo === start.id &&
          same(a.points.at(-1)!, start.point) &&
          !a.link.requiredRooms.length,
      );
    const last = cores
      .get(end.guide)
      ?.find(
        (a) =>
          a.sourceFrom === end.id &&
          same(a.points[0], end.point) &&
          !a.link.requiredRooms.length,
      );
    if (!first || !last) continue;
    const points = [start.point, end.point];
    let valid: boolean | undefined;
    result.push({
      from: first.to,
      to: last.from,
      sourceFrom: start.id,
      sourceTo: end.id,
      points,
      link,
      metres:
        corridorGuideLength(points) * data.alignment.horizontalMetresPerFoot,
      validateReviewedRun: () =>
        (valid ??=
          usable(first) &&
          usable(last) &&
          corridorRunAvoidsOtherBranches(points, guides.values(), cell) &&
          reviewedCorridorStripSupported(data, cell, level, floor, points)),
    });
  }
  return result;
}
