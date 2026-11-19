import type { IndoorDataset, IndoorEdge, IndoorNode } from "./contract";
import { geographicPoint } from "./routing";
import { projectLinkPolicy } from "./route-policy";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";
import type { PreparedRouting } from "./prepared-routing";
import type { SharedPathwayStop, PathwayArc } from "./shared-pathway-routing";
import {
  corridorSill,
  reviewedCorridorSillSupport,
} from "./reviewed-corridor-sill";

const doorId = "door:694:1513453",
  west = "rm-694-3fa5e106df03",
  east = "rm-694-43c823fdc35c",
  wrongOffice = "rm-694-3f176906de8a";
const westCore =
  "native-cell:14.435696:634:walk:door:694:1513784:0|door:694:1513785:1";
const eastCore =
  "native-cell:14.435696:637:walk:arrival:rm-694-43c823fdc35c|door:694:1992808:1";
type Guide = PreparedRouting["guides"][number];
type Door = NonNullable<IndoorDataset["doors"]>[number];

export function reviewedCrossCorridorDoor(data: IndoorDataset) {
  if (
    data.source.modelSha256 !==
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" ||
    data.source.roomsSha256 !==
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9" ||
    data.edges.some((e) => e.id === doorId || e.nativeElementId === 1513453) ||
    data.nativeDoorBoundaryClosures?.doors.some(
      (d) => d.nativeElementId === 1513453,
    )
  )
    return;
  const d = data.doors?.find((v) => v.id === doorId);
  if (
    !d ||
    d.state !== "connected" ||
    d.levelId !== 694 ||
    d.nativeElementId !== 1513453 ||
    d.hostWallNativeElementId !== 1513452 ||
    d.drawingBackedPatchId ||
    JSON.stringify(d.pointFeet) !== "[48.51157536000714,484.8917254283297]" ||
    JSON.stringify(d.normalFeet) !== "[-1,0]" ||
    JSON.stringify(d.footprintFeet) !==
      "[[50.1519953075137,483.46652857793634],[50.1519953075137,486.3169222787231],[46.871155412500585,486.3169222787231],[46.871155412500585,483.46652857793634]]" ||
    d.roomKeys.length !== 2 ||
    !d.roomKeys.includes(wrongOffice) ||
    !d.roomKeys.includes(west)
  )
    return;
  const office = data.records.find((r) => r.key === wrongOffice);
  if (
    office?.number !== "08-211" ||
    office.circulation ||
    office.levelId !== 694 ||
    office.building !== "08"
  )
    return;
  for (const [key, number] of [
    [west, "08-210"],
    [east, "08-202"],
  ]) {
    const r = data.records.find((r) => r.key === key);
    if (
      r?.number !== number ||
      r.levelId !== 694 ||
      r.building !== "08" ||
      !r.walkable ||
      !r.circulation ||
      r.access === "staff"
    )
      return;
  }
  return d;
}

function station(
  edge: IndoorEdge,
  terminal: string,
  segment: number,
  fraction: number,
  point: XYZ,
): SharedPathwayStop {
  const cell = edge.nativeCellId!,
    id = JSON.stringify([cell, ...point]);
  return {
    cellId: cell,
    terminalNodeId: terminal,
    guideEdgeId: edge.id,
    levelId: 694,
    building: "08",
    stopId: id,
    pointFeet: point,
    station: {
      guideEdgeId: edge.id,
      segment,
      fraction,
      previousStopId: id,
      previousPointFeet: point,
    },
  };
}

export function crossCorridorStations(
  door: Door,
  westGuide: Guide,
  eastGuide: Guide,
  westEdge: IndoorEdge,
  eastEdge: IndoorEdge,
) {
  if (
    westGuide.edgeId !== westCore ||
    eastGuide.edgeId !== eastCore ||
    westEdge.id !== westCore ||
    eastEdge.id !== eastCore ||
    westEdge.nativeCellId !== "native-cell:14.435696:634" ||
    eastEdge.nativeCellId !== "native-cell:14.435696:637" ||
    !westGuide.hallwayJoins ||
    !eastGuide.hallwayJoins
  )
    return;
  const [ws, we] = westGuide.hallwayJoins,
    [es, ee] = eastGuide.hallwayJoins,
    [cx, cy] = door.pointFeet;
  const candidates: SharedPathwayStop[] = [];
  for (let i = ws; i < we; i++) {
    const a = westGuide.pointsFeet[i],
      b = westGuide.pointsFeet[i + 1];
    if (a[2] !== b[2] || (a[1] - cy) * (b[1] - cy) >= 0) continue;
    const t = (cy - a[1]) / (b[1] - a[1]),
      point: XYZ = [a[0] + (b[0] - a[0]) * t, cy, a[2]];
    if (point[0] < cx)
      candidates.push(station(westEdge, "door:694:1513784:0", i, t, point));
  }
  if (candidates.length !== 1 || ee - es < 2) return;
  // The established east corridor already bends north at this guide vertex.
  const distanceSquared = (p: XYZ) => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    return dx * dx + dy * dy;
  };
  const vertices = eastGuide.pointsFeet
    .slice(es + 1, ee)
    .map((point, j) => ({ point, index: es + 1 + j }))
    .filter((v) => v.point[0] > cx)
    .sort((a, b) => distanceSquared(a.point) - distanceSquared(b.point));
  const pick = vertices[0];
  if (!pick) return;
  const e = station(eastEdge, "door:694:1992808:1", pick.index, 0, pick.point);
  if (e.pointFeet[2] !== candidates[0].pointFeet[2]) return;
  return [candidates[0], e] as const;
}

