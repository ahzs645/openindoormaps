import { nativeSourceStairPhysicalEvidence } from "./native-source-stair-material";
import type { IndoorDataset } from "./contract";

/** Physical routing evidence stays exact. Render meshes, selection tessellation
 * and authoring issue text are unused by route policy or floor/path validation;
 * sending them to a route worker wastes a large synchronous structured clone. */
export function routeWorkerDataset(data: IndoorDataset): IndoorDataset {
  return {
    ...data,
    // Derived frame material is separate from original cuts and remains exact
    // in the worker; render/private authoring wrappers below may be omitted.
    nativeDerivedFrameReturns: data.nativeDerivedFrameReturns,
    nativeProvisionalCornerSeals: data.nativeProvisionalCornerSeals,
    presentation: undefined,
    circulationGeometry:
      data.circulationGeometry &&
      (data.circulationGeometry.displayResidualTopology ||
        data.circulationGeometry.cells.some((c) => c.containedDisplay))
        ? {
            ...data.circulationGeometry,
            displayResidualTopology: undefined,
            cells: data.circulationGeometry.cells.map(
              ({ containedDisplay: _, ...cell }) => cell,
            ),
          }
        : data.circulationGeometry,
    nativeSourceStairMaterials: nativeSourceStairPhysicalEvidence(
      data.nativeSourceStairMaterials,
    ),
    nativeExploreMapping: undefined,
    windowDisplay: undefined,
    stairDisplay:
      data.stairDisplay &&
      (data.nativeIndoorEnvelopes ||
        data.nativePhysicalLevels ||
        data.edges.some((e) => e.nativeSourceStair))
        ? {
            ...data.stairDisplay,
            flights: [],
            sourceFlights:
              data.nativeIndoorEnvelopes || data.nativePhysicalLevels
                ? data.stairDisplay.sourceFlights
                : data.stairDisplay.sourceFlights?.filter((f) =>
                    data.edges.some(
                      (e) =>
                        e.nativeSourceStair?.nativeStairId === f.stairElementId,
                    ),
                  ),
          }
        : undefined,
    // These original top faces are physical ramp evidence, even though their
    // display body and platforms are unnecessary in the routing worker.
    rampDisplay: data.rampDisplay && {
      ...data.rampDisplay,
      ramps: data.rampDisplay.ramps
        .filter((r) =>
          data.edges.some(
            (e) =>
              e.id === r.edgeId &&
              (e.nativeRampSurface ||
                (data.nativeIndoorEnvelopes && e.kind === "ramp")),
          ),
        )
        .map((r) => ({
          ...r,
          displayTrianglesFeet: undefined,
          bodyTrianglesFeet: [],
          platforms: [],
        })),
    },
    nativeDisplayScopes: undefined,
    issues: [],
  };
}
