import type { IndoorDataset } from "./contract";
import type { SharedGuidePoint as XYZ } from "./shared-corridor-guides";
import { pathwayCirculationOwner } from "./reviewed-rotunda-role";
import { createNativeExactBoundaryMaterialQuery } from "./native-boundary-material";
import {
  nativeCirculationExactCellParts,
  nativeCirculationCells,
} from "./native-circulation";
import { nativeRoomIdentityRings } from "./native-floor-opening-ownership";
import { nativeRationalOverlay, rational } from "./native-rational-overlay";
import { nativeRoutingAccessZonesAt } from "./native-routing-access-zones";
import { createNativeRoutingMaterialQuery } from "./native-routing-material";
import { projectStatedTwoFootWalkingVolume } from "./native-stepped-stair-v2-walking-volume";
import { routingCalculationValue } from "./routing-cache";
import { indoorExclusionParts } from "./indoor-exclusions";
import { createDoorPassageQuery } from "./route-passages";
import { createNativeDoorApproachQuery } from "./native-door-approach";
import { nativeRoomDoorJunction } from "./native-room-door-junction";
import { nativeRationalPointInParts } from "./native-exact-planar-topology";
import { nativeDoorClearOpening } from "./native-door-clear-opening";
import { chordFitsFiniteDoor } from "./finite-door-chord";
import { createNativeFloorHoleQuery } from "./walking-support";

import { corridorChainTopologyConflicts } from "./corridor-chain-fit";
import type { PreparedRouting } from "./prepared-routing";
type Guide = PreparedRouting["guides"][number];

type XY = [number, number];
type Landing = { ownerKey: string; previous: XYZ; next: XYZ };

/** A one-foot half-width turns with the walking direction. For two headings in
 * the same cardinal quadrant the transverse component of the unit normal is
 * bounded by the largest transverse/axial slope. Round that bound upwards
 * to a binary fraction. A corner spanning different axes requires the full square. */
export function landingTurnBounds(a: XYZ, p: XYZ, b: XYZ): XY {
  const u = [p[0] - a[0], p[1] - a[1]],
    v = [b[0] - p[0], b[1] - p[1]];
  for (const axis of [0, 1]) {
    const other = 1 - axis;
    if (
      u[axis] * v[axis] <= 0 ||
      Math.abs(u[other]) > Math.abs(u[axis]) ||
      Math.abs(v[other]) > Math.abs(v[axis])
    )
      continue;
    const ratio = Math.max(
      Math.abs(u[other] / u[axis]),
      Math.abs(v[other] / v[axis]),
    );
    const extent = Math.min(1, (Math.floor(ratio * 1024) + 1) / 1024);
    return axis === 0 ? [extent, 1] : [1, extent];
  }
  return [1, 1];
}

/** Verify the entire walking strip against its native cell, slab, material
 * sections, doors, access zones and enclosed rooms, including its corners. */
