import type { IndoorDataset, IndoorEdge } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import type { ProjectRoutingGraph } from "./routing-graph";
import type { SharedPathwayStop } from "./shared-pathway-routing";
import type { RoomPathwayBranch } from "./room-pathway-branch";
import type { SharedGuidePoint as Point } from "./shared-corridor-guides";
import {
  corridorRunAvoidsOtherBranches,
  reviewedCorridorStripSupported,
} from "./native-public-corridor-strip";

export const reviewedClassroomKey = "rm-311-40372a304749";
const hallwayKey = "rm-311-403b1c30474d";
const hallway = "native-cell:0.000000:71";
const roomCell = "native-cell:0.000000:369";
const door = "door:311:1030100";
const stationNode = "door:311:1030152:1";
const points: Point[] = [
  [265.498_247_682_535_46, 226.572_538_451_437_28, 0],
  [262.445_274_536_371_64, 228.480_247_802_675_76, 0],
  [259.370_757_748_173_16, 223.602_531_196_300_36, 0],
];
type Candidate = {
  stop: SharedPathwayStop;
  departure: boolean;
  arrival: boolean;
};

/** Select an existing admitted station for an endpoint-only classroom branch.
 * The native room, door and hallway provide the original directed permissions. */
export function reviewedClassroomEntrance(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  edges: ReadonlyMap<string, IndoorEdge>,
  candidates: Iterable<Candidate>,
  guides: Iterable<PreparedRouting["guides"][number]>,
  usable: (e: IndoorEdge) => boolean,
  activeCore: (id: string) => boolean,
) {
  const room = graph.records.get(reviewedClassroomKey),
    hall = graph.records.get(hallwayKey);
  const gate = data.doors?.find((d) => d.id === door),
    gateEdge = edges.get(door);
  if (
    data.source.modelSha256 !==
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" ||
    data.source.roomsSha256 !==
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9" ||
    room?.number !== "05-175" ||
    room.name !== "Classroom" ||
    !room.arrivalNodeId ||
    room.levelId !== 311 ||
    hall?.number !== "05-187" ||
    !hall.circulation ||
    !hall.walkable ||
    hall.access === "staff" ||
    !gateEdge?.enabled ||
    gate?.hostWallNativeElementId !== 1_030_070 ||
    gate.roomKeys[0] !== room.key ||
    gate.roomKeys[1] !== hall.key ||
    gateEdge.from !== door + ":0" ||
    gateEdge.to !== door + ":1"
  )
    return null;
  const via = (from: string, to: string, edgeId: string, roomAllowed = false) =>
    graph.adjacency
      .get(from)
      ?.some(
        (l) =>
          l.to === to &&
          l.edge.id === edgeId &&
          l.edge.enabled &&
          l.blockers.length === 0 &&
          l.passages.length === 0 &&
          l.requiredRooms.every((k) => roomAllowed && k === room.key),
      ) === true;
  const roomWalk =
    roomCell + ":walk:" + room.arrivalNodeId + "|" + gateEdge.from;
  const hallWalk = hallway + ":walk:" + gateEdge.to + "|" + stationNode;
  const leave =
    via(room.arrivalNodeId, gateEdge.from, roomWalk, true) &&
    via(gateEdge.from, gateEdge.to, door, true) &&
    via(gateEdge.to, stationNode, hallWalk);
  const enter =
    via(stationNode, gateEdge.to, hallWalk) &&
    via(gateEdge.to, gateEdge.from, door, true) &&
    via(gateEdge.from, room.arrivalNodeId, roomWalk, true);
  if (!leave && !enter) return null;
  const point = points.at(-1)!;
  const target = [...candidates].find((c) => {
    const edge = edges.get(c.stop.guideEdgeId);
    return (
      edge &&
      c.stop.cellId === hallway &&
      c.stop.terminalNodeId === stationNode &&
      c.stop.pointFeet.every((n, i) => n === point[i]) &&
      c.departure &&
      c.arrival &&
      activeCore(edge.id) &&
      usable(edge)
    );
  });
  if (
    !target ||
    !corridorRunAvoidsOtherBranches(points, guides, hallway) ||
    !reviewedCorridorStripSupported(data, hallway, 311, 0, points, {
      roomKey: room.key,
      roomCell,
      doorId: door,
    })
  )
    return null;
  const stop = { ...target.stop, entranceEdgeId: door };
  const branch: RoomPathwayBranch = {
    roomKey: room.key,
    entranceId: door,
    guideId: stop.guideEdgeId,
    stopId: stop.stopId,
    roomSidePoint: points[0],
    pathToHallway: points,
    shape: "saved",
  };
  return {
    stop,
    branch,
    directions: { roomToHallway: leave, hallwayToRoom: enter },
  };
}
export const classroomStationTerminal = stationNode;
