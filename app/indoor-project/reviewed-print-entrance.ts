import type { IndoorDataset, IndoorEdge, IndoorNode } from "./contract";
import type { ProjectRoutingGraph, ProjectRoutingLink } from "./routing-graph";
import type { RoomPathwayBranch } from "./room-pathway-branch";
import type { PathwayArc, SharedPathwayStop } from "./shared-pathway-routing";
import {
  nativeCirculationCells,
  nativeCirculationExactCellParts,
} from "./native-circulation";
import { createCorridorGuideSupport } from "./corridor-guide-support";
import { createNativeDoorApproachQuery } from "./native-door-approach";
import { createDoorPassageQuery } from "./route-passages";
import { createNativeFloorHoleQuery } from "./walking-support";
import { createIndoorExclusionQuery } from "./indoor-exclusions";
import { nativeWalkTouchesTransitRoom } from "./native-walk-transit-owners";
import { reviewedPrintBridgeMatches } from "./reviewed-print-door-bridge";
import { sourceFallbackBarrierHits } from "./source-fallback-barriers";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";

// Owner-confirmed pre-room behind the Print entrance. Only these three
// identities may be crossed. The neighboring offices are terminal branches.
const printKey = "rm-694-3b5fdcfee0f0",
  storage = "rm-694-3b62e4fee0f2",
  officeArea = "rm-694-44498dfee60e";
const hallKey = "rm-694-43c823fdc35c",
  cellId = "native-cell:14.435696:702";
const through = new Set([printKey, storage, officeArea]);
const offices = [
  {
    key: "rm-694-3b5c74fee0ed",
    number: "08-244",
    area: storage,
    door: 2491634,
    host: 1993293,
    outside: 0,
  },
  {
    key: "rm-694-3b4b5cfee0de",
    number: "08-246",
    area: officeArea,
    door: 1995965,
    host: 1992999,
    outside: 1,
  },
  {
    key: "rm-694-3b4edcfee0e1",
    number: "08-248",
    area: officeArea,
    door: 1996013,
    host: 1992999,
    outside: 1,
  },
] as const;
const sourceVertex = (id: string) => JSON.stringify([id]);
const terminal = (key: string) => "arrival:" + key;
const same = (p: XYZ, q: XYZ) => p.every((v, i) => v === q[i]);

export function isReviewedPrintArea(data: IndoorDataset, key: string) {
  return (key === storage || key === officeArea) && matchesSource(data);
}
function matchesSource(data: IndoorDataset) {
  return (
    data.source.modelSha256 ===
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" &&
    data.source.roomsSha256 ===
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9"
  );
}
type OfficeBranch = {
  stop: SharedPathwayStop;
  branch: RoomPathwayBranch;
  directions: { roomToHallway: boolean; hallwayToRoom: boolean };
};
export function buildReviewedPrintPreRoom(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  nodes: Map<string, IndoorNode>,
  recordedStop?: (key: string, departure: boolean) => SharedPathwayStop | null,
) {
  // The north end of the public pre-room opens onto 08-240. Continue the
  // existing corridor station's axis when both office approaches still fit.
  const corridorKey = "rm-694-3b51e4fee0e4",
    corridor = graph.records.get(corridorKey);
  const officeKey = "rm-694-3b7e74fee10a"; // 08-243
  let north: SharedPathwayStop | undefined;
  if (
    recordedStop &&
    matchesSource(data) &&
    corridor?.number === "08-240" &&
    corridor.circulation &&
    corridor.walkable &&
    corridor.access !== "staff"
  ) {
    const stop =
      recordedStop(officeKey, true) ?? recordedStop(officeKey, false);
    if (
      stop &&
      stop.cellId === cellId &&
      !stop.station &&
      stop.entranceEdgeId === "door:694:1996146" &&
      stop.terminalNodeId === "door:694:1996146:1" &&
      nodes.get(stop.terminalNodeId)?.roomKey === corridorKey
    )
      north = stop;
  }
  if (north) {
    const aligned = buildPreRoom(data, graph, nodes, north, true);
    const joint = JSON.stringify([north.terminalNodeId, north.stopId]);
    if (
      aligned.branches.has(offices[0].key) &&
      aligned.branches.has(offices[1].key) &&
      aligned.arcs.some((a) => a.from === joint || a.to === joint)
    )
      return aligned;
  }
  return buildPreRoom(data, graph, nodes, north, false);
}

