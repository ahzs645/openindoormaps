import type { IndoorDataset } from "./contract";
import type { ProjectRoutingGraph } from "./routing-graph";
import type { PreparedRouting } from "./prepared-routing";
import type { PathwayArc } from "./shared-pathway-routing";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";
import {
  corridorRunAvoidsOtherBranches,
  reviewedCorridorStripSupported,
} from "./native-public-corridor-strip";

const survey = {
  model: "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
  room: "rm-311-86e02816d8fe",
  cell: "native-cell:0.000000:71",
  level: 311,
  ramp: "ramp:1622190:lower",
  door: "door:311:1951047:1",
  doorway: "door:311:1951047",
  owner: "arrival:rm-311-86e02816d8fe",
  station: [50, 451, 0] as XYZ,
  via: [90, 451, 0] as XYZ,
  cap: [97.730_110_296_764_45, 453.509_831_645_591_3, 0] as XYZ,
};

const same = (a: XYZ | undefined, b: XYZ) =>
  a?.length === 3 && a.every((v, i) => v === b[i]);
const vertex = (id: string) => JSON.stringify([id]);

/** Join an existing connector approach at a surveyed bend. Every added portion
 * retains its original directed link and the native corridor-door transition. */
export function reviewedConnectorCorridorJunction(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  outgoing: ReadonlyMap<string, PathwayArc[]>,
  guides: Iterable<PreparedRouting["guides"][number]>,
  checkDonor: (arc: PathwayArc) => boolean,
) {
  const s = survey;
  const result: PathwayArc[] = [];
  if (data.source.modelSha256 !== s.model) return result;
  const room = data.records.find((r) => r.key === s.room);
  if (
    !room?.circulation ||
    !room.walkable ||
    room.access === "staff" ||
    room.levelId !== s.level
  )
    return result;
  const sourceId = s.cell + ":walk:" + [s.ramp, s.door].sort().join("|");
  const donorId = "walk:" + s.ramp;
  const incoming = (outgoing.get(vertex(s.owner)) ?? []).find(
    (a) => a.link.edge.id === donorId && a.to === vertex(s.ramp),
  );
  const returning = (outgoing.get(vertex(s.ramp)) ?? []).find(
    (a) => a.link.edge.id === donorId && a.to === vertex(s.owner),
  );
  if (
    !incoming ||
    !returning ||
    ![incoming, returning].every(
      (a) =>
        a.link.edge.enabled &&
        a.link.blockers.length === 0 &&
        a.link.requiredRooms.length === 0 &&
        a.link.passages.length === 0 &&
        a.link.edge.roomKeys.includes(s.room),
    )
  )
    return result;
  const cut = incoming.points.findIndex((p) => same(p, s.station));
  if (
    cut <= 0 ||
    cut >= incoming.points.length - 1 ||
    incoming.points.length !== returning.points.length ||
    !incoming.points.every((p, i) =>
      same(p, returning.points[incoming.points.length - 1 - i]),
    )
  )
    return result;
  const fromDoor = (outgoing.get(vertex(s.door)) ?? []).some(
    (a) =>
      a.link.edge.id === s.doorway &&
      a.link.edge.enabled &&
      same(a.points[0], s.cap),
  );
  const toDoor = (outgoing.get(vertex(s.doorway + ":0")) ?? []).some(
    (a) =>
      a.to === vertex(s.door) &&
      a.link.edge.id === s.doorway &&
      a.link.edge.enabled &&
      same(a.points.at(-1), s.cap),
  );
  if (!fromDoor || !toDoor) return result;
  const shared = JSON.stringify([
    "connector-corridor-junction",
    s.cell,
    donorId,
    ...s.station,
  ]);
  const points = [s.station, s.via, s.cap];
  const checkStrip = (p: XYZ[]) =>
    reviewedCorridorStripSupported(data, s.cell, s.level, 0, p);
  let checked: boolean | undefined;
  const supported = () =>
    (checked ??=
      checkDonor(incoming) &&
      checkDonor(returning) &&
      corridorRunAvoidsOtherBranches(points, guides, s.cell) &&
      [incoming.points[cut - 1], incoming.points[cut + 1]].every((adjacent) => {
        const joined = [adjacent, ...points];
        return checkStrip(joined) && checkStrip(joined.toReversed());
      }));
  const scale = data.alignment.horizontalMetresPerFoot;
  for (const [from, to] of [
    [s.ramp, s.door],
    [s.door, s.ramp],
  ]) {
    const link = graph.adjacency
      .get(from)
      ?.find((v) => v.to === to && v.edge.id === sourceId);
    if (
      !link ||
      link.requiredRooms.length > 0 ||
      link.blockers.length > 0 ||
      link.passages.length > 0 ||
      !link.edge.enabled ||
      link.edge.nativeCellId !== s.cell ||
      link.edge.kind !== "walk" ||
      link.edge.from !== s.ramp ||
      link.edge.to !== s.door ||
      !link.edge.roomKeys.includes(s.room) ||
      !same(link.edge.pointsFeet[0], incoming.points.at(-1)!) ||
      !same(link.edge.pointsFeet.at(-1), s.cap)
    )
      continue;
    const forward = from === s.ramp;
    result.push({
      from: forward ? shared : vertex(s.door),
      to: forward ? vertex(s.door) : shared,
      sourceFrom: from,
      sourceTo: to,
      link,
      points: forward ? points : points.toReversed(),
      metres: corridorGuideLength(points) * scale,
      validateReviewedRun: supported,
    });
  }
  if (result.length === 0) return result;
  for (const arc of [incoming, returning]) {
    const i = arc === incoming ? cut : arc.points.length - 1 - cut;
    const before = arc.points.slice(0, i + 1),
      after = arc.points.slice(i);
    const guard = () => checkDonor(arc);
    result.push(
      {
        ...arc,
        to: shared,
        points: before,
        metres: corridorGuideLength(before) * scale,
        validateReviewedRun: guard,
      },
      {
        ...arc,
        from: shared,
        points: after,
        metres: corridorGuideLength(after) * scale,
        validateReviewedRun: guard,
      },
    );
  }
  return result;
}
