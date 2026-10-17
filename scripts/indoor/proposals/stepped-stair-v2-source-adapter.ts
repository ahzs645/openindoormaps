/** Original-source extraction boundary for the separately reviewed v2 variant.
 * The public plain-fact assembler is explicitly untrusted. Only the actual
 * source entry point dereferences issued RVT/foreign/body handles, reads the
 * original graph demand, rebuilds operands, then invokes the portable kernel.
 * Neither entry point grants route/access/step-free authority. */
import { Rational, rational, type NativeRationalParts } from "../../../../reviter/lib/reviter/native-rational-overlay.ts";
import {
  readOriginalNativeStairPhysicalSource, inspectOriginalNativeStairPhysicalInventory,
  type OriginalNativeStairPhysicalContext,
} from "../../../../reviter/lib/reviter/native-source-stair-physical-inventory.ts";
import { inspectOriginalNativeStairSupportEnvelopes } from "../../../../reviter/lib/reviter/native-source-stair-support-envelopes.ts";
import { originalNativePlacedStairMaterialEnvelope, type OriginalNativePlacedStairEnvelope } from "../../../../reviter/lib/reviter/native-source-stair-placed-envelope.ts";
import { originalNativeForeignEnvelopeFacts, type OriginalNativeForeignEnvelopeCensus } from "../../../../reviter/lib/reviter/native-source-foreign-envelope-census.ts";
import { originalNativeFloorObstacleDomainFacts, type OriginalNativeFloorObstacleDomains } from "../../../../reviter/lib/reviter/native-source-floor-obstacle-domains.ts";
import { originalNativeSlabSupportEnvelope, type OriginalNativePlanarSlabEnvelope } from "../../../../reviter/lib/reviter/native-source-planar-slab-envelope.ts";
import { inspectOriginalNativeFloorLocalSupport } from "../../../../reviter/lib/reviter/native-source-floor-local-support.ts";
import { inspectOriginalNativeStairFloorAttachment } from "../../../../reviter/lib/reviter/native-source-stair-floor-attachment.ts";
import { originalPlacedTrimObstacleFacts, type OriginalPlacedTrimObstacleCertificate } from "../../../../reviter/lib/reviter/native-source-placed-trim-obstacles.ts";
import { originalRectangularMullionSourceEnvelopeFact, type OriginalRectangularMullionSourceEnvelope } from "../../../../reviter/lib/reviter/native-source-rectangular-mullion-envelope.ts";
import {originalSimpleSystemPanelSourceEnvelopeFact,type OriginalSimpleSystemPanelSourceEnvelope} from "../../../../reviter/lib/reviter/native-source-simple-system-panel.ts";
import { inspectOriginalSteppedStairGraphDemand, type OriginalSteppedStairGraphDemand } from "./original-stepped-stair-graph-demand.ts";
import { replayPortableSteppedStairV2, type PortableSteppedSourceIndex, type PortableSteppedReceipt, type SteppedMaterialCell, type SteppedPhysicalBody, type Point3 } from "./stepped-stair-v2-kernel.ts";
import { inspectFiniteStairCarrierPrimitives } from "./finite-stair-carrier-primitives.ts";
import {indexExactOccurrenceMaterialRefinements} from "./stepped-stair-v2-occurrence-material.ts";
import {inspectOriginalNativeStairCapSideTopologies,inspectOriginalNativeFloorCapSideTopology} from "../../../../reviter/lib/reviter/native-source-cap-side-adjacency.ts";
import type {PortableCapSideTopology} from "./stepped-stair-v2-footing-boundary.ts";

type FloorMaterials =
  | { kind: "floor-domains"; certificate: OriginalNativeFloorObstacleDomains }
  | { kind: "planar-slab"; certificate: OriginalNativePlanarSlabEnvelope };
