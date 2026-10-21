/** Request mathematics only. The missing terminal strip is a demand on the
 * SAME named original floor, never support or permission by itself. The source
 * adapter must qualify the complete expanded demand and rerun every kernel
 * guard, including finite risers and all own/foreign six-foot material. */
import {
  nativeRationalOverlay,
  type Rational,
  type NativeRationalParts,
} from "../../../../reviter/lib/reviter/native-rational-overlay.ts";
import {
  inspectOriginalStairTypedRiserSequence,
  nativeConservativeTwoFootStrip,
} from "../../../../reviter/lib/reviter/native-source-stair-stepped-stations.ts";
import type {
  PortableSteppedSourceIndex,
  PortableSteppedReceipt,
  Point3,
  SteppedSupport,
  SteppedMaterialCell,
} from "./stepped-stair-v2-kernel.ts";
const cmp = (a: Rational, b: Rational) => a.n * b.d - b.n * a.d;
export function deriveUntrustedTerminalTransferFloorGap(demand: {
  nativeRunId: number;
  fromFeet: Point3;
  toFeet: Point3;
  lowerSupport: Pick<
    SteppedSupport,
    "referencePartsFeet" | "uncertaintyPartsFeet"
  >;
  upperSupport: Pick<
    SteppedSupport,
    "referencePartsFeet" | "uncertaintyPartsFeet"
  >;
  originalIntentPlanPartsFeet: NativeRationalParts;
  materialCells: SteppedMaterialCell[];
}): NativeRationalParts {
  const { fromFeet: a, toFeet: b } = demand;
  const strip = nativeConservativeTwoFootStrip([a[0], a[1]], [b[0], b[1]]);
  if (strip.length === 0 || cmp(b[2], a[2]) <= 0n)
    throw new Error("Nonascending or empty original terminal transfer demand");
  const own = demand.materialCells.filter(
    (cell) =>
      cell.nativeOwnerId === demand.nativeRunId &&
      cmp(cell.maximumElevationFeet, a[2]) >= 0n &&
      cmp(cell.minimumElevationFeet, b[2]) <= 0n,
  );
  const corridor = nativeRationalOverlay(
    "union",
    demand.lowerSupport.referencePartsFeet,
    demand.upperSupport.referencePartsFeet,
    demand.lowerSupport.uncertaintyPartsFeet,
    demand.upperSupport.uncertaintyPartsFeet,
    own.flatMap((cell) => cell.partsFeet),
    demand.originalIntentPlanPartsFeet,
  );
  return nativeRationalOverlay("difference", strip, corridor);
}
export function deriveUntrustedTerminalTransferFloorExtensions(
  index: PortableSteppedSourceIndex,
  receipt: PortableSteppedReceipt,
): [NativeRationalParts, NativeRationalParts] {
  const treads = index.supports
    .filter((s) => s.role === "tread")
    .sort((a, b) => a.typedIndex! - b.typedIndex!);
  if (
    treads.length < 2 ||
    treads.some(
      (s, i) => s.typedIndex !== i || s.nativeOwnerId !== index.nativeRunId,
    ) ||
    receipt.nativeRunId !== index.nativeRunId ||
    receipt.sourceModelSha256 !== index.sourceModelSha256
  )
    throw new Error("Incomplete original terminal transfer source binding");
  const sequence = inspectOriginalStairTypedRiserSequence(
    index.run,
    treads.length,
    index.riserPartition,
    index.capBackedTurns,
  );
  if (!sequence.completeNamedSourceRiserSequence)
    throw new Error(
      `Original terminal riser sequence refused: ${sequence.blockers.join("; ")}`,
    );
  return ([0, 1] as const).map((side) => {
    const terminal = receipt.terminals[side],
      station = side ? receipt.stations.at(-1) : receipt.stations[0],
      floors = index.supports.filter((s) => s.id === terminal.floorSupportId),
      ownSupports = index.supports.filter((s) => s.id === station?.supportId),
      endpoint = terminal.approachFeet.at(-1);
    if (
      !station ||
      !endpoint ||
      floors.length !== 1 ||
      ownSupports.length !== 1 ||
      floors[0]!.role !== "floor" ||
      ownSupports[0]!.role !== "tread" ||
      ownSupports[0]!.nativeOwnerId !== index.nativeRunId ||
      station.typedIndex !== (side ? treads.length - 1 : 0)
    )
      throw new Error("Original terminal support/station identity differs");
    return deriveUntrustedTerminalTransferFloorGap({
      nativeRunId: index.nativeRunId,
      fromFeet: side ? station.pointFeet : endpoint,
      toFeet: side ? endpoint : station.pointFeet,
      lowerSupport: side ? ownSupports[0]! : floors[0]!,
      upperSupport: side ? floors[0]! : ownSupports[0]!,
      originalIntentPlanPartsFeet: (side
        ? sequence.treadRelations.at(-1)!
        : sequence.treadRelations[0]!
      ).originalIntentPlanPartsFeet,
      materialCells: index.cells,
    });
  }) as [NativeRationalParts, NativeRationalParts];
}
