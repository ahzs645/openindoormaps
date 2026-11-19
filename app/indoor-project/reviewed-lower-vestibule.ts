import type { IndoorDataset, IndoorEdge, IndoorNode } from "./contract";
import type { PathwayArc, SharedPathwayStop } from "./shared-pathway-routing";
import { geographicPoint } from "./routing";
import { projectLinkPolicy } from "./route-policy";
import {
  nativeCirculationExactCellParts,
  type NativeCirculationCell,
} from "./native-circulation";
import { nativeRationalOverlay, rational } from "./native-rational-overlay";
import { createNativeRoutingMaterialQuery } from "./native-routing-material";
import { createNativeExactBoundaryMaterialQuery } from "./native-boundary-material";
import { nativeRoomIdentityRings } from "./native-floor-opening-ownership";
import { nativeRoutingAccessZonesAt } from "./native-routing-access-zones";
import { indoorExclusionParts } from "./indoor-exclusions";
import { createNativeFloorHoleQuery } from "./walking-support";
import { nativeDoorClearOpening } from "./native-door-clear-opening";
import { chordFitsFiniteDoor } from "./shared-door-crossing";
import { projectStatedTwoFootWalkingVolume } from "./native-stepped-stair-v2-walking-volume";
import { routingCalculationValue } from "./routing-cache";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";

const id = "door:694:2463762";
const west = "rm-694-3eff6106de76",
  east = "rm-694-43c823fdc35c";
const stationIds = ["door:694:1513787:0", "door:694:1998054:1"] as const;
const cellId = "native-cell:14.435696:637";
type Point = [number, number];
type Door = NonNullable<IndoorDataset["doors"]>[number];

// The owner confirmed public travel in both directions through the LOWER door
// between 08-216 and 08-202. The native source exports only its west owner.
export function reviewedVestibuleThreshold(data: IndoorDataset) {
  if (
    data.source.modelSha256 !==
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" ||
    data.source.roomsSha256 !==
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9" ||
    data.edges.some((e) => e.id === id || e.nativeElementId === 2463762) ||
    data.nativeDoorBoundaryClosures?.doors.some(
      (d) => d.nativeElementId === 2463762,
    )
  )
    return;
  const door = data.doors?.find((d) => d.id === id);
  if (
    !door ||
    door.nativeElementId !== 2463762 ||
    door.hostWallNativeElementId !== 2463683 ||
    door.levelId !== 694 ||
    door.state !== "unmatched" ||
    door.drawingBackedPatchId ||
    door.roomKeys.length !== 1 ||
    door.roomKeys[0] !== west ||
    JSON.stringify(door.pointFeet) !== "[54.64395724977068,529.643530373783]" ||
    JSON.stringify(door.normalFeet) !== "[-1,1.90645670820616e-15]" ||
    JSON.stringify(door.footprintFeet) !==
      "[[56.28437719727725,527.780013796927],[56.28437719727726,531.507046950639],[53.003537302264114,531.507046950639],[53.00353730226411,527.780013796927]]"
  )
    return;
  for (const [key, number] of [
    [west, "08-216"],
    [east, "08-202"],
  ]) {
    const r = data.records.find((r) => r.key === key);
    if (
      r?.number !== number ||
      r.levelId !== 694 ||
      r.building !== "08" ||
      !r.circulation ||
      !r.walkable ||
      r.access === "staff"
    )
      return;
  }
  return door;
}

// Keep both hallway stations. Split their straight chord a foot clear of each
// native cap, so the door remains a discrete, directional route instruction.
export function vestibuleDoorSegments(
  door: Door,
  a: XYZ,
  b: XYZ,
): XYZ[] | undefined {
  const ring = door.footprintFeet,
    n = door.normalFeet;
  if (!ring || !n || !Number.isFinite(a[2]) || a[2] !== b[2]) return;
  const lo = Math.min(...ring.map((p) => p[0])) - 1,
    hi = Math.max(...ring.map((p) => p[0])) + 1;
  if (!(a[0] < lo && hi < b[0]) || !chordFitsFiniteDoor(a, b, ring, n)) return;
  const at = (x: number): XYZ => [
    x,
    a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]),
    a[2],
  ];
  return [a, at(lo), at(hi), b];
}

