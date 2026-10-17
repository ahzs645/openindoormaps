/** Independent candidate scope: saved JSON is a locator, never source authority.
 * Admission reissues private original-RVT capabilities and reruns the original
 * finalizer. This module is a QA entry point, not part of the visitor runtime. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  assertPortableSteppedGraphBindingPreserved,
  createCurrentSteppedStairGraphBinding,
} from "../../app/indoor-project/native-stepped-stair-v2-graph-binding";
import {
  inspectNativeSteppedStairV2Binding,
  nativeSteppedStairV2Digest,
} from "../../app/indoor-project/native-stepped-stair-v2";
import { replayPortableSteppedStairV2 } from "../../app/indoor-project/native-stepped-stair-v2-kernel";
import { withRoutingCalculation } from "../../app/indoor-project/routing-cache";
import {
  initializeReviewedSourceSteppedStairV2Proofs,
  type SourceSteppedStairV2Review,
} from "./source-stepped-stair-v2-review";
import { readOriginalSteppedStairV2SourceProof } from "./source-stepped-stair-v2-producer";
import { finalizeSourceSteppedStairV2Dataset } from "./finalize-source-stepped-stair-v2";

const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const parse = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const json = (value: unknown) => JSON.stringify(value);
export type SteppedStairSourceSummary = {
  path: string;
  portableReviewPath: string;
  reviewSha256: string;
  receiptPath: string;
  receiptSha256: string;
  algorithms: { path: string; sha256: string }[];
  originalEdgeIds: string[];
  physicalGuardsWaived: false;
  sourceRoomsChanged: false;
  stepFreeApproved: false;
};
type Initialization = ReturnType<
  typeof initializeReviewedSourceSteppedStairV2Proofs
>["receipt"];
type Application = Awaited<
  ReturnType<typeof finalizeSourceSteppedStairV2Dataset>
>["receipt"];
export type SteppedStairSavedReplay = {
  initialization: Initialization;
  applications: Application[];
};

/** Artifact integrity only. A passing result cannot enable an edge: the full
 * verifier below must still reconstruct every original-source positive fact. */
export function checkedSteppedStairReviewArtifacts(options: {
  summary: SteppedStairSourceSummary;
  reviewBytes: Uint8Array;
  portableReviewBytes: Uint8Array;
  replayBytes: Uint8Array;
  sourceModelSha256: string;
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
  originalDatasetSha256: string;
}) {
  const { summary } = options;
  assert.equal(summary.physicalGuardsWaived, false);
  assert.equal(summary.sourceRoomsChanged, false);
  assert.equal(summary.stepFreeApproved, false);
  assert.equal(hash(options.reviewBytes), summary.reviewSha256,
    "External stepped review bytes differ from the regeneration summary");
  assert.deepEqual(options.portableReviewBytes, options.reviewBytes,
    "Portable stepped review must preserve the exact external file bytes");
  assert.equal(hash(options.replayBytes), summary.receiptSha256,
    "Saved stepped replay bytes differ from the regeneration summary");
  const review = parse(options.reviewBytes) as SourceSteppedStairV2Review,
    saved = parse(options.replayBytes) as SteppedStairSavedReplay;
  assert.equal(review.format, "openindoormaps-original-stepped-stair-v2-review-v1");
  for (const key of ["sourceModelSha256", "sourceRoomsSha256", "nativeCacheSha256", "originalDatasetSha256"] as const) {
    assert.match(review[key], /^[a-f0-9]{64}$/);
    assert.equal(review[key], options[key], `Stepped review has foreign ${key}`);
  }
  assert(Array.isArray(review.requests) && review.requests.length > 0 && review.requests.length <= 28);
  const ids = review.requests.map(request => request.originalEdgeId);
  assert(ids.every(id => typeof id === "string" && id.length > 0 && id.length < 2000));
  assert.equal(new Set(ids).size, ids.length, "Duplicate reviewed stair identity");
  assert.deepEqual(summary.originalEdgeIds, ids, "Summary reordered or widened the original stair review");
  assert.equal(saved.initialization?.format, "original-source-stepped-stair-v2-review-initialized-v1");
  assert.equal(saved.initialization.reviewSha256, hash(json(review)));
  for (const key of ["sourceModelSha256", "sourceRoomsSha256", "nativeCacheSha256", "originalDatasetSha256"] as const)
    assert.equal(saved.initialization[key], options[key]);
  assert.equal(saved.initialization.runtimeIntegrationApproved, false);
  assert.equal(saved.initialization.sourceRoomsChanged, false);
  assert.equal(saved.initialization.stepFreeApproved, false);
  assert(Array.isArray(saved.applications));
  assert.deepEqual(saved.applications.map(row => row.edgeId), ids,
    "Finalizer applications must cover the exact ordered reviewed edge set");
  for (const application of saved.applications) {
    assert.equal(application.format, "original-source-stepped-stair-v2-finalization");
    assert.equal(application.version, 1);
    for (const key of ["originalNodesLevelsRoomsAndCellsPreserved", "noNewConnectorAnchors",
      "currentOriginalPhysicalLateralApproachesPassed", "strictDatasetValidationPassed"] as const)
      assert.equal(application[key], true, `Saved finalizer lacks ${key}`);
    assert.equal(application.sourceStepFreeApproval, false);
    assert.equal(application.actualCalculatorRoutesPassed, false,
      "Source finalization cannot claim actual calculator tests");
    assert.equal(application.previousHeldEdge?.id, application.edgeId);
    assert.equal(application.previousHeldEdge.enabled, false);
    assert.equal(application.previousHeldEdge.accessible, "no");
    assert.equal(application.previousHeldEdge.nativeSourceStair, undefined);
    assert.equal(application.previousHeldEdge.nativeSteppedStairV2, undefined);
    assert.equal(application.finalizedEdge?.id, application.edgeId);
    assert.equal(application.finalizedEdge.enabled, true);
    assert.equal(application.finalizedEdge.accessible, "no");
    assert.equal(application.circulationGeometryKeyBefore, application.circulationGeometryKeyAfter);
    assert(Number.isSafeInteger(application.portableMovementsChecked) && application.portableMovementsChecked > 0);
  }
  return { review, saved, originalEdgeIds: ids, originalSourceAuthorityGranted: false as const };
}

