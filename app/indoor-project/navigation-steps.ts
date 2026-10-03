import type { RouteInstruction } from "../indoor-directions/types";
import type { IndoorDataset } from "./contract";
import { geographicPoint, type ProjectRoute } from "./routing";
export type ProjectStep = RouteInstruction & {
  levelId: number;
  building: string;
  pointsFeet: [number, number, number][];
};
export const projectFloorName = (data: IndoorDataset, levelId: number) =>
  data.floors.find((f) => f.levelIds.includes(levelId))?.name ??
  data.nativeLevels.find((f) => f.id === levelId)?.name ??
  "Floor";

/** Instructions follow the resolved path, while vertical movement uses the
 * original connection kind and native floor IDs. No elevator is inferred. */
export function projectNavigationSteps(
  data: IndoorDataset,
  route: ProjectRoute,
  departure: string,
  destination: string,
): ProjectStep[] {
  const result: ProjectStep[] = [];
  let previous: [number, number] | null = null;
  for (const path of route.paths) {
    const edge = route.edges.find((e) => e.id === path.edgeIds[0])!;
    const edgeIndex = route.edges.indexOf(edge);
    const from = data.nodes.find((n) => n.id === route.nodeIds[edgeIndex])!,
      to = data.nodes.find((n) => n.id === route.nodeIds[edgeIndex + 1])!;
    if (
      ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
        edge.kind,
      )
    ) {
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
          {
            message = `Take the ramp ${up ? "up" : "down"} ${target}`;
            // No default
          }
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
      previous = null;
      continue;
    }
    for (let i = 1; i < path.pointsFeet.length; i++) {
      const a = path.pointsFeet[i - 1],
        b = path.pointsFeet[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        metres = Math.hypot(dx, dy) * data.alignment.horizontalMetresPerFoot;
      if (metres < 1e-6) continue;
      const turn = previous
        ? (Math.atan2(
            previous[0] * dy - previous[1] * dx,
            previous[0] * dx + previous[1] * dy,
          ) *
            180) /
          Math.PI
        : 0;
      // Short threshold/alignment segments remain in the followed geometry and
      // distance, but do not replace the walking heading with an inch-long jog.
      // The next substantial leg supplies the actual turn instruction.
      const alignment = metres < 0.5;
      const curve = path.curveRanges?.find(
        (range) => i - 1 >= range.start && i <= range.end,
      );
      const enteringCurve = !!curve && i === curve.start + 1;
      const direction = turn > 0 ? "left" : "right";
      const turning = !curve && !alignment && Math.abs(turn) > 25;
      let type: ProjectStep["type"] = "straight",
        message = "Head straight";
      let turnKind: ProjectStep["turnKind"] = "turn";
      if (Math.abs(turn) > 150) turnKind = "around";
      else if (Math.abs(turn) < 60) turnKind = "slight";
      if (result.length === 0) {
        type = "depart";
        message = `Leave ${departure} and head straight`;
      } else if (turning) {
        type = "turn";
        message = `Turn ${direction}`;
        if (turnKind === "around") message = "Turn around";
        else if (turnKind === "slight") message = `Bear ${direction}`;
      }
      if (enteringCurve && result.length > 0) {
        type = "straight";
        message = "Follow the curved corridor";
      }
      const step: ProjectStep = {
        type,
        message,
        distanceMeters: metres,
        turnDirection: turning ? direction : null,
        turnKind,
        levelId: path.levelIds[0],
        building: from.building,
        pointsFeet: [a, b],
        position: geographicPoint(data, a),
      };
      const last = result.at(-1);
      if (
        !turning &&
        !enteringCurve &&
        last &&
        (last.type === "depart" ||
          last.type === "straight" ||
          last.type === "turn") &&
        last.levelId === step.levelId &&
        last.building === step.building
      ) {
        last.distanceMeters += metres;
        last.pointsFeet.push(b);
      } else result.push(step);
      if (!alignment || curve) previous = [dx, dy];
    }
  }
  const last = route.paths.at(-1),
    endNode = data.nodes.find((n) => n.id === route.nodeIds.at(-1));
  if (last && endNode)
    result.push({
      type: "arrive",
      message:
        route.arrival?.mode === "hallway"
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
