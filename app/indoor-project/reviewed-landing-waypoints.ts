import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { IndoorDataset, IndoorEdge, IndoorNode } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import { matchesReviewedGuideContext } from "./reviewed-guide-bends";
import { NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 } from "./published-route-runtime-binding";
import { geographicPoint } from "./routing";
import {
  corridorGuideLength,
  type SharedGuidePoint,
} from "./shared-corridor-guides";
import type { PathwayArc, SharedPathwayStop } from "./shared-pathway-routing";
import survey from "./unbc-lower-landing-waypoints.json";

const digest = (v: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(v))));

/** Admit only an interior station on a single measured donor segment. The
 * tolerance here is floating-point evaluation of interpolation in feet. */
export function splitLandingDonor(
  points: SharedGuidePoint[],
  segment: number,
  join: SharedGuidePoint,
) {
  const a = points[segment],
    b = points[segment + 1];
  if (!a || !b || a[2] !== b[2] || a[2] !== join[2]) return;
  const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1,
    other = 1 - axis;
  const fraction = (join[axis] - a[axis]) / (b[axis] - a[axis]);
  if (!(fraction > 0 && fraction < 1)) return;
  const interpolated = a[other] + fraction * (b[other] - a[other]);
  if (
    Math.abs(join[other] - interpolated) >
    4 * Number.EPSILON * Math.max(1, Math.abs(a[other]), Math.abs(b[other]))
  )
    return;
  return {
    before: [...points.slice(0, segment + 1), join],
    after: [join, ...points.slice(segment + 1)],
  };
}

/** A reviewed flight end is independently reachable even when traversal of
 * the flight itself is held. Its foot is a separate horizontal destination. */
export function reviewedLandingWaypoints(
  data: IndoorDataset,
  prepared: PreparedRouting | undefined,
  nodes: Map<string, IndoorNode>,
  edges: Map<string, IndoorEdge>,
  outgoing: Map<string, PathwayArc[]>,
  usable: (arc: PathwayArc) => boolean,
  stopVertex: (stop: SharedPathwayStop) => string,
) {
  const stops = new Map<string, SharedPathwayStop>(),
    arcs: PathwayArc[] = [],
    derivedNodes = new Set<string>();
  if (
    prepared &&
    survey.model === data.source.modelSha256 &&
    survey.physicalVerifier === NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 &&
    matchesReviewedGuideContext(data, prepared)
  ) {
    for (const r of survey.profiles) {
      const source = data.stairDisplay?.sourceFlights?.find(
        (f) => f.stairElementId === r.stair,
      );
      const original = nodes.get(r.originalNode),
        flight = edges.get(r.flightEdge),
        donor = edges.get(r.donor);
      const slab = data.walkingSupport?.floors.find(
        (f) =>
          f.nativeElementId === r.slab &&
          f.elevationFeet === original?.pointFeet[2],
      );
      if (
        !source ||
        !slab ||
        !original ||
        original.roomKey !== r.room ||
        original.levelId !== r.level ||
        !flight ||
        !donor ||
        donor.kind !== "walk" ||
        !donor.enabled ||
        donor.pointsFeet.length < r.donorSegment + 2 ||
        r.donorSegment < 0 ||
        digest([source, slab, flight, original, donor]) !== r.sourceEvidence
      )
        continue;
      const origin = "landing:" + r.stair + ":" + r.run + ":" + r.endpoint;
      const join = origin + ":hallway";
      const key = (id: string) => JSON.stringify([id]);
      if (nodes.has(origin) || nodes.has(join)) continue;
      const getDonor = (from: string, to: string) =>
        outgoing
          .get(key(from))
          ?.find(
            (a) =>
              a.to === key(to) &&
              a.link.edge.id === donor.id &&
              JSON.stringify(a.points) ===
                JSON.stringify(
                  from === donor.from
                    ? donor.pointsFeet
                    : donor.pointsFeet.toReversed(),
                ) &&
              a.link.requiredRooms.length === 0 &&
              a.link.passages.length === 0 &&
              a.link.blockers.length === 0 &&
              usable(a),
          );
      const forward = getDonor(donor.from, donor.to),
        backward = getDonor(donor.to, donor.from);
      if (!forward || !backward) continue;
      const path = r.points as SharedGuidePoint[],
        foot = path[0],
        crossing = path.at(-1)!;
      const pieces = splitLandingDonor(
        donor.pointsFeet,
        r.donorSegment,
        crossing,
      );
      if (!pieces) continue;
      const sourceCorridor = nodes.get(donor.from);
      if (!sourceCorridor || sourceCorridor.levelId !== r.level) continue;
      for (const [id, sourceNode, point] of [
        [origin, original, foot],
        [join, sourceCorridor, crossing],
      ] as const) {
        nodes.set(id, {
          ...sourceNode,
          kind: "junction",
          id,
          pointFeet: point,
          geographic: geographicPoint(data, point),
        });
        derivedNodes.add(id);
      }
      const edgeId = "walk:" + origin;
      const stop = {
        stopId: JSON.stringify([r.cell, ...foot]),
        pointFeet: foot,
        levelId: r.level,
        building: original.building,
        cellId: r.cell,
        terminalNodeId: origin,
        guideEdgeId: edgeId,
      };
      const length = (points: SharedGuidePoint[]) =>
        corridorGuideLength(points) * data.alignment.horizontalMetresPerFoot;
      const edge: IndoorEdge = {
        id: edgeId,
        from: origin,
        to: join,
        kind: "walk",
        enabled: true,
        accessible: "unknown",
        lengthMetres: length(path),
        pointsFeet: path,
        roomKeys: [r.room, sourceCorridor.roomKey],
        nativeCellId: r.cell,
        evidence:
          "Native first riser and lower slab cap with reviewed public corridor approach",
      };
      const vertex = (id: string) =>
        id === origin ? stopVertex(stop) : key(id);
      const piece = (
        from: string,
        to: string,
        points: SharedGuidePoint[],
        sourceEdge: IndoorEdge,
        sourceArc: PathwayArc,
      ) => {
        arcs.push({
          from: vertex(from),
          to: vertex(to),
          sourceFrom: from,
          sourceTo: to,
          points,
          metres: length(points),
          link: { ...sourceArc.link, to, edge: sourceEdge },
          validateReviewedRun: () => usable(sourceArc),
        });
      };
      const { before, after } = pieces;
      piece(donor.from, join, before, donor, forward);
      piece(join, donor.to, after, donor, forward);
      piece(donor.to, join, after.toReversed(), donor, backward);
      piece(join, donor.from, before.toReversed(), donor, backward);
      piece(origin, join, path, edge, forward);
      piece(join, origin, path.toReversed(), edge, backward);
      stops.set(r.room, stop);
    }
  }
  return { stops, arcs, derivedNodes };
}
