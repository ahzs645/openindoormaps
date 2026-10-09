import { nativeWallPositionMaterialBinding } from "./native-wall-position-repairs";
import { nativeCirculationBinding } from "./native-circulation-binding";
import type { IndoorDataset } from "./contract";

const calculations = new WeakMap<IndoorDataset, Map<string, unknown>>();

/** Only for a privately cloned worker snapshot, which is never edited in place.
 * Source-review callers still use the per-calculation guards below. Replacing
 * the worker's snapshot creates a new session and discards every cached binding. */
export function createImmutableRoutingSession(data: IndoorDataset) {
  const values = new Map<string, unknown>();
  return <T>(run: () => T): T => {
    if (calculations.has(data)) return run();
    calculations.set(data, values);
    try {
      return run();
    } finally {
      calculations.delete(data);
    }
  };
}

/** Reuse exact bindings only within one synchronous calculation. A later
 * request always rechecks the dataset, including in-place door/access edits. */
export function withRoutingCalculation<T>(
  data: IndoorDataset,
  run: () => T,
): T {
  if (calculations.has(data)) return run();
  calculations.set(data, new Map());
  try {
    return run();
  } finally {
    calculations.delete(data);
  }
}
export function routingCalculationValue<T>(
  data: IndoorDataset,
  key: string,
  read: () => T,
): T {
  const values = calculations.get(data);
  if (!values) return read();
  if (!values.has(key)) values.set(key, read());
  return values.get(key) as T;
}

/** Exact snapshots avoid stale permissions after an in-place source review.
 * Array identity also matters: equivalent imports must bind their own objects.
 * Do not use dataset/hash identity alone; closing a door does not change either. */
export function routingSnapshot(data: IndoorDataset): string {
  return routingCalculationValue(data, "policy-snapshot", () =>
    nativeCirculationBinding(
      [
        data.source.modelSha256,
        data.records.map((r) => [
          r.key,
          r.number,
          r.name,
          r.building,
          r.levelId,
          r.elevationFeet,
          r.surfaceId,
          r.arrivalNodeId,
          r.walkable,
          r.access,
          r.circulation,
          r.stair,
          r.ringsFeet,
          r.properties.throughNavigationReview,
          r.properties.generatedLanding,
          r.properties.nativeFloorOpeningOwnership,
          r.properties.floorOpeningsFeet,
          r.properties.spaceUse,
          r.properties.stairAccess,
          r.properties.dwg,
        ]),
        data.nodes.map((n) => [
          n.id,
          n.levelId,
          n.roomKey,
          n.kind,
          n.pointFeet,
        ]),
        data.edges,
        ...(data.edges.some((e) => e.nativeRampSurface)
          ? [
              "native-ramp-support-v1",
              data.rampDisplay?.sourceModelSha256,
              data.rampDisplay?.ramps.map((r) => [
                r.edgeId,
                r.nativeElementId,
                r.trianglesFeet,
              ]),
            ]
          : []),
        data.doors,
        ...(data.nativeIndoorEnvelopes && data.doorAperturePatchState
          ? [data.doorAperturePatchState]
          : []),
        data.walls,
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
        ...(data.nativeProvisionalCornerSeals
          ? [
              "native-provisional-corner-seals-v1",
              data.nativeProvisionalCornerSeals,
            ]
          : []),
        data.connectors,
        data.walkingSupport,
        ...(data.nativeIndoorEnvelopes && data.nativePhysicalLevels
          ? [data.nativePhysicalLevels]
          : []),
        ...(data.nativePhysicalLevels ||
        data.nativeIndoorEnvelopes ||
        data.edges.some((e) => e.nativeSourceStair)
          ? [
              data.stairDisplay?.sourceModelSha256,
              data.stairDisplay?.sourceFlights,
            ]
          : []),
        ...(data.indoorExclusions ? [data.indoorExclusions] : []),
        data.circulationGeometry,
        ...(data.nativeIndoorEnvelopes
          ? ["native-indoor-envelope-v1", data.nativeIndoorEnvelopes]
          : []),
      ],
      !!data.nativeIndoorEnvelopes,
    ),
  );
}
export const routingArrays = (data: IndoorDataset) =>
  [data.records, data.nodes, data.edges, data.doors] as const;
export const sameRoutingArrays = (
  a: ReturnType<typeof routingArrays>,
  b: ReturnType<typeof routingArrays>,
) => a.every((array, i) => array === b[i]);