export function buildReviewedCrossCorridor(
  data: IndoorDataset,
  nodes: Map<string, IndoorNode>,
  guides: Map<string, Guide>,
  edges: Map<string, IndoorEdge>,
  core: (id: string) => PathwayArc[] | undefined,
  usable: (edge: IndoorEdge) => boolean,
  vertex: (s: SharedPathwayStop) => string,
) {
  const empty = {
    arcs: [] as PathwayArc[],
    stations: [] as SharedPathwayStop[],
  };
  const door = reviewedCrossCorridorDoor(data);
  if (!door) return empty;
  const wg = guides.get(westCore),
    eg = guides.get(eastCore),
    we = edges.get(westCore),
    ee = edges.get(eastCore);
  if (
    !wg ||
    !eg ||
    !we ||
    !ee ||
    !core(we.id)?.some(
      (a) => !a.link.requiredRooms.length && !a.link.passages.length,
    ) ||
    !core(ee.id)?.some(
      (a) => !a.link.requiredRooms.length && !a.link.passages.length,
    )
  )
    return empty;
  const stations = crossCorridorStations(door, wg, eg, we, ee);
  if (!stations) return empty;
  const [w, e] = stations,
    wn = nodes.get(w.terminalNodeId),
    en = nodes.get(e.terminalNodeId);
  if (wn?.roomKey !== west || en?.roomKey !== east) return empty;
  const [cx, cy] = door.pointFeet,
    z = w.pointFeet[2],
    span = door.footprintFeet!.map((p) => p[0]);
  const left: XYZ = [Math.min(...span) - 1, cy, z],
    right: XYZ = [Math.max(...span) + 1, cy, z];
  if (!(w.pointFeet[0] < left[0] && left[0] < cx && right[0] < e.pointFeet[0]))
    return empty;
  // Continue through the narrow horizontal bay before turning toward the
  // existing east guide. The full two-foot turn must clear the wall end.
  const bend: XYZ = [right[0] + ((e.pointFeet[0] - right[0]) * 2) / 3, cy, z];
  const flat = [w.pointFeet, left, right, bend, e.pointFeet];
  // The measured metal sill is kept in the route's height profile and is
  // announced when the visitor reaches its original native doorway.
  const top = corridorSill.topFeet;
  const raised: XYZ[] = [
    left,
    [corridorSill.westX, cy, z],
    [corridorSill.westX, cy, top],
    [corridorSill.eastX, cy, top],
    [corridorSill.eastX, cy, z],
    right,
  ];
  const caps = [
    "reviewed-portal:" + doorId + ":west",
    "reviewed-portal:" + doorId + ":east",
  ];
  if (caps.some((c) => nodes.has(c))) return empty;
  const ids = [wn.id, ...caps, en.id],
    joints = [
      vertex(w),
      JSON.stringify([caps[0]]),
      JSON.stringify([caps[1]]),
      vertex(e),
    ];
  const paths = [[w.pointFeet, left], raised, [right, bend, e.pointFeet]];
  const records = new Map(data.records.map((r) => [r.key, r]));
  let checked: boolean | undefined;
  const validate = () => {
    if (checked !== undefined) return checked;
    try {
      return (checked =
        usable(we) && usable(ee) && reviewedCorridorSillSupport(data, flat));
    } catch {
      return (checked = false);
    }
  };
  const arcs: PathwayArc[] = [];
  for (const [i, points] of paths.entries()) {
    const gate = i === 1,
      metres =
        corridorGuideLength(points) * data.alignment.horizontalMetresPerFoot;
    const edge: IndoorEdge = {
      id: gate
        ? doorId
        : doorId + (i === 0 ? ":west-approach" : ":east-approach"),
      kind: gate ? "door" : "walk",
      from: ids[i],
      to: ids[i + 1],
      pointsFeet: points,
      roomKeys: gate ? [west, east] : [i === 0 ? west : east],
      lengthMetres: metres,
      enabled: true,
      accessible: "unknown",
      direction: "both",
      ...(gate ? { nativeElementId: 1513453 } : {}),
      evidence:
        "Owner-confirmed public corridor passage through native door 1513453 with original raised sill 1513455; native geometry and public approaches checked.",
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
      if (policy.blockers.length || policy.requiredRooms.length) return empty;
      const a = forward ? i : i + 1,
        b = forward ? i + 1 : i;
      arcs.push({
        from: joints[a],
        to: joints[b],
        sourceFrom: ids[a],
        sourceTo: ids[b],
        points: forward ? points : points.toReversed(),
        metres,
        validateReviewedDoor: validate,
        ...(gate ? { reviewedSillHeightFeet: top - z } : {}),
        link: { edge, to: ids[b], passages: [], ...policy },
      });
    }
  }
  for (const [i, source, point] of [
    [0, wn, left],
    [1, en, right],
  ] as const)
    nodes.set(caps[i], {
      ...source,
      id: caps[i],
      pointFeet: point,
      geographic: geographicPoint(data, point),
      kind: "portal",
    });
  return { arcs, stations: [...stations] };
}
