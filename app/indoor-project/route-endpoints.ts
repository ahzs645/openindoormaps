import type { IndoorDataset, IndoorRecord } from "./contract";
import type { ProjectRoutingGraph } from "./routing-graph";
import type { ProjectRouteArrival } from "./route-arrival";
import { isConnectorLobbyDestination } from "./connector-arrival";
import { routingDoorApertures } from "./routing-apertures";
import { validatedOpeningSpan, openingSpanFrame } from "./opening-span";

export type RouteEndpoint = { nodeId: string; entrance?: ProjectRouteArrival };

/** Choose existing, policy-admitted hallway-side portal nodes. Never infer a
 * doorway from a room outline, move a node or create a graph connection. */
export function hallwayRouteEndpoints(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  room: IndoorRecord,
  departure: boolean,
): RouteEndpoint[] {
  if (!room.arrivalNodeId || !room.walkable || room.access === "staff")
    return [];
  if (room.circulation || isConnectorLobbyDestination(data, room))
    return [{ nodeId: room.arrivalNodeId }];
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const apertures = new Map(routingDoorApertures(data).map((d) => [d.id, d]));
  const result = new Map<string, RouteEndpoint>();
  for (const [fromId, links] of graph.adjacency) {
    for (const link of links) {
      const edge = link.edge;
      if (edge.kind !== "door" && edge.kind !== "opening") continue;
      const from = nodes.get(fromId),
        to = nodes.get(link.to);
      if (!from || !to) continue;
      const inside = departure ? from : to,
        outside = departure ? to : from;
      if (
        inside.roomKey !== room.key ||
        outside.roomKey === room.key ||
        !graph.records.get(outside.roomKey)?.circulation ||
        inside.levelId !== outside.levelId ||
        Math.abs(inside.pointFeet[2] - outside.pointFeet[2]) > 0.01
      )
        continue;
      const door = apertures.get(edge.id);
      const span = validatedOpeningSpan(data, edge);
      let center: number[], normal: number[], aperture: number[][];
      if (door?.state === "connected" && door.footprintFeet) {
        aperture = door.footprintFeet;
        center = [0, 0];
        for (const p of door.footprintFeet) {
          center[0] += p[0] / door.footprintFeet.length;
          center[1] += p[1] / door.footprintFeet.length;
        }
        normal = door.normalFeet ?? [
          inside.pointFeet[0] - outside.pointFeet[0],
          inside.pointFeet[1] - outside.pointFeet[1],
        ];
      } else if (span) {
        aperture = span.apertureFeet;
        const frame = openingSpanFrame(edge, span);
        center = [(frame.a[0] + frame.b[0]) / 2, (frame.a[1] + frame.b[1]) / 2];
        normal = frame.n;
      } else continue;
      const side = (p: number[]) =>
        (p[0] - center[0]) * normal[0] + (p[1] - center[1]) * normal[1];
      if (!(side(inside.pointFeet) * side(outside.pointFeet) < -1e-14))
        continue;
      const tangent = (p: number[]) =>
        -(p[0] - center[0]) * normal[1] + (p[1] - center[1]) * normal[0];
      const width = aperture.map(tangent),
        lo = Math.min(...width),
        hi = Math.max(...width);
      // Opposite sides of an infinite plane do not prove this doorway. The
      // original saved portal path must actually cross its finite opening.
      const points =
        edge.from === outside.id
          ? edge.pointsFeet
          : [...edge.pointsFeet].reverse();
      const same = (a: number[], b: number[]) =>
        a.length === b.length && a.every((v, i) => v === b[i]);
      if (
        !points.length ||
        !same(points[0], outside.pointFeet) ||
        !same(points.at(-1)!, inside.pointFeet)
      )
        continue;
      const crosses = points.some((b, i) => {
        if (!i) return false;
        const a = points[i - 1],
          s = side(a),
          e = side(b);
        if (s * e > 0 || Math.abs(e - s) < 1e-8) return false;
        const t = -s / (e - s);
        const p = a.map((v, j) => v + (b[j] - v) * t);
        return (
          t >= 0 &&
          t <= 1 &&
          tangent(p) >= lo - 1e-7 &&
          tangent(p) <= hi + 1e-7 &&
          Math.abs(p[2] - outside.pointFeet[2]) < 0.01
        );
      });
      if (!crosses) continue;
      result.set(outside.id, {
        nodeId: outside.id,
        entrance: {
          mode: "hallway",
          pointFeet: [...outside.pointFeet],
          levelId: outside.levelId,
          building: room.building,
          entranceEdgeId: edge.id,
        },
      });
    }
  }
  return [...result.values()];
}
