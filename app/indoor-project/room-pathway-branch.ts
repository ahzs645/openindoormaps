import type { IndoorDataset, IndoorEdge, IndoorNode } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import type { ProjectRoutingGraph } from "./routing-graph";
import type { SharedPathwayStop } from "./shared-pathway-routing";
import { routingCalculationValue } from "./routing-cache";
import { createNativeDoorApproachQuery } from "./native-door-approach";
import { nativeRoomDoorJunction } from "./native-room-door-junction";
import { nativeDoorClearOpening } from "./native-door-clear-opening";
import { createTwoFootCorridorSupport } from "./corridor-guide-support";
import {
  nativeCirculationExactCellParts,
  nativeCirculationCells,
} from "./native-circulation";
import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { nativeRationalPathSupported } from "./native-exact-planar-topology";
import { createNativeTransitRefinementPolicy } from "./native-walk-transit-owners";
import { createDoorPassageQuery } from "./route-passages";
import { createIndoorExclusionQuery } from "./indoor-exclusions";
import { createNativeFloorHoleQuery } from "./walking-support";
import { corridorGuideLength } from "./shared-corridor-guides";
import * as DMath from "./deterministic-math";

type XY = [number, number];
type XYZ = [number, number, number];
type Guide = PreparedRouting["guides"][number];
const xy = (p: XYZ): XY => [p[0], p[1]];
const delta = (p: readonly number[], q: readonly number[]): XY => [
  p[0] - q[0],
  p[1] - q[1],
];
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const same = (a: XYZ, b: XYZ) => a.every((n, i) => n === b[i]);

export type RoomPathwayBranch = {
  roomKey: string;
  entranceId: string;
  guideId: string;
  stopId: string;
  roomSidePoint: XYZ;
  pathToHallway: XYZ[];
  shape: "saved" | "wall-normal";
  previousStopId?: string;
  trunkToPreviousStopFeet?: XYZ[];
  reason?: string;
  normalProof?: {
    hostWallNativeElementId: number;
    nativeDoorElementId: number;
    normalFeet: XY;
    hallwayJoinFeet: XYZ;
    hallwayGuideEdgeId: string;
    hallwaySegment: number;
    fraction: number;
    thresholdFeet: XYZ;
    bodyWidthFeet: 2;
    nativeCapJunction?: true;
  };
};
/** Ray–finite segment intersection. A gap or an extension of a saved lane
 * cannot supply a join; the parameter identifies the original segment. */
export function wallNormalJoin(room: XYZ, normal: XY, a: XYZ, b: XYZ) {
  if (a[2] !== room[2] || b[2] !== room[2]) return null;
  const v = delta(b, a),
    w = delta(a, room),
    det = cross(normal, v);
  if (det === 0) return null;
  const distance = cross(w, v) / det,
    fraction = cross(w, normal) / det;
  if (!(distance > 0 && fraction >= 0 && fraction <= 1)) return null;
  const point: XYZ =
    fraction === 0
      ? [...a]
      : fraction === 1
        ? [...b]
        : [a[0] + fraction * v[0], a[1] + fraction * v[1], a[2]];
  return { point, fraction, distance };
}

