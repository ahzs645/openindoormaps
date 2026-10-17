/** Unimported pure role/consumer census. A finite GLine/GPoint is retained as
 * closed 1D/0D obstruction; it is never silently dropped or given thickness.
 * Actual RVT membership must still come from the original source constructor. */
import type { Revit2027GRepReplay } from "../../../../reviter/lib/reviter/revit-2027-grep-replay.ts";
import { inspectOriginalStairCarrierEnvelope } from "../../../../reviter/lib/reviter/native-source-stair-placed-envelope.ts";
import type { SteppedMaterialCell } from "./stepped-stair-v2-kernel.ts";
export function inspectFiniteStairCarrierPrimitives(replay: Revit2027GRepReplay, nativeDefinitionId: number) {
  const original = inspectOriginalStairCarrierEnvelope(replay, nativeDefinitionId);
  if (!original.ok) return { ok: false as const, issues: original.blockers, cells: [], originalSourceAuthorityGranted: false as const };
  try {
    const spans = new Map(replay.spans.map((span) => [span.replayIndex, span]));
    const positive = replay.spans.filter((span) => span.propertyToken > 0);
    if (new Set(positive.map((span) => span.propertyToken)).size !== positive.length) throw Error("Aliased original carrier property identity");
    const cells: SteppedMaterialCell[] = [];
    for (const primitive of original.geometry.originalNonSurfacePrimitives) {
      const span = spans.get(primitive.sourceReplayIndex);
      if (!span || span.propertyToken <= 0 || replay.spans.some((child) => child.parentReplayIndex === span.replayIndex))
        throw Error("Original primitive has body/profile descendants or no unique source occurrence");
      const consumers = replay.descriptors.filter((descriptor) => descriptor.token === span.propertyToken);
      if (consumers.length !== 1 || consumers[0]!.state !== "queued" ||
          consumers[0]!.parentReplayIndex !== span.parentReplayIndex ||
          consumers[0]!.sourceClassSlot !== span.propertySourceClassSlot ||
          consumers[0]!.descriptorOffset !== span.descriptorOffset || consumers[0]!.descriptorEndOffset !== span.descriptorEndOffset)
        throw Error("Original primitive has a reused/unbound source consumer");
      const seen = new Set<number>();
      let at = span.parentReplayIndex;
      while (at !== null) {
        if (seen.has(at)) throw Error("Cyclic original primitive ancestry");
        seen.add(at);
        const parent = spans.get(at);
        if (!parent || !["Revit2027GGroup", "Revit2027GFilter"].includes(parent.readerId))
          throw Error("Original primitive lies in a body/profile/generator consumer");
        at = parent.parentReplayIndex;
      }
      const parent = span.parentReplayIndex === null ? undefined : spans.get(span.parentReplayIndex),
        value = parent?.value as { children?: { token: number; sourceClassSlot: number; byteOffset: number; endOffset: number }[];
          group?: { children?: { token: number; sourceClassSlot: number; byteOffset: number; endOffset: number }[] } } | undefined,
        children = parent?.readerId === "Revit2027GFilter" ? value?.group?.children : value?.children;
      if (parent && (!children || children.filter((child) => child.token === span.propertyToken && child.sourceClassSlot === span.propertySourceClassSlot &&
          child.byteOffset === span.descriptorOffset && child.endOffset === span.descriptorEndOffset).length !== 1))
        throw Error("Original primitive is not its exact declared group/filter child");
      const points = primitive.pointsFeet;
      if (points.length !== (primitive.sourceKind === "original-GLine" ? 2 : 1)) throw Error("Unsupported original primitive bounds");
      const lo = points.map((p) => p[2]).reduce((a, b) => a.n * b.d < b.n * a.d ? a : b),
        hi = points.map((p) => p[2]).reduce((a, b) => a.n * b.d > b.n * a.d ? a : b);
      cells.push({ id: `native:${Number(replay.ownerElementId)}:primitive:${primitive.sourceReplayIndex}`,
        nativeOwnerId: Number(replay.ownerElementId), geometryKind: "bounded-source-primitive", originalFaceTokens: [],
        minimumElevationFeet: lo, maximumElevationFeet: hi, partsFeet: [],
        closedSegmentsFeet: [points.map((p) => [p[0], p[1]])] });
    }
    return { ok: true as const, cells, issues: [], primitiveCount: cells.length,
      originalSourceAuthorityGranted: false as const, walkingSupportApproved: false as const, routeApproved: false as const };
  } catch (error) {
    return { ok: false as const, cells: [], issues: [error instanceof Error ? error.message : String(error)], originalSourceAuthorityGranted: false as const };
  }
}
