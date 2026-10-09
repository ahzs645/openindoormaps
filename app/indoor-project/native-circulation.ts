import { nativeRoomIdentityRings } from "./native-floor-opening-ownership";
import { validateNativeContainedCellDisplay } from "./native-contained-cell-display";
import { createNativeExactRoutingAuthority } from "./native-exact-routing-authority";
import {
  createNativeExactTopologyIndex,
  freezeNativeRationalParts,
  nativeRationalPointInParts,
  nativeRationalPathSupported,
  nativeRationalAreaCompare,
  type NativeExactTopologyIndex,
} from "./native-exact-planar-topology";
import {
  nativeRationalOverlay,
  NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
  type NativeRationalParts,
} from "./native-rational-overlay";
import { nativeRationalIntersectionOperand } from "./native-rational-intersection-broadphase";
import { NATIVE_EXACT_GEOS_BINDING } from "./native-exact-geos-overlay";
import { nativePlanarPointInRing } from "./native-planar-path-support";
import { nativeWallPositionMaterialBinding } from "./native-wall-position-repairs";
import { nativeCirculationBinding } from "./native-circulation-binding";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { nativeConnectorAnchors } from "./native-connector-anchors";
import { createNativeIndoorEnvelopeIndex } from "./native-indoor-envelopes";
import { NATIVE_BARRIER_TOPOLOGY_VERSION } from "./native-barrier-topology";
import { routingCalculationValue } from "./routing-cache";
import { createNativeDoorApproachQuery } from "./native-door-approach";
export type NativeCirculationCell = NonNullable<
  IndoorDataset["circulationGeometry"]
>["cells"][number];
function nativeCellAccessIsSupported(
  data: IndoorDataset,
  cell: NativeCirculationCell,
  index: NativeExactTopologyIndex,
): boolean {
  return routingCalculationValue(
    data,
    `native-exact-face-access:${cell.id}`,
    () => {
      const face = cell.exactFaceId ? index.parts(cell.exactFaceId) : undefined;
      if (!face) return false;
      const points = cell.ringsFeet.flat(),
        loX = Math.min(...points.map((p) => p[0])),
        hiX = Math.max(...points.map((p) => p[0])),
        loY = Math.min(...points.map((p) => p[1])),
        hiY = Math.max(...points.map((p) => p[1]));
      const broadAllowance =
        8 *
        Number.EPSILON *
        Math.max(1, Math.abs(loX), Math.abs(hiX), Math.abs(loY), Math.abs(hiY));
      for (const record of data.records) {
        if (
          Math.abs(record.elevationFeet - cell.elevationFeet) > 0.05 ||
          (record.walkable && record.access !== "staff")
        )
          continue;
        const identity = nativeRoomIdentityRings(data, record),
          ps = identity.flat();
        if (!ps.length) continue;
        if (
          Math.max(...ps.map((p) => p[0])) < loX - broadAllowance ||
          Math.min(...ps.map((p) => p[0])) > hiX + broadAllowance ||
          Math.max(...ps.map((p) => p[1])) < loY - broadAllowance ||
          Math.min(...ps.map((p) => p[1])) > hiY + broadAllowance
        )
          continue;
        const overlap = nativeRationalOverlay("intersection", face, [identity]);
        if (
          nativeRationalAreaCompare(overlap, []) > 0 &&
          (nativeRationalAreaCompare(overlap, face, 2n) >= 0 ||
            nativeRationalAreaCompare(
              overlap,
              nativeRationalOverlay("union", [identity]),
              2n,
            ) >= 0)
        )
          return false;
      }
      return true;
    },
  );
}
/** Decode once per immutable routing calculation; an edited snapshot gets a
 * new calculation context and complete descriptor checksum verification. */