export function reviewedCorridorStripSupported(
  data: IndoorDataset,
  cell: string,
  level: number,
  floor: number,
  points: XYZ[],
  entrance?: { roomKey: string; roomCell: string; doorId: string },
  landing?: Landing,
) {
  try {
    if (
      landing &&
      (entrance ||
        points.length !== 2 ||
        !data.stairDisplay?.sourceFlights?.length ||
        data.stairDisplay.sourceModelSha256 !== data.source.modelSha256 ||
        !data.records.some(
          (r) =>
            r.key === landing.ownerKey &&
            r.stair &&
            r.walkable &&
            r.access !== "staff" &&
            r.levelId === level,
        ))
    )
      return false;
    const model = data.source.modelSha256;
    if (
      points.length < 2 ||
      points.some((p) => p[2] !== floor || !p.every(Number.isFinite)) ||
      data.walkingSupport?.sourceModelSha256 !== model ||
      data.nativeMaterialSections?.sourceModelSha256 !== model
    )
      return false;
    const cellIds = new Set(entrance ? [cell, entrance.roomCell] : [cell]);
    const ownedCells = nativeCirculationCells(data, { cellIds }).filter((c) =>
      cellIds.has(c.id),
    );
    const physical = ownedCells.find((c) => c.id === cell);
    let face = physical && nativeCirculationExactCellParts(data, physical);
    if (
      !physical ||
      physical.elevationFeet !== floor ||
      !face?.length ||
      createNativeFloorHoleQuery(data)(points).length > 0
    )
      return false;
    const crossings = createDoorPassageQuery(data)(level, points);
    if (entrance) {
      const room = data.records.find((r) => r.key === entrance.roomKey);
      const roomCell = ownedCells.find((c) => c.id === entrance.roomCell);
      const roomFace =
        roomCell && nativeCirculationExactCellParts(data, roomCell);
      const door = data.doors?.find((d) => d.id === entrance.doorId);
      if (
        !room?.walkable ||
        room.access === "staff" ||
        room.circulation ||
        room.stair ||
        room.levelId !== level ||
        !roomFace?.length ||
        roomCell?.elevationFeet !== floor ||
        !roomCell.roomKeys.includes(room.key) ||
        roomCell.id === cell ||
        !nativeRationalPointInParts(points[0], roomFace) ||
        !nativeRationalPointInParts(points.at(-1)!, face) ||
        !door?.footprintFeet ||
        !door.normalFeet ||
        door.state !== "connected" ||
        !door.hostWallNativeElementId ||
        door.levelId !== level ||
        door.roomKeys.length !== 2 ||
        !door.roomKeys.includes(room.key) ||
        crossings.length !== 1 ||
        crossings[0].edge.id !== door.id
      )
        return false;
      const aperture =
        nativeDoorClearOpening(data, door, floor) ?? door.footprintFeet;
      if (!chordFitsFiniteDoor(points[0], points[1], aperture, door.normalFeet))
        return false;
      const doorEdge = crossings[0].edge;
      const halves = createNativeDoorApproachQuery(data);
      const owned = [physical, roomCell].map((owner) => {
        const endpoints = new Set([doorEdge.from, doorEdge.to]);
        const incident = data.edges.find(
          (e) =>
            e.kind === "walk" &&
            e.enabled &&
            e.nativeCellId === owner.id &&
            (endpoints.has(e.from) || endpoints.has(e.to)),
        );
        return incident
          ? halves(incident, endpoints)
              .filter((v) => v.z === floor)
              .flatMap((v) => v.exactParts ?? [])
          : [];
      });
      if (owned.some((parts) => parts.length === 0)) return false;
      // Use the same independently supported native jamb seam as an ordinary
      // room branch. Each side contributes only this doorway’s exact half.
      face = nativeRationalOverlay(
        "union",
        face,
        roomFace,
        ...owned,
        nativeRoomDoorJunction(
          data,
          aperture,
          door.normalFeet,
          roomCell,
          physical,
        ),
      );
    } else if (crossings.length > 0) return false;
    const q = rational(floor);
    const strips = points
      .slice(1)
      .map((p, i) => [
        projectStatedTwoFootWalkingVolume(points[i], p, q, q, 6)
          .unclippedStatedStripFeet,
      ]);
    const corners = points.slice(1, -1).map(([x, y]) => [
      [
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x + 1, y + 1],
        [x - 1, y + 1],
      ] as XY[],
    ]);
    if (landing) {
      for (const [i, neighbor] of [landing.previous, landing.next].entries()) {
        const p = points[i],
          [x, y] = p;
        const [dx, dy] =
          i === 0
            ? landingTurnBounds(neighbor, p, points[1])
            : landingTurnBounds(points[0], p, neighbor);
        corners.push([
          [
            [x - dx, y - dy],
            [x + dx, y - dy],
            [x + dx, y + dy],
            [x - dx, y + dy],
          ],
        ]);
      }
    }
    const body = nativeRationalOverlay("union", strips, corners);
    if (
      body.length === 0 ||
      nativeRationalOverlay("difference", body, face).length > 0
    )
      return false;
    const x0 = Math.min(...points.map((p) => p[0])) - 2,
      x1 = Math.max(...points.map((p) => p[0])) + 2,
      y0 = Math.min(...points.map((p) => p[1])) - 2,
      y1 = Math.max(...points.map((p) => p[1])) + 2;
    const near = (r: XY[][]) =>
      r[0]?.length &&
      !r[0].every((p) => p[0] < x0) &&
      !r[0].every((p) => p[0] > x1) &&
      !r[0].every((p) => p[1] < y0) &&
      !r[0].every((p) => p[1] > y1);
    const slabs = data.walkingSupport.floors
      .filter(
        (f) =>
          ownedCells.some((c) =>
            c.nativeFloorIds.includes(f.nativeElementId),
          ) && f.elevationFeet === floor,
      )
      .flatMap((f) => f.partsFeet ?? [f.ringsFeet])
      .filter(near);
    if (
      slabs.length === 0 ||
      nativeRationalOverlay("difference", body, slabs).length > 0
    )
      return false;
    const materialAt = routingCalculationValue(
      data,
      "native-route-material-query",
      () => createNativeRoutingMaterialQuery(data),
    );
    const boundary = createNativeExactBoundaryMaterialQuery(data);
    for (const cut of [floor + 0.1, floor + 4]) {
      if (
        !data.nativeMaterialSections.levels.some(
          (r) =>
            r.levelId === level &&
            r.elevationFeet === floor &&
            r.cutElevationFeet === cut,
        )
      )
        return false;
      const mat = materialAt(floor, cut);
      const obstructions = [
        ...mat.parts.map((v) => v.rings).filter(near),
        ...(mat.derivedParts ?? []).filter(near),
        ...data.walls
          .filter(
            (w) =>
              w.levelId === level &&
              near(w.ringsFeet) &&
              (!mat.known.has(w.nativeElementId) ||
                (w.reviewPatchId && mat.present.has(w.nativeElementId))),
          )
          .flatMap(boundary),
      ];
      if (
        obstructions.length > 0 &&
        nativeRationalOverlay("intersection", body, obstructions).length > 0
      )
        return false;
    }
    const excluded = [
      ...(data.doors ?? [])
        .filter(
          (d) =>
            d.levelId === level && d.footprintFeet && d.id !== entrance?.doorId,
        )
        .map((d) => [d.footprintFeet!]),
      ...(data.circulationGeometry?.fixtures ?? [])
        .filter((f) => f.elevationFeet === floor)
        .map((f) => f.ringsFeet),
      ...indoorExclusionParts(data, floor),
      ...(landing
        ? data.stairDisplay!.sourceFlights!.flatMap((f) =>
            f.treads
              .filter(
                (t) =>
                  t.elevationFeet > floor &&
                  t.elevationFeet - (t.thicknessFeet ?? 0) < floor + 6,
              )
              .map((t) => [t.ringFeet]),
          )
        : []),

      ...data.records
        .filter(
          (r) =>
            r.key !== entrance?.roomKey &&
            r.key !== landing?.ownerKey &&
            Math.abs(r.elevationFeet - floor) < 0.05 &&
            (!r.walkable ||
              r.access === "staff" ||
              r.stair ||
              !pathwayCirculationOwner(data, r)),
        )
        .map((r) => nativeRoomIdentityRings(data, r)),
    ].filter(near);
    const zones = nativeRoutingAccessZonesAt(data, floor).flatMap(
      (z) => z.parts,
    );
    return [excluded, zones].every(
      (group) =>
        group.length === 0 ||
        nativeRationalOverlay("intersection", body, group).length === 0,
    );
  } catch {
    return false;
  }
}

const name = (p: XY) => JSON.stringify(p);
const xy = (p: XYZ): XY => [p[0], p[1]];
export function corridorRunAvoidsOtherBranches(
  points: XYZ[],
  guides: Iterable<Guide>,
  cellId: string,
) {
  const geometry = points.map(xy),
    from = name(geometry[0]),
    to = name(geometry.at(-1)!);
  const newChain = { id: "span", from, to, points: geometry };
  for (const guide of guides) {
    if (!guide.edgeId.startsWith(cellId + ":walk:")) continue;
    const ps = guide.pointsFeet.map(xy);
    for (let i = 1; i < ps.length; i++) {
      const a = name(ps[i - 1]),
        b = name(ps[i]);
      if (a === b) continue;
      if (
        corridorChainTopologyConflicts([
          newChain,
          { id: "existing", from: a, to: b, points: [ps[i - 1], ps[i]] },
        ]).length > 0
      )
        return false;
    }
  }
  return true;
}