export function vestibuleStripSupported(
  data: IndoorDataset,
  cell: NativeCirculationCell,
  door: Door,
  points: XYZ[],
) {
  const z = cell.elevationFeet,
    footprint = door.footprintFeet!,
    normal = door.normalFeet!;
  if (
    data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256 ||
    data.nativeMaterialSections?.sourceModelSha256 !==
      data.source.modelSha256 ||
    cell.id !== cellId ||
    !cell.roomKeys.includes(west) ||
    !cell.roomKeys.includes(east) ||
    points.length !== 4 ||
    points.some((p) => p[2] !== z)
  )
    return false;
  const face = nativeCirculationExactCellParts(data, cell);
  if (
    !face?.length ||
    createNativeFloorHoleQuery(data)(points).length ||
    !chordFitsFiniteDoor(
      points[1],
      points[2],
      nativeDoorClearOpening(data, door, z) ?? footprint,
      normal,
    )
  )
    return false;
  const halfWindow = 2,
    xmin = Math.min(...points.map((p) => p[0])) - halfWindow,
    xmax = Math.max(...points.map((p) => p[0])) + halfWindow,
    ymin = Math.min(...points.map((p) => p[1])) - halfWindow,
    ymax = Math.max(...points.map((p) => p[1])) + halfWindow;
  function nearby(rings: Point[][]) {
    const pts = rings[0];
    return (
      !!pts?.length &&
      !pts.every((p) => p[0] < xmin) &&
      !pts.every((p) => p[0] > xmax) &&
      !pts.every((p) => p[1] < ymin) &&
      !pts.every((p) => p[1] > ymax)
    );
  }
  const q = rational(z),
    strip = nativeRationalOverlay(
      "union",
      points
        .slice(1)
        .map((p, i) => [
          projectStatedTwoFootWalkingVolume(points[i], p, q, q, 6)
            .unclippedStatedStripFeet,
        ]),
    );
  const slabs = data.walkingSupport.floors
    .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
    .flatMap((f) => f.partsFeet ?? [f.ringsFeet])
    .filter(nearby);
  if (
    !strip.length ||
    !slabs.length ||
    nativeRationalOverlay("difference", strip, slabs).length
  )
    return false;
  const belowDoor = nativeRationalOverlay("difference", strip, face);
  if (
    !belowDoor.length ||
    nativeRationalOverlay("difference", belowDoor, [[footprint]]).length
  )
    return false;
  const material = routingCalculationValue(
    data,
    "native-route-material-query",
    () => createNativeRoutingMaterialQuery(data),
  )(z);
  if (!material.known.has(door.hostWallNativeElementId!)) return false;
  const blockers = [
    ...material.parts.map((m) => m.rings),
    ...(material.derivedParts ?? []),
    ...(data.doors ?? [])
      .filter((d) => d.levelId === 694 && d !== door && d.footprintFeet)
      .map((d) => [d.footprintFeet!]),
    ...(data.circulationGeometry?.fixtures ?? [])
      .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
      .map((f) => f.ringsFeet),
    ...indoorExclusionParts(data, z),
    ...data.records
      .filter(
        (r) =>
          Math.abs(r.elevationFeet - z) < 0.05 &&
          (!r.circulation || r.access === "staff" || !r.walkable),
      )
      .map((r) => nativeRoomIdentityRings(data, r)),
  ].filter(nearby);
  const boundary = createNativeExactBoundaryMaterialQuery(data);
  const walls = data.walls
    .filter(
      (w) =>
        w.levelId === 694 &&
        nearby(w.ringsFeet) &&
        (!material.known.has(w.nativeElementId) ||
          (w.reviewPatchId && material.present.has(w.nativeElementId))),
    )
    .flatMap(boundary);
  const zones = nativeRoutingAccessZonesAt(data, z).flatMap((v) => v.parts);
  return [blockers, walls, zones].every(
    (m) => !m.length || !nativeRationalOverlay("intersection", strip, m).length,
  );
}