export function nativeCirculationExactIndex(
  data: IndoorDataset,
): NativeExactTopologyIndex | undefined {
  if (!data.nativeIndoorEnvelopes || !data.circulationGeometry?.exactTopology)
    return;
  return routingCalculationValue(
    data,
    "native-exact-circulation-topology",
    () =>
      createNativeExactTopologyIndex(data.circulationGeometry!.exactTopology!, {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: nativeCirculationGeometryKey(data),
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      }),
  );
}
export function nativeCirculationExactCellParts(
  data: IndoorDataset,
  cell: NativeCirculationCell,
): NativeRationalParts | undefined {
  if (!cell.exactFaceId) return;
  const face = nativeCirculationExactIndex(data)?.parts(cell.exactFaceId);
  if (!face) return;
  return routingCalculationValue(
    data,
    `native-exact-supported-cell:${cell.id}`,
    () => {
      const authority = routingCalculationValue(
        data,
        "native-exact-routing-authority",
        () => createNativeExactRoutingAuthority(data),
      )(cell.elevationFeet);
      return freezeNativeRationalParts(
        nativeRationalOverlay(
          "intersection",
          face,
          nativeRationalIntersectionOperand(face, authority),
        ),
      );
    },
  );
}
function exactOriginalParts(
  data: IndoorDataset,
  key: string,
  parts: [number, number][][][],
): NativeRationalParts {
  return routingCalculationValue(data, `native-exact-original:${key}`, () =>
    nativeRationalOverlay("union", parts),
  );
}
export function validateNativeCirculationGeometry(data: IndoorDataset): void {
  const value = data.circulationGeometry;
  if (value === undefined) return;
  if (
    !value ||
    value.version !== 1 ||
    value.sourceModelSha256 !== data.source.modelSha256 ||
    typeof value.sourceGeometryKey !== "string" ||
    // Exact original material cuts remain bound here; whole-campus descriptors
    // can exceed the older 32 MiB limit without exceeding package input caps.
    value.sourceGeometryKey.length > 64 * 1024 * 1024 ||
    !Array.isArray(value.cells) ||
    value.cells.length > 60_000
  )
    throw new Error("Invalid prepared native circulation geometry.");
  const exactIndex = value.exactTopology
    ? createNativeExactTopologyIndex(value.exactTopology, {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: value.sourceGeometryKey,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      })
    : undefined;
  const displayIndex = value.displayResidualTopology
    ? createNativeExactTopologyIndex(value.displayResidualTopology, {
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: value.sourceGeometryKey,
        kernelVersion: NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
      })
    : undefined;
  if (
    data.nativeIndoorEnvelopes &&
    value.sourceGeometryKey === nativeCirculationGeometryKey(data) &&
    !exactIndex
  )
    throw new Error("Current native circulation lacks exact topology.");
  if (
    exactIndex &&
    value.cells.some((c) => !c.exactFaceId || !exactIndex.parts(c.exactFaceId))
  )
    throw new Error("Native cell lacks its exact physical face.");
  const ids = new Set<string>();
  if (
    value.fixtures !== undefined &&
    (!Array.isArray(value.fixtures) ||
      value.fixtures.length > 60_000 ||
      value.fixtures.some(
        (f) =>
          !f ||
          typeof f.id !== "string" ||
          f.id.length > 512 ||
          !Number.isSafeInteger(f.nativeElementId) ||
          f.nativeElementId <= 0 ||
          !Number.isFinite(f.elevationFeet) ||
          !Number.isFinite(f.heightFeet) ||
          f.heightFeet <= 0 ||
          f.heightFeet > 50 ||
          !Array.isArray(f.levelIds) ||
          f.levelIds.length === 0 ||
          f.levelIds.some(
            (id) =>
              !data.nativeLevels.some(
                (l) =>
                  l.id === id &&
                  Math.abs(l.elevationFeet - f.elevationFeet) < 0.05,
              ),
          ) ||
          !Array.isArray(f.ringsFeet) ||
          f.ringsFeet.length === 0 ||
          f.ringsFeet.some(
            (r) =>
              !Array.isArray(r) ||
              r.length < 3 ||
              r.length > 60_000 ||
              r.some(
                (p) =>
                  !Array.isArray(p) ||
                  p.length !== 2 ||
                  p.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e8),
              ),
          ),
      ))
  )
    throw new Error("Invalid native fixture geometry.");
  if (
    value.preparedRoomKeys !== undefined &&
    (!Array.isArray(value.preparedRoomKeys) ||
      value.preparedRoomKeys.length > 60_000 ||
      value.preparedRoomKeys.some(
        (key) => !data.records.some((r) => r.key === key),
      ))
  )
    throw new Error("Invalid prepared native circulation identities.");
  if (
    value.reviewSurfaces !== undefined &&
    (!Array.isArray(value.reviewSurfaces) ||
      value.reviewSurfaces.length > 60_000 ||
      value.reviewSurfaces.some(
        (s) =>
          !s ||
          !value.preparedRoomKeys?.includes(s.roomKey) ||
          !data.records.some(
            (r) =>
              r.key === s.roomKey &&
              r.levelId === s.levelId &&
              Math.abs(r.elevationFeet - s.elevationFeet) < 0.05,
          ) ||
          !Array.isArray(s.ringsFeet) ||
          s.ringsFeet.length === 0 ||
          s.ringsFeet.length > 10_000 ||
          s.ringsFeet.some(
            (r) =>
              !Array.isArray(r) ||
              r.length < 3 ||
              r.length > 60_000 ||
              r.some(
                (p) =>
                  !Array.isArray(p) ||
                  p.length !== 2 ||
                  p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e8),
              ),
          ),
      ))
  )
    throw new Error("Invalid native floor-clipped review surface.");
  for (const cell of value.cells) {
    if (cell.containedDisplay) {
      const source = cell.exactFaceId
        ? exactIndex?.parts(cell.exactFaceId)
        : undefined;
      if (!source)
        throw Error("Contained native cell drawing lacks its exact authority.");
      validateNativeContainedCellDisplay(
        cell.containedDisplay,
        source,
        displayIndex,
      );
    }
    if (
      !cell ||
      typeof cell.id !== "string" ||
      cell.id.length > 512 ||
      ids.has(cell.id) ||
      !Number.isFinite(cell.elevationFeet) ||
      !Number.isFinite(cell.sourceCoverage) ||
      cell.sourceCoverage < (data.nativeIndoorEnvelopes ? 0 : 0.65) ||
      cell.sourceCoverage > 1.000_001 ||
      !Array.isArray(cell.levelIds) ||
      cell.levelIds.length === 0 ||
      cell.levelIds.some((id) => !data.nativeLevels.some((l) => l.id === id)) ||
      !Array.isArray(cell.roomKeys) ||
      (cell.roomKeys.length === 0 &&
        (!data.nativeIndoorEnvelopes ||
          !validConnectorCellAnchors(data, cell))) ||
      cell.roomKeys.some(
        (key) =>
          !data.records.some(
            (r) =>
              r.key === key &&
              ((cell.levelIds.includes(r.levelId) &&
                Math.abs(r.elevationFeet - cell.elevationFeet) < 0.05) ||
                (!!data.nativeIndoorEnvelopes &&
                  cell.connectorAnchors?.some((a) => a.roomKey === r.key) &&
                  validConnectorCellAnchors(data, cell))),
          ),
      ) ||
      !Array.isArray(cell.nativeFloorIds) ||
      cell.nativeFloorIds.length === 0 ||
      cell.nativeFloorIds.some(
        (id) =>
          !data.walkingSupport?.floors.some(
            (f) =>
              f.nativeElementId === id &&
              Math.abs(f.elevationFeet - cell.elevationFeet) < 0.05,
          ),
      ) ||
      !Array.isArray(cell.ringsFeet) ||
      cell.ringsFeet.length === 0 ||
      cell.ringsFeet.length > 10_000 ||
      cell.ringsFeet.some(
        (ring) =>
          !Array.isArray(ring) ||
          ring.length < 3 ||
          ring.length > 60_000 ||
          ring.some(
            (p) =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e8),
          ),
      )
    )
      throw new Error("Invalid native circulation cell or floor ownership.");
    if (
      cell.connectorAnchors !== undefined &&
      (!Array.isArray(cell.connectorAnchors) ||
        !cell.connectorAnchors.length ||
        cell.connectorAnchors.length > 1000 ||
        !validConnectorCellAnchors(data, cell))
    )
      throw new Error("Invalid source native connector landing ownership.");
    ids.add(cell.id);
  }
}
/** Keep this wire binding identical to Reviter's preparation function. */
export function nativeCirculationGeometryKey(data: IndoorDataset): string {
  return routingCalculationValue(data, "native-circulation-binding", () =>
    nativeCirculationBinding(
      [
        data.source.modelSha256,
        NATIVE_BARRIER_TOPOLOGY_VERSION,
        ...(data.nativeIndoorEnvelopes
          ? [
              "native-indoor-envelope-v1",
              data.nativeIndoorEnvelopes,
              "native-source-intermediate-landings-v5",
              "native-source-exact-free-face-v12-qualified-steps-exact-approach-identities",
              "native-door-approach-original-source-bounds-v1",
              NATIVE_RATIONAL_OVERLAY_KERNEL_VERSION,
              NATIVE_EXACT_GEOS_BINDING,
              nativeConnectorAnchors(data),
              ...(data.nativePhysicalLevels ? [data.nativePhysicalLevels] : []),
            ]
          : []),
        ...(data.nativeMaterialSections
          ? [
              "native-material-sections-v1",
              data.nativeMaterialSections,
              data.nativeIndoorEnvelopes
                ? nativeWallPositionMaterialBinding(
                    data.nativeWallPositionRepairs,
                  )
                : data.nativeWallPositionRepairs,
            ]
          : []),
        ...(data.nativeDerivedFrameReturns
          ? ["native-derived-frame-returns-v1", data.nativeDerivedFrameReturns]
          : []),
        ...(data.nativeSourceStairMaterials?.authoredTreadRoles
          ? [
              "native-authored-stair-tread-roles-v1",
              data.nativeSourceStairMaterials.authoredTreadRoles,
            ]
          : []),
        ...(data.nativeIndoorEnvelopes && data.stairDisplay?.sourceFlights
          ? [
              "native-source-stair-mask-inventory-v1",
              data.stairDisplay.sourceModelSha256,
              data.stairDisplay.sourceFlights.map((f) => [
                f.stairElementId,
                f.treads,
              ]),
            ]
          : []),
        ...(data.nativeProvisionalCornerSeals
          ? [
              "native-provisional-corner-seals-v1",
              data.nativeProvisionalCornerSeals,
            ]
          : []),
        data.records.map((r) => [
          r.key,
          r.levelId,
          r.elevationFeet,
          r.circulation,
          r.stair,
          r.walkable,
          r.access,
          r.ringsFeet,
          r.properties.floorOpeningsFeet,
          ...(r.properties.nativeFloorOpeningOwnership !== undefined
            ? [r.properties.nativeFloorOpeningOwnership]
            : []),
          r.properties.spaceUse,
          r.properties.stairAccess,
        ]),
        data.walls,
        data.doors,
        data.walkingSupport,
        ...(data.nativeIndoorEnvelopes && data.doorAperturePatchState
          ? [data.doorAperturePatchState]
          : []),
      ],
      !!data.nativeIndoorEnvelopes,
    ),
  );
}
export function nativeCirculationCells(
  data: IndoorDataset,
): NativeCirculationCell[] {
  const prepared = data.circulationGeometry;
  if (
    !prepared ||
    prepared.version !== 1 ||
    prepared.sourceModelSha256 !== data.source.modelSha256 ||
    prepared.sourceGeometryKey !== nativeCirculationGeometryKey(data) ||
    (data.nativeIndoorEnvelopes && !prepared.exactTopology)
  )
    return [];
  const index = data.nativeIndoorEnvelopes
    ? nativeCirculationExactIndex(data)
    : undefined;
  return prepared.cells.filter(
    (cell) =>
      (!data.nativeIndoorEnvelopes ||
        !!(
          cell.exactFaceId &&
          index?.parts(cell.exactFaceId) &&
          nativeCellAccessIsSupported(data, cell, index)
        )) &&
      (!cell.connectorAnchors || validConnectorCellAnchors(data, cell)),
  );
}