function buildPreRoom(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  nodes: Map<string, IndoorNode>,
  north: SharedPathwayStop | undefined,
  aligned: boolean,
) {
  const arcs: PathwayArc[] = [];
  const branches = new Map<string, OfficeBranch>();
  const result = { arcs, branches };
  if (!matchesSource(data)) return result;
  for (const [key, number] of [
    [printKey, "08-247"],
    [storage, "08-245"],
    [officeArea, "08-249"],
    [hallKey, "08-202"],
  ]) {
    const record = graph.records.get(key!);
    if (
      record?.number !== number ||
      !record.walkable ||
      record.access === "staff" ||
      record.levelId !== 694 ||
      record.building !== "08"
    )
      return result;
  }
  const cell = nativeCirculationCells(data, {
    cellIds: new Set([cellId]),
  }).find((c) => c.id === cellId);
  const face = cell && nativeCirculationExactCellParts(data, cell);
  if (!face?.length || !cell) return result;
  const local = data.edges.filter(
    (e) => e.nativeCellId === cellId && e.kind === "walk",
  );
  const support = createCorridorGuideSupport(
    face,
    cell.elevationFeet,
    local,
    createNativeDoorApproachQuery(data),
  );
  const passage = createDoorPassageQuery(data),
    holes = createNativeFloorHoleQuery(data),
    outside = createIndoorExclusionQuery(data);
  const xy = (p: XYZ): [number, number] => [p[0], p[1]];
  const link = (from: string, to: string, id?: string) =>
    graph.adjacency
      .get(from)
      ?.find((l) => l.to === to && (!id || l.edge.id === id));
  const orient = (e: IndoorEdge, id: string) =>
    e.from === id ? e.pointsFeet : e.pointsFeet.toReversed();
  const clear = (p: XYZ[]) => !holes(p).length && !outside(p).length;
  const portal = (
    id: number,
    host: number,
    side: number,
    inKey: string,
    outKey: string,
  ) => {
    const key = "door:694:" + id,
      from = key + ":" + side,
      to = key + ":" + (1 - side);
    const door = data.doors?.find((d) => d.id === key);
    const forward = link(from, to, key),
      reverse = link(to, from, key),
      edge = (forward ?? reverse)?.edge;
    if (
      !door?.normalFeet ||
      door.state !== "connected" ||
      door.nativeElementId !== id ||
      door.hostWallNativeElementId !== host ||
      nodes.get(from)?.roomKey !== inKey ||
      nodes.get(to)?.roomKey !== outKey ||
      !edge ||
      edge.kind !== "door"
    )
      return;
    const points = orient(edge, from);
    if (
      !points.length ||
      !same(points[0]!, nodes.get(from)!.pointFeet) ||
      !same(points.at(-1)!, nodes.get(to)!.pointFeet) ||
      !clear(points) ||
      passage(694, points).some((p) => p.edge.id !== edge.id)
    )
      return;
    const grossWallHits = sourceFallbackBarrierHits(
      data,
      {
        pointsFeet: points,
        levelIds: [694],
        edgeIds: [edge.id],
        centered: false,
        sourceReason: "no-clearance-route",
      },
      [edge],
    );
    if (
      (id === 1996013 || grossWallHits.length > 0) &&
      !reviewedPrintBridgeMatches(data, edge, grossWallHits)
    )
      return;
    const legitimate = (l?: ProjectRoutingLink) =>
      l &&
      l.requiredRooms.every((k) => k === inKey || k === outKey) &&
      l.passages.every((p) => p.edge.id === key)
        ? l
        : undefined;
    return {
      door,
      from,
      to,
      points,
      forward: legitimate(forward),
      reverse: legitimate(reverse),
      edge,
    };
  };
  function insert(
    l: ProjectRoutingLink,
    from: string,
    to: string,
    fromVertex: string,
    toVertex: string,
    points: XYZ[],
  ) {
    arcs.push({
      from: fromVertex,
      to: toVertex,
      sourceFrom: from,
      sourceTo: to,
      points,
      metres:
        corridorGuideLength(points) * data.alignment.horizontalMetresPerFoot,
      link: { ...l, requiredRooms: [] },
      reviewedPreRoom: true,
    });
  }
  // The original source links establish directional access. Their old arrival
  // coordinates are never consulted for shape, distance, station or junction.
  function addWalk(
    from: string,
    to: string,
    points: XYZ[],
    fromVertex: string,
    endVertex: string,
    cap?: string,
    servedOffice?: string,
  ) {
    const f = link(from, to),
      r = link(to, from),
      e = (f ?? r)?.edge;
    if (
      !e ||
      e.kind !== "walk" ||
      e.nativeCellId !== cellId ||
      !clear(points) ||
      passage(694, points).length ||
      !support.supported(points.map(xy), cap)
    )
      return false;
    for (const key of e.roomKeys) {
      const room = graph.records.get(key);
      if (
        !room ||
        (!through.has(key) &&
          !room.circulation &&
          !room.stair &&
          nativeWalkTouchesTransitRoom(
            data,
            { ...e, pointsFeet: points },
            room,
          ))
      )
        return false;
    }
    // Only the last office approach may replace a source trace that clipped
    // that particular office. The exact candidate above must avoid it wholly.
    const admissible = (l?: ProjectRoutingLink) =>
      !!l &&
      !l.passages.length &&
      l.requiredRooms.every(
        (k) => through.has(k) || (k === servedOffice && e.roomKeys.includes(k)),
      );
    const forward = admissible(f),
      reverse = admissible(r);
    if (forward) insert(f!, from, to, fromVertex, endVertex, points);
    if (reverse)
      insert(r!, to, from, endVertex, fromVertex, points.toReversed());
    return forward || reverse;
  }
  const entrance = portal(2463553, 2463308, 0, printKey, hallKey);
  if (!entrance || (!entrance.forward && !entrance.reverse)) return result;
  const start = entrance.points[0]!,
    other = entrance.points.at(-1)!;
  const frames = offices.map((o) => {
    const door = data.doors?.find(
      (d) => d.nativeElementId === o.door && d.levelId === 694,
    );
    const key = "door:694:" + o.door,
      side = nodes.get(key + ":" + o.outside),
      otherSide = nodes.get(key + ":" + (1 - o.outside));
    if (
      !door?.normalFeet ||
      door.hostWallNativeElementId !== o.host ||
      side?.roomKey !== o.area ||
      otherSide?.roomKey !== o.key
    )
      return;
    const [nx, ny] = door.normalFeet;
    if (Math.abs(ny) > 1e-10 || Math.abs(Math.abs(nx) - 1) > 1e-10) return;
    const direction = Math.sign(side.pointFeet[0] - otherSide.pointFeet[0]);
    if (!direction) return;
    return {
      office: o,
      side,
      offsetX: side.pointFeet[0] + 2 * direction,
      sideDirection: direction,
    };
  });
  if (frames.some((f) => !f)) return result;
  const laneX =
    aligned && north
      ? north.pointFeet[0]
      : frames.map((f) => f!.offsetX).sort((a, b) => a - b)[1]!;
  const dx = start[0] - other[0];
  if (!dx || (laneX - start[0]) / dx <= 0) return result;
  const hub: XYZ = [
    laneX,
    start[1] + ((laneX - start[0]) * (start[1] - other[1])) / dx,
    start[2],
  ];
  const hubId = JSON.stringify(["reviewed-print-trunk", "junction"]);
  if (
    !addWalk(
      entrance.from,
      terminal(printKey),
      [start, hub],
      sourceVertex(entrance.from),
      hubId,
      entrance.from,
    )
  )
    return result;
  if (entrance.forward)
    insert(
      entrance.forward,
      entrance.from,
      entrance.to,
      sourceVertex(entrance.from),
      sourceVertex(entrance.to),
      entrance.points,
    );
  if (entrance.reverse)
    insert(
      entrance.reverse,
      entrance.to,
      entrance.from,
      sourceVertex(entrance.to),
      sourceVertex(entrance.from),
      entrance.points.toReversed(),
    );

  // The nearest office on each side of the junction supplies the first station.
  // A farther door extends the same spine along a real, admitted door-to-door walk.
  const lastStation = new Map<
    number,
    { node: string; vertex: string; point: XYZ }
  >();
  for (const frame of frames
    .map((f) => f!)
    .sort(
      (a, b) =>
        Math.abs(a.side.pointFeet[1] - hub[1]) -
        Math.abs(b.side.pointFeet[1] - hub[1]),
    )) {
    const { office, side } = frame,
      record = graph.records.get(office.key);
    if (
      !record?.walkable ||
      record.access === "staff" ||
      record.number !== office.number
    )
      continue;
    const door = portal(
      office.door,
      office.host,
      1 - office.outside,
      office.key,
      office.area,
    );
    if (!door || (!door.forward && !door.reverse)) continue;
    const point: XYZ = [laneX, side.pointFeet[1], hub[2]],
      slope = Math.sign(point[1] - hub[1]);
    if (!slope || (point[0] - side.pointFeet[0]) * frame.sideDirection <= 0)
      continue;
    const approach = [point, side.pointFeet];
    if (
      !clear(approach) ||
      passage(694, approach).length ||
      !support.supported(approach.map(xy), side.id) ||
      !support.edgeSupported(door.points.map(xy), door.from, door.to)
    )
      continue;
    const stopId = JSON.stringify([cellId, ...point]),
      station = JSON.stringify([side.id, stopId]);
    const previous = lastStation.get(slope);
    const parent = terminal(office.area),
      vParent = JSON.stringify(["reviewed-print-trunk", slope]);
    const sourceId = previous?.node ?? parent;
    const permission = link(sourceId, side.id) ?? link(side.id, sourceId);
    if (!permission) continue;
    const protectedRooms = permission.edge.roomKeys.map((k) =>
      graph.records.get(k),
    );
    if (
      protectedRooms.some(
        (r) =>
          !r ||
          (!through.has(r.key) &&
            !r.circulation &&
            !r.stair &&
            nativeWalkTouchesTransitRoom(
              data,
              { ...permission.edge, pointsFeet: approach },
              r,
            )),
      )
    )
      continue;
    const checkpoint = arcs.length;
    if (!previous) {
      // Two source walks prove the branch. The split is collinear and is
      // internal to the graph, not an arrival or a direction change.
      const mid: XYZ = [laneX, (hub[1] + point[1]) / 2, hub[2]];
      if (
        !addWalk(terminal(printKey), parent, [hub, mid], hubId, vParent) ||
        !addWalk(
          parent,
          side.id,
          [mid, point],
          vParent,
          station,
          undefined,
          office.key,
        )
      ) {
        arcs.length = checkpoint;
        continue;
      }
    } else if (
      !addWalk(
        previous.node,
        side.id,
        [previous.point, point],
        previous.vertex,
        station,
        undefined,
        office.key,
      )
    ) {
      arcs.length = checkpoint;
      continue;
    }
    const edgeId = permission.edge.id;
    const stop = {
      stopId,
      pointFeet: point,
      levelId: 694,
      building: "08",
      cellId,
      terminalNodeId: side.id,
      guideEdgeId: edgeId,
      entranceEdgeId: door.edge.id,
    };
    branches.set(office.key, {
      stop,
      branch: {
        roomKey: office.key,
        entranceId: door.edge.id,
        guideId: edgeId,
        stopId,
        roomSidePoint: door.points[0]!,
        pathToHallway: [...door.points, point],
        shape: "saved",
      },
      directions: {
        roomToHallway: !!door.forward,
        hallwayToRoom: !!door.reverse,
      },
    });
    lastStation.set(slope, { node: side.id, vertex: station, point });
  }
  const westOffice = offices[0],
    end = branches.get(westOffice.key)?.stop;
  if (north && end) {
    const points = [north.pointFeet, end.pointFeet];
    if (
      !sourceFallbackBarrierHits(
        data,
        {
          pointsFeet: points,
          levelIds: [694],
          edgeIds: [],
          centered: false,
          sourceReason: "no-clearance-route",
        },
        [],
      ).length
    ) {
      addWalk(
        north.terminalNodeId,
        end.terminalNodeId,
        points,
        JSON.stringify([north.terminalNodeId, north.stopId]),
        JSON.stringify([end.terminalNodeId, end.stopId]),
        undefined,
        westOffice.key,
      );
    }
  }
  if (!branches.size) arcs.length = 0;
  return result;
}