export function buildReviewedVestibuleDoor(
  data: IndoorDataset,
  nodes: Map<string, IndoorNode>,
  cell: NativeCirculationCell | undefined,
  endpoint: (id: string, enter: boolean) => SharedPathwayStop | undefined,
  vertex: (stop: SharedPathwayStop) => string,
): PathwayArc[] {
  const door = reviewedVestibuleThreshold(data);
  if (!door || cell?.id !== cellId) return [];
  // Each direction needs current source guides at its approach and exit.
  // Preserve the common physical station when both directions qualify.
  const westEntry = endpoint(stationIds[0], true),
    eastExit = endpoint(stationIds[1], false),
    westExit = endpoint(stationIds[0], false),
    eastEntry = endpoint(stationIds[1], true);
  const forward = westEntry?.cellId === cellId && eastExit?.cellId === cellId;
  const reverse =
    westExit?.cellId === cellId &&
    eastEntry?.cellId === cellId &&
    (!forward ||
      (vertex(westEntry) === vertex(westExit) &&
        vertex(eastExit) === vertex(eastEntry)));
  if (!forward && !reverse) return [];
  const a = (forward ? westEntry : westExit)!,
    b = (forward ? eastExit : eastEntry)!;
  const start = nodes.get(a.terminalNodeId),
    end = nodes.get(b.terminalNodeId);
  if (start?.roomKey !== west || end?.roomKey !== east) return [];
  const p = vestibuleDoorSegments(door, a.pointFeet, b.pointFeet);
  if (!p) return [];
  const ids = [start.id, id + ":0", id + ":1", end.id];
  if (nodes.has(ids[1]) || nodes.has(ids[2])) return [];
  const joints = [
    vertex(a),
    JSON.stringify([ids[1]]),
    JSON.stringify([ids[2]]),
    vertex(b),
  ];
  const records = new Map(data.records.map((r) => [r.key, r]));
  let checked: boolean | undefined;
  const validate = () => {
    if (checked !== undefined) return checked;
    try {
      return (checked = vestibuleStripSupported(data, cell, door, p));
    } catch {
      return (checked = false);
    }
  };
  let eastbound: PathwayArc[] = [],
    westbound: PathwayArc[] = [];
  for (let i = 0; i < 3; i++) {
    const gate = i === 1,
      points = p.slice(i, i + 2),
      from = ids[i],
      to = ids[i + 1];
    const metres =
      corridorGuideLength(points) * data.alignment.horizontalMetresPerFoot;
    const edge: IndoorEdge = {
      id: gate
        ? id
        : id + (i === 0 ? ":vestibule-approach" : ":corridor-approach"),
      from,
      to,
      kind: gate ? "door" : "walk",
      roomKeys: gate ? [west, east] : [i === 0 ? west : east],
      pointsFeet: points,
      lengthMetres: metres,
      accessible: "unknown",
      enabled: true,
      direction: "both",
      ...(gate ? { nativeElementId: door.nativeElementId } : {}),
      evidence:
        "Owner-confirmed two-way public passage through native door 2463762, with the two-foot strip checked against current source geometry.",
    };
    for (const along of [true, false]) {
      if (along ? !forward : !reverse) continue;
      const policy = projectLinkPolicy(
        records,
        edge,
        [],
        along,
        "public",
        data.source.modelSha256,
        data,
      );
      if (policy.blockers.length || policy.requiredRooms.length) continue;
      const j = along ? i : i + 1,
        k = along ? i + 1 : i;
      (along ? eastbound : westbound).push({
        from: joints[j],
        to: joints[k],
        sourceFrom: ids[j],
        sourceTo: ids[k],
        points: along ? points : points.toReversed(),
        metres,
        validateReviewedDoor: validate,
        link: { edge, to: ids[k], passages: [], ...policy },
      });
    }
  }
  // A door with an ineligible approach must not publish a partial crossing.
  if (eastbound.length !== 3) eastbound = [];
  if (westbound.length !== 3) westbound = [];
  const arcs = [...eastbound, ...westbound];
  if (!arcs.length) return [];
  for (const [i, side] of [
    [1, start],
    [2, end],
  ] as const)
    nodes.set(ids[i], {
      ...side,
      id: ids[i],
      pointFeet: p[i],
      geographic: geographicPoint(data, p[i]),
      kind: "portal",
    });
  return arcs;
}
