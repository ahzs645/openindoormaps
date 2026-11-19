import { validNativeSteppedStairV2Binding } from "./native-stepped-stair-v2";
import type { IndoorDataset, IndoorNode } from "./contract";
import type { ProjectRoutingGraph, ProjectRoutingLink } from "./routing-graph";
import type { PathwayArc } from "./shared-pathway-routing";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";
import {
  corridorRunAvoidsOtherBranches,
  reviewedCorridorStripSupported,
} from "./native-public-corridor-strip";
import type { PreparedRouting } from "./prepared-routing";

const vertex = (id: string) => JSON.stringify([id]);
const same = (a: XYZ, b: XYZ) => a.every((v, i) => v === b[i]);
const clear = (link: ProjectRoutingLink) =>
  link.edge.enabled &&
  link.blockers.length === 0 &&
  link.requiredRooms.length === 0 &&
  link.passages.length === 0;

/** Connect an admitted stair cap to its own real doorway using an original
 * public in-room walk. Unserved flights and corridors never supply candidates. */
export function nativeStairHallwayApproaches(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  nodes: Map<string, IndoorNode>,
  outgoing: Map<string, PathwayArc[]>,
  guides: Map<string, PreparedRouting["guides"][number]>,
  usable: (arc: PathwayArc) => boolean,
) {
  const result: PathwayArc[] = [];
  const flights = data.stairDisplay?.sourceFlights;
  if (
    !flights?.length ||
    data.stairDisplay?.sourceModelSha256 !== data.source.modelSha256
  )
    return result;
  const admitted = (node: string) => outgoing.get(vertex(node)) ?? [];
  const stairs = data.edges.filter((e) => e.kind === "stairs");
  for (const stair of stairs) {
    if (
      !stair.nativeSteppedStairV2 ||
      !stair.enabled ||
      stair.accessible !== "no" ||
      !stair.nativeElementId
    )
      continue;
    const matches = flights.filter(
      (f) => f.stairElementId === stair.nativeElementId,
    );
    const flight = matches[0];
    if (matches.length !== 1 || flight.context || flight.treads.length === 0)
      continue;
    const runIds = new Set(flight.treads.map((t) => t.runElementId));
    if (
      [...runIds].some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      flights.some(
        (f) => f !== flight && f.treads.some((t) => runIds.has(t.runElementId)),
      )
    )
      continue;
    for (const [i, capId] of [stair.from, stair.to].entries()) {
      const cap = nodes.get(capId),
        room = cap && graph.records.get(cap.roomKey);
      const flightArc = admitted(capId).find(
        (a) => a.link.edge === stair && clear(a.link),
      );
      if (
        !cap ||
        !room?.stair ||
        !room.arrivalNodeId ||
        !room.walkable ||
        room.access === "staff" ||
        cap.kind !== "stair" ||
        !flightArc ||
        !flight.levelIds.includes(cap.levelId) ||
        !flight.buildings.includes(cap.building) ||
        !stair.roomKeys.includes(room.key) ||
        !same(cap.pointFeet, stair.pointsFeet.at(i === 0 ? 0 : -1)!)
      )
        continue;
      const intoFlight = flightArc.points.find(
        (p) => p[0] !== cap.pointFeet[0] || p[1] !== cap.pointFeet[1],
      );
      if (!intoFlight) continue;
      const alias = admitted(capId).find(
        (a) =>
          a.sourceTo === room.arrivalNodeId &&
          clear(a.link) &&
          a.link.edge.kind === "walk" &&
          a.link.edge.lengthMetres === 0 &&
          a.points.every((p) => same(p, cap.pointFeet)),
      );
      if (
        !alias ||
        !stair.nativeSteppedStairV2.terminalApproaches.some(
          (t) =>
            t.nodeId === capId &&
            t.walkEdgeId === alias.link.edge.id &&
            t.nativeCellId === alias.link.edge.nativeCellId,
        )
      )
        continue;
      // Two approved flights can meet the same logical landing but enter it
      // at different angles. This candidate proves the current flight's turn.
      const sameCap = (id: string) => {
        const node = nodes.get(id);
        return (
          node?.roomKey === room.key &&
          node.levelId === cap.levelId &&
          same(node.pointFeet, cap.pointFeet)
        );
      };
      if (
        stairs.some(
          (other) =>
            other !== stair &&
            (sameCap(other.from) || sameCap(other.to)) &&
            [other.from, other.to].some((id) =>
              admitted(id).some((a) => a.link.edge === other && clear(a.link)),
            ),
        )
      )
        continue;
      for (const link of graph.adjacency.get(room.arrivalNodeId) ?? []) {
        const edge = link.edge,
          port = nodes.get(link.to),
          cell = edge.nativeCellId;
        if (
          edge.kind !== "walk" ||
          !cell ||
          cell !== alias.link.edge.nativeCellId ||
          !clear(link) ||
          guides.has(edge.id) ||
          !port ||
          port.kind !== "portal" ||
          port.roomKey !== room.key ||
          port.levelId !== cap.levelId ||
          port.pointFeet[2] !== cap.pointFeet[2] ||
          !edge.roomKeys.includes(room.key) ||
          same(port.pointFeet, cap.pointFeet)
        )
          continue;
        const realDoor = admitted(port.id).find(
          (a) => a.link.edge.kind === "door" && clear(a.link),
        );
        const outside = realDoor && nodes.get(realDoor.sourceTo),
          hall = outside && graph.records.get(outside.roomKey);
        const door =
          realDoor && data.doors?.find((d) => d.id === realDoor.link.edge.id);
        if (
          !outside ||
          !hall?.circulation ||
          !hall.walkable ||
          hall.access === "staff" ||
          hall.stair ||
          !realDoor ||
          !door ||
          door.state !== "connected" ||
          !door.hostWallNativeElementId ||
          door.nativeElementId !== realDoor.link.edge.nativeElementId ||
          !door.roomKeys.includes(room.key) ||
          !door.roomKeys.includes(hall.key) ||
          outside.levelId !== cap.levelId ||
          outside.pointFeet[2] !== cap.pointFeet[2]
        )
          continue;
        const inbound = admitted(outside.id).find(
          (a) =>
            a.sourceTo === port.id &&
            a.link.edge === realDoor.link.edge &&
            clear(a.link),
        );
        const returning = graph.adjacency
          .get(port.id)
          ?.find(
            (l) => l.to === room.arrivalNodeId && l.edge === edge && clear(l),
          );
        if (
          !inbound ||
          !returning ||
          realDoor.points.length !== 2 ||
          !same(realDoor.points[0], port.pointFeet) ||
          !same(realDoor.points[1], outside.pointFeet)
        )
          continue;
        const points = [cap.pointFeet, port.pointFeet],
          source =
            edge.from === room.arrivalNodeId
              ? edge.pointsFeet
              : edge.pointsFeet.toReversed();
        if (
          source.length < 2 ||
          !same(source[0], points[0]) ||
          !same(source.at(-1)!, points[1])
        )
          continue;
        const scale = data.alignment.horizontalMetresPerFoot;
        let checked: boolean | undefined;
        const validate = () =>
          (checked ??=
            validNativeSteppedStairV2Binding(data, stair) &&
            usable(alias) &&
            usable(flightArc) &&
            usable(realDoor) &&
            usable(inbound) &&
            corridorRunAvoidsOtherBranches(points, guides.values(), cell) &&
            reviewedCorridorStripSupported(
              data,
              cell,
              cap.levelId,
              cap.pointFeet[2],
              points,
              undefined,
              {
                ownerKey: room.key,
                previous: intoFlight,
                next: outside.pointFeet,
              },
            ));
        for (const l of [link, returning]) {
          const forward = l === link,
            sourceFrom = forward ? room.arrivalNodeId : port.id;
          result.push({
            from: vertex(sourceFrom),
            to: vertex(l.to),
            sourceFrom,
            sourceTo: l.to,
            link: l,
            points: forward ? points : points.toReversed(),
            metres: corridorGuideLength(points) * scale,
            validateReviewedRun: validate,
          });
        }
      }
    }
  }
  return result;
}