/** Identity/inventory preflight, also deliberately without source authority.
 * No unreviewed held stair, new endpoint or orphan physical index is admitted. */
export function checkedSteppedStairCandidateInventory(
  original: IndoorDataset,
  candidate: IndoorDataset,
  reviewedIds: string[],
) {
  assert.equal(new Set(reviewedIds).size, reviewedIds.length);
  assert.equal(original.source.modelSha256, candidate.source.modelSha256);
  assert.equal(original.edges.filter(edge => edge.nativeSteppedStairV2).length, 0,
    "This bounded review expects the original pre-v2 graph");
  assert.equal(original.nativeSteppedStairV2SourceIndices?.length ?? 0, 0);
  const requested = new Set(reviewedIds),
    indices = candidate.nativeSteppedStairV2SourceIndices ?? [];
  assert.equal(indices.length, requested.size, "Source review must exactly cover the shared index append");
  assert.equal(new Set(indices.map(row => row.id)).size, indices.length);
  const claimedIndices = new Set<string>();
  for (const id of reviewedIds) {
    const before = original.edges.filter(edge => edge.id === id),
      after = candidate.edges.filter(edge => edge.id === id);
    assert.equal(before.length, 1, "Reviewed stair must exist uniquely in the original graph");
    assert.equal(after.length, 1, "Reviewed stair must exist uniquely in the candidate graph");
    assert.equal(before[0]!.enabled, false);
    assert.equal(after[0]!.enabled, true);
    assert.equal(after[0]!.accessible, "no");
    assert(after[0]!.nativeSteppedStairV2, "An enabled reviewed stair needs its distinct source variant");
    assert.equal(after[0]!.nativeSourceStair, undefined);
    assertPortableSteppedGraphBindingPreserved(
      createCurrentSteppedStairGraphBinding(original, id),
      createCurrentSteppedStairGraphBinding(candidate, id),
    );
    const indexId = after[0]!.nativeSteppedStairV2!.sourceIndexId;
    assert(!claimedIndices.has(indexId), "One reviewed stair cannot borrow another stair's source index");
    claimedIndices.add(indexId);
    assert.equal(indices.filter(row => row.id === indexId).length, 1);
  }
  for (const old of original.edges)
    if (!old.enabled && ["stairs", "local-steps"].includes(old.kind) && !requested.has(old.id)) {
      const matches = candidate.edges.filter(edge => edge.id === old.id);
      assert.equal(matches.length, 1, "Lost an unrelated original held stair");
      assert.equal(matches[0]!.enabled, false, "An unreviewed original held stair was enabled");
      assert.equal(matches[0]!.nativeSteppedStairV2, undefined);
    }
  for (const edge of candidate.edges)
    if (edge.nativeSteppedStairV2)
      assert(requested.has(edge.id), "Unreviewed stepped proof was added");
  assert.deepEqual([...claimedIndices].sort(), indices.map(row => row.id).sort());
  return { originalEdgeIds: [...reviewedIds], originalSourceAuthorityGranted: false as const };
}

