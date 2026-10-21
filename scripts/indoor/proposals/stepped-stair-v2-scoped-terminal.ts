import {
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../../../reviter/lib/reviter/native-rational-overlay.ts";
/** Explicit source-only single-run floor demand. A local patch is selected by
 * an authoring request, never by retrying a failed global ring admission. */
import type { OriginalNativeStairPhysicalContext } from "../../../../reviter/lib/reviter/native-source-stair-physical-inventory.ts";
import type { OriginalNativeForeignEnvelopeCensus } from "../../../../reviter/lib/reviter/native-source-foreign-envelope-census.ts";
import type { OriginalNativeStairRiserPartition } from "../../../../reviter/lib/reviter/native-source-stair-riser-partition.ts";
import type { inspectOriginalNativeFloorLocalSupport } from "../../../../reviter/lib/reviter/native-source-floor-local-support.ts";
import {
  originalStairTerminalWalkingFootprint,
  inspectOriginalNativeStairScopedFloorAttachment,
} from "../../../../reviter/lib/reviter/native-source-stair-scoped-floor-attachment.ts";
import type { NativeStairStationLateral } from "../../../../reviter/lib/reviter/native-source-stair-stepped-stations.ts";
import {
  inspectOriginalSteppedStairGraphDemand,
  type OriginalSteppedStairGraphDemand,
} from "./original-stepped-stair-graph-demand.ts";
export type SteppedTerminalCap = Pick<
  ReturnType<typeof inspectOriginalNativeFloorLocalSupport>,
  | "sourceModelSha256"
  | "sourceSchemaSha256"
  | "nativeFloorElementId"
  | "originalFaceToken"
  | "originalAssociatedNativeLevelId"
  | "originalGElementFrameSha256"
  | "originalPhysicalTopElevationFeet"
  | "originalReferenceWindingPartsFeet"
  | "guaranteedInnerSupportPartsFeet"
  | "retainedPositiveBoundaryUncertaintyPartsFeet"
  | "retainedZeroAreaBoundarySegmentsFeet"
> & {
  scopedOriginalFloorQualification?: ReturnType<
    typeof inspectOriginalNativeStairScopedFloorAttachment
  >;
};
export function extractOriginalScopedSteppedTerminalCap(
  sources: {
    stair: OriginalNativeStairPhysicalContext;
    foreign: OriginalNativeForeignEnvelopeCensus;
    riserPartition?: OriginalNativeStairRiserPartition;
  },
  originalDemand: OriginalSteppedStairGraphDemand,
  nativeRunId: number,
  side: 0 | 1,
  request: {
    supportScope: "connected-demand";
    nativeFloorElementId: number;
    originalCapFaceToken: number;
    approachXYFeet: [number, number][];
  } & NativeStairStationLateral,
  additionalTransferFloorDemandFeet?: NativeRationalParts,
): SteppedTerminalCap {
  const graph = inspectOriginalSteppedStairGraphDemand(originalDemand),
    original = graph.terminals[side]!.node;
  if (
    request.supportScope !== "connected-demand" ||
    request.approachXYFeet[0]?.[0] !== original.pointFeet[0] ||
    request.approachXYFeet[0]?.[1] !== original.pointFeet[1]
  )
    throw new Error(
      "Scoped original floor request changed its original graph endpoint",
    );
  const scoped = inspectOriginalNativeStairScopedFloorAttachment(
    sources.foreign,
    sources.stair,
    nativeRunId,
    {
      originalLogicalGraphNodeId: original.id,
      originalLogicalPointFeet: original.pointFeet,
      nativeFloorElementId: request.nativeFloorElementId,
      originalTrimmedFloorFaceToken: request.originalCapFaceToken,
      runTerminal: side ? "upper" : "lower",
      ...(request.lateralDirectionFeet === undefined
        ? { lateralAxis: request.lateralAxis }
        : {
            lateralDirectionFeet: [...request.lateralDirectionFeet] as [
              number,
              number,
            ],
          }),
    },
    additionalTransferFloorDemandFeet?.length
      ? nativeRationalOverlay(
          "union",
          originalStairTerminalWalkingFootprint(
            request.approachXYFeet,
            request,
          ),
          additionalTransferFloorDemandFeet,
        )
      : originalStairTerminalWalkingFootprint(request.approachXYFeet, request),
    sources.riserPartition,
  );
  if (
    !scoped.completeScopedAttachmentQualified ||
    scoped.sourceModelSha256 !== originalDemand.sourceModelSha256 ||
    scoped.nativeStairId !== graph.edge.nativeElementId ||
    scoped.originalNativeServedLevelId !== original.levelId
  )
    throw Object.assign(
      new Error(
        "Original connected single-run floor footprint is not fully qualified",
      ),
      {
        originalScopedFloorQualification: scoped,
      },
    );
  return {
    sourceModelSha256: scoped.sourceModelSha256,
    sourceSchemaSha256: scoped.sourceSchemaSha256,
    nativeFloorElementId: scoped.nativeFloorElementId,
    originalFaceToken: scoped.originalCapFaceToken,
    originalAssociatedNativeLevelId: scoped.originalNativeServedLevelId,
    originalGElementFrameSha256: scoped.originalGElementFrameSha256,
    originalPhysicalTopElevationFeet:
      scoped.cap.originalPhysicalTopElevationFeet,
    // The entire connected walking footprint is freshly proved within every
    // original boundary/hole uncertainty. It never claims a whole floor ring.
    originalReferenceWindingPartsFeet:
      scoped.completeConnectedWalkingFootprintFeet,
    guaranteedInnerSupportPartsFeet:
      scoped.completeConnectedWalkingFootprintFeet,
    retainedPositiveBoundaryUncertaintyPartsFeet: [],
    retainedZeroAreaBoundarySegmentsFeet: [],
    scopedOriginalFloorQualification: scoped,
  };
}
