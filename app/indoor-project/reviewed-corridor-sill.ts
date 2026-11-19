import type { IndoorDataset } from "./contract";
import { nativeCirculationCells } from "./native-circulation";
import { nativeReviewedSillStrip } from "./native-reviewed-sill-strip";
import { chordFitsFiniteDoor } from "./shared-door-crossing";
import type { SharedGuidePoint as XYZ } from "./shared-corridor-guides";

const floor = 14.435695538057743;
export const corridorSill = {
  westX: 48.26551236788115,
  eastX: 48.75763835213312,
  topFeet: 14.5997375328084,
} as const;
const south = 483.46652857793634,
  north = 486.3169222787231;
const centre = 484.8917254283297;
const sillId = 1513455,
  hostId = 1513452,
  doorId = 1513453;
const physicalChildren = [
  1513454, 1513455, 1513456, 1513457, 2492480, 2492487, 2492488, 2492489,
];
const faceIds = ["native-cell:14.435696:634", "native-cell:14.435696:637"];
type Point = [number, number];
const sillRing: Point[] = [
  [corridorSill.westX, south],
  [corridorSill.eastX, south],
  [corridorSill.eastX, north],
  [corridorSill.westX, north],
];
const aperture: Point[] = [
  [50.1519953075137, south],
  [50.1519953075137, north],
  [46.871155412500585, north],
  [46.871155412500585, south],
];

// The member census, sill top and own-leaf identity are original source facts.
// Only ordinary walking across the middle of this particular opening is reviewed.
// Its 50 mm sill remains material. The router models a step up and down.
export function reviewedCorridorSillSupport(
  data: IndoorDataset,
  flatPath: XYZ[],
): boolean {
  try {
    return supported(data, flatPath);
  } catch {
    return false;
  }
}
function supported(data: IndoorDataset, points: XYZ[]) {
  const source = data.source.modelSha256;
  if (
    source !==
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" ||
    data.source.roomsSha256 !==
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9" ||
    data.walkingSupport?.sourceModelSha256 !== source ||
    data.nativeMaterialSections?.sourceModelSha256 !== source ||
    points.length < 2 ||
    points.length > 20 ||
    points.some(
      (p) => p.length !== 3 || !p.every(Number.isFinite) || p[2] !== floor,
    ) ||
    data.nativeDoorBoundaryClosures?.doors.some(
      (d) => d.nativeElementId === doorId,
    ) ||
    data.edges.some(
      (e) => e.nativeElementId === doorId || e.id === "door:694:1513453",
    )
  )
    return false;
  const door = data.doors?.find((d) => d.id === "door:694:1513453");
  if (
    !door ||
    door.state !== "connected" ||
    door.levelId !== 694 ||
    door.nativeElementId !== doorId ||
    door.hostWallNativeElementId !== hostId ||
    door.drawingBackedPatchId ||
    JSON.stringify(door.footprintFeet) !== JSON.stringify(aperture) ||
    JSON.stringify(door.normalFeet) !== "[-1,0]" ||
    JSON.stringify(door.pointFeet) !==
      "[48.51157536000714,484.8917254283297]" ||
    JSON.stringify(door.roomKeys) !==
      '["rm-694-3f176906de8a","rm-694-3fa5e106df03"]'
  )
    return false;
  for (const [key, number] of [
    ["rm-694-3fa5e106df03", "08-210"],
    ["rm-694-43c823fdc35c", "08-202"],
  ]) {
    const record = data.records.find((r) => r.key === key);
    if (
      record?.number !== number ||
      !record.walkable ||
      !record.circulation ||
      record.access === "staff" ||
      record.levelId !== 694
    )
      return false;
  }
  const direction = Math.sign(points.at(-1)![0] - points[0]![0]);
  if (
    !direction ||
    points.slice(1).some((p, i) => direction * (p[0] - points[i]![0]) <= 0)
  )
    return false;
  const segments = points.slice(1).map((end, i) => [points[i]!, end] as const);
  const crossings = segments.filter(
    ([a, b]) =>
      Math.min(a[0], b[0]) < aperture[2]![0] &&
      Math.max(a[0], b[0]) > aperture[0]![0] &&
      a[1] === centre &&
      b[1] === centre &&
      chordFitsFiniteDoor(a, b, aperture, [-1, 0]),
  );
  if (crossings.length !== 1) return false;
  const cells = nativeCirculationCells(data, { cellIds: new Set(faceIds) });
  if (
    cells.length !== 2 ||
    !cells.some(
      (c) => c.id === faceIds[0] && c.roomKeys.includes("rm-694-3fa5e106df03"),
    ) ||
    !cells.some(
      (c) => c.id === faceIds[1] && c.roomKeys.includes("rm-694-43c823fdc35c"),
    )
  )
    return false;
  return nativeReviewedSillStrip(data, door, cells, points, {
    floor,
    topFeet: corridorSill.topFeet,
    aperture,
    sillRing,
    hostId,
    sillId,
    doorId,
    physicalChildren,
    throughRooms: [],
  });
}