/** Reconstruct only post-finalizer packaging operations already performed by
 * the driver: derived mapping append and hydrated→archive room checksum. Exact
 * saved field digests must then match before invoking the original finalizer. */
function originalFinalizerInput(candidate: IndoorDataset, saved: SteppedStairSavedReplay,
  currentSourceRooms: Parameters<typeof finalizeSourceSteppedStairV2Dataset>[2]["sourceRooms"]) {
  const input = { ...candidate, source: { ...candidate.source, roomsSha256: hash(json(currentSourceRooms)) },
    edges: candidate.edges.map(edge => saved.applications.find(row => row.edgeId === edge.id)?.previousHeldEdge ?? edge),
  };
  delete input.nativeExploreMapping;
  delete input.nativeSteppedStairV2SourceIndices;
  const first = saved.applications[0]!;
  if (Object.hasOwn(first.inputFieldSha256, "nativeSteppedStairV2SourceIndices"))
    input.nativeSteppedStairV2SourceIndices = [];
  // JSON transport drops own properties with undefined values. Reconstruct
  // only an exact undefined digest; no concrete field may be manufactured.
  for (const [key, digest] of Object.entries(first.inputFieldSha256))
    if (!Object.hasOwn(input, key)) {
      assert.equal(digest, nativeSteppedStairV2Digest(undefined),
        `Missing concrete pre-finalizer field ${key}`);
      (input as unknown as Record<string, unknown>)[key] = undefined;
    }
  return input;
}
function assertExactInputFields(data: IndoorDataset, application: Application) {
  assert.deepEqual(Object.keys(data).sort(), Object.keys(application.inputFieldSha256).sort(),
    "Finalizer input fields differ from the independently reconstructed candidate");
  for (const [key, digest] of Object.entries(application.inputFieldSha256))
    assert.equal(nativeSteppedStairV2Digest((data as unknown as Record<string, unknown>)[key]), digest,
      `Pre-finalizer operand changed: ${key}`);
}