type FloorFacts = {
  sourceModelSha256: string; sourceSchemaSha256: string; nativeFloorElementId: number;
  sourceGElementSha256: string; cells: { originalFaceTokens: number[]; minimumElevationFeet: Rational; maximumElevationFeet: Rational;
    partsFeet: NativeRationalParts; closedSegmentsFeet: [Rational, Rational][][];role?:"cap-bounded-core"|"original-boundary-domain" }[];
};
export type SteppedSourceRouteProposal = {
  nativeRunId: number;
  terminals: [
    { nativeFloorElementId: number; originalCapFaceToken: number; lateralAxis: "x" | "y"; approachXYFeet: [number, number][] },
    { nativeFloorElementId: number; originalCapFaceToken: number; lateralAxis: "x" | "y"; approachXYFeet: [number, number][] },
  ];
  stations: { typedIndex: number; pointFeet: [number, number]; lateralAxis: "x" | "y" }[];
};
type Extracted = {
  physical: ReturnType<typeof readOriginalNativeStairPhysicalSource>;
  inventory: ReturnType<typeof inspectOriginalNativeStairPhysicalInventory>;
  supports: ReturnType<typeof inspectOriginalNativeStairSupportEnvelopes>;
  own: ReturnType<typeof originalNativePlacedStairMaterialEnvelope>;
  foreign: ReturnType<typeof originalNativeForeignEnvelopeFacts>;
  floors: [FloorFacts, FloorFacts];
  floorCaps: [ReturnType<typeof inspectOriginalNativeFloorLocalSupport>, ReturnType<typeof inspectOriginalNativeFloorLocalSupport>];
  additionalForeignMaterials?: { nativeElementId: number; sourceModelSha256: string; sourceSchemaSha256: string;
    sourceFrameSha256: string; originalCategoryId?: number; sourceCensusSha256?: string; cells: FloorFacts["cells"] }[];
  capSideTopologies?:PortableCapSideTopology[];
};
const cmp = (a: Rational, b: Rational) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
function finiteXY(value: [number, number]) {
  return Array.isArray(value) && value.length === 2 && [0, 1].every((i) => typeof value[i] === "number" && Number.isFinite(value[i]));
}

/** Plain report snapshots can exercise runtime mathematics, but CANNOT mint
 * original-source authority or an admitted edge. Actual source import below
 * reconstructs these operands independently through the opaque readers. */
