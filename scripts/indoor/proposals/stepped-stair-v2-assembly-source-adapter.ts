/** Source-only bounded two-run/one-landing composition. Internal landing
 * boundaries are physical source joins, never invented original graph nodes
 * or served stops. Nothing here enables an edge or issues a portable proof. */
import { inspectFiniteStairCarrierPrimitives } from "./finite-stair-carrier-primitives.ts";
import {
  Rational,
  rational,
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../../../reviter/lib/reviter/native-rational-overlay.ts";
import { deriveUntrustedTerminalTransferFloorGap } from "./stepped-stair-v2-terminal-transfer-demand.ts";
import {
  originalNativeStairAssemblyMembershipFacts,
  inspectOriginalNativeStairAssemblyMemberMaterial,
  inspectOriginalNativeStairAssemblyLandingPorts,
  type OriginalNativeStairAssemblyMembership,
} from "../../../../reviter/lib/reviter/native-source-stair-assembly.ts";
import { inspectOriginalNativeStairFloorAttachment } from "../../../../reviter/lib/reviter/native-source-stair-floor-attachment.ts";
import { originalNativeStairRunReferencePlane } from "../../../../reviter/lib/reviter/native-source-stair-reference-plane.ts";
import {
  inspectOriginalNativeStairScopedFloorAttachment,
  originalStairTerminalWalkingFootprint,
} from "../../../../reviter/lib/reviter/native-source-stair-scoped-floor-attachment.ts";
import { inspectOriginalNativeFloorLocalSupport } from "../../../../reviter/lib/reviter/native-source-floor-local-support.ts";
import {
  originalNativeFloorObstacleDomainFacts,
  type OriginalNativeFloorObstacleDomains,
} from "../../../../reviter/lib/reviter/native-source-floor-obstacle-domains.ts";
import {
  originalNativeSlabSupportEnvelope,
  type OriginalNativePlanarSlabEnvelope,
} from "../../../../reviter/lib/reviter/native-source-planar-slab-envelope.ts";
import {
  nativeStairStationLateralDirection,
  inspectOriginalStairTypedRiserSequence,
  type NativeStairStationLateral,
} from "../../../../reviter/lib/reviter/native-source-stair-stepped-stations.ts";
import {
  inspectOriginalSteppedStairGraphDemand,
  type OriginalSteppedStairGraphDemand,
} from "./original-stepped-stair-graph-demand.ts";
import {
  extractOriginalSteppedRunMaterialFacts,
  assembleUntrustedSteppedRunPieceOperands,
  type SteppedSourceRouteProposal,
  type SteppedSourceExtractedFacts,
} from "./stepped-stair-v2-source-adapter.ts";
import {
  replayUntrustedSteppedRunPiece,
  type SteppedSupport,
  type Point3,
  type PortableSteppedRunPieceDemand,
  type PortableSteppedRunPieceReceipt,
  type SteppedSourceLandingBoundary,
  type PortableSteppedSourceIndex,
} from "./stepped-stair-v2-kernel.ts";

type RunSources = Parameters<typeof extractOriginalSteppedRunMaterialFacts>[0];
type FloorMaterial =
  | { kind: "floor-domains"; certificate: OriginalNativeFloorObstacleDomains }
  | { kind: "planar-slab"; certificate: OriginalNativePlanarSlabEnvelope };
type BoundaryRequest = {
  approachXYFeet: [number, number][];
} & NativeStairStationLateral;
export type OriginalTwoRunAssemblyProposal = {
  runs: [
    {
      nativeRunId: number;
      stations: SteppedSourceRouteProposal["stations"];
      outer: BoundaryRequest & {
        nativeFloorElementId: number;
        originalCapFaceToken: number;
        supportScope?: "connected-demand";
      };
      landing: BoundaryRequest;
    },
    {
      nativeRunId: number;
      stations: SteppedSourceRouteProposal["stations"];
      outer: BoundaryRequest & {
        nativeFloorElementId: number;
        originalCapFaceToken: number;
        supportScope?: "connected-demand";
      };
      landing: BoundaryRequest;
    },
  ];
  nativeLandingId: number;
  originalLandingCapFaceToken: number;
};
const qsame = (a: Rational, b: Rational) => a.n * b.d === b.n * a.d;
const subtract = (a: Rational, b: Rational) =>
  new Rational(a.n * b.d - b.n * a.d, a.d * b.d);

/** Pure request mathematics, never floor support. Only the original graph
 * boundary may request more of its SAME named floor; the peer boundary must
 * remain an independently complete source landing. The source consumer below
 * qualifies the expanded footprint afresh before rebuilding ordinary operands. */
export function deriveUntrustedAssemblyOuterTransferFloorGap(
  index: PortableSteppedSourceIndex,
  receipt: PortableSteppedRunPieceReceipt,
  outerSide: 0 | 1,
): NativeRationalParts {
  const outer = receipt.terminals[outerSide],
    inner = receipt.terminals[outerSide === 0 ? 1 : 0],
    treads = index.supports
      .filter((s) => s.role === "tread")
      .sort((a, b) => a.typedIndex! - b.typedIndex!);
  if (
    (outerSide !== 0 && outerSide !== 1) ||
    !outer ||
    !inner ||
    ("kind" in outer && outer.kind === "source-landing") ||
    !("floorSupportId" in outer) ||
    !("kind" in inner) ||
    inner.kind !== "source-landing" ||
    receipt.nativeStairId !== index.nativeStairId ||
    receipt.nativeRunId !== index.nativeRunId ||
    index.run.nativeRunId !== index.nativeRunId ||
    index.run.nativeElementId !== index.nativeRunId ||
    receipt.sourceModelSha256 !== index.sourceModelSha256 ||
    receipt.widthFeet !== 2 ||
    receipt.headroomFeet !== 6 ||
    treads.length < 2 ||
    treads.some(
      (s, i) => s.typedIndex !== i || s.nativeOwnerId !== index.nativeRunId,
    )
  )
    throw new Error("Original assembly outer/landing transfer binding differs");
  const floors = index.supports.filter((s) => s.id === outer.floorSupportId),
    landings = index.supports.filter((s) => s.id === inner.boundarySupportId),
    station = outerSide ? receipt.stations.at(-1) : receipt.stations[0],
    own = index.supports.filter((s) => s.id === station?.supportId),
    endpoint = outer.approachFeet.at(-1);
  if (
    floors.length !== 1 ||
    floors[0]!.role !== "floor" ||
    floors[0]!.nativeLevelId !== outer.originalLevelId ||
    landings.length !== 1 ||
    landings[0]!.role !== "landing" ||
    landings[0]!.nativeOwnerId !== inner.nativeLandingId ||
    landings[0]!.physicalFaceToken !== inner.originalCapFaceToken ||
    landings[0]!.sourceGeometryOwnerElementId !== inner.nativeDefinitionId ||
    !station ||
    !endpoint ||
    own.length !== 1 ||
    own[0]!.role !== "tread" ||
    own[0]!.nativeOwnerId !== index.nativeRunId ||
    own[0]!.typedIndex !== station.typedIndex ||
    station.typedIndex !== (outerSide ? treads.length - 1 : 0) ||
    !qsame(endpoint[2], floors[0]!.elevationFeet) ||
    !qsame(station.pointFeet[2], own[0]!.elevationFeet)
  )
    throw new Error("Original assembly outer support/station identity differs");
  const sequence = inspectOriginalStairTypedRiserSequence(
    index.run,
    treads.length,
    index.riserPartition,
    index.capBackedTurns,
  );
  if (!sequence.completeNamedSourceRiserSequence)
    throw new Error(
      `Original assembly terminal sequence refused: ${sequence.blockers.join("; ")}`,
    );
  return deriveUntrustedTerminalTransferFloorGap({
    nativeRunId: index.nativeRunId,
    fromFeet: outerSide ? station.pointFeet : endpoint,
    toFeet: outerSide ? endpoint : station.pointFeet,
    lowerSupport: outerSide ? own[0]! : floors[0]!,
    upperSupport: outerSide ? floors[0]! : own[0]!,
    originalIntentPlanPartsFeet: (outerSide
      ? sequence.treadRelations.at(-1)!
      : sequence.treadRelations[0]!
    ).originalIntentPlanPartsFeet,
    materialCells: index.cells,
  });
}
const lateral = (r: NativeStairStationLateral): NativeStairStationLateral => {
  nativeStairStationLateralDirection(r);
  return r.lateralDirectionFeet === undefined
    ? { lateralAxis: r.lateralAxis }
    : { lateralDirectionFeet: [...r.lateralDirectionFeet] };
};
function approach(request: BoundaryRequest, z: Rational): Point3[] {
  if (
    !Array.isArray(request.approachXYFeet) ||
    request.approachXYFeet.length < 2 ||
    request.approachXYFeet.length > 1000 ||
    request.approachXYFeet.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        ![0, 1].every((i) => typeof p[i] === "number" && Number.isFinite(p[i])),
    )
  )
    throw new Error("Malformed requested assembly boundary approach");
  return request.approachXYFeet.map((p) => [rational(p[0]), rational(p[1]), z]);
}
function floorMaterial(
  entry: FloorMaterial,
): SteppedSourceExtractedFacts["floors"][number] {
  if (entry.kind === "floor-domains") {
    const f = originalNativeFloorObstacleDomainFacts(entry.certificate);
    return {
      sourceModelSha256: f.sourceModelSha256,
      sourceSchemaSha256: f.sourceSchemaSha256,
      nativeFloorElementId: f.nativeFloorElementId,
      sourceGElementSha256: f.originalGElementFrameSha256,
      cells: f.cells,
    };
  }
  const f = originalNativeSlabSupportEnvelope(entry.certificate);
  return {
    sourceModelSha256: f.sourceModelSha256,
    sourceSchemaSha256: f.sourceSchemaSha256,
    nativeFloorElementId: f.nativeSlabElementId,
    sourceGElementSha256: f.sourceFrameSha256,
    cells: f.completeOriginalMaterialCellsFeet,
  };
}
/** Every supplied handle is independently dereferenced. The complete original
 * semantic child census, reciprocal definition host and named landing map
 * bind membership. Actual finite cap/riser/approach and every body then prove
 * geometry. Original label nodes, outer levels and access remain unchanged. */
