import type { IndoorDataset, IndoorEdge, IndoorNode } from "./contract";
import { projectLinkPolicy } from "./route-policy";
import { geographicPoint } from "./routing";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";
import type { PathwayArc } from "./shared-pathway-routing";

export interface ReviewedStationDoor {
  nativeDoorId: number;
  levelId: number;
  roomKeys: [string, string];
  guideEdgeIds: [string, string];
  terminalIds: [string, string];
  paths: [XYZ[], XYZ[], XYZ[]];
  evidence: string;
  reviewedSillHeightFeet?: number;
  supported: () => boolean;
}

/** A field-reviewed passage joins existing bidirectional public core stations.
 * Each endpoint is bound by guide, terminal, level, room, and exact coordinates. */
export function buildReviewedStationDoor(
  data: IndoorDataset,
  nodes: Map<string, IndoorNode>,
  cores: Map<string, PathwayArc[]>,
  usable: (edge: IndoorEdge) => boolean,
  spec: ReviewedStationDoor,
): PathwayArc[] {
  const records = new Map(data.records.map((r) => [r.key, r]));
  const doorId = `door:${spec.levelId}:${spec.nativeDoorId}`;
  const portals = [doorId + ":reviewed:0", doorId + ":reviewed:1"];
  const portalPoints = [spec.paths[1].at(0)!, spec.paths[1].at(-1)!];
  const same = (p: XYZ | undefined, q: XYZ | undefined) =>
    !!p && !!q && p.every((x, i) => x === q[i]);
  if (
    portals.some((id) => nodes.has(id)) ||
    !same(spec.paths[0].at(-1), portalPoints[0]) ||
    !same(spec.paths[2][0], portalPoints[1])
  )
    return [];
  const approachEdges: IndoorEdge[] = [];
  const stations: string[] = [];
  for (const i of [0, 1]) {
    const node = nodes.get(spec.terminalIds[i]);
    if (
      !node ||
      node.roomKey !== spec.roomKeys[i] ||
      node.levelId !== spec.levelId
    )
      return [];
    const point = i === 0 ? spec.paths[0][0] : spec.paths[2].at(-1);
    const arcs = (cores.get(spec.guideEdgeIds[i]) ?? []).filter(
      (a) =>
        !a.link.requiredRooms.length &&
        !a.link.passages.length &&
        a.link.edge.enabled,
    );
    const arriving = arcs.find(
      (a) => a.sourceTo === node.id && same(a.points.at(-1), point),
    );
    if (
      !arriving ||
      !arcs.some(
        (a) =>
          a.from === arriving.to &&
          a.sourceFrom === node.id &&
          same(a.points[0], point),
      )
    )
      return [];
    approachEdges.push(arriving.link.edge);
    stations.push(arriving.to);
  }
  let checked: boolean | undefined;
  function validate() {
    try {
      return (checked ??= approachEdges.every(usable) && spec.supported());
    } catch {
      return (checked = false);
    }
  }
  const ids = [spec.terminalIds[0], ...portals, spec.terminalIds[1]];
  const vertices = [
    stations[0],
    ...portals.map((id) => JSON.stringify([id])),
    stations[1],
  ];
  const out: PathwayArc[] = [];
  for (const [i, points] of spec.paths.entries()) {
    const gate = i === 1;
    const metres =
      corridorGuideLength(points) * data.alignment.horizontalMetresPerFoot;
    const edge: IndoorEdge = {
      id: gate ? doorId : doorId + ":approach:" + i,
      kind: gate ? "door" : "walk",
      from: ids[i],
      to: ids[i + 1],
      roomKeys: gate ? spec.roomKeys : [spec.roomKeys[i === 0 ? 0 : 1]],
      ...(gate ? { nativeElementId: spec.nativeDoorId } : {}),
      pointsFeet: points,
      lengthMetres: metres,
      enabled: true,
      accessible: "unknown",
      direction: "both",
      evidence: spec.evidence,
    };
    for (const forward of [true, false]) {
      const policy = projectLinkPolicy(
        records,
        edge,
        [],
        forward,
        "public",
        data.source.modelSha256,
        data,
      );
      if (policy.blockers.length || policy.requiredRooms.length) return [];
      const a = forward ? i : i + 1,
        b = forward ? i + 1 : i;
      out.push({
        from: vertices[a],
        to: vertices[b],
        sourceFrom: ids[a],
        sourceTo: ids[b],
        points: forward ? points : points.toReversed(),
        metres,
        validateReviewedDoor: validate,
        ...(gate && spec.reviewedSillHeightFeet !== undefined
          ? { reviewedSillHeightFeet: spec.reviewedSillHeightFeet }
          : {}),
        link: { edge, to: ids[b], passages: [], ...policy },
      });
    }
  }
  for (const i of [0, 1]) {
    const p = portalPoints[i];
    nodes.set(portals[i], {
      ...nodes.get(spec.terminalIds[i])!,
      id: portals[i],
      kind: "portal",
      pointFeet: p,
      geographic: geographicPoint(data, p),
    });
  }
  return out;
}