function physicalCellPoint(
  data: IndoorDataset,
  cell: NativeCirculationCell,
  point: number[],
) {
  const inside = (rings: number[][][]) =>
    insideRing(point, rings[0]!) &&
    !rings.slice(1).some((h) => insideRing(point, h));
  const index = routingCalculationValue(
    data,
    "native-connector-envelopes",
    () =>
      createNativeIndoorEnvelopeIndex(
        data.nativeIndoorEnvelopes,
        data.source.modelSha256,
      ),
  );
  return (
    Math.abs(point[2]! - cell.elevationFeet) < 0.05 &&
    (data.nativeIndoorEnvelopes
      ? !!nativeCirculationExactCellParts(data, cell) &&
        nativeRationalPointInParts(
          point,
          nativeCirculationExactCellParts(data, cell)!,
        )
      : inside(cell.ringsFeet)) &&
    data.walkingSupport?.sourceModelSha256 === data.source.modelSha256 &&
    data.walkingSupport.floors.some(
      (f) =>
        cell.nativeFloorIds.includes(f.nativeElementId) &&
        Math.abs(f.elevationFeet - cell.elevationFeet) < 0.05 &&
        (data.nativeIndoorEnvelopes
          ? nativeRationalPointInParts(
              point,
              exactOriginalParts(
                data,
                `floor:${f.nativeElementId}`,
                f.partsFeet ?? [f.ringsFeet],
              ),
            )
          : (f.partsFeet ?? [f.ringsFeet]).some(inside)),
    ) &&
    (data.nativeIndoorEnvelopes
      ? nativeRationalPointInParts(
          point,
          exactOriginalParts(
            data,
            `envelope:${cell.elevationFeet}`,
            index.parts(cell.elevationFeet),
          ),
        )
      : index.parts(cell.elevationFeet).some(inside))
  );
}
/** Metadata floor/building aliases never move physical endpoints. Crossing
 * them requires the same original slab and independently bound native face. */
