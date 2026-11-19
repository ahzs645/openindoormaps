import type { IndoorDataset } from "./contract";
import {
  createIndoorExclusionQuery,
  indoorExclusionParts,
} from "./indoor-exclusions";
import { createNativeExactBoundaryMaterialQuery } from "./native-boundary-material";
import {
  type NativeCirculationCell,
  nativeCirculationExactCellParts,
} from "./native-circulation";
import { nativeRoomIdentityRings } from "./native-floor-opening-ownership";
import { nativeRationalOverlay, rational } from "./native-rational-overlay";
import { nativeRoutingAccessZonesAt } from "./native-routing-access-zones";
import { createNativeRoutingMaterialQuery } from "./native-routing-material";
import { projectStatedTwoFootWalkingVolume } from "./native-stepped-stair-v2-walking-volume";
import { routingCalculationValue } from "./routing-cache";

import type { SharedGuidePoint as XYZ } from "./shared-corridor-guides";
import { createNativeFloorHoleQuery } from "./walking-support";

type Point = [number, number];
type Door = NonNullable<IndoorDataset["doors"]>[number];

/** Check a source-reviewed sill across two original circulation faces. The
 * original duct, fixture, wall and permission inventories remain vetoes.
 * Only the measured horizontal section of the sill and its own assembly may
 * occupy the walking strip at the lower native cut; the upper cut must clear. */
