import type { IndoorDataset } from "./contract";
import { indoorExclusionParts } from "./indoor-exclusions";
import { createNativeExactBoundaryMaterialQuery } from "./native-boundary-material";
import {
  nativeCirculationCells,
  nativeCirculationExactCellParts,
} from "./native-circulation";
import { nativeDoorClearOpening } from "./native-door-clear-opening";
import { nativeRoomIdentityRings } from "./native-floor-opening-ownership";
import { nativeRationalOverlay, rational } from "./native-rational-overlay";
import { nativeRoutingAccessZonesAt } from "./native-routing-access-zones";
import { createNativeRoutingMaterialQuery } from "./native-routing-material";
import { projectStatedTwoFootWalkingVolume } from "./native-stepped-stair-v2-walking-volume";
import { createDoorPassageQuery } from "./route-passages";
import { routingCalculationValue } from "./routing-cache";
import type { SharedGuidePoint as XYZ } from "./shared-corridor-guides";
import { chordFitsFiniteDoor } from "./shared-door-crossing";
import { createNativeFloorHoleQuery } from "./walking-support";
export const balconyLevel = 402367;
export const balconyFloor = 34.120734908136484;
export const balconyCell = "native-cell:34.120735:1094";
const z = balconyFloor,
  level = balconyLevel;
type Point = [number, number];
type Door = NonNullable<IndoorDataset["doors"]>[number];
export function balconyWalkingSupport(
  data: IndoorDataset,
  door: Door,
  points: XYZ[],
) {
  const source = data.source.modelSha256;
  if (
    data.walkingSupport?.sourceModelSha256 !== source ||
    data.nativeMaterialSections?.sourceModelSha256 !== source ||
    points.length !== 7 ||
    points.some((p) => p[2] !== z || !p.every(Number.isFinite))
  )
    return false;
  const cell = nativeCirculationCells(data, {
    cellIds: new Set([balconyCell]),
  }).find(
    (c) =>
      c.id === balconyCell && c.exactFaceId === "native-face:34.120735:4550",
  );
  if (
    !cell ||
    !cell.roomKeys.includes("rm-402367-133b24ba6565") ||
    !cell.roomKeys.includes("rm-402367-039546889998")
  )
    return false;
  const face = nativeCirculationExactCellParts(data, cell);
  if (!face?.length) return false;
  const aperture = nativeDoorClearOpening(data, door, z) ?? door.footprintFeet;
  if (
    !aperture ||
    !door.normalFeet ||
    !chordFitsFiniteDoor(points[3], points[4], aperture, door.normalFeet) ||
    !chordFitsFiniteDoor(points[4], points[3], aperture, door.normalFeet) ||
    createNativeFloorHoleQuery(data)(points).length ||
    createDoorPassageQuery(data)(level, points).length
  )
    return false;
  const q = rational(z);
  const segments = points
    .slice(1)
    .map((p, i) => [
      projectStatedTwoFootWalkingVolume(points[i], p, q, q, 6)
        .unclippedStatedStripFeet,
    ]);
  // Cover the turning body between successive straight strips.
  const corners: Point[][][] = points.slice(1, -1).map(([x, y]) => [
    [
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x + 1, y + 1],
      [x - 1, y + 1],
    ],
  ]);
  const strip = nativeRationalOverlay("union", segments, corners);
  if (!strip.length) return false;
  const box = [
    Math.min(...points.map((p) => p[0])) - 2,
    Math.min(...points.map((p) => p[1])) - 2,
    Math.max(...points.map((p) => p[0])) + 2,
    Math.max(...points.map((p) => p[1])) + 2,
  ];
  const near = (part: Point[][]) =>
    part[0]?.length > 0 &&
    !part[0].every((p) => p[0] < box[0]) &&
    !part[0].every((p) => p[1] < box[1]) &&
    !part[0].every((p) => p[0] > box[2]) &&
    !part[0].every((p) => p[1] > box[3]);
  const slab = data.walkingSupport.floors.filter(
    (f) => f.nativeElementId === 501699 && f.elevationFeet === z,
  );
  if (
    slab.length !== 1 ||
    nativeRationalOverlay(
      "difference",
      strip,
      slab.flatMap((f) => f.partsFeet ?? [f.ringsFeet]),
    ).length
  )
    return false;
  const outsideFace = nativeRationalOverlay("difference", strip, face);
  if (
    !outsideFace.length ||
    nativeRationalOverlay("difference", outsideFace, [[aperture]]).length
  )
    return false;
  const materialQuery = routingCalculationValue(
    data,
    "native-route-material-query",
    () => createNativeRoutingMaterialQuery(data),
  );
  const wallParts = createNativeExactBoundaryMaterialQuery(data);
  for (const cut of [z + 0.1, z + 4]) {
    const material = materialQuery(z, cut);
    if (
      !material.known.has(2131262) ||
      material.parts.filter((p) => p.nativeElementId === 2131262).length !== 2
    )
      return false;
    const barriers = [
      ...material.parts.map((p) => p.rings),
      ...(material.derivedParts ?? []),
    ].filter(near);
    const fallback = data.walls
      .filter(
        (w) =>
          w.levelId === level &&
          near(w.ringsFeet) &&
          (!material.known.has(w.nativeElementId) ||
            (w.reviewPatchId && material.present.has(w.nativeElementId))),
      )
      .flatMap(wallParts);
    if (
      [barriers, fallback].some(
        (rows) =>
          rows.length &&
          nativeRationalOverlay("intersection", strip, rows).length,
      )
    )
      return false;
  }
  const blocked = [
    ...(data.doors ?? [])
      .filter((d) => d !== door && d.levelId === level && d.footprintFeet)
      .map((d) => [d.footprintFeet!]),
    ...(data.circulationGeometry?.fixtures ?? [])
      .filter((f) => Math.abs(f.elevationFeet - z) < 0.05)
      .map((f) => f.ringsFeet),
    ...indoorExclusionParts(data, z),
    ...data.records
      .filter(
        (r) =>
          Math.abs(r.elevationFeet - z) < 0.05 &&
          (!r.circulation || !r.walkable || r.access === "staff" || r.stair),
      )
      .map((r) => nativeRoomIdentityRings(data, r)),
  ].filter(near);
  const zones = nativeRoutingAccessZonesAt(data, z).flatMap((a) => a.parts);
  return [blocked, zones].every(
    (rows) =>
      !rows.length ||
      !nativeRationalOverlay("intersection", strip, rows).length,
  );
}
