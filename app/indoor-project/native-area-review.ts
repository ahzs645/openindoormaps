import * as DMath from "./deterministic-math";
import {
  validateNativeSelectionContactRepairs,
  deriveNativeSelectionContactRepairs,
} from "./native-selection-contact-repairs";
import {
  assertNativeSelectionContactRepairsPhysicalGuards,
  type NativeSelectionContactDuplicateClosure,
} from "./native-selection-contact-guards";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";
import {
  createNativeContainedDisplay,
  type NativeContainedDisplay,
} from "./native-contained-display";
import {
  encodeNativeExactTopology,
  createNativeExactTopologyIndex,
  nativeExactPartsForProposals,
  nativeRationalAreaCompare,
  nativeRationalMeasuredArea,
  nativeRationalPointInParts,
  type NativeExactPlanarTopology,
} from "./native-exact-planar-topology";
import { nativeRoomIdentityRings } from "./native-floor-opening-ownership";
import {
  nativeMaterialPlanWalls,
  nativeMaterialPlanExactWalls,
  NATIVE_FLOOR_CONTACT_SELECTION_VERSION,
} from "./native-material-plan";
import {
  createNativeHostApertureQuery,
  createNativeRoutingMaterialQuery,
} from "./native-routing-material";
import { verifyNativeMaterialSections } from "./native-material-sections";
import {
  nativeIndoorEnvelopeParts,
  verifyNativeIndoorEnvelopes,
} from "./native-indoor-envelopes";
import {
  nativeSelectionTopology,
  NATIVE_SELECTION_TOPOLOGY_VERSION,
} from "./native-selection-topology";
import { validateDoorApertureBinding } from "./reviewed-door-apertures";
import { nativeDoorBoundaryClosureFootprints } from "./native-door-boundary-closures";
import {
  NATIVE_SELECTION_POINT_CONTACT_VERSION,
  splitNativeSelectionPointContacts,
} from "./native-selection-point-contacts";
import { selectionDoorIds } from "./selection-door-thresholds";
import {
  checkReviewedAreaPartition,
  reviewedAreaPartitionEvidenceStatuses,
  validateReviewedAreaPartitions,
} from "./reviewed-area-partitions";
import {
  indoorExclusionParts,
  validateIndoorExclusions,
} from "./indoor-exclusions";
import pc from "polygon-clipping";
import {
  nativeBarrierTopology,
  NATIVE_BARRIER_TOPOLOGY_VERSION,
} from "./native-barrier-topology";
import type { IndoorDataset } from "./contract";
import { reviewArea, type IndoorProject } from "./package";
import { setMapAnnotations } from "./map-edits";
import { roomLabelPoint } from "./map-edits";
import { nativeAreaDisplayParts } from "./native-area-display";
import { exposedNativeFloorEdgeFeet } from "./native-floor-edge-check";
import { displayDoorwayClosures } from "./display-doorway-closures";
import {
  reviewedBoundaryWalls,
  type NativeBoundaryPatch,
  type NativeBoundaryPatches,
} from "./native-boundary-patches";
import { nativeCirculationCells } from "./native-circulation";
import { nativeExactHallwayDisplayParts } from "./native-hallway-display";
import { nativeSelectionBoolean } from "./native-selection-boolean";
import { associateNativeRooms } from "./native-explore-associations";
import {
  NATIVE_PHYSICAL_LEVEL_RECORDS_VERSION,
  nativePhysicalLevelRecords,
  nativeRecordPhysicalLevelId,
} from "./native-physical-level-records";
type Point = [number, number];
type Rings = Point[][];
export const nativeAreaKinds = {
  hallway: "Hallway / open circulation",
  outdoor: "Outdoors / exclude from indoor map",
  staff: "Staff only walking area",
  room: "Enclosed room",
  "off-limits": "Off limits",
  "non-traversable": "Exclude non-traversable footprint",
  unclassified: "Needs investigation",
} as const;
export type NativeAreaKind = keyof typeof nativeAreaKinds;
export type NativeAreaRegion = {
  id: string;
  /** Exact strict-selection face; numeric rings are presentation proposals only. */
  exactFaceId?: string;
  ringsFeet: Rings;
  displayPartsFeet: Rings[];
  /** Certified render subset; complete authority remains in exactTopology. */
  containedDisplay?: Pick<
    NativeContainedDisplay,
    "certificate" | "faces" | "unchangedIEEEAnchorsFeet"
  >;
  roomKeys: string[];
  nativeFloorIds: number[];
  nativeDoorIds: number[];
  areaSquareFeet: number;
  exposedFloorEdgeFeet: number;
};
export type NativeAreaResult = {
  /** Exact strict topology survives worker/ZIP serialization without rounded intersections. */
  exactTopology?: NativeExactPlanarTopology;
  /** All positive source portions not representable by the contained render pieces. */
  displayResidualTopology?: NativeExactPlanarTopology;
  /** Analytical boundaries used for selection; these certify no physical wall or route. */
  logicalPartitionIds?: string[];
  /** Applied boundaries left out of this selection because their check failed
   * (for example stale physical evidence). Never silent: also in warnings. */
  omittedLogicalPartitions?: { id: string; label: string; errors: string[] }[];
  /** Which evidence test each applied boundary passed: level-wide, exact local, or tolerant local. */
  logicalPartitionEvidenceTests?: Record<
    string,
    "level" | "exact" | "tolerance"
  >;
  /** Joints closed both by an applied contact repair and by an applied
   * drawing-backed row. Each joint is closed once in effect: the repair's gap
   * mask is the closure of record, and the row is not read as foreign material. */
  contactClosureDuplicates?: NativeSelectionContactDuplicateClosure[];
  /** Current full-project audit evidence, computed on the native review worker. */
  reviewEvidenceSha256?: string;
  levelId: number;
  sourceModelSha256: string;
  geometrySha256: string;
  regions: NativeAreaRegion[];
  warnings: string[];
  doorChecks: NativeDoorCheck[];
  options?: NativeAreaOptions;
  gapCandidates?: NativeGapCandidate[];
  cropEvidence?: string;
  hallwayPartsFeet?: Rings[];
};
export type NativeAreaOptions = {
  previewPartitionIds?: string[];
  ignoreAppliedPartitions?: boolean;
  /** Explicit selection-only pass-throughs; never deletes physical doors or admits routes. */
  passThroughDoorIds?: number[];
  manualGapPoints?: [Point, Point];
  cropPolygonFeet?: Point[];
  nativeFloorId?: number;
  maxGapFeet?: number;
  previewGapIds?: string[];
  roomKey?: string;
  mode?: "connected" | "room";
};
export type NativeGapCandidate = Omit<NativeBoundaryPatch, "status" | "notes">;
export function validateNativeAreaOptions(
  value: unknown,
): asserts value is NativeAreaOptions | undefined {
  if (value === undefined) return;
  const o = value as NativeAreaOptions;
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    (o.ignoreAppliedPartitions !== undefined &&
      typeof o.ignoreAppliedPartitions !== "boolean") ||
    (o.previewPartitionIds !== undefined &&
      (!Array.isArray(o.previewPartitionIds) ||
        o.previewPartitionIds.length > 5000 ||
        new Set(o.previewPartitionIds).size !== o.previewPartitionIds.length ||
        o.previewPartitionIds.some(
          (id) => typeof id !== "string" || !id || id.length > 200,
        ))) ||
    (o.passThroughDoorIds !== undefined &&
      (!Array.isArray(o.passThroughDoorIds) ||
        o.passThroughDoorIds.length > 10_000 ||
        new Set(o.passThroughDoorIds).size !== o.passThroughDoorIds.length ||
        o.passThroughDoorIds.some(
          (id) => !Number.isSafeInteger(id) || id <= 0,
        ))) ||
    (o.manualGapPoints !== undefined &&
      (!Array.isArray(o.manualGapPoints) ||
        o.manualGapPoints.length !== 2 ||
        o.manualGapPoints.some((p) => !validPoint(p)))) ||
    (o.cropPolygonFeet !== undefined &&
      (!Array.isArray(o.cropPolygonFeet) ||
        o.cropPolygonFeet.length < 3 ||
        o.cropPolygonFeet.length > 200 ||
        o.cropPolygonFeet.some((p) => !validPoint(p)) ||
        !validCrop(o.cropPolygonFeet))) ||
    (o.nativeFloorId !== undefined &&
      (!Number.isSafeInteger(o.nativeFloorId) || o.nativeFloorId <= 0)) ||
    (o.maxGapFeet !== undefined &&
      (!Number.isFinite(o.maxGapFeet) ||
        o.maxGapFeet < 0 ||
        o.maxGapFeet > 6)) ||
    (o.mode !== undefined && !["room", "connected"].includes(o.mode)) ||
    (o.roomKey !== undefined &&
      (typeof o.roomKey !== "string" ||
        !o.roomKey ||
        o.roomKey.length > 200)) ||
    (o.previewGapIds !== undefined &&
      (!Array.isArray(o.previewGapIds) ||
        o.previewGapIds.length > 5000 ||
        new Set(o.previewGapIds).size !== o.previewGapIds.length ||
        o.previewGapIds.some(
          (id) => typeof id !== "string" || !id || id.length > 200,
        )))
  )
    throw new Error("Invalid native-area selection options.");
}
const validPoint = (p: Point) =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every((n) => Number.isFinite(n) && Math.abs(n) < 1e7);
const validCrop = (p: Point[]) => {
  try {
    const union = pc.union([p]);
    return (
      ringArea(p) >= 1 &&
      union.length === 1 &&
      union[0].length === 1 &&
      Math.abs(ringArea(union[0][0]) - ringArea(p)) < 0.001
    );
  } catch {
    return false;
  }
};
export type NativeDoorCheck = {
  nativeElementId: number;
  pointFeet: Point;
  sideRegionIds: [string | null, string | null];
  status: "same-region" | "separated" | "unsupported-side";
};
export type NativeAreaDecision = {
  selectionOptions?: NativeAreaOptions;
  id: string;
  levelId: number;
  sourceModelSha256: string;
  geometrySha256: string;
  regionIds: string[];
  partsFeet: Rings[];
  roomKeys: string[];
  nativeFloorIds: number[];
  nativeDoorIds: number[];
  kind: NativeAreaKind;
  label: string;
  notes: string;
  status: "proposed" | "applied";
  appliedRoomKeys?: string[];
};
export type NativeAreaReviews = { version: 1; decisions: NativeAreaDecision[] };
const hash = async (value: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const ringArea = (r: Point[]) =>
  Math.abs(
    r.reduce((n, p, i) => {
      const q = r[(i + 1) % r.length];
      return n + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
export function pointInNativeArea(p: Point, rings: Rings) {
  const inside = (r: Point[]) => {
    let yes = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (
        r[i][1] > p[1] !== r[j][1] > p[1] &&
        p[0] <
          ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) +
            r[i][0]
      )
        yes = !yes;
    return yes;
  };
  return inside(rings[0]) && !rings.slice(1).some(inside);
}
const bounds = (rings: Rings) => {
  const p = rings.flat();
  return [
    Math.min(...p.map((p) => p[0])),
    Math.min(...p.map((p) => p[1])),
    Math.max(...p.map((p) => p[0])),
    Math.max(...p.map((p) => p[1])),
  ];
};
// Same 30 micrometre topology grid as native room recovery. This removes
// floating-point copies of a face without closing any real doorway or gap.
const topology = (rings: Rings): Rings =>
  rings.map((r) =>
    r
      .map(
        (p) =>
          [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4] as Point,
      )
      .filter(
        (p, i, all) => !i || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1],
      ),
  );
/** Floor identity is metadata, not another clipping pass on the selection.
 * Difference operations introduce off-grid crossing vertices. Comparing those
 * with independently rounded slab edges can create coincident floating-point
 * segments that polygon-clipping cannot order. Node true contacts and place
 * both comparison copies on the existing native topology grid; never replace
 * the returned region, original slab profiles or their protected holes. */
export function nativeAreaOverlapsSupportedFloor(rings: Rings, parts: Rings[]) {
  const [region, ...floors] = nativeBarrierTopology([rings, ...parts], 1e4);
  return pc
    .intersection([region], floors)
    .some(
      (p) =>
        ringArea(p[0]) - p.slice(1).reduce((n, h) => n + ringArea(h), 0) >
        0.001,
    );
}
const overlaps = (a: number[], b: number[], pad = 0) =>
  a[0] <= b[2] + pad &&
  a[2] >= b[0] - pad &&
  a[1] <= b[3] + pad &&
  a[3] >= b[1] - pad;

/** A deliberately drawn short repair anchored to two exact native wall faces.
 * This permits corner/jamb repairs that the aligned-cap detector cannot infer. */
function manualNativeGap(
  data: IndoorDataset,
  levelId: number,
  points: [Point, Point],
  ground: Rings[],
  holes: Rings[],
): NativeGapCandidate {
  const walls = data.walls.filter(
    (w) =>
      w.levelId === levelId &&
      w.kind === "wall" &&
      !w.approximate &&
      !w.reviewPatchId,
  );
  const snap = (point: Point) => {
    const choices = walls.flatMap((wall) =>
      wall.ringsFeet.flatMap((ring) =>
        ring.map((a, i) => {
          const b = ring[(i + 1) % ring.length],
            dx = b[0] - a[0],
            dy = b[1] - a[1];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          );
          const p: Point = [a[0] + t * dx, a[1] + t * dy];
          return {
            wall,
            p,
            distance: DMath.hypot(p[0] - point[0], p[1] - point[1]),
          };
        }),
      ),
    );
    choices.sort((a, b) => a.distance - b.distance);
    if (choices.length === 0 || choices[0].distance > 0.75)
      throw new Error(
        "Click within 0.75 feet of an exact native wall face. Approximate envelopes cannot anchor a repair.",
      );
    return choices[0];
  };
  const a = snap(points[0]),
    b = snap(points[1]);
  const width = DMath.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
  if (
    a.wall.nativeElementId === b.wall.nativeElementId ||
    width < 0.02 ||
    width > 6
  )
    throw new Error(
      "Choose two different native walls with a gap between 0.02 and 6 feet. Longer missing walls need source reconstruction.",
    );
  const thickness = (w: typeof a.wall) =>
    Math.min(
      ...w.ringsFeet[0].map((p, i) => {
        const q = w.ringsFeet[0][(i + 1) % w.ringsFeet[0].length];
        return DMath.hypot(p[0] - q[0], p[1] - q[1]) || Infinity;
      }),
    );
  const half = Math.max(
    0.05,
    Math.min(0.5, thickness(a.wall) / 2, thickness(b.wall) / 2),
  );
  const u: Point = [(b.p[0] - a.p[0]) / width, (b.p[1] - a.p[1]) / width],
    n: Point = [-u[1], u[0]];
  const corner = (p: Point, along: number, side: number): Point => [
    p[0] + along * u[0] + side * n[0],
    p[1] + along * u[1] + side * n[1],
  ];
  const rings: Rings = [
    [
      corner(a.p, -0.02, half),
      corner(b.p, 0.02, half),
      corner(b.p, 0.02, -half),
      corner(a.p, -0.02, -half),
    ],
  ];
  const area = (parts: Rings[]) =>
    parts.reduce(
      (s, r) =>
        s + ringArea(r[0]) - r.slice(1).reduce((t, h) => t + ringArea(h), 0),
      0,
    );
  if (
    area(pc.difference([rings], ground)) > 0.001 ||
    holes.some((h) => area(pc.intersection(h, rings)) > 0.001)
  )
    throw new Error(
      "This repair crosses unsupported floor or a protected opening. Choose wall ends on supported floor.",
    );
  // Require a real open strip, rather than drawing a duplicate through a wall.
  if (
    area(
      pc.difference(
        [rings],
        ...data.walls
          .filter(
            (w) =>
              w.levelId === levelId &&
              !w.approximate &&
              overlaps(bounds(w.ringsFeet), bounds(rings)),
          )
          .map((w) => w.ringsFeet),
      ),
    ) <
    area([rings]) * 0.1
  )
    throw new Error("The drawn strip is already covered by native walls.");
  const snapped: [Point, Point] = [a.p, b.p];
  return {
    id: `manual-gap:${levelId}:${a.wall.nativeElementId}-${b.wall.nativeElementId}:${snapped
      .flat()
      .map((n) => n.toFixed(4))
      .join(":")}`,
    levelId,
    sourceModelSha256: data.source.modelSha256,
    widthFeet: width,
    ringsFeet: rings,
    manualPointsFeet: points,
    wallEvidence: [a.wall, b.wall].map((w) => ({
      nativeElementId: w.nativeElementId,
      ringsFeet: w.ringsFeet,
    })),
    nativeDoorIds: (data.doors ?? [])
      .filter(
        (d) =>
          d.levelId === levelId &&
          d.footprintFeet &&
          area(pc.intersection([d.footprintFeet], rings)) > 0.001,
      )
      .map((d) => d.nativeElementId),
  };
}

function nativeInputs(data: IndoorDataset, levelId: number) {
  const level = data.nativeLevels.find((l) => l.id === levelId);
  if (
    !level ||
    data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256
  )
    throw new Error("This level has no model-bound native floor support.");
  const floors = data.walkingSupport.floors.filter(
    (f) => Math.abs(f.elevationFeet - level.elevationFeet) < 0.15,
  );
  if (floors.length === 0)
    throw new Error("No native slabs support this level.");
  const walls = data.walls.filter((w) => w.levelId === levelId);
  // A raised opening in a plan cut is not a passage through material at floor
  // level. Use both independently recovered source sections for selection;
  // neither the room outline nor a projected wall box supplies missing faces.
  const strict = data.nativeIndoorEnvelopes && data.nativeMaterialSections;
  const query = strict ? createNativeRoutingMaterialQuery(data) : undefined;
  const seen = new Set<string>();
  const unique = <
    T extends IndoorDataset["walls"][number] & {
      exactParts?: NativeRationalParts;
    },
  >(
    cuts: T[],
  ) =>
    cuts.filter((w) => {
      if (w.approximate) return false;
      const key = JSON.stringify([
        w.nativeElementId,
        w.kind,
        w.reviewPatchId,
        w.ringsFeet,
        ...(w.exactParts
          ? [
              w.exactParts.map((part) =>
                part.map((ring) =>
                  ring.map((p) => p.map((q) => [String(q.n), String(q.d)])),
                ),
              ),
            ]
          : []),
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const precise = unique(
    strict
      ? nativeMaterialPlanExactWalls(data, levelId, query!)
      : nativeMaterialPlanWalls(data, levelId, query),
  );
  const floorContactPrecise = strict
    ? unique(
        nativeMaterialPlanExactWalls(
          data,
          levelId,
          query!,
          level.elevationFeet + 0.1,
        ),
      )
    : [];
  const doors = (data.doors ?? []).filter(
    (d) =>
      d.levelId === levelId &&
      d.footprintFeet &&
      d.footprintFeet.length >= 3 &&
      d.normalFeet,
  );
  // Strict native slabs already retain their original inner loops. Legacy room
  // holes are metadata and cannot cut this physical floor a second time.
  const holes = data.nativeIndoorEnvelopes
    ? []
    : data.records
        .filter((r) => r.levelId === levelId)
        .flatMap((r) =>
          ((r.properties.floorOpeningsFeet ?? []) as Point[][]).map((h) => [h]),
        );
  const fixtures = (
    data.circulationGeometry?.sourceModelSha256 === data.source.modelSha256
      ? (data.circulationGeometry.fixtures ?? [])
      : []
  ).filter((f) => f.levelIds.includes(levelId));
  return {
    floors,
    walls,
    precise,
    floorContactPrecise,
    doors,
    holes,
    fixtures,
  };
}
export async function nativeAreaGeometrySha256(
  data: IndoorDataset,
  levelId: number,
  options?: NativeAreaOptions,
) {
  if (
    data.nativeIndoorEnvelopes &&
    data.nativeMaterialSections &&
    options?.passThroughDoorIds === undefined
  ) {
    const reviewed = selectionDoorIds(data, levelId);
    if (reviewed.length > 0)
      options = { ...options, passThroughDoorIds: reviewed };
  }
  const { floors, walls, doors, holes, fixtures } = nativeInputs(data, levelId);
  return hash(
    JSON.stringify([
      data.source.modelSha256,
      ...(data.nativeIndoorEnvelopes && data.nativeMaterialSections
        ? [
            NATIVE_FLOOR_CONTACT_SELECTION_VERSION,
            NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
            "native-selection-rational-authority-v1",
            NATIVE_SELECTION_POINT_CONTACT_VERSION,
          ]
        : [NATIVE_BARRIER_TOPOLOGY_VERSION, NATIVE_SELECTION_TOPOLOGY_VERSION]),
      ...(data.nativeMaterialSections ? [data.nativeMaterialSections] : []),
      ...(data.nativeDerivedFrameReturns
        ? [data.nativeDerivedFrameReturns]
        : []),
      ...(data.nativeProvisionalCornerSeals
        ? [data.nativeProvisionalCornerSeals]
        : []),
      ...(data.nativeIndoorEnvelopes
        ? ["native-enclosed-selection-domain-v1", data.nativeIndoorEnvelopes]
        : []),
      ...(data.nativeIndoorEnvelopes && data.doorAperturePatchState
        ? [data.doorAperturePatchState]
        : []),
      ...(data.nativeSelectionContactRepairs?.repairs.some(
        (r) => r.status === "applied" && r.levelId === levelId,
      )
        ? [
            data.nativeSelectionContactRepairs.repairs
              .filter((r) => r.status === "applied" && r.levelId === levelId)
              .map(({ notes: _, ...r }) => r),
          ]
        : []),
      data.nativeDoorBoundaryClosures,
      data.nativeWallPositionRepairs,
      ...(data.reviewedAreaPartitions ? [data.reviewedAreaPartitions] : []),
      levelId,
      floors,
      walls,
      doors,
      ...(options?.passThroughDoorIds?.length
        ? [
            "native-pass-through-own-host-portals-v2",
            data.edges.filter(
              (e) =>
                e.kind === "door" &&
                options.passThroughDoorIds!.includes(e.nativeElementId!),
            ),
          ]
        : []),
      holes,
      fixtures,
      ...(data.indoorExclusions ? [data.indoorExclusions] : []),
      ...(data.nativePhysicalLevels && data.walkingSupport
        ? [NATIVE_PHYSICAL_LEVEL_RECORDS_VERSION]
        : []),
      nativePhysicalLevelRecords(data, levelId).map((r) => [
        r.key,
        r.ringsFeet,
        roomLabelPoint(data, r.key),
        ...(r.properties.nativeFloorOpeningOwnership
          ? [r.properties.nativeFloorOpeningOwnership]
          : []),
      ]),
      ...(options &&
      (options.roomKey ||
        options.manualGapPoints ||
        options.cropPolygonFeet ||
        options.nativeFloorId ||
        options.passThroughDoorIds?.length ||
        options.previewPartitionIds?.length ||
        options.ignoreAppliedPartitions ||
        options.previewGapIds?.length)
        ? [options]
        : []),
    ]),
  );
}

/** Native slabs minus native walls and measured door footprints. A closed
 * door isolates a selection, never closes or admits a navigation portal. */
export async function deriveNativeAreas(
  data: IndoorDataset,
  levelId: number,
  options: NativeAreaOptions = {},
): Promise<NativeAreaResult> {
  const strict = !!(data.nativeIndoorEnvelopes && data.nativeMaterialSections);
  await verifyNativeMaterialSections(
    data.nativeMaterialSections,
    data.source.modelSha256,
  );
  await verifyNativeIndoorEnvelopes(
    data.nativeIndoorEnvelopes,
    data.source.modelSha256,
  );
  validateNativeSelectionContactRepairs(
    data.nativeSelectionContactRepairs,
    data.source.modelSha256,
  );
  if (
    data.nativeSelectionContactRepairs?.repairs.some(
      (r) => r.status === "applied",
    ) &&
    !strict
  )
    throw new Error(
      "Applied native selection contacts require verified exact material and enclosure authority.",
    );
  validateReviewedAreaPartitions(
    data.reviewedAreaPartitions,
    data.source.modelSha256,
  );
  if (options.passThroughDoorIds === undefined) {
    const reviewed = selectionDoorIds(data, levelId);
    if (reviewed.length > 0)
      options = { ...options, passThroughDoorIds: reviewed };
  }
  validateNativeAreaOptions(options);
  if (options.mode === "room" && !options.roomKey)
    throw new Error("Choose a room to focus its enclosure.");
  if (
    !Number.isFinite(options.maxGapFeet ?? 0) ||
    (options.maxGapFeet ?? 0) < 0 ||
    (options.maxGapFeet ?? 0) > 6
  )
    throw new Error("Choose a wall-gap limit between 0 and 6 feet.");
  const {
    floors,
    walls,
    precise,
    floorContactPrecise,
    doors,
    holes,
    fixtures,
  } = nativeInputs(data, levelId);
  const savedPartitions = data.reviewedAreaPartitions?.partitions ?? [];
  if (
    options.previewPartitionIds?.some(
      (id) =>
        !savedPartitions.some((p) => p.id === id && p.levelId === levelId),
    )
  )
    throw new Error("Choose a saved area boundary on this native floor.");
  const activePartitions = savedPartitions.filter(
    (p) =>
      p.levelId === levelId &&
      ((!options.ignoreAppliedPartitions && p.status === "applied") ||
        options.previewPartitionIds?.includes(p.id)),
  );
  const partitionEvidence =
    activePartitions.length > 0
      ? await reviewedAreaPartitionEvidenceStatuses(data, activePartitions)
      : {};
  const checkedPartitionIds: string[] = [];
  const logicalPartitionEvidenceTests: NonNullable<
    NativeAreaResult["logicalPartitionEvidenceTests"]
  > = {};
  const partitionWarnings: string[] = [];
  const omittedLogicalPartitions: NonNullable<
    NativeAreaResult["omittedLogicalPartitions"]
  > = [];
  const partitionMasks = activePartitions.flatMap((p) => {
    const check = checkReviewedAreaPartition(
      data,
      p,
      partitionEvidence[p.id]!.digest,
    );
    if (!check.valid) {
      const warning = `Area boundary ${p.label || p.id} needs review: ${check.errors.join(" ")}`;
      if (options.previewPartitionIds?.includes(p.id)) throw new Error(warning);
      partitionWarnings.push(warning + " It was omitted from selection.");
      omittedLogicalPartitions.push({
        id: p.id,
        label: p.label,
        errors: check.errors,
      });
      return [];
    }
    checkedPartitionIds.push(p.id);
    const test = partitionEvidence[p.id]!.test;
    if (test !== "changed") logicalPartitionEvidenceTests[p.id] = test;
    return check.footprintsFeet.map((ring) => [ring]);
  });
  const scopedFloors = options.nativeFloorId
    ? floors.filter((f) => f.nativeElementId === options.nativeFloorId)
    : floors;
  if (
    options.passThroughDoorIds?.some(
      (id) =>
        !doors.some(
          (d) =>
            d.nativeElementId === id &&
            Number.isFinite(DMath.hypot(...d.normalFeet!)) &&
            DMath.hypot(...d.normalFeet!) > 1e-9,
        ),
    )
  )
    throw new Error(
      "A pass-through threshold has stale or missing measured door evidence on this floor.",
    );
  if (scopedFloors.length === 0)
    throw new Error("Choose a native slab supporting this floor.");
  const support = scopedFloors.flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
  // Shared slab edges can have different vertex segmentation. Rounding each
  // plate to the wall grid first creates false floor cracks at those contacts.
  // Node original contacts at source numerical precision, then union once;
  // keep this fine floor grid independent of the coarser barrier grid. Real
  // separated plates and inner openings must not be snapped or buffered.
  const floorOrigin = support[0]?.[0]?.[0] ?? [0, 0];
  const exactGround = strict
    ? nativeRationalOverlay("union", support)
    : undefined;
  // Numeric copies are legacy/proposal inputs only. Strict subtraction below
  // always starts from unchanged source vertices and retains exact intersections.
  const ground = exactGround
    ? nativeExactPartsForProposals(exactGround)
    : pc.union(nativeBarrierTopology(support, 1e10, floorOrigin, 1e-12));
  const exterior = indoorExclusionParts(
    data,
    data.nativeLevels.find((l) => l.id === levelId)!.elevationFeet,
  );
  const gapCandidates: NativeGapCandidate[] = (
    options.maxGapFeet
      ? displayDoorwayClosures(
          precise.filter((w) => !w.reviewPatchId),
          options.maxGapFeet,
          0.02,
        )
      : []
  ).flatMap((c) => {
    const covered = pc.intersection(ground, c.rings);
    const area = (ps: Rings[]) =>
      ps.reduce(
        (n, r) =>
          n + ringArea(r[0]) - r.slice(1).reduce((s, h) => s + ringArea(h), 0),
        0,
      );
    if (
      area(covered) < area([c.rings]) * 0.995 ||
      holes.some((h) => area(pc.intersection(h, c.rings)) > 0.001)
    )
      return [];
    return [
      {
        id: `gap:${levelId}:${[...c.wallIds].sort((a, b) => a - b).join("-")}:${c.rings[0][0].map((n) => n.toFixed(4)).join(":")}`,
        levelId,
        sourceModelSha256: data.source.modelSha256,
        widthFeet: c.widthFeet,
        ringsFeet: c.rings,
        wallEvidence: c.wallIds.map((id) => ({
          nativeElementId: id,
          ringsFeet: precise.find((w) => w.nativeElementId === id)!.ringsFeet,
        })),
        nativeDoorIds: doors
          .filter(
            (d) => area(pc.intersection([d.footprintFeet!], c.rings)) > 0.001,
          )
          .map((d) => d.nativeElementId),
      },
    ];
  });
  if (options.manualGapPoints)
    gapCandidates.push(
      manualNativeGap(data, levelId, options.manualGapPoints, ground, holes),
    );
  if (
    options.previewGapIds?.some((id) => !gapCandidates.some((c) => c.id === id))
  )
    throw new Error(
      "A selected gap no longer matches this floor/size. Reselect its recommendation.",
    );
  const closedDoorOverrides = new Map(
    nativeDoorBoundaryClosureFootprints(data, levelId).map((d) => [
      d.nativeElementId,
      d.footprintFeet,
    ]),
  );
  const elevation = data.nativeLevels.find(
    (l) => l.id === levelId,
  )!.elevationFeet;
  const ownsAperture = createNativeHostApertureQuery(
    createNativeRoutingMaterialQuery(data)(elevation, elevation + 4),
  );
  const apertureMasks = (w: IndoorDataset["walls"][number]): Rings[] => {
    if (w.kind !== "wall" || w.reviewPatchId) return [];
    return doors
      .filter(
        (d) =>
          options.passThroughDoorIds?.includes(d.nativeElementId) &&
          ownsAperture(
            d.hostWallNativeElementId,
            d.nativeElementId,
            w.nativeElementId,
          ) &&
          d.state === "connected" &&
          d.roomKeys.length === 2 &&
          data.edges.some(
            (e) =>
              e.id === d.id &&
              e.kind === "door" &&
              e.enabled &&
              e.nativeElementId === d.nativeElementId &&
              e.roomKeys.length === 2 &&
              e.roomKeys.every((k) => d.roomKeys.includes(k)),
          ),
      )
      .map((d) => [d.footprintFeet!]);
  };
  const wallMasks = (sourceWalls: IndoorDataset["walls"]) =>
    sourceWalls.flatMap((w) => {
      const apertures = apertureMasks(w);
      // Strict cuts are kept rational by exactWallMasks; this copy is only used
      // for broad-phase/proposal bookkeeping and cannot authorize the subtraction.
      return !strict && apertures.length > 0
        ? pc.difference(w.ringsFeet, ...apertures)
        : [w.ringsFeet];
    });
  const exactWallMasks = (
    sourceWalls: (IndoorDataset["walls"][number] & {
      exactParts?: NativeRationalParts;
    })[],
  ): NativeRationalParts =>
    sourceWalls.flatMap((w) => {
      const apertures = apertureMasks(w);
      return nativeRationalOverlay(
        apertures.length > 0 ? "difference" : "union",
        w.exactParts ?? [w.ringsFeet],
        ...apertures.map((a) => [a]),
      );
    });
  const masks = [
    ...wallMasks(precise),
    ...doors
      .filter((d) => !options.passThroughDoorIds?.includes(d.nativeElementId))
      .map((d) => [
        closedDoorOverrides.get(d.nativeElementId) ?? d.footprintFeet!,
      ]),
    ...holes,
    ...fixtures.map((f) => f.ringsFeet),
    ...partitionMasks,
    ...gapCandidates
      .filter((c) => options.previewGapIds?.includes(c.id))
      .map((c) => c.ringsFeet),
  ];
  const groundBounds = bounds(ground.flat());
  let remainingExact: NativeRationalParts | undefined;
  let remaining: Rings[];
  let contactClosureDuplicates: NativeSelectionContactDuplicateClosure[] = [];
  if (strict) {
    const contacts = (data.nativeSelectionContactRepairs?.repairs ?? []).filter(
      (r) => r.status === "applied" && r.levelId === levelId,
    );
    const contactMasks = deriveNativeSelectionContactRepairs(data, contacts);
    contactClosureDuplicates =
      assertNativeSelectionContactRepairsPhysicalGuards(
        data,
        contacts,
        contactMasks,
      );
    const exactMasks: NativeRationalParts = [
      ...contactMasks.flat(),
      ...exactWallMasks(precise),
      ...exactWallMasks(floorContactPrecise),
      ...nativeRationalOverlay("union", [
        ...doors
          .filter(
            (d) => !options.passThroughDoorIds?.includes(d.nativeElementId),
          )
          .map((d) => [
            closedDoorOverrides.get(d.nativeElementId) ?? d.footprintFeet!,
          ]),
        ...holes,
        ...fixtures.map((f) => f.ringsFeet),
        ...partitionMasks,
        ...gapCandidates
          .filter((c) => options.previewGapIds?.includes(c.id))
          .map((c) => c.ringsFeet),
        ...exterior,
      ]),
    ];
    remainingExact = nativeRationalOverlay(
      "difference",
      exactGround!,
      exactMasks,
    );
    remaining = nativeExactPartsForProposals(remainingExact);
  } else {
    const sourceTopology = nativeSelectionTopology(
      support,
      [...masks, ...exterior].filter((part) =>
        overlaps(groundBounds, bounds(part)),
      ),
    );
    remaining = sourceTopology.ground;
    for (let i = 0; i < sourceTopology.masks.length; i += 100)
      remaining = nativeSelectionBoolean(
        "difference",
        remaining,
        ...sourceTopology.masks.slice(i, i + 100).map((part) => [part]),
      );
    if (floorContactPrecise.length > 0) {
      const floorContactMasks = wallMasks(floorContactPrecise);
      // Adding real low material must only subtract from the plan selection.
      // Renoding the previous faces together with new vertices can move a shared
      // floating-point contact. Retain the independently noded plan floor/masks,
      // and subtract only the additional source sections in the common frame.
      const contactTopology = nativeSelectionTopology(
        support,
        [...masks, ...exterior, ...floorContactMasks].filter((part) =>
          overlaps(groundBounds, bounds(part)),
        ),
      );
      const retainedBaseCount = [...masks, ...exterior].filter((part) =>
        overlaps(groundBounds, bounds(part)),
      ).length;
      const additional = contactTopology.masks.slice(retainedBaseCount);
      for (let i = 0; i < additional.length; i += 100)
        remaining = nativeSelectionBoolean(
          "difference",
          remaining,
          ...additional.slice(i, i + 100).map((part) => [part]),
        );
    }
  }
  // Resolve connected indoor components before attaching identities. Otherwise
  // a leak onto an unbounded source slab can merge separate indoor rooms through
  // the exterior, even when that exterior is later hidden by the visitor map.
  // Explicit slab focus remains the uncropped physical support diagnostic.
  if (data.nativeIndoorEnvelopes && !options.nativeFloorId) {
    const indoor = nativeIndoorEnvelopeParts(
      data.nativeIndoorEnvelopes,
      data.source.modelSha256,
      elevation,
    );
    if (remainingExact) {
      remainingExact =
        indoor.length > 0
          ? nativeRationalOverlay("intersection", remainingExact, indoor)
          : [];
      remaining = nativeExactPartsForProposals(remainingExact);
    } else
      remaining =
        indoor.length > 0
          ? nativeSelectionBoolean("intersection", remaining, indoor)
          : [];
  }
  let cropEvidence: string | undefined = options.nativeFloorId
    ? `Exact native slab #${options.nativeFloorId}; verify which part is enclosed before classification.`
    : undefined;
  if (options.roomKey) {
    const room = data.records.find(
      (r) =>
        r.key === options.roomKey &&
        nativeRecordPhysicalLevelId(data, r) === levelId,
    );
    if (!room) throw new Error("Choose a place on this native floor.");
    const prepared =
      data.presentation?.sourceModelSha256 === data.source.modelSha256
        ? data.presentation.rooms.find((r) => r.roomKey === room.key)
        : undefined;
    if (data.nativeIndoorEnvelopes) {
      // The name identifies a complete native component below. Its old contour
      // cannot trim that component or manufacture a room-shaped selection.
      cropEvidence =
        "Complete native component; the registered room identifies it only.";
    } else {
      const identity = nativeRoomIdentityRings(data, room);
      remaining = pc.intersection(
        remaining,
        identity === room.ringsFeet
          ? (prepared?.interiorRingsFeet ?? room.ringsFeet)
          : identity,
      );
      cropEvidence =
        identity === room.ringsFeet
          ? prepared
            ? "Prepared native interior crop; inspect current walls and doors."
            : "Source-outline crop only; enclosure remains unverified."
          : "Original native slab opening identity; this non-traversable void has no supported selectable floor.";
    }
  }
  if (options.cropPolygonFeet) {
    if (remainingExact) {
      remainingExact = nativeRationalOverlay("intersection", remainingExact, [
        [options.cropPolygonFeet],
      ]);
      remaining = nativeExactPartsForProposals(remainingExact);
    } else remaining = pc.intersection(remaining, [options.cropPolygonFeet]);
    cropEvidence =
      "User-drawn boundary clipped to native floor support. Verify the excluded extent in the full source model before applying; real floor holes remain.";
  }
  if (remainingExact) {
    // Selection only: interiors that meet at isolated exact points are
    // separate areas. Physical geometry, holes, doors and routes are untouched.
    const pointContacts = splitNativeSelectionPointContacts(remainingExact);
    if (pointContacts.splitParts) {
      remainingExact = pointContacts.parts;
      remaining = nativeExactPartsForProposals(remainingExact);
    }
  }
  const geometrySha256 = await nativeAreaGeometrySha256(data, levelId, options);
  // Rooms are labelled on the physical level carrying their native floor;
  // levelId stays their directory/display identity.
  const records = nativePhysicalLevelRecords(data, levelId);
  const containedDisplays = remainingExact?.map((part) =>
    createNativeContainedDisplay([part]),
  );
  let regions = remaining
    .filter(
      (r) =>
        strict ||
        ringArea(r[0]) - r.slice(1).reduce((n, h) => n + ringArea(h), 0) >= 1,
    )
    .map((rings, index) => {
      const b = bounds(rings);
      return {
        id: `native-region:${levelId}:${index}`,
        ...(strict ? { exactFaceId: `native-region:${levelId}:${index}` } : {}),
        ringsFeet: rings,
        displayPartsFeet:
          containedDisplays?.[index].partsFeet ?? nativeAreaDisplayParts(rings),
        ...(containedDisplays
          ? {
              containedDisplay: {
                certificate: containedDisplays[index].certificate,
                faces: containedDisplays[index].faces,
                unchangedIEEEAnchorsFeet:
                  containedDisplays[index].unchangedIEEEAnchorsFeet,
              },
            }
          : {}),
        exposedFloorEdgeFeet: exposedNativeFloorEdgeFeet(rings, ground),
        areaSquareFeet: remainingExact
          ? nativeRationalMeasuredArea([remainingExact[index]])
          : ringArea(rings[0]) -
            rings.slice(1).reduce((n, h) => n + ringArea(h), 0),
        roomKeys:
          options.roomKey && !data.nativeIndoorEnvelopes
            ? [options.roomKey]
            : records
                .filter(
                  (r) =>
                    nativeRoomIdentityRings(data, r) === r.ringsFeet &&
                    pointInNativeArea(roomLabelPoint(data, r.key), rings),
                )
                .map((r) => r.key),
        nativeFloorIds: scopedFloors
          .filter(
            (f) =>
              (remainingExact || overlaps(b, bounds(f.ringsFeet))) &&
              (remainingExact
                ? nativeRationalAreaCompare(
                    nativeRationalOverlay(
                      "intersection",
                      [remainingExact[index]],
                      nativeRationalIntersectionOperand(
                        [remainingExact[index]],
                        f.partsFeet ?? [f.ringsFeet],
                      ),
                    ),
                    [],
                  ) > 0
                : nativeAreaOverlapsSupportedFloor(
                    rings,
                    f.partsFeet ?? [f.ringsFeet],
                  )),
          )
          .map((f) => f.nativeElementId),
        nativeDoorIds: doors
          .filter((d) => overlaps(b, bounds([d.footprintFeet!]), 0.05))
          .map((d) => d.nativeElementId),
      };
    });
  if (data.nativeIndoorEnvelopes && !options.nativeFloorId) {
    regions = associateNativeRooms(
      regions,
      records,
      data,
      remainingExact
        ? new Map(regions.map((r, i) => [r.id, [remainingExact![i]]]))
        : undefined,
    );
  }
  if (options.roomKey && data.nativeIndoorEnvelopes) {
    const room = records.find((r) => r.key === options.roomKey)!;
    const identity = nativeRoomIdentityRings(data, room);
    const exactById = remainingExact
      ? new Map(
          remainingExact.map((p, i) => [`native-region:${levelId}:${i}`, [p]]),
        )
      : undefined;
    const area = (parts: Rings[]) =>
      parts.reduce(
        (sum, rings) =>
          sum +
          ringArea(rings[0]) -
          rings.slice(1).reduce((n, hole) => n + ringArea(hole), 0),
        0,
      );
    const identityArea = area([identity]);
    const ranked = regions
      .map((region) => ({
        region,
        overlap: exactById
          ? nativeRationalMeasuredArea(
              nativeRationalOverlay("intersection", exactById.get(region.id)!, [
                identity,
              ]),
            )
          : area(
              nativeSelectionBoolean(
                "intersection",
                [region.ringsFeet],
                [identity],
              ),
            ),
      }))
      .sort((a, b) => b.overlap - a.overlap);
    const strictMajority = exactById
      ? regions.find((r) =>
          (
            r as NativeAreaRegion & {
              associations?: { roomKey: string; method: string }[];
            }
          ).associations?.some(
            (a) => a.roomKey === room.key && a.method === "majority-overlap",
          ),
        )
      : undefined;
    const majority = exactById
      ? strictMajority
      : ranked[0] && ranked[0].overlap > identityArea * (0.5 + 1e-8)
        ? ranked[0].region
        : undefined;
    const seed =
      !remainingExact && identity === room.ringsFeet
        ? regions.find((region) =>
            exactById
              ? nativeRationalPointInParts(
                  roomLabelPoint(data, room.key),
                  exactById.get(region.id)!,
                )
              : pointInNativeArea(
                  roomLabelPoint(data, room.key),
                  region.ringsFeet,
                ),
          )
        : undefined;
    const selected = majority ?? seed;
    regions = selected ? [selected] : [];
    if (selected && !selected.roomKeys.includes(room.key))
      selected.roomKeys.push(room.key);
    if (!selected)
      cropEvidence =
        "No supported native component matches this identity; no registered outline crop was used.";
  }
  const regionBounds = regions.map((r) => bounds(r.ringsFeet));
  // Probe just outside each measured aperture. The same connected component
  // on both sides reveals a boundary to investigate, not a defective door:
  // the bypass may be a missing partition/join elsewhere in the enclosure.
  const doorChecks: NativeDoorCheck[] = doors.map((door) => {
    if (
      !Number.isFinite(DMath.hypot(...door.normalFeet!)) ||
      DMath.hypot(...door.normalFeet!) < 1e-9
    ) {
      return {
        nativeElementId: door.nativeElementId,
        pointFeet: door.pointFeet,
        sideRegionIds: [null, null],
        status: "unsupported-side",
      };
    }
    const n = door.normalFeet!,
      size = DMath.hypot(...n),
      normal: Point = [n[0] / size, n[1] / size],
      tangent: Point = [-normal[1], normal[0]],
      projected = door.footprintFeet!.map((p) => [
        p[0] * normal[0] + p[1] * normal[1],
        p[0] * tangent[0] + p[1] * tangent[1],
      ]),
      across =
        (Math.min(...projected.map((p) => p[1])) +
          Math.max(...projected.map((p) => p[1]))) /
        2,
      depths = [
        Math.min(...projected.map((p) => p[0])) - 0.25,
        Math.max(...projected.map((p) => p[0])) + 0.25,
      ],
      sideRegionIds = depths.map((depth) => {
        const p: Point = [
          normal[0] * depth + tangent[0] * across,
          normal[1] * depth + tangent[1] * across,
        ];
        const index = regions.findIndex(
          (r, i) =>
            overlaps(regionBounds[i], [p[0], p[1], p[0], p[1]]) &&
            (remainingExact
              ? nativeRationalPointInParts(p, [
                  remainingExact[Number(r.id.split(":").at(-1))],
                ])
              : pointInNativeArea(p, r.ringsFeet)),
        );
        return index === -1 ? null : regions[index].id;
      }) as [string | null, string | null];
    return {
      nativeElementId: door.nativeElementId,
      pointFeet: door.pointFeet,
      sideRegionIds,
      status: sideRegionIds.includes(null)
        ? "unsupported-side"
        : sideRegionIds[0] === sideRegionIds[1]
          ? "same-region"
          : "separated",
    };
  });
  return {
    levelId,
    sourceModelSha256: data.source.modelSha256,
    geometrySha256,
    ...(remainingExact
      ? {
          exactTopology: encodeNativeExactTopology(
            {
              sourceModelSha256: data.source.modelSha256,
              sourceGeometryKey: geometrySha256,
              kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
            },
            remainingExact.map((part, i) => ({
              id: `native-region:${levelId}:${i}`,
              parts: [part],
            })),
          ),
          displayResidualTopology: encodeNativeExactTopology(
            {
              sourceModelSha256: data.source.modelSha256,
              sourceGeometryKey: geometrySha256,
              kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
            },
            containedDisplays!.flatMap((display, i) =>
              display.exactResidualParts.length > 0
                ? [
                    {
                      id: `native-region:${levelId}:${i}:render-residual`,
                      parts: display.exactResidualParts,
                    },
                  ]
                : [],
            ),
          ),
        }
      : {}),
    regions,
    doorChecks,
    options,
    gapCandidates,
    ...(checkedPartitionIds.length > 0
      ? { logicalPartitionIds: checkedPartitionIds }
      : {}),
    ...(checkedPartitionIds.length > 0
      ? { logicalPartitionEvidenceTests }
      : {}),
    ...(omittedLogicalPartitions.length > 0
      ? { omittedLogicalPartitions }
      : {}),
    ...(contactClosureDuplicates.length > 0
      ? { contactClosureDuplicates }
      : {}),
    cropEvidence,
    hallwayPartsFeet: strict
      ? nativeExactHallwayDisplayParts(data, levelId, exterior)
      : nativeCirculationCells(data)
          .filter((c) => c.levelIds.includes(levelId))
          .flatMap((c) =>
            (exterior.length > 0
              ? pc.difference(c.ringsFeet, ...exterior.map(topology))
              : [c.ringsFeet]
            ).flatMap(nativeAreaDisplayParts),
          ),
    warnings: [
      ...partitionWarnings,
      ...(checkedPartitionIds.length > 0
        ? [
            `${checkedPartitionIds.length} reviewed area boundaries separate this selection. Dashed lines are analytical boundaries across open entrances or shutters, not source walls. Physical geometry, access, routing and raised room certification are unchanged.`,
          ]
        : []),
      "Native floor support does not certify indoor enclosure. Open slab edges can indicate an outdoor walkway or missing wall/curtain geometry; compare the full source model, including enclosure above the floor section.",
      ...(walls.some((w) => w.approximate)
        ? [
            `${walls.filter((w) => w.approximate).length} approximate wall envelopes omitted. Check glazing and missing partitions in Source model.`,
          ]
        : []),
      ...((data.doors ?? []).filter((d) => d.levelId === levelId).length >
      doors.length
        ? [
            "Some doors lack a measured footprint/direction and were left open in this selection.",
          ]
        : []),
      "Unlabelled gaps remain open. Shared regions can contain multiple place labels; inspect partitions before grouping.",
      "Closed doors define selection boundaries only. Proposals do not change access. Applying changes existing places; rebuild changed circulation and missing links in Reviter.",
    ],
  };
}
export function validateNativeAreaReviews(
  value: unknown,
  data: IndoorDataset,
): asserts value is NativeAreaReviews | undefined {
  if (value === undefined) return;
  const v = value as NativeAreaReviews;
  if (Array.isArray(v?.decisions))
    for (const d of v.decisions) validateNativeAreaOptions(d?.selectionOptions);
  if (
    !v ||
    v.version !== 1 ||
    !Array.isArray(v.decisions) ||
    v.decisions.length > 5000 ||
    new Set(v.decisions.map((d) => d.id)).size !== v.decisions.length ||
    v.decisions.some(
      (d) =>
        !d ||
        !d.id ||
        d.id.length > 200 ||
        d.sourceModelSha256 !== data.source.modelSha256 ||
        !/^[a-f0-9]{64}$/.test(d.geometrySha256) ||
        !data.nativeLevels.some((l) => l.id === d.levelId) ||
        !Object.hasOwn(nativeAreaKinds, d.kind) ||
        !["proposed", "applied"].includes(d.status) ||
        typeof d.label !== "string" ||
        !d.label.trim() ||
        d.label.length > 200 ||
        typeof d.notes !== "string" ||
        d.notes.length > 10_000 ||
        !d.notes.trim() ||
        !Array.isArray(d.regionIds) ||
        d.regionIds.length === 0 ||
        d.regionIds.length > 1000 ||
        d.regionIds.some((id) => typeof id !== "string" || id.length > 200) ||
        !Array.isArray(d.partsFeet) ||
        d.partsFeet.length !== d.regionIds.length ||
        d.partsFeet.some(
          (r) =>
            !Array.isArray(r) ||
            r.length === 0 ||
            r.length > 10_000 ||
            r.some(
              (h) =>
                !Array.isArray(h) ||
                h.length < 3 ||
                h.length > 60_000 ||
                h.some(
                  (p) =>
                    !Array.isArray(p) ||
                    p.length !== 2 ||
                    p.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e8),
                ),
            ),
        ) ||
        !Array.isArray(d.roomKeys) ||
        d.roomKeys.length > 10_000 ||
        d.roomKeys.some((k) => typeof k !== "string" || !k || k.length > 200) ||
        (d.appliedRoomKeys !== undefined &&
          (!Array.isArray(d.appliedRoomKeys) ||
            d.appliedRoomKeys.length === 0 ||
            d.appliedRoomKeys.some((k) => !d.roomKeys.includes(k)))) ||
        !Array.isArray(d.nativeFloorIds) ||
        !Array.isArray(d.nativeDoorIds) ||
        [...d.nativeFloorIds, ...d.nativeDoorIds].some(
          (id) => !Number.isSafeInteger(id) || id <= 0,
        ),
    )
  )
    throw new Error(
      "Invalid native-area review geometry, identity or decision.",
    );
}

/** Review source sidecars; recommendations do not mutate native geometry.
 * Applying changes supplementary wall faces and suspends routes until Reviter
 * regenerates against them. Original RVT/GLB bytes are retained. */
export async function saveNativeBoundaryPatches(
  project: IndoorProject,
  result: NativeAreaResult,
  ids: string[],
  notes: string,
  apply = false,
): Promise<IndoorProject> {
  if (
    project.manifest.format !== "reviter-project" ||
    result.sourceModelSha256 !== project.dataset.source.modelSha256
  )
    throw new Error("Use the matching authoring master for boundary patches.");
  if (
    (await nativeAreaGeometrySha256(
      project.dataset,
      result.levelId,
      result.options,
    )) !== result.geometrySha256
  )
    throw new Error("Native geometry changed. Retrace before saving patches.");
  if (ids.length === 0 || new Set(ids).size !== ids.length || !notes.trim())
    throw new Error("Check proposed closures and record your evidence first.");
  const selected = ids.map((id) =>
    result.gapCandidates?.find((c) => c.id === id),
  );
  if (selected.some((c) => !c))
    throw new Error("A checked closure is not in the current recommendations.");
  const prior = project.rooms.nativeBoundaryPatches?.patches ?? [];
  const patches: NativeBoundaryPatches = {
    version: 1,
    patches: [
      ...prior.filter((p) => !ids.includes(p.id)),
      ...selected.map((c) => ({
        ...c!,
        status:
          apply || prior.find((p) => p.id === c!.id)?.status === "applied"
            ? ("applied" as const)
            : ("proposed" as const),
        notes: notes.trim(),
      })),
    ],
  };
  validateDoorApertureBinding(
    project.rooms.reviewedDoorApertures,
    project.dataset,
  );
  const walls = reviewedBoundaryWalls(
    project.dataset.walls,
    patches,
    project.dataset.source.modelSha256,
    undefined,
    project.rooms.reviewedDoorApertures,
    project.dataset.nativeMaterialSections,
    project.dataset.nativeMaterialSections
      ? (levelId) => nativeMaterialPlanWalls(project.dataset, levelId)
      : undefined,
  );
  if (!apply)
    return {
      ...project,
      rooms: { ...project.rooms, nativeBoundaryPatches: patches },
    };
  const dataset = {
    ...project.dataset,
    walls: [...project.dataset.walls.filter((w) => !w.reviewPatchId), ...walls],
    boundaryPatchState: {
      patchIds: patches.patches
        .filter((p) => p.status === "applied")
        .map((p) => p.id),
      regenerated: false,
    },
  };
  delete dataset.presentation;
  delete dataset.circulationGeometry;
  return {
    ...project,
    rooms: { ...project.rooms, nativeBoundaryPatches: patches },
    dataset,
  };
}
export async function saveNativeAreaDecision(
  project: IndoorProject,
  result: NativeAreaResult,
  ids: string[],
  patch: Pick<NativeAreaDecision, "kind" | "label" | "notes">,
): Promise<IndoorProject> {
  if (
    project.manifest.format !== "reviter-project" ||
    result.sourceModelSha256 !== project.dataset.source.modelSha256
  )
    throw new Error(
      "Use this model's authoring master for native area decisions.",
    );
  const fresh = await nativeAreaGeometrySha256(
    project.dataset,
    result.levelId,
    result.options,
  );
  if (fresh !== result.geometrySha256)
    throw new Error(
      "Native geometry or place identities changed. Reselect the regions.",
    );
  const regions = ids.map((id) => result.regions.find((r) => r.id === id));
  if (
    ids.length === 0 ||
    new Set(ids).size !== ids.length ||
    regions.some((r) => !r)
  )
    throw new Error("Select native regions on one floor first.");
  const id = `area-review:${result.geometrySha256}:${[...ids].sort().join(",")}`;
  const existing = project.rooms.nativeAreaReviews?.decisions.find(
    (d) =>
      d.status === "proposed" &&
      d.geometrySha256 === result.geometrySha256 &&
      JSON.stringify([...d.regionIds].sort()) ===
        JSON.stringify([...ids].sort()),
  );
  const decision: NativeAreaDecision = {
    id:
      existing?.id ??
      (id.length > 200 ||
      project.rooms.nativeAreaReviews?.decisions.some((d) => d.id === id)
        ? crypto.randomUUID()
        : id),
    levelId: result.levelId,
    sourceModelSha256: result.sourceModelSha256,
    geometrySha256: result.geometrySha256,
    regionIds: [...ids],
    partsFeet: regions.map((r) => r!.ringsFeet),
    roomKeys: [...new Set(regions.flatMap((r) => r!.roomKeys))],
    nativeFloorIds: [...new Set(regions.flatMap((r) => r!.nativeFloorIds))],
    nativeDoorIds: [...new Set(regions.flatMap((r) => r!.nativeDoorIds))],
    ...patch,
    status: "proposed",
    selectionOptions: result.options,
  };
  const reviews: NativeAreaReviews = {
    version: 1,
    decisions: [
      ...(project.rooms.nativeAreaReviews?.decisions ?? []).filter(
        (d) => d.id !== decision.id,
      ),
      decision,
    ],
  };
  validateNativeAreaReviews(reviews, project.dataset);
  return {
    ...project,
    rooms: { ...project.rooms, nativeAreaReviews: reviews },
  };
}

/** Apply existing source review semantics, never manufacture a connection or
 * replace navigation polygons with the closed-door selection footprint. */
export async function applyNativeAreaDecision(
  project: IndoorProject,
  result: NativeAreaResult,
  ids: string[],
  patch: Pick<NativeAreaDecision, "kind" | "label" | "notes">,
  roomKeys: string[],
) {
  if (result.options?.previewGapIds?.length)
    throw new Error(
      "Apply the checked boundary patches and retrace before applying place classifications.",
    );
  if (result.options?.previewPartitionIds?.length)
    throw new Error(
      "Apply the reviewed area boundary to selection and retrace before applying a place classification.",
    );
  if (patch.kind === "unclassified")
    throw new Error("Needs investigation can only be saved as a proposal.");
  let next = await saveNativeAreaDecision(project, result, ids, patch);
  const decision = next.rooms.nativeAreaReviews!.decisions.at(-1)!;
  if (patch.kind === "outdoor" || patch.kind === "non-traversable") {
    if (result.exactTopology) {
      const index = createNativeExactTopologyIndex(result.exactTopology, {
        sourceModelSha256: result.sourceModelSha256,
        sourceGeometryKey: result.geometrySha256,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      });
      const selectedExact = ids.flatMap((id) => index.parts(id) ?? []);
      // Exclusion v1 carries IEEE footprints. Never turn a rounded display
      // approximation into a new source/navigation veto.
      if (
        nativeRationalOverlay("xor", selectedExact, decision.partsFeet).length >
        0
      )
        throw new Error(
          "This exact native boundary needs an exact footprint correction; the display proposal cannot be applied as an exclusion.",
        );
    }
    if (result.options?.roomKey)
      throw new Error(
        "Use a complete native region for footprint review; a room crop does not verify the exclusion boundary.",
      );
    const exclusion = {
      version: 1 as const,
      sourceModelSha256: next.dataset.source.modelSha256,
      areas: [
        ...(next.dataset.indoorExclusions?.areas ?? []),
        {
          id: decision.id,
          reason:
            patch.kind === "outdoor"
              ? ("outdoor" as const)
              : ("off-limits" as const),
          levelId: result.levelId,
          elevationFeet: next.dataset.nativeLevels.find(
            (l) => l.id === result.levelId,
          )!.elevationFeet,
          label: patch.label,
          notes: patch.notes,
          nativeFloorIds: decision.nativeFloorIds,
          partsFeet: structuredClone(decision.partsFeet),
        },
      ],
    };
    validateIndoorExclusions(
      exclusion,
      next.dataset.source.modelSha256,
      next.dataset.nativeLevels,
    );
    decision.status = "applied";
    delete decision.appliedRoomKeys;
    // An indoor scope veto is not a void, wall repair or source room access edit.
    return {
      ...next,
      rooms: { ...next.rooms, indoorExclusions: structuredClone(exclusion) },
      dataset: { ...next.dataset, indoorExclusions: exclusion },
    };
  }
  if (
    roomKeys.length === 0 ||
    new Set(roomKeys).size !== roomKeys.length ||
    roomKeys.some((k) => !decision.roomKeys.includes(k))
  )
    throw new Error(
      "Choose existing places inside the selected regions to apply this classification.",
    );
  for (const key of roomKeys) {
    const record = next.dataset.records.find((r) => r.key === key)!;
    if (
      record.stair ||
      next.dataset.connectors?.some((c) =>
        c.entrances.some((e) => e.roomKey === key),
      )
    )
      throw new Error(
        "Review stair/elevator access separately; this action cannot reclassify a vertical connector.",
      );
    next = reviewArea(next, key, {
      notes: patch.notes,
      ...(patch.kind === "hallway"
        ? { access: "public", walkable: true, throughNavigation: true }
        : patch.kind === "staff"
          ? { access: "staff", walkable: true, throughNavigation: false }
          : patch.kind === "off-limits"
            ? { walkable: false, throughNavigation: false }
            : { walkable: true, throughNavigation: false }),
    });
    const room = next.dataset.records.find((r) => r.key === key)!;
    const spaceUse = {
      kind: patch.kind === "room" ? "room" : "hallway",
      evidence: "user-reported",
      notes: patch.notes,
    };
    room.properties.spaceUse = spaceUse;
    room.circulation = patch.kind === "hallway";
    const source = next.rooms.annotations.find((r) => r.key === key);
    if (!source)
      throw new Error(
        "This place has no editable source annotation. Save a proposal and regenerate it in Reviter.",
      );
    source.spaceUse = spaceUse;
  }
  next.rooms.nativeAreaReviews!.decisions.at(-1)!.status = "applied";
  next.rooms.nativeAreaReviews!.decisions.at(-1)!.appliedRoomKeys = roomKeys;
  next = setMapAnnotations(next, [
    ...(next.rooms.mapEdits?.annotations ?? []).filter(
      (a) => a.id !== `native-area:${decision.id.slice(-60)}`,
    ),
    {
      id: `native-area:${decision.id.slice(-60)}`,
      kind: "label",
      levelId: result.levelId,
      text: patch.label,
      notes: patch.notes.slice(0, 4000),
      color: patch.kind === "hallway" ? "#287b8a" : "#8a5670",
      fontSize: 16,
      pointsFeet: [decision.partsFeet[0][0][0]],
    },
  ]);
  return next;
}

/** Restore only the reviewed indoor scope; source geometry/permissions are retained. */
export function removeOutdoorExclusion(
  project: IndoorProject,
  id: string,
): IndoorProject {
  if (project.manifest.format !== "reviter-project")
    throw new Error("Use the authoring master to change indoor scope.");
  const next = {
    ...project,
    rooms: structuredClone(project.rooms),
    dataset: structuredClone(project.dataset),
  };
  const areas = next.dataset.indoorExclusions?.areas.filter((a) => a.id !== id);
  if (!areas || areas.length === next.dataset.indoorExclusions!.areas.length)
    throw new Error("Indoor exclusion not found.");
  if (areas.length > 0) {
    next.dataset.indoorExclusions!.areas = areas;
    next.rooms.indoorExclusions = structuredClone(
      next.dataset.indoorExclusions,
    );
  } else {
    delete next.dataset.indoorExclusions;
    delete next.rooms.indoorExclusions;
  }
  const decision = next.rooms.nativeAreaReviews?.decisions.find(
    (d) =>
      d.id === id && (d.kind === "outdoor" || d.kind === "non-traversable"),
  );
  if (decision) {
    decision.status = "proposed";
    delete decision.appliedRoomKeys;
  }
  return next;
}