export function nativeCellSharedFloorAlias(
  data: IndoorDataset,
  edge: IndoorDataset["edges"][number],
): boolean {
  if (!data.nativeIndoorEnvelopes || !edge.nativeCellId || edge.kind !== "walk")
    return false;
  const cell = nativeCirculationCells(data).find(
      (c) => c.id === edge.nativeCellId,
    ),
    from = data.nodes.find((n) => n.id === edge.from),
    to = data.nodes.find((n) => n.id === edge.to);
  if (!cell || !from || !to) return false;
  const inside = (point: number[], rings: number[][][]) =>
    insideRing(point, rings[0]!) &&
    !rings.slice(1).some((h) => insideRing(point, h));
  // Native selection masks the door itself. An unchanged source portal can
  // therefore lie in its independently checked own threshold half rather than
  // the base face. It still needs the complete physical native branch and the
  // same original slab/enclosure; no neighbouring half or metadata surface ID
  // can supply that support.
  const approaches = routingCalculationValue(
    data,
    "native-door-approach-query",
    () => createNativeDoorApproachQuery(data),
  )(edge);
  if (
    [from, to].some(
      (node) =>
        !physicalCellPoint(data, cell, node.pointFeet) &&
        !(
          node.kind === "portal" &&
          approaches.some(
            (a) =>
              Math.abs(a.z - cell.elevationFeet) < 0.05 &&
              (a.exactParts
                ? nativeRationalPointInParts(node.pointFeet, a.exactParts)
                : inside(node.pointFeet, a.rings)),
          )
        ),
    )
  )
    return false;
  if (
    routingCalculationValue(
      data,
      `routing-native-alias-walk-blocker:${edge.id}`,
      () => nativeCirculationWalkBlockers(data, [edge]).has(edge.id),
    )
  )
    return false;
  return (
    data.walkingSupport?.floors.some(
      (f) =>
        cell.nativeFloorIds.includes(f.nativeElementId) &&
        Math.abs(f.elevationFeet - cell.elevationFeet) < 0.05 &&
        (f.partsFeet ?? [f.ringsFeet]).some((p) =>
          data.nativeIndoorEnvelopes
            ? [from, to].every((n) =>
                nativeRationalPointInParts(
                  n.pointFeet,
                  exactOriginalParts(
                    data,
                    `alias-floor:${f.nativeElementId}`,
                    f.partsFeet ?? [f.ringsFeet],
                  ),
                ),
              )
            : inside(from.pointFeet, p) && inside(to.pointFeet, p),
        ) &&
        data.nativeIndoorEnvelopes!.levels.some(
          (scope) =>
            Math.abs(scope.elevationFeet - cell.elevationFeet) < 0.05 &&
            scope.sourceElementIds.includes(f.nativeElementId) &&
            scope.partsFeet.some((p) =>
              data.nativeIndoorEnvelopes
                ? [from, to].every((n) =>
                    nativeRationalPointInParts(
                      n.pointFeet,
                      exactOriginalParts(
                        data,
                        `alias-envelope:${scope.levelId}:${scope.elevationFeet}`,
                        scope.partsFeet,
                      ),
                    ),
                  )
                : inside(from.pointFeet, p) && inside(to.pointFeet, p),
            ),
        ),
    ) ?? false
  );
}
function validConnectorCellAnchors(
  data: IndoorDataset,
  cell: NativeCirculationCell,
) {
  if (!data.nativeIndoorEnvelopes || !cell.connectorAnchors?.length)
    return false;
  const anchors = routingCalculationValue(
    data,
    "native-source-connector-anchors",
    () =>
      new Map(
        nativeConnectorAnchors(data).map((a) => [a.edgeId + "|" + a.nodeId, a]),
      ),
  );
  return cell.connectorAnchors.every((proof) => {
    const anchor = anchors.get(proof.edgeId + "|" + proof.nodeId);
    return (
      !!anchor &&
      proof.roomKey === anchor.roomKey &&
      proof.nativeElementId === anchor.nativeElementId &&
      (anchor.roomKey === "" ? true : cell.roomKeys.includes(anchor.roomKey)) &&
      cell.levelIds.includes(anchor.levelId) &&
      physicalCellPoint(data, cell, anchor.pointFeet)
    );
  });
}
/** A semantic record can identify several disconnected native cells. Preserve
 * all physical parts; never join them with a hull or a bounding rectangle. */