export async function verifySourceSteppedStairCandidateScope(options: {
  summary: SteppedStairSourceSummary;
  reviewBytes: Uint8Array;
  portableReviewBytes: Uint8Array;
  replayBytes: Uint8Array;
  originalRVTBytes: Uint8Array;
  originalDatasetBytes: Uint8Array;
  originalSourceRoomsBytes: Uint8Array;
  sourceModelSha256: string;
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
  originalCanonicalDataset: IndoorDataset;
  candidateMaster: IndoorDataset;
  candidateVisitor: IndoorDataset;
  currentSourceRooms: Parameters<typeof finalizeSourceSteppedStairV2Dataset>[2]["sourceRooms"];
  reviewedDrawingReferences: Parameters<typeof initializeReviewedSourceSteppedStairV2Proofs>[0]["reviewedDrawingReferences"];
  log?: (message: unknown) => void;
}) {
  const checked = checkedSteppedStairReviewArtifacts({ ...options,
      originalDatasetSha256: hash(options.originalDatasetBytes) }),
    { review, saved, originalEdgeIds } = checked;
  checkedSteppedStairCandidateInventory(options.originalCanonicalDataset, options.candidateMaster, originalEdgeIds);
  checkedSteppedStairCandidateInventory(options.originalCanonicalDataset, options.candidateVisitor, originalEdgeIds);
  assert.equal(hash(options.originalRVTBytes), review.sourceModelSha256);
  assert.equal(hash(options.originalSourceRoomsBytes), review.sourceRoomsSha256);
  const originalGraph = parse(options.originalDatasetBytes) as IndoorDataset;
  for (const id of originalEdgeIds)
    assertPortableSteppedGraphBindingPreserved(
      createCurrentSteppedStairGraphBinding(options.originalCanonicalDataset, id),
      createCurrentSteppedStairGraphBinding(originalGraph, id),
    );
  options.log?.({ stage: "independent-original-rvt-stair-source-reissuance-begins", originalEdgeIds });
  const initialized = initializeReviewedSourceSteppedStairV2Proofs({
    originalRVTBytes: options.originalRVTBytes,
    originalDatasetBytes: options.originalDatasetBytes,
    originalSourceRoomsBytes: options.originalSourceRoomsBytes,
    sourceModelSha256: options.sourceModelSha256,
    sourceRoomsSha256: options.sourceRoomsSha256,
    nativeCacheSha256: options.nativeCacheSha256,
    reviewedDrawingReferences: options.reviewedDrawingReferences,
    review,
    log: options.log,
  });
  assert.deepEqual(initialized.receipt, saved.initialization,
    "Saved source initialization differs from freshly reissued original-RVT capabilities");
  let replayed = originalFinalizerInput(options.candidateMaster, saved, options.currentSourceRooms);
  for (const [index, proof] of initialized.proofs.entries()) {
    const source = readOriginalSteppedStairV2SourceProof(proof), application = saved.applications[index]!;
    assert.equal(proof.originalEdgeId, application.edgeId);
    assert.deepEqual(source.bindings, application.source);
    assert.deepEqual(options.candidateMaster.nativeSteppedStairV2SourceIndices!.find(row => row.id === source.sourceIndex.id),
      source.sourceIndex, "Candidate shared physical data differs from actual source reissuance");
    assertExactInputFields(replayed, application);
    const result = await finalizeSourceSteppedStairV2Dataset(replayed, proof, { sourceRooms: options.currentSourceRooms });
    assert.deepEqual(result.receipt, application,
      "Original-source finalizer did not reproduce the complete recorded one-edge preservation receipt");
    replayed = result.dataset;
  }
  const exportedComparable = { ...options.candidateMaster,
    source: { ...options.candidateMaster.source, roomsSha256: hash(json(options.currentSourceRooms)) } };
  delete exportedComparable.nativeExploreMapping;
  assert.equal(json(replayed), json(exportedComparable),
    "Source-finalized result differs from the candidate beyond the two exact packaging operations");
  const runtime = originalEdgeIds.map(id => {
    const rows = [options.candidateMaster, options.candidateVisitor].map((dataset, scope) => {
      const data = scope === 1 ? routeWorkerDataset(dataset) : dataset,
        edge = data.edges.find(row => row.id === id)!;
      return withRoutingCalculation(data, () => {
        const result = inspectNativeSteppedStairV2Binding(data, edge),
          reverse = replayPortableSteppedStairV2(result.physical, result.receipt,
            edge.nativeSteppedStairV2!.originalGraphBinding, result.currentGraphBinding, { direction: "reverse" });
        assert.equal(result.replay.mathematicalReplayPassed, true);
        assert.equal(reverse.mathematicalReplayPassed, true, reverse.issues.join("; "));
        assert.equal(reverse.checkedMovements, result.replay.checkedMovements);
        return { scope: scope === 0 ? "master" : "visitor-route-worker-projection",
          forwardMovements: result.replay.checkedMovements, reverseMovements: reverse.checkedMovements };
      });
    });
    return { edgeId: id, runtime: rows, stepFreeApproved: false };
  });
  return {
    format: "openindoormaps-independently-reissued-stepped-stair-candidate-scope-v1",
    sourceModelSha256: review.sourceModelSha256,
    originalSourceRoomsSha256: review.sourceRoomsSha256,
    originalDatasetSha256: review.originalDatasetSha256,
    nativeCacheSha256: review.nativeCacheSha256,
    externalReviewFileSha256: hash(options.reviewBytes),
    savedFinalizerFileSha256: hash(options.replayBytes),
    initializedSourceReceiptSha256: hash(json(initialized.receipt)),
    sourceCapabilitiesReissuedFromOriginalRvt: true,
    exactOriginalFinalizerReplayed: true,
    allOriginalTerminalIdentitiesAndPermissionsPreserved: true,
    allOtherOriginalHeldStairsRemainDisabled: true,
    candidateSharedIndicesEqualReissuedOriginalSource: true,
    runtime,
    originalEdgeIds,
    actualCalculatorRoutesPassed: false,
    stepFreeApproved: false,
    freshFullCandidateAndActualCalculatorTestsRequired: true,
  };
}