export function assembleUntrustedSteppedStairV2Operands(
  extracted: Extracted, proposal: SteppedSourceRouteProposal, originalDemand: OriginalSteppedStairGraphDemand,
) {
  const graph = inspectOriginalSteppedStairGraphDemand(originalDemand), { physical, inventory, supports: nativeCaps, own, foreign } = extracted;
  const model = originalDemand.sourceModelSha256, schema = physical.sourceSchemaSha256;
  if ([physical, own, foreign, ...extracted.floorCaps, ...extracted.floors].some((s) => s.sourceModelSha256 !== model || s.sourceSchemaSha256 !== schema) ||
      own.nativeRunId !== proposal.nativeRunId || physical.nativeRunId !== proposal.nativeRunId ||
      graph.edge.nativeElementId !== physical.nativeStairId || own.localizationBlockers.length ||
      nativeCaps.blockers.length || !nativeCaps.completeOriginalStraightPlanarSourceCensus ||
      !inventory.completeOriginalSourceFaceCensus || !inventory.treadHistoryBindingComplete ||
      inventory.unsupportedPhysicalFaceTokens.length || inventory.unsupportedPhysicalTreadEdgeTokens.length)
    throw Error("Original source ownership/census/material/support operands are incomplete or disagree");
  const roleByFace = new Map(inventory.treads.map((t) => [t.physicalFaceToken, t]));
  const supportRows: PortableSteppedSourceIndex["supports"] = nativeCaps.caps.map((cap) => {
    const role = roleByFace.get(cap.physicalFaceToken);
    return { id: `native:${proposal.nativeRunId}:face:${cap.physicalFaceToken}`, nativeOwnerId: proposal.nativeRunId,
      physicalFaceToken: cap.physicalFaceToken, role: role ? "tread" as const : "auxiliary" as const,
      ...(role ? { typedIndex: role.typedIndex } : {}), elevationFeet: cap.originalPhysicalPlaneHeightFeet,
      referencePartsFeet: cap.referenceEmbedding, innerPartsFeet: cap.guaranteedInnerPlanSupport,
      uncertaintyPartsFeet: cap.boundaryUncertainty, closedUncertaintyFeet: [] };
  });
  for (const side of [0, 1] as const) {
    const cap = extracted.floorCaps[side], body = extracted.floors[side], request = proposal.terminals[side], node = graph.terminals[side]!.node;
    if (cap.nativeFloorElementId !== request.nativeFloorElementId || cap.originalFaceToken !== request.originalCapFaceToken ||
        body.nativeFloorElementId !== request.nativeFloorElementId || cap.originalAssociatedNativeLevelId !== node.levelId ||
        cap.originalGElementFrameSha256 !== body.sourceGElementSha256)
      throw Error("Original named terminal floor/face/body/served level disagree");
    supportRows.push({ id: `native:${request.nativeFloorElementId}:face:${cap.originalFaceToken}`, nativeOwnerId: request.nativeFloorElementId,
      physicalFaceToken: cap.originalFaceToken, role: "floor", nativeLevelId: cap.originalAssociatedNativeLevelId,
      elevationFeet: cap.originalPhysicalTopElevationFeet, referencePartsFeet: cap.originalReferenceWindingPartsFeet,
      innerPartsFeet: cap.guaranteedInnerSupportPartsFeet, uncertaintyPartsFeet: cap.retainedPositiveBoundaryUncertaintyPartsFeet,
      closedUncertaintyFeet: cap.retainedZeroAreaBoundarySegmentsFeet });
  }
  for(const support of supportRows){const topology=extracted.capSideTopologies?.find(t=>t.nativeOwnerElementId===support.nativeOwnerId&&t.capFaceToken===support.physicalFaceToken);
    if(topology){support.sourceComponentFaceTokens=[...topology.componentFaceTokens];support.sourceOccurrenceFrameSha256=topology.sourceOccurrenceFrameSha256;}}
  const refinementKey=(owner:number,frame:string)=>`${owner}:${frame}`;
  const refinements = new Map<string, { sourceFrame: string; originalCategoryId?:number; cells: SteppedMaterialCell[] }>();
  const ownFrame = own.sourceFrameSha256s[`${proposal.nativeRunId}:2246`];
  if (!ownFrame || ownFrame !== physical.sourceFrameSha256s[`${proposal.nativeRunId}:2246`]) throw Error("Original own body source frame differs");
  const bindCells = (owner: number, frame: string, rows: FloorFacts["cells"]): SteppedMaterialCell[] => rows.map((cell, i) => {
    const component=extracted.capSideTopologies?.find(t=>t.nativeOwnerElementId===owner&&t.sourceOccurrenceFrameSha256===frame&&
      cell.originalFaceTokens.length&&cell.originalFaceTokens.every(token=>t.componentFaceTokens.includes(token)));
    return {
      id: `native:${owner}:${frame}:cell:${i}`, nativeOwnerId: owner, geometryKind: cell.originalFaceTokens.length?"native-face-cells":"complete-source-envelope", originalFaceTokens: cell.originalFaceTokens,
      minimumElevationFeet: cell.minimumElevationFeet, maximumElevationFeet: cell.maximumElevationFeet,
      partsFeet: cell.partsFeet, closedSegmentsFeet: cell.closedSegmentsFeet,
      ...(cell.role?{originalCellRole:cell.role}:{}),...(component?{sourceComponentFaceTokens:[...component.componentFaceTokens]}:{}),
    };});
  refinements.set(refinementKey(proposal.nativeRunId,ownFrame), { sourceFrame: ownFrame, cells: bindCells(proposal.nativeRunId, ownFrame, own.localizedCells) });
  for (const floor of extracted.floors) {
    const key=refinementKey(floor.nativeFloorElementId,floor.sourceGElementSha256);
    if (refinements.has(key)) throw Error("Duplicated source body refinement");
    refinements.set(key, { sourceFrame: floor.sourceGElementSha256, cells: bindCells(floor.nativeFloorElementId, floor.sourceGElementSha256, floor.cells) });
  }
  const checkedForeign=indexExactOccurrenceMaterialRefinements(foreign.rows,(extracted.additionalForeignMaterials??[]).map(material=>({...material,
    cells:bindCells(material.nativeElementId,material.sourceFrameSha256,material.cells)})),
    {sourceModelSha256:model,sourceSchemaSha256:schema,sourceCensusSha256:foreign.sourceCensusSha256});
  for (const foreignMaterial of checkedForeign.values()) {
    const key=refinementKey(foreignMaterial.nativeElementId,foreignMaterial.sourceFrameSha256);
    if (foreignMaterial.sourceModelSha256 !== model || foreignMaterial.sourceSchemaSha256 !== schema ||
        foreignMaterial.sourceCensusSha256!==undefined&&foreignMaterial.sourceCensusSha256!==foreign.sourceCensusSha256 ||
        refinements.has(key)) throw Error("Additional original material source/owner/census differs");
    refinements.set(key, { sourceFrame: foreignMaterial.sourceFrameSha256,originalCategoryId:foreignMaterial.originalCategoryId,
      cells: foreignMaterial.cells });
  }
  const cells: SteppedMaterialCell[] = [], bodies: SteppedPhysicalBody[] = [], seenRefinements = new Set<string>();
  for (const [ordinal, row] of foreign.rows.entries()) {
    const key = `original:${row.nativeElementId}:${row.sourceFrameSha256}:${ordinal}`, exactOccurrence=refinementKey(row.nativeElementId,row.sourceFrameSha256), refinement = refinements.get(exactOccurrence);
    if (refinement) {
      if (seenRefinements.has(exactOccurrence) || row.sourceFrameSha256 !== refinement.sourceFrame ||
          refinement.originalCategoryId!==undefined&&row.categoryId!==refinement.originalCategoryId)
        throw Error("Original occurrence/frame does not permit complete source body refinement");
      seenRefinements.add(exactOccurrence); cells.push(...refinement.cells);
      bodies.push({ key, nativeOwnerId: row.nativeElementId, representation: { kind: "cells", cellIds: refinement.cells.map((c) => c.id) } });
    } else if (!row.boundsFeet || row.blocker) {
      bodies.push({ key, nativeOwnerId: row.nativeElementId, representation: { kind: "unknown", reason: row.blocker ?? "Original source bounds unavailable" } });
    } else {
      const b = row.boundsFeet;
      if (!["x", "y", "z"].every((axis) => { const a = axis as "x" | "y" | "z";
        return Number.isFinite(b.min[a]) && Number.isFinite(b.max[a]) && b.min[a] <= b.max[a]; })) throw Error("Invalid actual source bounding envelope");
      const x0 = rational(b.min.x), x1 = rational(b.max.x), y0 = rational(b.min.y), y1 = rational(b.max.y),
        planar = cmp(x0, x1) !== 0 && cmp(y0, y1) !== 0,
        cell: SteppedMaterialCell = { id: `${key}:envelope`, nativeOwnerId: row.nativeElementId, geometryKind: "complete-source-envelope",
          originalFaceTokens: [], minimumElevationFeet: rational(b.min.z), maximumElevationFeet: rational(b.max.z),
          partsFeet: planar ? [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]] : [],
          closedSegmentsFeet: planar ? [] : [[[x0, y0], [x1, y1]]] };
      cells.push(cell); bodies.push({ key, nativeOwnerId: row.nativeElementId, representation: { kind: "cells", cellIds: [cell.id] } });
    }
  }
  if (seenRefinements.size !== refinements.size) throw Error("A source body refinement is absent from the original complete census");
  // Boundedness comes from the complete carrier role/consumer graph, not the
  // GLine/GPoint name. Keep exact closed line/point envelopes. Any unsupported
  // body/profile consumer remains unresolved; nothing is silently omitted.
  const finitePrimitives = physical.carrier ? inspectFiniteStairCarrierPrimitives(physical.carrier, physical.nativeDefinitionId) : undefined;
  if (finitePrimitives?.ok && finitePrimitives.cells.length !== own.nonSurfaceOriginalPrimitives.length)
    throw Error("Own source primitive census differs from placed material ledger");
  for (const [ordinal, primitive] of own.nonSurfaceOriginalPrimitives.entries()) {
    const key = `original-carrier-primitive:${proposal.nativeRunId}:${primitive.sourceReplayIndex}:${ordinal}`,
      finite = finitePrimitives?.ok && finitePrimitives.cells.find((c) => c.id === `native:${proposal.nativeRunId}:primitive:${primitive.sourceReplayIndex}`);
    if (finite) { cells.push(finite); bodies.push({ key, nativeOwnerId: proposal.nativeRunId, representation: { kind: "cells", cellIds: [finite.id] } }); }
    else bodies.push({ key, nativeOwnerId: proposal.nativeRunId, representation: { kind: "unknown",
      reason: `Original ${primitive.sourceKind} lacks a complete finite body/profile consumer census` } });
  }
  const index: PortableSteppedSourceIndex = { version: 2, kind: "original-native-stepped-source-operands", sourceModelSha256: model,
    sourceSchemaSha256: schema, sourceCensusScopeFeet:{minimum:[rational(foreign.scopeBoundsFeet.min.x),rational(foreign.scopeBoundsFeet.min.y),rational(foreign.scopeBoundsFeet.min.z)],maximum:[rational(foreign.scopeBoundsFeet.max.x),rational(foreign.scopeBoundsFeet.max.y),rational(foreign.scopeBoundsFeet.max.z)]}, nativeStairId: physical.nativeStairId, nativeRunId: proposal.nativeRunId,
    nativeDefinitionId:physical.nativeDefinitionId,
    run: physical.run, servedLevelIds: [graph.terminals[0]!.node.levelId, graph.terminals[1]!.node.levelId],
    supports: supportRows, requiredPhysicalBodyKeys: bodies.map((b) => b.key), physicalBodies: bodies, cells,
    ...(extracted.capSideTopologies?{capSideTopologies:extracted.capSideTopologies}:{}),
    ...(finitePrimitives?.ok ? { carrierPrimitiveCensus: { nativeDefinitionId: physical.nativeDefinitionId, carrier: physical.carrier } } : {}) };
  const terminals = ([0, 1] as const).map((side) => {
    const request = proposal.terminals[side], node = graph.terminals[side]!.node, floor = supportRows.find((s) => s.role === "floor" && s.nativeOwnerId === request.nativeFloorElementId)!;
    if (request.approachXYFeet.length < 2 || request.approachXYFeet.some((xy) => !finiteXY(xy)) ||
        request.approachXYFeet[0]![0] !== node.pointFeet[0] || request.approachXYFeet[0]![1] !== node.pointFeet[1])
      throw Error("Proposed terminal approach does not start at its exact original graph demand");
    const logical = node.pointFeet.map(rational) as Point3, logicalZ = logical[2], physicalZ = floor.elevationFeet;
    return { originalNodeId: node.id, originalLevelId: node.levelId, originalLogicalPointFeet: logical,
      physicalAttachmentPointFeet: [logical[0], logical[1], physicalZ] as Point3,
      logicalToPhysicalHeightDeltaFeet: new Rational(physicalZ.n * logicalZ.d - logicalZ.n * physicalZ.d, physicalZ.d * logicalZ.d),
      floorSupportId: floor.id, lateralAxis: request.lateralAxis,
      approachFeet: request.approachXYFeet.map((xy): Point3 => [rational(xy[0]), rational(xy[1]), floor.elevationFeet]) };
  }) as PortableSteppedReceipt["terminals"];
  const stations = proposal.stations.map((station) => {
    const found = supportRows.filter((s) => s.role === "tread" && s.typedIndex === station.typedIndex);
    if (found.length !== 1 || !finiteXY(station.pointFeet)) throw Error("Proposed station has no unique original physical tread role");
    return { typedIndex: station.typedIndex, supportId: found[0]!.id, lateralAxis: station.lateralAxis,
      pointFeet: [rational(station.pointFeet[0]), rational(station.pointFeet[1]), found[0]!.elevationFeet] as Point3 };
  });
  const receipt: PortableSteppedReceipt = { version: 2, kind: "original-native-stepped-support", sourceModelSha256: model,
    nativeStairId: physical.nativeStairId, nativeRunId: proposal.nativeRunId, originalEdgeId: graph.edge.id,
    widthFeet: 2, headroomFeet: 6, terminals, stations };
  const scope = foreign.scopeBoundsFeet, points = [...terminals.flatMap((t) => t.approachFeet), ...stations.map((s) => s.pointFeet)];
  // A conservative two-foot coordinate margin covers standing squares and
  // every checked rational lateral normal; six feet covers the full head band.
  for (const point of points) for (const [axis, name] of [[0, "x"], [1, "y"], [2, "z"]] as const) {
    const margin = axis === 2 ? 0 : 2, upper = axis === 2 ? 6 : 2;
    const low = rational(scope.min[name]), high = rational(scope.max[name]),
      minimum = new Rational(low.n + BigInt(margin) * low.d, low.d),
      maximum = new Rational(high.n - BigInt(upper) * high.d, high.d);
    if (cmp(point[axis], minimum) < 0 || cmp(point[axis], maximum) > 0)
      throw Error("Physical demand leaves the complete original source census scope");
  }
  return { index, receipt, originalNonSurfaceLedger: own.nonSurfaceOriginalPrimitives,
    delegatedOriginalContainers: foreign.delegatedOriginalContainers,
    sourceCensusSha256: foreign.sourceCensusSha256, originalSourceAuthorityGranted: false as const, routeApproved: false as const };
}

