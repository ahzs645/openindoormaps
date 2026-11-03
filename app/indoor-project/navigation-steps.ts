import type { RouteInstruction } from "../indoor-directions/types";
import * as DMath from "./deterministic-math";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import type { ProjectRoute } from "./viewer-routing";
export type ProjectStep = RouteInstruction & {
  levelId: number;
  building: string;
  pointsFeet: [number, number, number][];
};
export const projectFloorName = (data: IndoorDataset, levelId: number) =>
  data.floors.find((f) => f.levelIds.includes(levelId))?.name ??
  data.nativeLevels.find((f) => f.id === levelId)?.name ??
  "Floor";

/** Which walking events become an instruction. Only meaningful events are
 * steps: a real turn, a floor change, entering another building or passing
 * through another (ordinary) room, a curved corridor, and arrival.
 *
 * Turns are classified on a smoothed heading, not per polyline segment:
 *  - a leg shorter than `headingLegMetres` never sets the walking heading (it
 *    only adds distance), except that the first leg of at least
 *    `firstHeadingLegMetres` sets a provisional heading, so leaving a room
 *    through a short doorway branch still yields the turn into the corridor;
 *  - a heading change is measured between consecutive heading legs, so the
 *    short legs between them (thresholds, hooks, jogs) accumulate into one net
 *    change instead of producing several steps;
 *  - consecutive bends whose straight walk between them is shorter than
 *    `mergeBendsWithinMetres` merge into one net change when at least one of
 *    them is slight (< `slightTurnBelowDegrees`): two 45 degree bends of a
 *    chamfered corner become one turn, and a left/right jog cancels out;
 *  - a net change below `minimumTurnDegrees` is never a step. The walking
 *    graph has no corridor junction nodes (walk edges run door to door and the
 *    hallway joins are guide vertices), so an ambiguous junction cannot be
 *    recognised and there is no junction exception to this rule;
 *  - `minimumTurnDegrees` to `slightTurnBelowDegrees` is "Bear", up to
 *    `turnAroundAboveDegrees` is "Turn", and beyond it "Turn around".
 */
export const NAVIGATION_STEP_RULES = Object.freeze({
  headingLegMetres: 2,
  firstHeadingLegMetres: 0.5,
  bendDegrees: 5,
  mergeBendsWithinMetres: 4,
  minimumTurnDegrees: 30,
  slightTurnBelowDegrees: 60,
  turnAroundAboveDegrees: 150,
});

export type WalkingLeg = {
  /** Horizontal direction in the project frame; any length. */
  dx: number;
  dy: number;
  metres: number;
  /** Inside a recognised curved corridor range. */
  curve?: boolean;
  /** No bend may merge across this leg's start (door, building, curve). */
  barrier?: boolean;
};
export type WalkingTurn = {
  /** Index of the first leg of the new step. */
  leg: number;
  /** Signed net heading change in degrees; positive is left. */
  degrees: number;
  kind: "slight" | "turn" | "around";
};

const signedDegrees = (u: [number, number], v: [number, number]) =>
  (DMath.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180) /
  Math.PI;

/** Turn events of one continuous walking run under NAVIGATION_STEP_RULES.
 * `heading` is the walking heading carried in from an earlier run, if any. */
export function classifyWalkingTurns(
  legs: readonly WalkingLeg[],
  heading: [number, number] | null = null,
  rules = NAVIGATION_STEP_RULES,
): { turns: WalkingTurn[]; heading: [number, number] | null } {
  type Bend = {
    leg: number;
    degrees: number;
    /** First leg after this bend's heading leg; straight walk starts here. */
    headingLeg: number;
  };
  const bends: Bend[] = [];
  // Start of the short legs that precede the next heading leg.
  let bendStart = 0;
  for (const [i, leg] of legs.entries()) {
    if (leg.metres <= 1e-6) continue;
    const direction: [number, number] = [leg.dx, leg.dy];
    if (leg.curve) {
      heading = direction;
      bendStart = i + 1;
      continue;
    }
    if (!heading) {
      if (leg.metres >= rules.firstHeadingLegMetres) {
        heading = direction;
        bendStart = i + 1;
      }
      continue;
    }
    if (leg.metres < rules.headingLegMetres) continue;
    const degrees = signedDegrees(heading, direction);
    if (Math.abs(degrees) >= rules.bendDegrees)
      bends.push({ leg: bendStart, degrees, headingLeg: i });
    heading = direction;
    bendStart = i + 1;
  }
  const walked = (from: number, to: number) => {
    let metres = 0;
    for (let i = from; i < to; i++) metres += legs[i].metres;
    return metres;
  };
  const barrierBetween = (from: number, to: number) =>
    legs.slice(from + 1, to + 1).some((leg) => leg.barrier || leg.curve);
  const merged: Bend[] = [];
  for (const bend of bends) {
    const last = merged.at(-1);
    if (
      last &&
      walked(last.headingLeg, bend.leg) < rules.mergeBendsWithinMetres &&
      (Math.abs(last.degrees) < rules.slightTurnBelowDegrees ||
        Math.abs(bend.degrees) < rules.slightTurnBelowDegrees) &&
      !barrierBetween(last.leg, bend.leg)
    ) {
      last.degrees += bend.degrees;
      if (last.degrees > 180) last.degrees -= 360;
      if (last.degrees < -180) last.degrees += 360;
      last.headingLeg = bend.headingLeg;
    } else merged.push({ ...bend });
  }
  return {
    heading,
    turns: merged
      .filter((b) => Math.abs(b.degrees) >= rules.minimumTurnDegrees)
      .map((b) => ({
        leg: b.leg,
        degrees: b.degrees,
        kind:
          Math.abs(b.degrees) > rules.turnAroundAboveDegrees
            ? "around"
            : Math.abs(b.degrees) < rules.slightTurnBelowDegrees
              ? "slight"
              : "turn",
      })),
  };
}

