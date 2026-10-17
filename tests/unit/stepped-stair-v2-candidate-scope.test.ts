import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { originalGraph } from "../fixtures/stepped-stair-v2";
import {
  checkedSteppedStairReviewArtifacts,
  checkedSteppedStairCandidateInventory,
  verifySourceSteppedStairCandidateScope,
  type SteppedStairSourceSummary,
  type SteppedStairSavedReplay,
} from "../../scripts/indoor/stepped-stair-v2-candidate-scope";

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex"),
  bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
/** Deliberately only an identity and receipt-envelope fixture. It contains no
 * actual RVT, physical inventory, private capability or route approval. */
function fixture() {
  const binding = originalGraph(),
    original = { source: { modelSha256: binding.sourceModelSha256 },
      nodes: binding.terminals.map(row => row.node), records: binding.terminals.map(row => row.record),
      nativeLevels: binding.terminals.map(row => row.level),
      edges: [{ ...binding.edge, enabled: false, pointsFeet: binding.terminals.map(row => row.node.pointFeet) }],
    } as unknown as IndoorDataset,
    candidate = structuredClone(original), id = original.edges[0]!.id,
    roomsBytes = bytes({ format: "reviter-room-annotations", version: 1 }),
    originalDatasetBytes = bytes(original),
    proof = { sourceIndexId: "source-index" } as NonNullable<IndoorDataset["edges"][number]["nativeSteppedStairV2"]>;
  candidate.edges[0]!.enabled = true;
  candidate.edges[0]!.nativeSteppedStairV2 = proof;
  candidate.nativeSteppedStairV2SourceIndices = [{ id: "source-index", physical: {} }];
  const review = {
      format: "openindoormaps-original-stepped-stair-v2-review-v1",
      sourceModelSha256: original.source.modelSha256,
      sourceRoomsSha256: hash(roomsBytes), nativeCacheSha256: "c".repeat(64),
      originalDatasetSha256: hash(originalDatasetBytes), requests: [{ originalEdgeId: id }],
    },
    application = {
      format: "original-source-stepped-stair-v2-finalization", version: 1, edgeId: id,
      previousHeldEdge: original.edges[0], finalizedEdge: candidate.edges[0],
      circulationGeometryKeyBefore: "geometry", circulationGeometryKeyAfter: "geometry",
      portableMovementsChecked: 3, originalNodesLevelsRoomsAndCellsPreserved: true,
      noNewConnectorAnchors: true, currentOriginalPhysicalLateralApproachesPassed: true,
      strictDatasetValidationPassed: true, sourceStepFreeApproval: false,
      actualCalculatorRoutesPassed: false,
    },
    saved = {
      initialization: { format: "original-source-stepped-stair-v2-review-initialized-v1",
        reviewSha256: hash(JSON.stringify(review)), sourceModelSha256: review.sourceModelSha256,
        sourceRoomsSha256: review.sourceRoomsSha256, nativeCacheSha256: review.nativeCacheSha256,
        originalDatasetSha256: review.originalDatasetSha256, runtimeIntegrationApproved: false,
        sourceRoomsChanged: false, stepFreeApproved: false },
      applications: [application],
    } as unknown as SteppedStairSavedReplay,
    summary: SteppedStairSourceSummary = {
      path: "/review.json", portableReviewPath: "/portable.json", receiptPath: "/replay.json",
      reviewSha256: hash(bytes(review)), receiptSha256: hash(bytes(saved)),
      originalEdgeIds: [id], algorithms: [], physicalGuardsWaived: false,
      sourceRoomsChanged: false, stepFreeApproved: false,
    };
  return { original, candidate, review, saved, summary, roomsBytes, originalDatasetBytes,
    arguments: () => ({ summary, reviewBytes: bytes(review), portableReviewBytes: bytes(review),
      replayBytes: bytes(saved), sourceModelSha256: original.source.modelSha256,
      sourceRoomsSha256: review.sourceRoomsSha256, nativeCacheSha256: review.nativeCacheSha256,
      originalDatasetSha256: review.originalDatasetSha256 }) };
}

test("exact review and finalizer file bindings remain a preflight with no original-source authority", () => {
  const f = fixture(), result = checkedSteppedStairReviewArtifacts(f.arguments());
  assert.deepEqual(result.originalEdgeIds, ["held:10"]);
  assert.equal(result.originalSourceAuthorityGranted, false);
  assert.equal(checkedSteppedStairCandidateInventory(f.original, f.candidate, ["held:10"])
    .originalSourceAuthorityGranted, false);
});

test("portable review preserves actual file bytes and raw review/replay hashes", () => {
  const f = fixture(), args = f.arguments();
  assert.throws(() => checkedSteppedStairReviewArtifacts({ ...args,
    portableReviewBytes: new TextEncoder().encode(JSON.stringify(f.review, null, 2)) }), /exact external/);
  assert.throws(() => checkedSteppedStairReviewArtifacts({ ...args,
    reviewBytes: bytes({ ...f.review, requests: [] }) }), /External stepped review bytes/);
  assert.throws(() => checkedSteppedStairReviewArtifacts({ ...args,
    replayBytes: bytes({ ...f.saved, applications: [] }) }), /Saved stepped replay bytes/);
});

test("self-rehashed reviews cannot move RVT, source-room, graph or conversion bindings", () => {
  for (const key of ["sourceModelSha256", "sourceRoomsSha256", "nativeCacheSha256", "originalDatasetSha256"] as const) {
    const f = fixture(), expected = f.arguments();
    f.review[key] = "d".repeat(64);
    f.summary.reviewSha256 = hash(bytes(f.review));
    assert.throws(() => checkedSteppedStairReviewArtifacts({ ...expected, summary: f.summary,
      reviewBytes: bytes(f.review), portableReviewBytes: bytes(f.review) }), /foreign/);
  }
});

