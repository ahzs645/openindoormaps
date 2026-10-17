/** Independently replay the qualified/declined post-cell decision from genuine
 * RVT capabilities. Historical successful receipts remain historical only. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  readIndoorProject,
  type ProjectRooms,
} from "../../app/indoor-project/package";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import {
  checkedPostcompileArchive,
  prepareHeldPostcompileArchive,
  postcompileHash,
  postcompileJsonHash,
  assertExactSteppedOutcomeInventory,
} from "./postcompile-stepped-stair-artifacts";
import {
  replayPostcompileSteppedStairs,
  type PostcompileSteppedReplayReceipt,
} from "./postcompile-stepped-stair-replay";
import {
  assertHistoricalSteppedAlgorithmBindings,
  verifyPostcompileStrengtheningReview,
  type PostcompileStrengtheningReview,
} from "./postcompile-stepped-stair-source-review";
import type { SourceSteppedStairV2Review } from "./source-stepped-stair-v2-review";
import {
  checkedSteppedStairReviewArtifacts,
  type SteppedStairSavedReplay,
  type SteppedStairSourceSummary,
} from "./stepped-stair-v2-candidate-scope";
import { masterVisitorPhysicalAuthoritySha256 } from "./pathway-candidate-audit";
import type { RouteCase } from "./pathway-candidate-audit";

export type PostcompileSteppedSummary = {
  path: string;
  sha256: string;
  requestedEdgeIds: string[];
  qualifiedEdgeIds: string[];
  declinedEdgeIds: string[];
};
export type PostcompileSteppedCandidateReview = {
  format: "openindoormaps-postcompile-stepped-candidate-v1";
  historicalRegeneration: { path: string; sha256: string };
  historicalMaster: { path: string; sha256: string };
  historicalFinalizer: { path: string; sha256: string };
  strengtheningReview: { path: string; sha256: string };
  heldImportTransform: { path: string; sha256: string };
  replay: { path: string; sha256: string };
  requestedEdgeIds: string[];
  qualifiedEdgeIds: string[];
  declinedEdgeIds: string[];
  master: { path: string; bytes: number; sha256: string; indoorSha256: string };
  viewer: {
    path: string;
    bytes: number;
    sha256: string;
    routingProjectionSha256: string;
  };
  currentEngineSha256: string;
  sourcePreservation: { path: string; bytes: number; sha256: string }[];
  originalCompilerRerunClaimed: false;
  strictHeldMasterAndFinalMasterVisitorImportsPassed: true;
  originalSourceReissued: true;
  actualCalculatorRoutesPassed: false;
  publisherReceiptChanged: false;
};
export function createPostcompileRegenerationReport(
  historical: Record<string, unknown>,
  audit: PostcompileSteppedCandidateReview,
  auditPath: string,
  auditSha256: string,
  replay: PostcompileSteppedReplayReceipt,
) {
  return {
    ...historical,
    master: audit.master,
    viewer: audit.viewer,
    historicalCompilerRegeneration: audit.historicalRegeneration,
    postcompileSteppedStairReview: {
      path: auditPath,
      sha256: auditSha256,
      requestedEdgeIds: audit.requestedEdgeIds,
      qualifiedEdgeIds: audit.qualifiedEdgeIds,
      declinedEdgeIds: audit.declinedEdgeIds,
    },
    originalCompilerRerunClaimed: false,
    sourceSteppedStairV2ReviewHistoricalOnly: true,
    sourcePhysicalSourceIndexDigests: replay.applications.map((row) => ({
      edgeId: row.edgeId,
      sha256: row.sourceBindings.physicalWireSha256,
    })),
  };
}
export function postcompileDeclinedRouteCases(
  data: IndoorDataset,
  ids: string[],
): RouteCase[] {
  return ids.flatMap((id) => {
    const edge = data.edges.find((row) => row.id === id);
    assert(edge && !edge.enabled && !edge.nativeSteppedStairV2);
    const owners = [edge.from, edge.to].map((nodeId) =>
      data.records.find(
        (record) =>
          record.key === data.nodes.find((node) => node.id === nodeId)?.roomKey,
      ),
    );
    assert(
      owners.every((record) => record?.arrivalNodeId),
      `Declined stair lacks a selectable original endpoint pair: ${id}`,
    );
    return (["public", "accessible"] as const).flatMap((mode) =>
      [false, true].map((reverse) => ({
        name: `postcompile-declined:${id}:${reverse ? "reverse" : "forward"}:${mode}`,
        start: owners[reverse ? 1 : 0]!.key,
        end: owners[reverse ? 0 : 1]!.key,
        mode,
        forbiddenEdgeIds: [id],
      })),
    );
  });
}
async function bound<T>(entry: { path: string; sha256: string }) {
  const bytes = await fs.readFile(entry.path);
  assert.equal(
    postcompileHash(bytes),
    entry.sha256,
    `Postcompile evidence changed: ${entry.path}`,
  );
  return { bytes, value: JSON.parse(bytes.toString()) as T };
}
export function assertPostcompileCandidateOutcomes(
  data: IndoorDataset,
  historical: IndoorDataset,
  saved: SteppedStairSavedReplay,
  requested: string[],
  qualified: string[],
  declined: string[],
) {
  assertExactSteppedOutcomeInventory(requested, qualified, declined);
  assert.deepEqual(
    data.edges
      .filter((e) => e.nativeSteppedStairV2)
      .map((e) => e.id)
      .sort(),
    [...qualified].sort(),
    "Unexpected candidate qualified stair inventory",
  );
  const indices = data.nativeSteppedStairV2SourceIndices ?? [];
  assert.equal(indices.length, qualified.length);
  for (const id of declined) {
    const before = saved.applications.find((a) => a.edgeId === id);
    assert(before);
    const edges = data.edges.filter((e) => e.id === id);
    assert.equal(edges.length, 1);
    assert.deepEqual(
      edges[0],
      before.previousHeldEdge,
      "Declined candidate did not retain the exact original held edge",
    );
    assert(
      !indices.some(
        (row) =>
          row.id === before.finalizedEdge.nativeSteppedStairV2!.sourceIndexId,
      ),
    );
  }
  const requestedSet = new Set(requested),
    byId = new Map(data.edges.map((e) => [e.id, e]));
  assert.equal(data.edges.length, historical.edges.length);
  for (const edge of historical.edges)
    if (!requestedSet.has(edge.id))
      assert.deepEqual(
        byId.get(edge.id),
        edge,
        "Unrelated compiled edge changed",
      );
  const usedSourceIds = new Set<string>();
  for (const id of qualified) {
    const edge = byId.get(id);
    assert(
      edge?.nativeSteppedStairV2 && edge.enabled && edge.accessible === "no",
    );
    assert(
      !usedSourceIds.has(edge.nativeSteppedStairV2.sourceIndexId),
      "Qualified stairs cannot share one source index",
    );
    usedSourceIds.add(edge.nativeSteppedStairV2.sourceIndexId);
    assert.equal(
      indices.filter(
        (row) => row.id === edge.nativeSteppedStairV2!.sourceIndexId,
      ).length,
      1,
    );
  }
  assert.deepEqual(
    [...usedSourceIds].sort(),
    indices.map((row) => row.id).sort(),
    "Orphan or duplicate qualified source index",
  );
}

export async function verifyPostcompileSteppedCandidateScope(options: {
  summary: PostcompileSteppedSummary;
  candidateMasterPath: string;
  candidateVisitorPath: string;
  candidateMaster: IndoorDataset;
  candidateVisitor: IndoorDataset;
  currentSourceRooms: ProjectRooms;
  currentRegeneration?: Record<string, unknown>;
  log?: (message: unknown) => void;
}) {
  const checked = await bound<PostcompileSteppedCandidateReview>(
      options.summary,
    ),
    audit = checked.value;
  assert.equal(audit.format, "openindoormaps-postcompile-stepped-candidate-v1");
  assert.equal(audit.originalCompilerRerunClaimed, false);
  assert.equal(audit.actualCalculatorRoutesPassed, false);
  assert.equal(audit.publisherReceiptChanged, false);
  assert.equal(audit.originalSourceReissued, true);
  assert.equal(audit.strictHeldMasterAndFinalMasterVisitorImportsPassed, true);
  for (const key of [
    "requestedEdgeIds",
    "qualifiedEdgeIds",
    "declinedEdgeIds",
  ] as const)
    assert.deepEqual(audit[key], options.summary[key]);
  assertExactSteppedOutcomeInventory(
    audit.requestedEdgeIds,
    audit.qualifiedEdgeIds,
    audit.declinedEdgeIds,
  );
  await initializeNativeExactGeosOverlay();
  const strictCandidates = [];
  for (const [file, descriptor] of [
    [options.candidateMasterPath, audit.master],
    [options.candidateVisitorPath, audit.viewer],
  ] as const) {
    const bytes = new Uint8Array(await fs.readFile(file));
    assert.equal(bytes.length, descriptor.bytes);
    assert.equal(postcompileHash(bytes), descriptor.sha256);
    strictCandidates.push(await readIndoorProject(bytes));
  }
  const candidateMaster = strictCandidates[0]!.dataset,
    candidateVisitor = strictCandidates[1]!.dataset;
  assert.equal(
    postcompileJsonHash(routeWorkerDataset(candidateVisitor)),
    audit.viewer.routingProjectionSha256,
    "Recorded current worker projection differs from the strict visitor",
  );
  assert.equal(
    masterVisitorPhysicalAuthoritySha256(candidateMaster),
    masterVisitorPhysicalAuthoritySha256(options.candidateMaster),
  );
  assert.equal(
    masterVisitorPhysicalAuthoritySha256(candidateVisitor),
    masterVisitorPhysicalAuthoritySha256(options.candidateVisitor),
  );
  const historical = await bound<
      Record<string, unknown> & {
        nativeCache: string;
        nativeCacheSha256: string;
        input: string;
        sourceSteppedStairV2Review: SteppedStairSourceSummary;
        master: { sha256: string };
      }
    >(audit.historicalRegeneration),
    review = await bound<PostcompileStrengtheningReview>(
      audit.strengtheningReview,
    );
  await verifyPostcompileStrengtheningReview(review.value);
  assert.equal(audit.currentEngineSha256, review.value.currentEngineSha256);
  assert.equal(historical.value.master.sha256, audit.historicalMaster.sha256);
  const sourceSummary = historical.value.sourceSteppedStairV2Review;
  const historicalFreeze = JSON.parse(
    await fs.readFile(review.value.historicalCompilerClosure.path, "utf8"),
  );
  assertHistoricalSteppedAlgorithmBindings(
    sourceSummary.algorithms,
    historicalFreeze.files,
  );
  assert.equal(sourceSummary.receiptPath, audit.historicalFinalizer.path);
  assert.equal(sourceSummary.receiptSha256, audit.historicalFinalizer.sha256);
  const saved = await bound<SteppedStairSavedReplay>(audit.historicalFinalizer),
    sourceReview = await bound<SourceSteppedStairV2Review>({
      path: sourceSummary.path,
      sha256: sourceSummary.reviewSha256,
    });
  const portable = await fs.readFile(sourceSummary.portableReviewPath);
  checkedSteppedStairReviewArtifacts({
    summary: sourceSummary,
    reviewBytes: sourceReview.bytes,
    portableReviewBytes: portable,
    replayBytes: saved.bytes,
    sourceModelSha256: sourceReview.value.sourceModelSha256,
    sourceRoomsSha256: sourceReview.value.sourceRoomsSha256,
    nativeCacheSha256: sourceReview.value.nativeCacheSha256,
    originalDatasetSha256: sourceReview.value.originalDatasetSha256,
  });
  const beforeBytes = new Uint8Array(
      await fs.readFile(audit.historicalMaster.path),
    ),
    before = checkedPostcompileArchive(
      beforeBytes,
      audit.historicalMaster.sha256,
    ),
    beforeDataset = JSON.parse(
      new TextDecoder().decode(before.files[before.manifest.indoor.path]!),
    ) as IndoorDataset,
    safe = prepareHeldPostcompileArchive(
      beforeBytes,
      audit.historicalMaster.sha256,
      saved.value,
    ),
    transform = await bound<typeof safe.receipt>(audit.heldImportTransform);
  assert.equal(
    before.manifest.preparedDisplay,
    undefined,
    "Embedded prepared display needs its own exact transformation review",
  );
  assert.deepEqual(
    safe.receipt,
    transform.value,
    "Historical held/no-index import transform differs on independent replay",
  );
  await initializeNativeExactGeosOverlay();
  const strictHeld = await readIndoorProject(safe.bytes);
  assert.deepEqual(
    strictHeld.rooms,
    options.currentSourceRooms,
    "Postcompile candidate changed current source annotations",
  );
  const inputBytes = new Uint8Array(await fs.readFile(historical.value.input)),
    input = checkedPostcompileArchive(inputBytes, postcompileHash(inputBytes));
  assert.equal(
    input.manifest.model.sha256,
    sourceReview.value.sourceModelSha256,
  );
  assert.equal(
    input.manifest.floors.sha256,
    sourceReview.value.sourceRoomsSha256,
  );
  const cacheHash = createHash("sha256");
  for await (const chunk of createReadStream(historical.value.nativeCache))
    cacheHash.update(chunk);
  assert.equal(cacheHash.digest("hex"), historical.value.nativeCacheSha256);
  const replayed = await replayPostcompileSteppedStairs({
    historicalDataset: beforeDataset,
    strictHeldDataset: strictHeld.dataset,
    saved: saved.value,
    sourceReview: sourceReview.value,
    originalRVTBytes: input.files[input.manifest.model.path]!,
    originalDatasetBytes: input.files[input.manifest.indoor.path]!,
    originalSourceRoomsBytes: input.files[input.manifest.floors.path]!,
    currentSourceRooms: strictHeld.rooms,
    nativeCacheSha256: historical.value.nativeCacheSha256,
    log: options.log,
  });
  const savedReplay = await bound<PostcompileSteppedReplayReceipt>(
    audit.replay,
  );
  assertExactSteppedOutcomeInventory(
    savedReplay.value.requestedEdgeIds,
    savedReplay.value.qualifiedEdgeIds,
    savedReplay.value.declinedEdgeIds,
    savedReplay.value.applications.map((row) => row.edgeId),
  );
  assert.deepEqual(
    replayed.receipt,
    savedReplay.value,
    "Current qualified/declined decision did not reproduce from fresh genuine original-RVT capabilities",
  );
  assert.deepEqual(replayed.receipt.qualifiedEdgeIds, audit.qualifiedEdgeIds);
  assert.deepEqual(replayed.receipt.declinedEdgeIds, audit.declinedEdgeIds);
  if (options.currentRegeneration)
    assert.deepEqual(
      options.currentRegeneration,
      createPostcompileRegenerationReport(
        historical.value,
        audit,
        options.summary.path,
        options.summary.sha256,
        replayed.receipt,
      ),
      "Postcompile report changed historical compiler metadata outside the exact outcome/archive extension",
    );
  const comparable = {
    ...candidateMaster,
    source: {
      ...candidateMaster.source,
      roomsSha256: replayed.dataset.source.roomsSha256,
    },
  };
  delete comparable.nativeExploreMapping;
  for (const [key, value] of Object.entries(replayed.dataset))
    if (value === undefined && !Object.hasOwn(comparable, key))
      (comparable as unknown as Record<string, unknown>)[key] = undefined;
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(comparable).map(([k, v]) => [k, postcompileJsonHash(v)]),
    ),
    replayed.receipt.finalDatasetFieldSha256,
    "Current candidate differs from independently reissued native compiled operands/outcomes",
  );
  assertPostcompileCandidateOutcomes(
    candidateMaster,
    beforeDataset,
    saved.value,
    audit.requestedEdgeIds,
    audit.qualifiedEdgeIds,
    audit.declinedEdgeIds,
  );
  assert.equal(
    masterVisitorPhysicalAuthoritySha256(candidateMaster),
    masterVisitorPhysicalAuthoritySha256(candidateVisitor),
  );
  const candidate = checkedPostcompileArchive(
    new Uint8Array(await fs.readFile(options.candidateMasterPath)),
    audit.master.sha256,
  );
  assert.equal(candidate.manifest.indoor.sha256, audit.master.indoorSha256);
  for (const entry of audit.sourcePreservation) {
    const original = before.files[entry.path],
      current = candidate.files[entry.path];
    assert(original && current);
    assert.equal(original.length, entry.bytes);
    assert.equal(current.length, entry.bytes);
    assert.equal(postcompileHash(original), entry.sha256);
    assert.equal(postcompileHash(current), entry.sha256);
  }
  assert.deepEqual(
    audit.sourcePreservation.map((row) => row.path).sort(),
    Object.keys(before.files)
      .filter(
        (name) =>
          name !== "manifest.json" && name !== before.manifest.indoor.path,
      )
      .sort(),
  );
  assert.deepEqual(
    Object.keys(candidate.files)
      .filter(
        (name) =>
          name !== "manifest.json" && name !== candidate.manifest.indoor.path,
      )
      .sort(),
    audit.sourcePreservation.map((row) => row.path).sort(),
    "Postcompile archive added or dropped an unreviewed companion",
  );
  validateIndoorDataset(candidateMaster);
  validateIndoorDataset(candidateVisitor);
  await verifyPostcompileStrengtheningReview(review.value);
  return {
    format: "independently-reissued-postcompile-stepped-scope-v1",
    requestedEdgeIds: audit.requestedEdgeIds,
    originalEdgeIds: audit.qualifiedEdgeIds,
    qualifiedEdgeIds: audit.qualifiedEdgeIds,
    declinedEdgeIds: audit.declinedEdgeIds,
    originalSourceCapabilitiesFreshlyReissued: true,
    exactCompiledInputFieldsMatched: true,
    completeCurrentFinalizerAndStrictImportsReplayed: true,
    historicalSuccessfulReceiptRelabelled: false,
    currentEngineSha256: audit.currentEngineSha256,
    actualCalculatorRoutesPassed: false,
    stepFreeApproved: false,
  } as const;
}