const turnMessage = (turn: WalkingTurn) => {
  const direction = turn.degrees > 0 ? "left" : "right";
  if (turn.kind === "around") return "Turn around";
  return turn.kind === "slight" ? `Bear ${direction}` : `Turn ${direction}`;
};

type XYZ = [number, number, number];
type Walk = {
  a: XYZ;
  b: XYZ;
  leg: WalkingLeg;
  levelId: number;
  building: string;
  curveEntry: boolean;
  /** Ordinary room entered by a door/opening crossing at this leg's start. */
  room?: string;
  /** This leg starts in a different building than the previous leg. */
  buildingChange?: boolean;
};

/** Instructions follow the resolved path, while vertical movement uses the
 * original connection kind and native floor IDs. No elevator is inferred.
 * See NAVIGATION_STEP_RULES for which walking events become a step. */
export function projectNavigationSteps(
  data: IndoorDataset,
  route: ProjectRoute,
  departure: string,
  destination: string,
): ProjectStep[] {
  const result: ProjectStep[] = [];
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  // Room records are only consulted for door/opening crossings.
  const records = new Map(
    route.edges.some((e) => e.kind === "door" || e.kind === "opening")
      ? data.records.map((r) => [r.key, r])
      : [],
  );
  const endpointRooms = new Set(
    [route.nodeIds[0], route.nodeIds.at(-1)].map(
      (id) => nodes.get(id!)?.roomKey,
    ),
  );
  const mpf = data.alignment.horizontalMetresPerFoot;
  // Ordinary rooms the route passes through, keyed by the door/opening node
  // where it enters them. Endpoint rooms and circulation are not announced.
  const roomEntries: { point: XYZ; room: string }[] = [];
  route.edges.forEach((edge, i) => {
    if (edge.kind !== "door" && edge.kind !== "opening") return;
    const from = nodes.get(route.nodeIds[i]),
      to = nodes.get(route.nodeIds[i + 1]);
    const room = to && records.get(to.roomKey);
    if (
      !from ||
      !to ||
      !room ||
      from.roomKey === to.roomKey ||
      endpointRooms.has(to.roomKey) ||
      room.circulation ||
      room.stair
    )
      return;
    roomEntries.push({
      point: to.pointFeet,
      room: room.number || room.name || "the next room",
    });
  });
  let walks: Walk[] = [];
  let heading: [number, number] | null = null;
  let lastBuilding: string | undefined;
  let entered = 0;
  const flush = () => {
    if (walks.length === 0) return;
    const legs = walks.map((w) => w.leg);
    const classified = classifyWalkingTurns(legs, heading);
    heading = classified.heading;
    const turns = new Map(classified.turns.map((t) => [t.leg, t]));
    walks.forEach((walk, i) => {
      const turn = turns.get(i);
      const last = result.at(-1);
      let type: ProjectStep["type"] | undefined;
      let message = "";
      let turnKind: ProjectStep["turnKind"];
      let turnDirection: ProjectStep["turnDirection"] = null;
      if (!last || last.type === "arrive") {
        type = "depart";
        message = route.departure?.hallwayCenter
          ? `Start in the hallway center near ${departure} and head straight`
          : route.departure?.mode === "hallway"
            ? `Start outside ${departure} and head straight`
            : `Leave ${departure} and head straight`;
      } else if (walk.curveEntry) {
        type = "straight";
        message = "Follow the curved corridor";
      } else if (turn) {
        type = "turn";
        turnKind = turn.kind;
        turnDirection = turn.degrees > 0 ? "left" : "right";
        message = turnMessage(turn);
        if (walk.room) message += ` into ${walk.room}`;
      } else if (walk.room) {
        type = "straight";
        message = `Continue through ${walk.room}`;
      } else if (walk.buildingChange) {
        type = "building-change";
        message = `Continue into building ${walk.building}`;
      } else if (
        last.type === "floor-change" ||
        last.levelId !== walk.levelId
      ) {
        type = "straight";
        message = "Head straight";
      }
      if (type) {
        result.push({
          type,
          message,
          distanceMeters: walk.leg.metres,
          turnDirection,
          ...(turnKind ? { turnKind } : {}),
          ...(type === "building-change"
            ? { buildingName: walk.building }
            : {}),
          levelId: walk.levelId,
          building: walk.building,
          pointsFeet: [walk.a, walk.b],
          position: geographicPoint(data, walk.a),
        });
      } else {
        last!.distanceMeters += walk.leg.metres;
        last!.pointsFeet.push(walk.b);
      }
    });
    walks = [];
  };
  for (const path of route.paths) {
    const edgeIndex = route.edges.findIndex((e) => e.id === path.edgeIds[0]);
    const edge = route.edges[edgeIndex]!;
    const from = nodes.get(route.nodeIds[edgeIndex])!,
      to = nodes.get(route.nodeIds[edgeIndex + 1])!;
    if (
      ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
        edge.kind,
      )
    ) {
      flush();
      const up = path.pointsFeet.at(-1)![2] > path.pointsFeet[0][2];
      const sameCampusFloor = data.floors.some(
        (f) =>
          f.levelIds.includes(from.levelId) && f.levelIds.includes(to.levelId),
      );
      const target = `${sameCampusFloor ? "within" : "to"} ${projectFloorName(data, to.levelId)}`;
      let message = `Take the steps ${up ? "up" : "down"}`;
      switch (edge.kind) {
        case "elevator":
        case "escalator": {
          message = `Take the ${edge.kind} ${up ? "up" : "down"} ${target}`;
          break;
        }
        case "stairs": {
          message = `Take stairs ${up ? "up" : "down"} ${target}`;
          break;
        }
        case "ramp": {
          message = `Take the ramp ${up ? "up" : "down"} ${target}`;
          break;
        }
      }
      result.push({
        type: "floor-change",
        message,
        networkType:
          edge.kind === "elevator" ||
          edge.kind === "escalator" ||
          edge.kind === "ramp"
            ? edge.kind
            : "stairs",
        distanceMeters: edge.lengthMetres,
        fromLevel: from.levelId,
        toLevel: to.levelId,
        levelId: to.levelId,
        building: to.building,
        pointsFeet: path.pointsFeet,
        position: geographicPoint(data, path.pointsFeet[0]),
        arrivalPosition: geographicPoint(data, path.pointsFeet.at(-1)!),
        floorsTraversed: sameCampusFloor ? 0 : 1,
      });
      heading = null;
      lastBuilding = to.building;
      continue;
    }
    const buildingChange =
      lastBuilding !== undefined && lastBuilding !== from.building;
    lastBuilding = from.building;
    let first = true;
    for (let i = 1; i < path.pointsFeet.length; i++) {
      const a = path.pointsFeet[i - 1],
        b = path.pointsFeet[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        metres = DMath.hypot(dx, dy) * mpf;
      if (metres < 1e-6) continue;
      const curve = path.curveRanges?.find(
        (range) => i - 1 >= range.start && i <= range.end,
      );
      // Room entries are matched in route order at the leg leaving the
      // entering door/opening's anchor; an unmatched entry is not announced.
      const found = roomEntries.findIndex(
        (e, j) =>
          j >= entered &&
          DMath.hypot(e.point[0] - a[0], e.point[1] - a[1]) < 0.01 &&
          Math.abs(e.point[2] - a[2]) < 0.01,
      );
      const entry = found === -1 ? undefined : roomEntries[found];
      if (entry) entered = found + 1;
      const curveEntry = !!curve && i === curve.start + 1;
      walks.push({
        a,
        b,
        leg: {
          dx,
          dy,
          metres,
          curve: !!curve,
          barrier: curveEntry || !!entry || (first && buildingChange),
        },
        levelId: path.levelIds[0],
        building: from.building,
        curveEntry,
        room: entry?.room,
        buildingChange: first && buildingChange,
      });
      first = false;
    }
  }
  flush();
  const last = route.paths.at(-1),
    endNode = nodes.get(route.nodeIds.at(-1)!);
  if (last && endNode)
    result.push({
      type: "arrive",
      message: route.arrival?.hallwayCenter
        ? `Arrive in the hallway center near ${destination}`
        : route.arrival?.mode === "hallway"
          ? `Arrive outside ${destination}`
          : route.arrival?.mode === "doorway"
            ? `Arrive at the doorway of ${destination}`
            : `Arrive at ${destination}`,
      distanceMeters: 0,
      levelId: route.arrival?.levelId ?? endNode.levelId,
      building: route.arrival?.building ?? endNode.building,
      pointsFeet: [last.pointsFeet.at(-1)!],
      position: geographicPoint(data, last.pointsFeet.at(-1)!),
    });
  return result;
}