test("source receipt cannot claim step-free, calculator approval, waived guards or absent preservation gates", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.summary.physicalGuardsWaived = true as never; },
    (f: ReturnType<typeof fixture>) => { f.summary.stepFreeApproved = true as never; },
    (f: ReturnType<typeof fixture>) => { f.saved.initialization.runtimeIntegrationApproved = true as never; },
    (f: ReturnType<typeof fixture>) => { f.saved.applications[0]!.sourceStepFreeApproval = true as never; },
    (f: ReturnType<typeof fixture>) => { f.saved.applications[0]!.actualCalculatorRoutesPassed = true as never; },
    (f: ReturnType<typeof fixture>) => { f.saved.applications[0]!.noNewConnectorAnchors = false as never; },
    (f: ReturnType<typeof fixture>) => { f.saved.applications[0]!.strictDatasetValidationPassed = false as never; },
    (f: ReturnType<typeof fixture>) => { f.saved.applications[0]!.currentOriginalPhysicalLateralApproachesPassed = false as never; },
    (f: ReturnType<typeof fixture>) => { f.saved.applications[0]!.portableMovementsChecked = 0; },
  ]) {
    const f = fixture(); change(f); f.summary.receiptSha256 = hash(bytes(f.saved));
    assert.throws(() => checkedSteppedStairReviewArtifacts(f.arguments()));
  }
});

test("reviewed requests, summary and actual finalizer applications must have one exact ordered identity set", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.review.requests.push({ ...f.review.requests[0]! }); },
    (f: ReturnType<typeof fixture>) => { f.summary.originalEdgeIds.push("unreviewed"); },
    (f: ReturnType<typeof fixture>) => { f.saved.applications[0]!.edgeId = "foreign"; },
    (f: ReturnType<typeof fixture>) => { f.saved.applications = []; },
  ]) {
    const f = fixture(); change(f);
    f.saved.initialization.reviewSha256 = hash(JSON.stringify(f.review));
    f.summary.reviewSha256 = hash(bytes(f.review)); f.summary.receiptSha256 = hash(bytes(f.saved));
    assert.throws(() => checkedSteppedStairReviewArtifacts(f.arguments()));
  }
});

test("near-coincident coordinates, original node fields, level elevations and room access stay exact", () => {
  for (const change of [
    (d: IndoorDataset) => { d.nodes[0]!.pointFeet[0] += 1e-12; },
    (d: IndoorDataset) => { d.nodes[0]!.pointFeet[2] += 1e-12; },
    (d: IndoorDataset) => { d.nodes[0]!.kind = "portal"; },
    (d: IndoorDataset) => { d.nodes[0]!.roomKey = "upper"; },
    (d: IndoorDataset) => { d.nativeLevels[0]!.elevationFeet += 1e-12; },
    (d: IndoorDataset) => { d.records[0]!.access = "public"; },
    (d: IndoorDataset) => { d.records[0]!.building = "02"; },
    (d: IndoorDataset) => { d.records[0]!.walkable = false; },
  ]) {
    const f = fixture(); change(f.candidate);
    assert.throws(() => checkedSteppedStairCandidateInventory(f.original, f.candidate, ["held:10"]));
  }
});

test("stair accessibility, original owners, direction and physical identities cannot be widened", () => {
  for (const change of [
    (d: IndoorDataset) => { d.edges[0]!.accessible = "yes"; },
    (d: IndoorDataset) => { d.edges[0]!.nativeElementId = 20; },
    (d: IndoorDataset) => { d.edges[0]!.roomKeys.reverse(); },
    (d: IndoorDataset) => { d.edges[0]!.direction = "from-to"; },
    (d: IndoorDataset) => { d.edges[0]!.from = "new-anchor"; },
    (d: IndoorDataset) => { d.edges[0]!.kind = "elevator"; },
  ]) {
    const f = fixture(); change(f.candidate);
    assert.throws(() => checkedSteppedStairCandidateInventory(f.original, f.candidate, ["held:10"]));
  }
});

test("unreviewed original held stairs stay disabled and missing, duplicate or orphan indices refuse", () => {
  for (const change of [
    (d: IndoorDataset) => { d.edges[1]!.enabled = true; },
    (d: IndoorDataset) => { d.edges.pop(); },
    (d: IndoorDataset) => { d.edges[1]!.nativeSteppedStairV2 = d.edges[0]!.nativeSteppedStairV2; },
    (d: IndoorDataset) => { d.nativeSteppedStairV2SourceIndices = []; },
    (d: IndoorDataset) => { d.nativeSteppedStairV2SourceIndices!.push({ id: "unreviewed", physical: {} }); },
    (d: IndoorDataset) => { d.nativeSteppedStairV2SourceIndices![0]!.id = "foreign-index"; },
  ]) {
    const f = fixture(), other = { ...structuredClone(f.original.edges[0]!), id: "other-held" };
    f.original.edges.push(other); f.candidate.edges.push(structuredClone(other)); change(f.candidate);
    assert.throws(() => checkedSteppedStairCandidateInventory(f.original, f.candidate, ["held:10"]));
  }
});

test("a self-consistent receipt envelope and identity graph cannot replace actual original RVT bytes", async () => {
  const f = fixture();
  await assert.rejects(verifySourceSteppedStairCandidateScope({ ...f.arguments(),
    originalRVTBytes: new Uint8Array([1, 2, 3]), originalDatasetBytes: f.originalDatasetBytes,
    originalSourceRoomsBytes: f.roomsBytes, originalCanonicalDataset: f.original,
    candidateMaster: f.candidate, candidateVisitor: f.candidate, currentSourceRooms: {},
    reviewedDrawingReferences: undefined }), /Expected values to be strictly equal/);
});