/** Actual RVT-issued handles ONLY. Floor/run/census snapshots passed as forged
 * handles fail in the original readers. Caller-supplied geometry never enters
 * a source body refinement. The returned plain facts still need independent
 * source importer reconstruction and all normal routing/access checks. */
export function extractOriginalSteppedStairV2Candidate(
  sources: { stair: OriginalNativeStairPhysicalContext; foreign: OriginalNativeForeignEnvelopeCensus;
    own: OriginalNativePlacedStairEnvelope; terminalMaterials: [FloorMaterials, FloorMaterials];
    additionalForeignMaterials?: OriginalPlacedTrimObstacleCertificate[];
    rectangularMullions?: OriginalRectangularMullionSourceEnvelope[];
    simpleSystemPanels?:OriginalSimpleSystemPanelSourceEnvelope[] },
  originalDemand: OriginalSteppedStairGraphDemand, proposal: SteppedSourceRouteProposal,
) {
  const graph = inspectOriginalSteppedStairGraphDemand(originalDemand), physical = readOriginalNativeStairPhysicalSource(sources.stair, proposal.nativeRunId),
    inventory = inspectOriginalNativeStairPhysicalInventory(sources.stair, proposal.nativeRunId),
    supports = inspectOriginalNativeStairSupportEnvelopes(sources.stair, proposal.nativeRunId),
    own = originalNativePlacedStairMaterialEnvelope(sources.own), foreign = originalNativeForeignEnvelopeFacts(sources.foreign);
  const floorCaps = ([0, 1] as const).map((side) => {
    const terminal = proposal.terminals[side], node = graph.terminals[side]!.node;
    const attachment = inspectOriginalNativeStairFloorAttachment(sources.foreign, sources.stair, proposal.nativeRunId, {
      originalLogicalGraphNodeId: node.id, originalLogicalPointFeet: node.pointFeet, nativeFloorElementId: terminal.nativeFloorElementId,
      originalTrimmedFloorFaceToken: terminal.originalCapFaceToken, lateralAxis: terminal.lateralAxis, runTerminal: side ? "upper" : "lower",
    });
    if (attachment.originalGraphNodeId !== node.id || attachment.originalNativeServedLevelId !== node.levelId ||
        !attachment.floorAndStairNamedLevelAgree || !attachment.unchangedLogicalHeightMatchesOriginalNominalRunHeight || !attachment.zeroOriginalServedLevelOffset)
      throw Error("Original stair/floor/source graph attachment operands disagree");
    return inspectOriginalNativeFloorLocalSupport(sources.foreign, terminal.nativeFloorElementId, terminal.originalCapFaceToken);
  }) as Extracted["floorCaps"];
  const floors = sources.terminalMaterials.map((entry): FloorFacts => {
    if (entry.kind === "floor-domains") {
      const source = originalNativeFloorObstacleDomainFacts(entry.certificate);
      return { sourceModelSha256: source.sourceModelSha256, sourceSchemaSha256: source.sourceSchemaSha256,
        nativeFloorElementId: source.nativeFloorElementId, sourceGElementSha256: source.originalGElementFrameSha256, cells: source.cells };
    }
    const source = originalNativeSlabSupportEnvelope(entry.certificate);
    return { sourceModelSha256: source.sourceModelSha256, sourceSchemaSha256: source.sourceSchemaSha256,
      nativeFloorElementId: source.nativeSlabElementId, sourceGElementSha256: source.sourceFrameSha256,
      cells: source.completeOriginalMaterialCellsFeet };
  }) as [FloorFacts, FloorFacts];
  const additionalForeignMaterials:NonNullable<Extracted["additionalForeignMaterials"]> = (sources.additionalForeignMaterials ?? []).map((certificate) => {
    const original = originalPlacedTrimObstacleFacts(certificate);
    return { nativeElementId: certificate.nativeElementId, sourceModelSha256: original.sourceFacts.sourceModelSha256,
      sourceSchemaSha256: original.sourceFacts.sourceSchemaSha256, sourceFrameSha256: original.sourceFacts.frameSha256s.occurrence!, originalCategoryId:original.sourceFacts.nativeCategoryId,
      cells: original.components.map((component) => ({ originalFaceTokens: component.physicalFaceTokens,
        minimumElevationFeet: component.minimumElevationFeet, maximumElevationFeet: component.maximumElevationFeet,
        partsFeet: component.outerPlanEnvelope, closedSegmentsFeet: [] })) };
  });
  for(const certificate of sources.rectangularMullions??[]){
    const fact=originalRectangularMullionSourceEnvelopeFact(sources.foreign,certificate),
      occurrence=fact.originalFrameHashes.filter(f=>f.role==="occurrence-graphics"&&f.nativeElementId===fact.nativeElementId&&f.marker===2246);
    if(occurrence.length!==1||fact.sourceCensusSha256!==foreign.sourceCensusSha256)throw Error("Original mullion occurrence/census is ambiguous");
    const b=fact.boundsFeet;
    if(!["x","y","z"].every(axis=>{const k=axis as "x"|"y"|"z";return Number.isFinite(b.min[k])&&Number.isFinite(b.max[k])&&b.min[k]<b.max[k];}))throw Error("Original mullion enclosure is empty or invalid");
    const x0=rational(b.min.x),x1=rational(b.max.x),y0=rational(b.min.y),y1=rational(b.max.y);
    additionalForeignMaterials.push({nativeElementId:fact.nativeElementId,sourceModelSha256:fact.sourceModelSha256,sourceSchemaSha256:fact.sourceSchemaSha256,
      sourceFrameSha256:occurrence[0]!.sha256,originalCategoryId:-2000171,sourceCensusSha256:fact.sourceCensusSha256,
      cells:[{originalFaceTokens:[],minimumElevationFeet:rational(b.min.z),maximumElevationFeet:rational(b.max.z),partsFeet:[[[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]]],closedSegmentsFeet:[]}]});
  }
  for(const certificate of sources.simpleSystemPanels??[]){
    const fact=originalSimpleSystemPanelSourceEnvelopeFact(sources.foreign,certificate);
    if(fact.sourceCensusSha256!==foreign.sourceCensusSha256||fact.nativeInstanceId!==certificate.nativeInstanceId||
      !fact.conservativeMaterialBoxesFeet.length)throw Error("Original system panel occurrence/census/material differs");
    const cells:FloorFacts["cells"]=fact.conservativeMaterialBoxesFeet.map(box=>{
      const lo=box.minimumFeet,hi=box.maximumFeet;
      if(![0,1,2].every(i=>lo[i] instanceof Rational&&hi[i] instanceof Rational&&lo[i]!.d>0n&&hi[i]!.d>0n&&cmp(lo[i]!,hi[i]!)<=0))
        throw Error("Original system panel enclosure is invalid");
      const planar=cmp(lo[0],hi[0])!==0&&cmp(lo[1],hi[1])!==0;
      return{originalFaceTokens:[],minimumElevationFeet:lo[2],maximumElevationFeet:hi[2],
        partsFeet:planar?[[[[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]]]]:[],
        closedSegmentsFeet:planar?[]:[[[lo[0],lo[1]],[hi[0],hi[1]]]]};
    });
    additionalForeignMaterials.push({nativeElementId:fact.nativeInstanceId,sourceModelSha256:fact.sourceModelSha256,sourceSchemaSha256:fact.sourceSchemaSha256,
      sourceCensusSha256:fact.sourceCensusSha256,sourceFrameSha256:fact.originalOccurrenceGElementFrameSha256,originalCategoryId:-2000170,cells});
  }
  const ownOccurrence=own.sourceFrameSha256s[`${proposal.nativeRunId}:2246`],ownDefinition=own.sourceFrameSha256s[`${physical.nativeDefinitionId}:2246`];
  const capSideTopologies:PortableCapSideTopology[]=inspectOriginalNativeStairCapSideTopologies(sources.stair,proposal.nativeRunId,inventory.treads.map(t=>t.physicalFaceToken)).map(topology=>{
    if(topology.nativeOwnerElementId!==physical.nativeDefinitionId||topology.nativeRunId!==proposal.nativeRunId||
      topology.sourceFrameSha256s[`${proposal.nativeRunId}:2246`]!==ownOccurrence||topology.sourceFrameSha256s[`${physical.nativeDefinitionId}:2246`]!==ownDefinition)
      throw Error("Original placed/definition component topology binding differs");
    return{...topology,nativeOwnerElementId:proposal.nativeRunId,sourceGeometryOwnerElementId:topology.nativeOwnerElementId,
      sourceOccurrenceFrameSha256:ownOccurrence!,sourceGeometryFrameSha256:ownDefinition!};
  });
  for(const side of [0,1]as const){
    // A complete planar slab certificate supplies one whole closed source
    // topology. Other scoped floor domains grant no extra side permission.
    if(sources.terminalMaterials[side].kind!=="planar-slab")continue;
    const floor=floors[side],topology=inspectOriginalNativeFloorCapSideTopology(sources.foreign,floor.nativeFloorElementId,proposal.terminals[side].originalCapFaceToken);
    if(topology.sourceFrameSha256s.geometry!==floor.sourceGElementSha256||topology.nativeOwnerElementId!==floor.nativeFloorElementId)
      throw Error("Original floor component topology binding differs");
    capSideTopologies.push({...topology,sourceGeometryOwnerElementId:topology.nativeOwnerElementId,
      sourceOccurrenceFrameSha256:floor.sourceGElementSha256,sourceGeometryFrameSha256:floor.sourceGElementSha256});
  }
  const operands = assembleUntrustedSteppedStairV2Operands({ physical, inventory, supports, own, foreign, floors, floorCaps,
    additionalForeignMaterials,capSideTopologies }, proposal, originalDemand);
  return { ...operands, extractionScope: "actual-issued-original-source-contexts" as const,
    replay: replayPortableSteppedStairV2(operands.index, operands.receipt, originalDemand),
    runtimeIntegrationApproved: false as const };
}