export function nativeCirculationSurfaces(
  data: IndoorDataset,
  records: IndoorRecord[],
) {
  const keys = new Set(
    records
      .filter((r) => data.nativeIndoorEnvelopes || r.circulation)
      .map((r) => r.key),
  );
  const cells = nativeCirculationCells(data).filter(
    (c) =>
      c.roomKeys.some((k) => keys.has(k)) &&
      records.some(
        (r) =>
          c.roomKeys.includes(r.key) &&
          Math.abs(c.elevationFeet - r.elevationFeet) < 0.05 &&
          c.levelIds.includes(r.levelId),
      ),
  );
  const valid =
    data.circulationGeometry?.sourceGeometryKey ===
      nativeCirculationGeometryKey(data) &&
    data.circulationGeometry.sourceModelSha256 === data.source.modelSha256;
  const reviewSurfaces =
    valid && !data.nativeIndoorEnvelopes
      ? (data.circulationGeometry?.reviewSurfaces ?? []).filter((s) =>
          keys.has(s.roomKey),
        )
      : [];
  const covered = new Set(
    valid && data.circulationGeometry?.preparedRoomKeys
      ? data.circulationGeometry.preparedRoomKeys.filter((k) => keys.has(k))
      : cells.flatMap((c) => c.roomKeys),
  );
  return {
    cells,
    covered,
    reviewSurfaces,
    fixtures: valid
      ? (data.circulationGeometry?.fixtures ?? []).filter((f) =>
          records.some(
            (r) =>
              f.levelIds.includes(r.levelId) &&
              Math.abs(r.elevationFeet - f.elevationFeet) < 0.05,
          ),
        )
      : [],
    rings: [
      ...cells.map((c) => c.ringsFeet),
      ...reviewSurfaces.map((s) => s.ringsFeet),
      ...(data.nativeIndoorEnvelopes
        ? []
        : records
            .filter((r) => !r.circulation || !covered.has(r.key))
            .map((r) => r.ringsFeet)),
    ],
  };
}