export function nativeReviewedSillStrip(
  data: IndoorDataset,
  door: Door,
  cells: NativeCirculationCell[],
  points: XYZ[],
  review: {
    floor: number;
    topFeet: number;
    aperture: Point[];
    sillRing: Point[];
    hostId: number;
    sillId: number;
    doorId: number;
    physicalChildren: number[];
    throughRooms: string[];
  },
) {
  const {
    floor,
    topFeet,
    aperture,
    sillRing,
    hostId,
    sillId,
    doorId,
    physicalChildren,
    throughRooms,
  } = review;
  if (
    data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256 ||
    data.nativeMaterialSections?.sourceModelSha256 !== data.source.modelSha256
  )
    return false;
  const segments = points.slice(1).map((end, i) => [points[i]!, end] as const);
  const faces = cells.map((c) => nativeCirculationExactCellParts(data, c));
  if (faces.some((f) => !f?.length)) return false;
  const q = rational(floor);
  const strips = segments.map(([a, b]) => [
    projectStatedTwoFootWalkingVolume(a, b, q, q, 6).unclippedStatedStripFeet,
  ]);
  // Cover the full one-foot turning radius where segment end caps meet.
  const corners: Point[][][] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1]!, points[i]!, points[i + 1]!];
    if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) {
      const [x, y] = b;
      corners.push([
        [
          [x - 1, y - 1],
          [x + 1, y - 1],
          [x + 1, y + 1],
          [x - 1, y + 1],
        ],
      ]);
    }
  }
  const strip = nativeRationalOverlay("union", strips, corners);
  if (!strip.length) return false;
  const box = [
    Math.min(...points.map((p) => p[0])) - 2,
    Math.min(...points.map((p) => p[1])) - 2,
    Math.max(...points.map((p) => p[0])) + 2,
    Math.max(...points.map((p) => p[1])) + 2,
  ];
  const nearby = (rings: Point[][]) =>
    rings[0]?.length &&
    !rings[0].every((p) => p[0] < box[0]!) &&
    !rings[0].every((p) => p[1] < box[1]!) &&
    !rings[0].every((p) => p[0] > box[2]!) &&
    !rings[0].every((p) => p[1] > box[3]!);
  const slabs = data
    .walkingSupport!.floors.filter(
      (f) => Math.abs(f.elevationFeet - floor) < 0.05,
    )
    .flatMap((f) => f.partsFeet ?? [f.ringsFeet])
    .filter(nearby);
  if (
    !slabs.length ||
    nativeRationalOverlay("difference", strip, slabs).length ||
    createNativeFloorHoleQuery(data)(points).length ||
    createIndoorExclusionQuery(data)(points).length
  )
    return false;
  const gap = nativeRationalOverlay(
    "difference",
    strip,
    ...faces.map((f) => f!),
  );
  const doorwayPart = nativeRationalOverlay("intersection", strip, [
    [aperture],
  ]);
  if (
    !doorwayPart.length ||
    nativeRationalOverlay("xor", gap, doorwayPart).length
  )
    return false;
  const fragments = nativeRationalOverlay("intersection", strip, [[sillRing]]);
  if (!fragments.length) return false;
  const query = routingCalculationValue(
    data,
    "native-route-material-query",
    () => createNativeRoutingMaterialQuery(data),
  );
  const boundary = createNativeExactBoundaryMaterialQuery(data);
  for (const cut of [floor + 0.1, floor + 4]) {
    const row = data.nativeMaterialSections!.levels.find(
      (r) =>
        r.levelId === 694 &&
        r.elevationFeet === floor &&
        r.cutElevationFeet === cut,
    );
    const host = row?.sections.find((s) => s.nativeElementId === hostId);
    if (
      !host ||
      !host.sourceNativeHostRelationsVerified ||
      host.categoryId !== -2000011 ||
      JSON.stringify(host.sourceAssemblyChildIds) !==
        JSON.stringify(physicalChildren) ||
      JSON.stringify(host.originalPhysicalDoorChildIds) !==
        JSON.stringify([doorId]) ||
      !physicalChildren.every((id) => row!.sourceElementIds.includes(id))
    )
      return false;
    const lower = cut === floor + 0.1;
    const sill = row!.sections.find((s) => s.nativeElementId === sillId);
    if (
      lower
        ? !sill ||
          sill.categoryId !== -2000171 ||
          sill.baseElevationFeet !== floor ||
          sill.topElevationFeet !== topFeet ||
          nativeRationalOverlay("xor", sill.partsFeet, [[sillRing]]).length > 0
        : !!sill
    )
      return false;
    const material = query(floor, cut);
    for (const id of [hostId, sillId]) {
      const own = material.parts
        .filter((p) => p.nativeElementId === id)
        .map((p) => p.rings);
      const hits = own.length
        ? nativeRationalOverlay("intersection", strip, own)
        : [];
      if (
        lower
          ? nativeRationalOverlay("xor", hits, fragments).length > 0
          : hits.length > 0
      )
        return false;
    }
    const foreign = [
      ...material.parts
        .filter(
          (p) => p.nativeElementId !== hostId && p.nativeElementId !== sillId,
        )
        .map((p) => p.rings),
      ...(material.derivedParts ?? []),
    ].filter(nearby);
    if (
      foreign.length &&
      nativeRationalOverlay("intersection", strip, foreign).length
    )
      return false;
    const fallback = data.walls
      .filter(
        (w) =>
          w.levelId === 694 &&
          nearby(w.ringsFeet) &&
          (!material.known.has(w.nativeElementId) ||
            (w.reviewPatchId && material.present.has(w.nativeElementId))),
      )
      .flatMap(boundary);
    if (
      fallback.length &&
      nativeRationalOverlay("intersection", strip, fallback).length
    )
      return false;
  }
  const blockers = [
    ...(data.doors ?? [])
      .filter((d) => d !== door && d.levelId === 694 && d.footprintFeet)
      .map((d) => [d.footprintFeet!]),
    ...(data.circulationGeometry?.fixtures ?? [])
      .filter((f) => Math.abs(f.elevationFeet - floor) < 0.05)
      .map((f) => f.ringsFeet),
    ...indoorExclusionParts(data, floor),
    ...data.records
      .filter(
        (r) =>
          Math.abs(r.elevationFeet - floor) < 0.05 &&
          (!r.walkable ||
            r.access === "staff" ||
            (!r.circulation && !throughRooms.includes(r.key))),
      )
      .map((r) => nativeRoomIdentityRings(data, r)),
  ].filter(nearby);
  const zones = nativeRoutingAccessZonesAt(data, floor).flatMap((v) => v.parts);
  return [blockers, zones].every(
    (x) => !x.length || !nativeRationalOverlay("intersection", strip, x).length,
  );
}