export function extractOriginalTwoRunStairAssemblyCandidate(
  sources: {
    membership: OriginalNativeStairAssemblyMembership;
    runs: [RunSources, RunSources];
    outerFloorMaterials: [FloorMaterial, FloorMaterial];
  },
  originalDemand: OriginalSteppedStairGraphDemand,
  proposal: OriginalTwoRunAssemblyProposal,
) {
  const graph = inspectOriginalSteppedStairGraphDemand(originalDemand),
    membership = originalNativeStairAssemblyMembershipFacts(sources.membership);
  if (
    membership.nativeStairId !== graph.edge.nativeElementId ||
    membership.sourceModelSha256 !== originalDemand.sourceModelSha256 ||
    membership.originalRunIds.length !== 2 ||
    membership.originalLandingIds.length !== 1 ||
    membership.originalLandingIds[0] !== proposal.nativeLandingId ||
    new Set(proposal.runs.map((r) => r.nativeRunId)).size !== 2 ||
    proposal.runs.some(
      (r) => !membership.originalRunIds.includes(r.nativeRunId),
    )
  )
    throw new Error("Original bounded assembly/outer graph membership differs");
  const runFacts = sources.runs.map((s, i) =>
      extractOriginalSteppedRunMaterialFacts(s, proposal.runs[i]!.nativeRunId),
    ),
    landing = membership.members.find(
      (m) =>
        m.kind === "landing" && m.nativeElementId === proposal.nativeLandingId,
    )!;
  const joinHeight = landing.originalLandingBaseElevationFeet;
  if (
    runFacts.some(
      (facts) =>
        Boolean(facts.riserPartition) !== Boolean(runFacts[0]!.riserPartition),
    )
  )
    throw new Error(
      "Assembly run reference modes must share a complete original partition",
    );
  const reference = (side: 0 | 1, terminal: "lower" | "upper") =>
    originalNativeStairRunReferencePlane(
      runFacts[side]!.physical,
      terminal,
      sources.runs[side].riserPartition,
    );
  if (
    typeof joinHeight !== "number" ||
    !Number.isFinite(joinHeight) ||
    reference(0, "upper").heightFeet !== joinHeight ||
    reference(1, "lower").heightFeet !== joinHeight ||
    reference(0, "lower").heightFeet !==
      graph.terminals[0]!.node.pointFeet[2] ||
    reference(1, "upper").heightFeet !== graph.terminals[1]!.node.pointFeet[2]
  )
    throw new Error(
      "Original assembly nominal run/landing/served planes do not compose",
    );
  const portMap = landing.originalLandingRisersMap;
  if (
    !Array.isArray(portMap) ||
    portMap.length !== 2 ||
    new Set(
      portMap.map(
        (p) =>
          (p as { first?: { m_id?: { m_id64?: unknown } } }).first?.m_id
            ?.m_id64,
      ),
    ).size !== 2 ||
    proposal.runs.some(
      (r) =>
        !portMap.some(
          (p) =>
            (p as { first?: { m_id?: { m_id64?: unknown } } }).first?.m_id
              ?.m_id64 === r.nativeRunId,
        ),
    )
  )
    throw new Error(
      "Original landing does not explicitly name both owned runs",
    );
  const namedPorts = inspectOriginalNativeStairAssemblyLandingPorts(
    sources.membership,
    proposal.nativeLandingId,
  );
  if (
    !namedPorts.completeOriginalSemanticFifo ||
    !namedPorts.originalReciprocalNamedPortBindingsComplete ||
    namedPorts.originalLandingSemanticFrameSha256 !==
      landing.originalChildSemanticFrameSha256 ||
    namedPorts.ports.length !== 2 ||
    proposal.runs.some((run, i) => {
      const ports = namedPorts.ports.filter(
        (p) => p.nativeRunId === run.nativeRunId,
      );
      return (
        ports.length !== 1 ||
        ports[0]!.originalRunEndpointType !== (i === 0 ? 2 : 1) ||
        ports[0]!.originalRunSemanticFrameSha256 !==
          runFacts[i]!.physical.sourceFrameSha256s[`${run.nativeRunId}:4102`]
      );
    })
  )
    throw new Error(
      "Original finite landing port/reciprocal run endpoint binding differs",
    );
  const material = inspectOriginalNativeStairAssemblyMemberMaterial(
    sources.membership,
    sources.runs[0].foreign,
    proposal.nativeLandingId,
  );
  if (
    !material.completeOriginalMemberMaterialEnclosed ||
    !material.carrierMaterial.allOriginalCarrierMaterialEnclosed ||
    !material.localMaterial.allOriginalFaceDomainsEnclosed ||
    material.localMaterial.blockers.length > 0 ||
    material.support.blockers.length > 0 ||
    !material.support.completeOriginalStraightPlanarSourceCensus
  )
    throw new Error(
      "Original landing complete material/support is unavailable",
    );
  const caps = material.support.caps.filter(
    (c) => c.physicalFaceToken === proposal.originalLandingCapFaceToken,
  );
  if (
    caps.length !== 1 ||
    !qsame(caps[0]!.originalPhysicalPlaneHeightFeet, rational(joinHeight))
  )
    throw new Error(
      "Named original landing cap differs from exact nominal join plane",
    );
  const cap = caps[0]!,
    landingSupport: SteppedSupport = {
      id: `native:${proposal.nativeLandingId}:face:${cap.physicalFaceToken}`,
      nativeOwnerId: proposal.nativeLandingId,
      physicalFaceToken: cap.physicalFaceToken,
      sourceGeometryOwnerElementId: material.nativeDefinitionId,
      role: "landing",
      elevationFeet: cap.originalPhysicalPlaneHeightFeet,
      referencePartsFeet: cap.referenceEmbedding,
      innerPartsFeet: cap.guaranteedInnerPlanSupport,
      uncertaintyPartsFeet: cap.boundaryUncertainty,
      closedUncertaintyFeet: [],
      sourceOccurrenceFrameSha256: material.originalMemberFrameSha256,
    };
  const landingApproaches = proposal.runs.map((r) =>
    approach(r.landing, cap.originalPhysicalPlaneHeightFeet),
  );
  if (
    !landingApproaches[0]![0]!.every((v, i) =>
      qsame(v, landingApproaches[1]![0]![i]!),
    )
  )
    throw new Error(
      "Source landing approaches do not meet at one physical point",
    );
  const landingBoundary: SteppedSourceLandingBoundary = {
    kind: "source-landing",
    nativeLandingId: proposal.nativeLandingId,
    nativeDefinitionId: material.nativeDefinitionId,
    originalLandingSemanticFrameSha256:
      landing.originalChildSemanticFrameSha256,
    originalOccurrenceFrameSha256: material.originalMemberFrameSha256,
    originalCapFaceToken: cap.physicalFaceToken,
    originalNominalElevationFeet: joinHeight,
    requestedBoundaryPointFeet: landingApproaches[0]![0]!,
  };
  const pieces = runFacts.map((facts, i) => {
    const side = i as 0 | 1,
      request = proposal.runs[side],
      original = graph.terminals[side]!;
    if (
      facts.foreign.sourceCensusSha256 !==
        runFacts[0]!.foreign.sourceCensusSha256 ||
      facts.physical.nativeStairId !== membership.nativeStairId ||
      facts.physical.sourceSchemaSha256 !== membership.sourceSchemaSha256 ||
      facts.physical.sourceModelSha256 !== membership.sourceModelSha256
    )
      throw new Error("Assembly run/complete foreign census source differs");
    const attachmentDemand = {
      originalLogicalGraphNodeId: original.node.id,
      originalLogicalPointFeet: original.node.pointFeet,
      nativeFloorElementId: request.outer.nativeFloorElementId,
      originalTrimmedFloorFaceToken: request.outer.originalCapFaceToken,
      runTerminal: side ? ("upper" as const) : ("lower" as const),
      ...lateral(request.outer),
    };
    if (
      request.outer.supportScope !== undefined &&
      request.outer.supportScope !== "connected-demand"
    )
      throw new Error("Unsupported explicit assembly floor support scope");
    // A bounded demand is selected explicitly, never as a catch/retry after a
    // failed global winding. Complete original boundary/hole operands remain
    // in its certificate, while the unchanged kernel sees only the proved patch.
    let scoped =
      request.outer.supportScope === "connected-demand"
        ? inspectOriginalNativeStairScopedFloorAttachment(
            sources.runs[side].foreign,
            sources.runs[side].stair,
            request.nativeRunId,
            attachmentDemand,
            originalStairTerminalWalkingFootprint(
              request.outer.approachXYFeet,
              request.outer,
            ),
            sources.runs[side].riserPartition,
          )
        : undefined;
    if (scoped && !scoped.completeScopedAttachmentQualified) {
      const error = new Error(
        "Original connected outer walking footprint is not fully qualified",
      );
      Object.assign(error, { originalScopedFloorQualification: scoped });
      throw error;
    }
    const globalCap = scoped
        ? undefined
        : inspectOriginalNativeFloorLocalSupport(
            sources.runs[side].foreign,
            request.outer.nativeFloorElementId,
            request.outer.originalCapFaceToken,
          ),
      attachment =
        scoped ??
        inspectOriginalNativeStairFloorAttachment(
          sources.runs[side].foreign,
          sources.runs[side].stair,
          request.nativeRunId,
          attachmentDemand,
          sources.runs[side].riserPartition,
        ),
      outerBody = floorMaterial(sources.outerFloorMaterials[side]);
    if (
      !attachment.floorAndStairNamedLevelAgree ||
      !attachment.unchangedLogicalHeightMatchesOriginalRunReferencePlane ||
      !attachment.zeroOriginalServedLevelOffset ||
      attachment.originalNativeServedLevelId !== original.node.levelId ||
      outerBody.nativeFloorElementId !== request.outer.nativeFloorElementId ||
      outerBody.sourceGElementSha256 !==
        (scoped?.originalGElementFrameSha256 ??
          globalCap!.originalGElementFrameSha256)
    )
      throw new Error("Original outer served floor/body/attachment differs");
    const outerSupport: SteppedSupport = {
      id: `native:${request.outer.nativeFloorElementId}:face:${request.outer.originalCapFaceToken}`,
      nativeOwnerId: request.outer.nativeFloorElementId,
      physicalFaceToken: request.outer.originalCapFaceToken,
      role: "floor",
      nativeLevelId: original.node.levelId,
      elevationFeet:
        scoped?.cap.originalPhysicalTopElevationFeet ??
        globalCap!.originalPhysicalTopElevationFeet,
      referencePartsFeet:
        scoped?.completeConnectedWalkingFootprintFeet ??
        globalCap!.originalReferenceWindingPartsFeet,
      innerPartsFeet:
        scoped?.completeConnectedWalkingFootprintFeet ??
        globalCap!.guaranteedInnerSupportPartsFeet,
      uncertaintyPartsFeet: scoped
        ? []
        : globalCap!.retainedPositiveBoundaryUncertaintyPartsFeet,
      closedUncertaintyFeet: scoped
        ? []
        : globalCap!.retainedZeroAreaBoundarySegmentsFeet,
    };
    const outerApproach = approach(request.outer, outerSupport.elevationFeet),
      logical = original.node.pointFeet.map(rational) as Point3;
    const outerTerminal = {
        originalNodeId: original.node.id,
        originalLevelId: original.node.levelId,
        originalLogicalPointFeet: logical,
        physicalAttachmentPointFeet: outerApproach[0]!,
        logicalToPhysicalHeightDeltaFeet: subtract(
          outerSupport.elevationFeet,
          logical[2],
        ),
        floorSupportId: outerSupport.id,
        approachFeet: outerApproach,
        ...lateral(request.outer),
      },
      landingTerminal = {
        ...landingBoundary,
        physicalAttachmentPointFeet: landingApproaches[side]![0]!,
        nominalToPhysicalHeightDeltaFeet: subtract(
          landingSupport.elevationFeet,
          rational(joinHeight),
        ),
        boundarySupportId: landingSupport.id,
        approachFeet: landingApproaches[side]!,
        ...lateral(request.landing),
      };
    const terminals = (
        side
          ? [landingTerminal, outerTerminal]
          : [outerTerminal, landingTerminal]
      ) as PortableSteppedRunPieceReceipt["terminals"],
      boundaries = (
        side
          ? [landingBoundary, { kind: "original-graph", original }]
          : [{ kind: "original-graph", original }, landingBoundary]
      ) as PortableSteppedRunPieceDemand["terminals"],
      demand = {
        sourceModelSha256: originalDemand.sourceModelSha256,
        edge: graph.edge,
        terminals: boundaries,
      };
    const extra = [
      ...(facts.additionalForeignMaterials ?? []),
      {
        nativeElementId: proposal.nativeLandingId,
        sourceModelSha256: membership.sourceModelSha256,
        sourceSchemaSha256: membership.sourceSchemaSha256,
        sourceFrameSha256: material.originalMemberFrameSha256,
        sourceCensusSha256: facts.foreign.sourceCensusSha256,
        cells: material.completeOriginalMemberMaterialCells,
      },
      ...runFacts
        .filter((_, j) => j !== i)
        .map((peer) => {
          const primitives = inspectFiniteStairCarrierPrimitives(
            peer.physical.carrier,
            peer.physical.nativeDefinitionId,
          );
          if (!primitives.ok || peer.own.localizationBlockers.length > 0)
            throw new Error(
              "Other original assembly run has an unresolved material/primitive census",
            );
          return {
            nativeElementId: peer.physical.nativeRunId,
            sourceModelSha256: peer.physical.sourceModelSha256,
            sourceSchemaSha256: peer.physical.sourceSchemaSha256,
            sourceFrameSha256:
              peer.own.sourceFrameSha256s[`${peer.physical.nativeRunId}:2246`]!,
            sourceCensusSha256: facts.foreign.sourceCensusSha256,
            cells: [...peer.own.localizedCells, ...primitives.cells],
          };
        }),
    ];
    const assemble = () =>
      assembleUntrustedSteppedRunPieceOperands(
        {
          ...facts,
          additionalForeignMaterials: extra,
          floors: [outerBody],
          terminalSupports: side
            ? [landingSupport, outerSupport]
            : [outerSupport, landingSupport],
          terminals,
          servedLevelIds: [
            graph.terminals[0]!.node.levelId,
            graph.terminals[1]!.node.levelId,
          ],
        },
        request,
        demand,
      );
    let operands = assemble();
    let outerTransferFloorDemandFeet: NativeRationalParts = [];
    if (scoped) {
      outerTransferFloorDemandFeet =
        deriveUntrustedAssemblyOuterTransferFloorGap(
          operands.index,
          operands.receipt,
          side,
        );
      if (outerTransferFloorDemandFeet.length > 0) {
        const expanded = inspectOriginalNativeStairScopedFloorAttachment(
          sources.runs[side].foreign,
          sources.runs[side].stair,
          request.nativeRunId,
          attachmentDemand,
          nativeRationalOverlay(
            "union",
            scoped.completeConnectedWalkingFootprintFeet,
            outerTransferFloorDemandFeet,
          ),
          sources.runs[side].riserPartition,
        );
        if (
          !expanded.completeScopedAttachmentQualified ||
          expanded.sourceModelSha256 !== membership.sourceModelSha256 ||
          expanded.sourceSchemaSha256 !== membership.sourceSchemaSha256 ||
          expanded.sourceCensusSha256 !== facts.foreign.sourceCensusSha256 ||
          expanded.nativeStairId !== membership.nativeStairId ||
          expanded.nativeRunId !== request.nativeRunId ||
          expanded.nativeFloorElementId !==
            request.outer.nativeFloorElementId ||
          expanded.originalCapFaceToken !==
            request.outer.originalCapFaceToken ||
          expanded.originalGraphNodeId !== original.node.id ||
          !expanded.originalLogicalPointFeet.every((q, j) =>
            qsame(q, logical[j]!),
          ) ||
          !expanded.originalPhysicalAttachmentPointFeet.every((q, j) =>
            qsame(q, outerApproach[0]![j]!),
          ) ||
          !expanded.floorAndStairNamedLevelAgree ||
          !expanded.unchangedLogicalHeightMatchesOriginalRunReferencePlane ||
          !expanded.zeroOriginalServedLevelOffset ||
          expanded.originalNativeServedLevelId !== original.node.levelId ||
          expanded.originalGElementFrameSha256 !==
            outerBody.sourceGElementSha256 ||
          !qsame(
            expanded.cap.originalPhysicalTopElevationFeet,
            outerSupport.elevationFeet,
          )
        )
          throw Object.assign(
            new Error(
              "Original expanded assembly outer floor demand is not fully qualified",
            ),
            { originalScopedFloorQualification: expanded },
          );
        scoped = expanded;
        outerSupport.referencePartsFeet =
          expanded.completeConnectedWalkingFootprintFeet;
        outerSupport.innerPartsFeet =
          expanded.completeConnectedWalkingFootprintFeet;
        operands = assemble();
      }
    }
    return {
      ...operands,
      scopedFloorQualification: scoped,
      outerTransferFloorDemandFeet,
      demand,
      forward: replayUntrustedSteppedRunPiece(
        operands.index,
        operands.receipt,
        demand,
      ),
      reverse: replayUntrustedSteppedRunPiece(
        operands.index,
        operands.receipt,
        demand,
        { direction: "reverse" },
      ),
    };
  });
  const joined = pieces[0]!.forward.physicalPointsFeet.at(-1),
    next = pieces[1]!.forward.physicalPointsFeet[0];
  const continuous =
    !!joined && !!next && joined.every((q, i) => qsame(q, next[i]!));
  return {
    nativeStairId: membership.nativeStairId,
    originalEdgeId: graph.edge.id,
    sourceModelSha256: membership.sourceModelSha256,
    completeOriginalMembership: membership,
    originalNamedLandingPorts: namedPorts,
    pieces,
    physicalJoinContinuous: continuous,
    mathematicalAssemblyReplayPassed:
      continuous &&
      pieces.every(
        (p) =>
          p.forward.mathematicalReplayPassed &&
          p.reverse.mathematicalReplayPassed,
      ),
    originalSourceAuthorityGranted: false as const,
    runtimeIntegrationApproved: false as const,
    routeApproved: false as const,
  };
}