const insideRing = nativePlanarPointInRing;

type Bounds = [number, number, number, number];
type IndexedRing = { points: number[][]; bounds: Bounds };
type IndexedSurface = {
  id?: string;
  z: number;
  rings: IndexedRing[];
  bounds: Bounds;
};
const ringBounds = (points: number[][]): Bounds => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  return [minX, minY, maxX, maxY];
};
const overlaps = (a: Bounds, b: Bounds) =>
  a[0] <= b[2] + 1e-6 &&
  a[2] >= b[0] - 1e-6 &&
  a[1] <= b[3] + 1e-6 &&
  a[3] >= b[1] - 1e-6;
const inBounds = (p: number[], b: Bounds) =>
  p[0] >= b[0] - 1e-6 &&
  p[0] <= b[2] + 1e-6 &&
  p[1] >= b[1] - 1e-6 &&
  p[1] <= b[3] + 1e-6;
const containsRing = (p: number[], r: IndexedRing) =>
  inBounds(p, r.bounds) && insideRing(p, r.points);
const supportedNativePoint = (p: number[], surfaces: IndexedSurface[]) =>
  surfaces.some(
    (s) =>
      containsRing(p, s.rings[0]) &&
      !s.rings.slice(1).some((h) => containsRing(p, h)),
  );

