import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { IndoorDataset, IndoorEdge, IndoorNode } from "./contract";
import type { PreparedRouting } from "./prepared-routing";
import { matchesReviewedGuideContext } from "./reviewed-guide-bends";
import { splitLandingDonor } from "./reviewed-landing-waypoints";
import { reviewedCorridorStripSupported } from "./native-public-corridor-strip";
import { geographicPoint } from "./routing";
import {
  corridorGuideLength,
  type SharedGuidePoint as Point,
} from "./shared-corridor-guides";
import type { PathwayArc } from "./shared-pathway-routing";
import survey from "./unbc-upper-landing-bridge.json";

/** Scope and both observed visitor directions are required for this two-way link. */
export function permitsFlatLandingBridge(
  scope: string,
  directions: readonly string[],
) {
  return (
    scope === "same-floor-landing" &&
    directions.length === 2 &&
    directions.includes("corridor-to-reception") &&
    directions.includes("reception-to-corridor")
  );
}

/** Select the two opposite directed arcs containing the station. A core,
 * doorway approach and crossing can belong to different source vertices. */
export function flatLandingDonor(
  available: PathwayArc[],
  point: Point,
  accepted: (arc: PathwayArc) => boolean,
) {
  const pieces = available.flatMap((arc) => {
    const runs = arc.points.flatMap((p, i) => {
      const split = splitLandingDonor(arc.points, i, point);
      return split
        ? [{ ...split, previous: p, next: arc.points[i + 1], arc }]
        : [];
    });
    return runs.length === 1 &&
      arc.link.requiredRooms.length === 0 &&
      arc.link.blockers.length === 0 &&
      arc.link.passages.length === 0 &&
      accepted(arc)
      ? runs
      : [];
  });
  if (pieces.length !== 2) return;
  const [a, b] = pieces;
  if (
    a.arc.from !== b.arc.to ||
    a.arc.to !== b.arc.from ||
    a.arc.sourceFrom !== b.arc.sourceTo ||
    a.arc.sourceTo !== b.arc.sourceFrom ||
    JSON.stringify(a.arc.points) !== JSON.stringify(b.arc.points.toReversed())
  )
    return;
  return { pieces, tangents: [a.previous, a.next] };
}

export function reviewedFlatLandingBridge(
  data: IndoorDataset,
  prepared: PreparedRouting | undefined,
  nodes: Map<string, IndoorNode>,
  outgoing: Map<string, PathwayArc[]>,
  accepted: (arc: PathwayArc) => boolean,
) {
  if (
    !permitsFlatLandingBridge(survey.scope, survey.visitorDirections) ||
    !prepared ||
    survey.sourceModel !== data.source.modelSha256 ||
    !matchesReviewedGuideContext(data, prepared)
  )
    return;
  const flight = data.stairDisplay?.sourceFlights?.find(
    (f) => f.stairElementId === survey.nativeStair,
  );
  const owner = data.records.find(
    (r) => r.key === survey.owner && r.levelId === survey.level,
  );
  const use = owner?.properties.spaceUse;
  if (
    !flight ||
    !owner?.stair ||
    !owner.walkable ||
    owner.access === "staff" ||
    !use ||
    typeof use !== "object" ||
    !("kind" in use) ||
    use.kind !== "hallway" ||
    data.stairDisplay?.sourceModelSha256 !== survey.sourceModel ||
    bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(flight)))) !==
      survey.flightSha256
  )
    return;
  const id =
    "walk:landing:" + survey.nativeStair + ":" + survey.run + ":upper-hallway";
  const ids = survey.stations.map((_, i) => id + ":" + i);
  if (data.edges.some((e) => e.id === id) || ids.some((k) => nodes.has(k)))
    return;
  const points = survey.stations.map((s) => s.point as Point),
    indices = new Map(
      survey.stations.map((s) => [s.guide, [] as PathwayArc[]]),
    );
  for (const group of outgoing.values())
    for (const arc of group) indices.get(arc.link.edge.id)?.push(arc);
  const [a, b] = survey.stations.map((s, i) =>
    flatLandingDonor(indices.get(s.guide)!, points[i], accepted),
  );
  if (!a || !b) return;
  const bridges = [
    [a, b],
    [b, a],
  ];
  for (const [i, [start, end]] of bridges.entries()) {
    const path = i === 0 ? points : points.toReversed();
    if (
      !start.tangents.every((previous) =>
        end.tangents.every((next) =>
          reviewedCorridorStripSupported(
            data,
            survey.cell,
            owner.levelId,
            owner.elevationFeet,
            path,
            undefined,
            { ownerKey: owner.key, previous, next },
          ),
        ),
      )
    )
      return;
  }
  const derivedNodes = new Set(ids);
  for (const [i, k] of ids.entries())
    nodes.set(k, {
      id: k,
      kind: "junction",
      roomKey: owner.key,
      building: owner.building,
      levelId: owner.levelId,
      surfaceId: owner.surfaceId,
      pointFeet: points[i],
      geographic: geographicPoint(data, points[i]),
    });
  const arcs: PathwayArc[] = [],
    vertex = (id: string) => JSON.stringify([id]),
    metres = (path: Point[]) =>
      corridorGuideLength(path) * data.alignment.horizontalMetresPerFoot;
  for (const [index, donor] of [a, b].entries())
    for (const { arc, before, after } of donor.pieces) {
      const node = ids[index];
      arcs.push(
        {
          ...arc,
          to: vertex(node),
          sourceTo: node,
          points: before,
          metres: metres(before),
          validateReviewedRun: () => accepted(arc),
        },
        {
          ...arc,
          from: vertex(node),
          sourceFrom: node,
          points: after,
          metres: metres(after),
          validateReviewedRun: () => accepted(arc),
        },
      );
    }
  const edge: IndoorEdge = {
    id,
    from: ids[0],
    to: ids[1],
    kind: "walk",
    roomKeys: [owner.key],
    nativeCellId: survey.cell,
    evidence:
      "Reviewed public flat landing between native hallway guide stations",
    pointsFeet: points,
    enabled: true,
    accessible: "unknown",
    lengthMetres: metres(points),
  };
  for (const [i, [start, end]] of bridges.entries()) {
    const from = ids[i],
      to = ids[1 - i];
    arcs.push({
      from: vertex(from),
      to: vertex(to),
      sourceFrom: from,
      sourceTo: to,
      points: i === 0 ? points : points.toReversed(),
      metres: edge.lengthMetres,
      link: { edge, to, passages: [], requiredRooms: [], blockers: [] },
      validateReviewedRun: () =>
        start.pieces.every((p) => accepted(p.arc)) &&
        end.pieces.every((p) => accepted(p.arc)),
    });
  }
  return { arcs, derivedNodes };
}