export function createRoomPathwayBranches(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  guides: Map<string, Guide>,
  edges: Map<string, IndoorEdge>,
  nodes: Map<string, IndoorNode>,
  usable: (e: IndoorEdge) => boolean,
) {
  const doors = new Map(data.doors?.map((d) => [d.id, d]));
  const cells = new Map(nativeCirculationCells(data).map((c) => [c.id, c]));
  const incident = new Map<string, IndoorEdge[]>();
  for (const edge of edges.values()) {
    if (edge.kind !== "walk" || !edge.enabled || !edge.nativeCellId) continue;
    for (const id of [edge.from, edge.to]) {
      const list = incident.get(id) ?? [];
      list.push(edge);
      incident.set(id, list);
    }
  }
  const passage = createDoorPassageQuery(data),
    outside = createIndoorExclusionQuery(data),
    holes = createNativeFloorHoleQuery(data);
  const halves = routingCalculationValue(
    data,
    "native-door-approach-query",
    () => createNativeDoorApproachQuery(data),
  );
  const cache = new Map<string, RoomPathwayBranch | null>();
  return (room: string, stop: SharedPathwayStop): RoomPathwayBranch | null => {
    const id = JSON.stringify([
      room,
      stop.entranceEdgeId,
      stop.stopId,
      stop.guideEdgeId,
    ]);
    if (cache.has(id)) return structuredClone(cache.get(id)!);
    const branch = resolve(room, stop);
    cache.set(id, branch);
    return structuredClone(branch);
  };
  function resolve(
    room: string,
    stop: SharedPathwayStop,
  ): RoomPathwayBranch | null {
    const edge = edges.get(stop.entranceEdgeId ?? ""),
      guide = guides.get(stop.guideEdgeId),
      walk = edges.get(stop.guideEdgeId);
    const terminal = stop.terminalNodeId;
    if (
      !edge ||
      !guide?.hallwayJoins ||
      !walk ||
      ![edge.from, edge.to].includes(terminal) ||
      ![walk.from, walk.to].includes(terminal)
    )
      return null;
    const inside = edge.from === terminal ? edge.to : edge.from;
    const originalDoor =
      edge.from === inside ? edge.pointsFeet : edge.pointsFeet.toReversed();
    if (
      nodes.get(inside)?.roomKey !== room ||
      !same(originalDoor.at(-1)!, nodes.get(terminal)!.pointFeet)
    )
      return null;
    const [first, last] = guide.hallwayJoins;
    const approach =
      walk.from === terminal
        ? guide.pointsFeet.slice(0, first + 1)
        : guide.pointsFeet.slice(last).toReversed();
    if (
      !same(approach[0], originalDoor.at(-1)!) ||
      !same(approach.at(-1)!, stop.pointFeet)
    )
      return null;
    const old = [...originalDoor, ...approach.slice(1)],
      start = old[0],
      z = start[2];
    const saved: RoomPathwayBranch = {
      roomKey: room,
      entranceId: edge.id,
      guideId: walk.id,
      stopId: stop.stopId,
      roomSidePoint: start,
      pathToHallway: old,
      shape: "saved",
    };
    const refuse = (reason: string): RoomPathwayBranch => ({
      ...saved,
      reason,
    });
    const door = doors.get(edge.id);
    if (
      edge.kind !== "door" ||
      !door?.normalFeet ||
      !door.footprintFeet ||
      !door.hostWallNativeElementId ||
      door.state !== "connected" ||
      edge.nativeElementId !== door.nativeElementId ||
      old.some((p) => p[2] !== z)
    )
      return refuse("no-native-host-normal");
    const n0 = door.normalFeet,
      h = DMath.hypot(...n0),
      sign = dot(n0, delta(originalDoor.at(-1)!, start)) > 0 ? 1 : -1;
    if (!(h > 0)) return refuse("no-native-host-normal");
    const normal: XY = [(n0[0] * sign) / h, (n0[1] * sign) / h];
    const station = dot(delta(door.pointFeet, start), normal);
    if (station <= 0) return refuse("room-point-is-not-before-threshold");
    const threshold: XYZ = [
      start[0] + station * normal[0],
      start[1] + station * normal[1],
      z,
    ];
    const roomWalks = (incident.get(inside) ?? []).filter(
      (e) =>
        e.nativeCellId !== stop.cellId &&
        cells.get(e.nativeCellId!)?.roomKeys.includes(room),
    );
    if (roomWalks.length === 0) return refuse("missing-room-side-native-walk");
    // Only a source-admitted, bidirectional corridor run can carry a short
    // continuation back to this exact existing directory stop. Other model
    // levels, nearest lines and graphical core extensions are never joined.
    const atStop = (incident.get(terminal) ?? [])
      .flatMap((e) => {
        const edgeId = e.id,
          g = guides.get(edgeId);
        if (!g?.hallwayJoins || e.nativeCellId !== stop.cellId) return [];
        const [lo, hi] = g.hallwayJoins;
        if (
          ![e.from, e.to].every((n) =>
            graph.adjacency
              .get(n)
              ?.some(
                (l) =>
                  l.edge.id === edgeId &&
                  l.requiredRooms.length === 0 &&
                  l.passages.length === 0,
              ),
          )
        )
          return [];
        const core = g.pointsFeet.slice(lo, hi + 1);
        const candidates = [];
        for (const [target, v] of core.entries()) {
          // The source graph must actually attach this core to the room's
          // selected hallway terminal. A coincident native point on another
          // independent lane cannot move a directory endpoint onto that lane.
          const ownJoin =
            (e.from === terminal && target === 0) ||
            (e.to === terminal && target === core.length - 1);
          if (!ownJoin || !same(v, stop.pointFeet)) continue;
          for (let i = 0; i + 1 < core.length; i++) {
            const hit = wallNormalJoin(start, normal, core[i], core[i + 1]);
            if (!hit || hit.distance <= station) continue;
            const end =
              target <= i
                ? core.slice(target, i + 1).toReversed()
                : core.slice(i + 1, target + 1);
            const tail = [hit.point, ...end].filter(
              (p, j, all) => !j || !same(p, all[j - 1]),
            );
            // A full circuit or a remote cross-track return cannot improve a
            // short doorway branch; remain within its original measured extent.
            if (corridorGuideLength(tail) > corridorGuideLength(old)) continue;
            candidates.push({ edge: e, hit, i: lo + i, tail });
          }
        }
        return candidates;
      })
      .sort(
        (a, b) =>
          a.hit.distance - b.hit.distance ||
          corridorGuideLength(a.tail) - corridorGuideLength(b.tail) ||
          a.edge.id.localeCompare(b.edge.id) ||
          a.i - b.i,
      );
    if (atStop.length === 0) return refuse("normal-misses-admitted-saved-core");
    try {
      const opening =
        nativeDoorClearOpening(data, door, z) ?? door.footprintFeet;
      const tangent: XY = [-normal[1], normal[0]];
      const width: XY[] = [-1, 1].map((s) => [
        threshold[0] + s * tangent[0],
        threshold[1] + s * tangent[1],
      ]);
      if (
        !nativeRationalPathSupported(
          width,
          nativeRationalOverlay("union", [[opening]]),
        )
      )
        return refuse("body-exceeds-native-opening");
      const hall = cells.get(stop.cellId),
        hallFace = hall && nativeCirculationExactCellParts(data, hall);
      const hallHalf = halves(walk, new Set([terminal])).flatMap((s) =>
        s.z === z ? (s.exactParts ?? []) : [],
      );
      if (!hall || !hallFace?.length || hallHalf.length === 0)
        return refuse("missing-hallway-face-or-door-half");
      const turnFit = createTwoFootCorridorSupport(hallFace, z);
      const original = passage(stop.levelId, old);
      if (
        original.length !== 1 ||
        original[0].edge.id !== edge.id ||
        original[0].forward !== (edge.from === inside)
      )
        return refuse("door-passage-mismatch");
      const refusals = new Set<string>();
      for (const rw of roomWalks) {
        const rc = cells.get(rw.nativeCellId!),
          rf = rc && nativeCirculationExactCellParts(data, rc);
        const roomHalf = halves(rw, new Set([inside])).flatMap((s) =>
          s.z === z ? (s.exactParts ?? []) : [],
        );
        if (!rc || !rf?.length || roomHalf.length === 0) {
          refusals.add("missing-room-face-or-door-half");
          continue;
        }
        const body = createTwoFootCorridorSupport(
          nativeRationalOverlay("union", rf, hallFace, roomHalf, hallHalf),
          z,
        );
        let junction: NativeRationalParts | undefined;
        const allowed = createNativeTransitRefinementPolicy(
          data,
          [rw, walk],
          old,
        );
        for (const c of atStop) {
          if (!usable(c.edge)) {
            refusals.add("hallway-guide-replay-refused");
            continue;
          }
          const path = [start, c.hit.point];
          const passed = passage(stop.levelId, path);
          if (
            passed.length !== 1 ||
            passed[0].edge.id !== edge.id ||
            passed[0].forward !== original[0].forward
          ) {
            refusals.add("changed-door-passage");
            continue;
          }
          if (
            outside(path).length > 0 ||
            holes(path).length > 0 ||
            !allowed(path)
          ) {
            refusals.add("source-floor-or-transit-refused");
            continue;
          }
          const line = path.map(xy);
          const needsJunction = !body(line);
          if (needsJunction) {
            junction ??= nativeRoomDoorJunction(
              data,
              opening,
              normal,
              rc,
              hall,
            );
            if (junction.length === 0 || !body(line, junction)) {
              refusals.add("two-foot-native-strip-refused");
              continue;
            }
          }
          const [x, y] = c.hit.point;
          if (
            !turnFit([
              [x - 1, y],
              [x + 1, y],
            ])
          ) {
            refusals.add("two-foot-turn-at-junction-refused");
            continue;
          }
          return {
            ...saved,
            shape: "wall-normal",
            pathToHallway: [start, c.hit.point],
            stopId: JSON.stringify([stop.cellId, ...c.hit.point]),
            previousStopId: stop.stopId,
            trunkToPreviousStopFeet: c.tail,
            normalProof: {
              hostWallNativeElementId: door.hostWallNativeElementId,
              nativeDoorElementId: door.nativeElementId,
              normalFeet: normal,
              hallwayJoinFeet: c.hit.point,
              hallwayGuideEdgeId: c.edge.id,
              hallwaySegment: c.i,
              fraction: c.hit.fraction,
              thresholdFeet: threshold,
              bodyWidthFeet: 2,
              ...(needsJunction ? { nativeCapJunction: true as const } : {}),
            },
          };
        }
      }
      return refuse(
        [...refusals].sort().join(",") ||
          "native-body-or-passage-proof-refused",
      );
    } catch {
      return refuse("native-body-proof-unavailable");
    }
  }
}