/** Existing source walks cannot override a regenerated physical floor boundary.
 * Test every interval cut by a polygon edge, so even a thin fixture is a veto. */
export function nativeCirculationWalkBlockers(
  data: IndoorDataset,
  edges: ReadonlyArray<IndoorDataset["edges"][number]> = data.edges,
): Set<string> {
  const cells = nativeCirculationCells(data),
    prepared = data.circulationGeometry;
  const blocked = new Set<string>(
    data.nativeIndoorEnvelopes
      ? edges
          .filter((e) => e.kind === "walk" && !e.nativeCellId)
          .map((e) => e.id)
      : [],
  );
  if (
    !prepared?.preparedRoomKeys ||
    prepared.sourceGeometryKey !== nativeCirculationGeometryKey(data) ||
    prepared.sourceModelSha256 !== data.source.modelSha256
  ) {
    if (data.nativeIndoorEnvelopes)
      for (const edge of edges) if (edge.kind === "walk") blocked.add(edge.id);
    return blocked;
  }
  const keys = new Set(prepared.preparedRoomKeys);
  const doorApproaches = routingCalculationValue(
    data,
    "native-door-approach-query",
    () => createNativeDoorApproachQuery(data),
  );
  const surfaces = [
    ...cells.map((c) => ({ id: c.id, z: c.elevationFeet, rings: c.ringsFeet })),
    ...(data.nativeIndoorEnvelopes ? [] : (prepared.reviewSurfaces ?? [])).map(
      (s) => ({
        z: s.elevationFeet,
        rings: s.ringsFeet,
      }),
    ),
  ].map((surface): IndexedSurface => {
    const rings = surface.rings.map((points) => ({
      points,
      bounds: ringBounds(points),
    }));
    return {
      id:
        "id" in surface && typeof surface.id === "string"
          ? surface.id
          : undefined,
      z: surface.z,
      rings,
      bounds: rings[0].bounds,
    };
  });
  const byCell = new Map(surfaces.filter((s) => s.id).map((s) => [s.id!, s]));
  const rawCells = new Map(cells.map((c) => [c.id, c]));
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    if (
      edge.kind !== "walk" ||
      (edge.nativeCellId && !data.nativeIndoorEnvelopes) ||
      (edge.roomKeys.length === 0 &&
        (!data.nativeIndoorEnvelopes ||
          !edge.nativeCellId ||
          !rawCells.get(edge.nativeCellId)?.connectorAnchors?.length ||
          !validConnectorCellAnchors(
            data,
            rawCells.get(edge.nativeCellId)!,
          ))) ||
      !edge.roomKeys.every((k) => keys.has(k))
    )
      continue;
    if (data.nativeIndoorEnvelopes) {
      const cell = edge.nativeCellId
        ? rawCells.get(edge.nativeCellId)
        : undefined;
      const face = cell
        ? nativeCirculationExactCellParts(data, cell)
        : undefined;
      if (!cell || !face) {
        blocked.add(edge.id);
        continue;
      }
      const ownHalves = doorApproaches(edge)
        .filter((a) => Math.abs(a.z - cell.elevationFeet) < 0.05)
        .flatMap((a) => a.exactParts ?? []);
      // Face already rechecks current source floor/holes/material independently
      // of a rehashed prepared descriptor. Only checked incident halves extend it.
      const support = ownHalves.length
        ? freezeNativeRationalParts(
            nativeRationalOverlay("union", face, ownHalves),
          )
        : face;
      if (
        edge.pointsFeet.some(
          (p) => Math.abs(p[2] - cell.elevationFeet) > 0.05,
        ) ||
        !nativeRationalPathSupported(edge.pointsFeet, support)
      )
        blocked.add(edge.id);
      // Coincident metadata aliases need the original unchanged physical point
      // on their own face. A doorway half cannot supply that identity alias.
      if (
        edge.pointsFeet.length > 1 &&
        edge.pointsFeet.every((p) =>
          p.every((v, k) => v === edge.pointsFeet[0][k]),
        )
      ) {
        const from = nodes.get(edge.from),
          to = nodes.get(edge.to);
        if (
          !from ||
          !to ||
          from.roomKey !== to.roomKey ||
          !physicalCellPoint(data, cell, from.pointFeet) ||
          !physicalCellPoint(data, cell, to.pointFeet)
        )
          blocked.add(edge.id);
      }
      continue;
    }
    const approachSurfaces = doorApproaches(edge).map(
      (surface): IndexedSurface => {
        const rings = surface.rings.map((points) => ({
          points,
          bounds: ringBounds(points),
        }));
        return { z: surface.z, rings, bounds: rings[0].bounds };
      },
    );
    for (let i = 1; i < edge.pointsFeet.length; i++) {
      const a = edge.pointsFeet[i - 1],
        b = edge.pointsFeet[i];
      if (
        data.nativeIndoorEnvelopes &&
        Math.hypot(...a.map((v, k) => v - b[k]!)) < 1e-8
      ) {
        const cell = edge.nativeCellId && rawCells.get(edge.nativeCellId),
          from = nodes.get(edge.from),
          to = nodes.get(edge.to);
        if (
          !cell ||
          !from ||
          !to ||
          from.roomKey !== to.roomKey ||
          Math.hypot(...from.pointFeet.map((v, k) => v - a[k]!)) > 1e-8 ||
          Math.hypot(...to.pointFeet.map((v, k) => v - b[k]!)) > 1e-8 ||
          !physicalCellPoint(data, cell, a) ||
          !physicalCellPoint(data, cell, b)
        ) {
          blocked.add(edge.id);
          break;
        }
      }
      const segmentBounds: Bounds = [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
      ];
      // Bounds only reject irrelevant geometry. The exact boundary cuts and
      // interval checks below still veto gaps and arbitrarily thin obstacles.
      // A generated branch is certified by its own physical native face, not
      // a neighbouring room's floor. This also avoids scanning every campus
      // enclosure for every segment during worker warmup.
      const ownedSurface = edge.nativeCellId
        ? byCell.get(edge.nativeCellId)
        : undefined;
      const candidates =
        data.nativeIndoorEnvelopes && edge.nativeCellId
          ? ownedSurface
            ? [ownedSurface]
            : []
          : surfaces;
      const local = [...candidates, ...approachSurfaces].filter(
        (s) =>
          Math.abs(s.z - a[2]) < 0.05 &&
          Math.abs(s.z - b[2]) < 0.05 &&
          overlaps(s.bounds, segmentBounds),
      );
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        cuts = [0, 1];
      for (const surface of local)
        for (const indexed of surface.rings.filter((r) =>
          overlaps(r.bounds, segmentBounds),
        ))
          for (let j = 0; j < indexed.points.length; j++) {
            const p = indexed.points[j],
              q = indexed.points[(j + 1) % indexed.points.length],
              ex = q[0] - p[0],
              ey = q[1] - p[1],
              den = dx * ey - dy * ex;
            if (data.nativeIndoorEnvelopes ? den === 0 : Math.abs(den) < 1e-12)
              continue;
            const ox = p[0] - a[0],
              oy = p[1] - a[1],
              t = (ox * ey - oy * ex) / den,
              u = (ox * dy - oy * dx) / den;
            if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
          }
      cuts.sort((x, y) => x - y);
      if (
        !supportedNativePoint(a, local) ||
        !supportedNativePoint(b, local) ||
        cuts
          .slice(1)
          .some(
            (t, j) =>
              t > cuts[j] &&
              !supportedNativePoint(
                [
                  a[0] + (dx * (t + cuts[j])) / 2,
                  a[1] + (dy * (t + cuts[j])) / 2,
                ],
                local,
              ),
          )
      ) {
        blocked.add(edge.id);
        break;
      }
    }
  }
  return blocked;
}
