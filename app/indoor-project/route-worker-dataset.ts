import { nativeSourceStairPhysicalEvidence } from "./native-source-stair-material";
import type { IndoorDataset } from "./contract";

/** Physical routing evidence stays exact. Render meshes, selection tessellation
 * and authoring issue text are unused by route policy or floor/path validation;
 * sending them to a route worker wastes a large synchronous structured clone. */
export function routeWorkerDataset(data: IndoorDataset): IndoorDataset {
  // A stepped-stair proof digests its two claimed terminal cells whole, so
  // those cells keep their display containment for the worker to recheck,
  // with the residual topology their containment refers to.
  const claimedCells = new Set(
    data.edges.flatMap(
      (e) =>
        e.nativeSteppedStairV2?.terminalApproaches?.map(
          (a) => a.nativeCellId,
        ) ?? [],
    ),
  );
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
            displayResidualTopology: claimedCells.size
              ? data.circulationGeometry.displayResidualTopology
              : undefined,
            cells: data.circulationGeometry.cells.map((cell) => {
              if (claimedCells.has(cell.id)) return cell;
              const { containedDisplay: _, ...rest } = cell;
              return rest;
            }),
          }
        : data.circulationGeometry,
    nativeSourceStairMaterials: nativeSourceStairPhysicalEvidence(
      data.nativeSourceStairMaterials,
    ),
    // These exact JSON wire values are shared physical stair evidence. Keep
    // their rational markers intact; they are decoded by the stair verifier.
    nativeSteppedStairV2SourceIndices: data.nativeSteppedStairV2SourceIndices,
    nativeExploreMapping: undefined,
    windowDisplay: undefined,
    stairDisplay:
      data.stairDisplay &&
      (data.nativeIndoorEnvelopes ||
        data.nativePhysicalLevels ||
        data.edges.some((e) => e.nativeSourceStair || e.nativeSteppedStairV2))
        ? {
            ...data.stairDisplay,
            flights: [],
            sourceFlights:
              data.nativeIndoorEnvelopes || data.nativePhysicalLevels
                ? data.stairDisplay.sourceFlights
                : data.stairDisplay.sourceFlights?.filter((f) =>
                    data.edges.some(
                      (e) =>
                        e.nativeSourceStair?.nativeStairId === f.stairElementId ||
                        (e.nativeSteppedStairV2 &&
                          e.nativeElementId === f.stairElementId),
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
          bodyTrianglesFeet: undefined,
          platforms: [],
        })),
    },
    nativeDisplayScopes: undefined,
    issues: [],
  };
}
