/** Fresh original-RVT reissuance on exactly reconstructed compiled operands.
 * A current-policy veto retains the original held edge; it never widens room
 * dependencies, waives a physical failure, or accepts a serialized capability. */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import type { NativeSteppedStairV2EdgeProof } from "../../app/indoor-project/native-stepped-stair-v2";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import {
  initializeReviewedSourceSteppedStairV2Proofs,
  type SourceSteppedStairV2Review,
} from "./source-stepped-stair-v2-review";
import { readOriginalSteppedStairV2SourceProof } from "./source-stepped-stair-v2-producer";
import {
  finalizeSourceSteppedStairV2Dataset,
  existingClaimedSteppedApproachCandidates,
} from "./finalize-source-stepped-stair-v2";
import type { ProjectRooms } from "../../app/indoor-project/package";
import type { SteppedStairSavedReplay } from "./stepped-stair-v2-candidate-scope";
import {
  assertExactPostcompileInputFields,
  assertExactSteppedOutcomeInventory,
  assertHistoricalSteppedAppend,
  postcompileJsonHash,
  reconstructPostcompileFinalizerInput,
} from "./postcompile-stepped-stair-artifacts";

export type CurrentFlatPolicyInspection = {
  passed: boolean;
  rows: {
    side: number;
    nodeId: string;
    cellId: string;
    accessSupported: boolean;
    centerlineSupported: boolean;
    fullProfileSupported: boolean;
    exclusionContact: boolean;
    staffContact: boolean;
    policies: { blockers: unknown[]; requiredRooms: string[] }[];
    untrackedRoomKeys: string[];
    passed: boolean;
  }[];
};
type PolicyModule = {
  inspectCurrentSteppedFlatApproachPolicy(
    data: IndoorDataset,
    edge: IndoorEdge,
    proof: NativeSteppedStairV2EdgeProof,
  ): CurrentFlatPolicyInspection;
};
export type PostcompileSteppedReplayReceipt = {
  format: "openindoormaps-postcompile-stepped-replay-v1";
  historicalFinalizerSha256: string;
  historicalCompiledDatasetSha256: string;
  reconstructedInitialFieldSha256: Record<string, string>;
  currentRoomsSha256: string;
  originalSourceInitialization: SteppedStairSavedReplay["initialization"];
  requestedEdgeIds: string[];
  qualifiedEdgeIds: string[];
  declinedEdgeIds: string[];
  applications: Array<{
    edgeId: string;
    outcome: "qualified" | "declined-current-flat-policy";
    sourceBindings: ReturnType<
      typeof readOriginalSteppedStairV2SourceProof
    >["bindings"];
    finalization?: SteppedStairSavedReplay["applications"][number];
    refusal?: {
      finalizerMessage: string;
      allCurrentAliasCombinationsRefused: true;
      aliasChecks: CurrentFlatPolicyInspection[];
      solePhysicalFailureCauseClaimed: false;
      originalHeldEdgeSha256: string;
      newSourceIndexOmitted: true;
    };
  }>;
  finalDatasetFieldSha256: Record<string, string>;
  allUnrelatedCompiledFieldsUnchanged: true;
  sourcePhysicalProofsReissuedFromOriginalRvt: true;
  currentCompleteValidationPassed: true;
  historicalSuccessfulReceiptRelabelled: false;
  originalCompilerRerunClaimed: false;
  actualCalculatorRoutesPassed: false;
};
const fieldHashes = (data: IndoorDataset) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      postcompileJsonHash(value),
    ]),
  );
const failAliasMessage =
  "Original stair lacks both current physically valid claimed lateral approaches";

/** Reject arbitrary errors as declined-source outcomes. This checks a concrete
 * independent current-policy veto for EVERY original claimed alias choice.
 * No error is converted to success and no missing alias is excused. */
export function checkedCurrentPolicyDecline(
  message: string,
  checks: CurrentFlatPolicyInspection[],
) {
  assert.equal(
    message,
    failAliasMessage,
    "Unexpected finalizer failure is not an authorized current-policy decline",
  );
  assert(
    checks.length > 0,
    "A missing original approach is not an established policy veto",
  );
  for (const result of checks) {
    assert.equal(
      result.passed,
      false,
      "A current-policy-valid alternative cannot be silently declined",
    );
    assert(Array.isArray(result.rows) && result.rows.length === 2);
    assert.deepEqual(
      result.rows.map((row) => row.side),
      [0, 1],
    );
    for (const row of result.rows) {
      for (const key of [
        "accessSupported",
        "centerlineSupported",
        "fullProfileSupported",
        "exclusionContact",
        "staffContact",
        "passed",
      ] as const)
        assert.equal(
          typeof row[key],
          "boolean",
          `Malformed current policy evidence: ${key}`,
        );
      assert(
        typeof row.nodeId === "string" &&
          row.nodeId.length > 0 &&
          typeof row.cellId === "string" &&
          row.cellId.length > 0,
      );
      assert(Array.isArray(row.policies) && row.policies.length === 2);
      for (const policy of row.policies)
        assert(
          Array.isArray(policy.blockers) && Array.isArray(policy.requiredRooms),
        );
      assert(
        Array.isArray(row.untrackedRoomKeys) &&
          row.untrackedRoomKeys.every(
            (key) => typeof key === "string" && key.length > 0,
          ),
      );
      assert.equal(
        row.passed,
        row.accessSupported &&
          row.centerlineSupported &&
          row.fullProfileSupported &&
          !row.exclusionContact &&
          !row.staffContact &&
          row.policies.every((policy) => policy.blockers.length === 0) &&
          row.untrackedRoomKeys.length === 0,
        "Current policy passed bit differs from its concrete predicates",
      );
    }
    assert(
      result.rows.some(
        (row) =>
          row.passed === false &&
          (!row.accessSupported ||
            !row.centerlineSupported ||
            !row.fullProfileSupported ||
            row.exclusionContact ||
            row.staffContact ||
            row.policies.some((policy) => policy.blockers.length > 0) ||
            row.untrackedRoomKeys.length > 0),
      ),
      "Current policy did not record a concrete veto",
    );
  }
  return {
    allCurrentAliasCombinationsRefused: true,
    solePhysicalFailureCauseClaimed: false,
  } as const;
}

/** Prove all historical applications' input hashes, including ordered previous
 * appends, without treating historical successful flags as current authority. */
export function assertHistoricalPostcompileInputChain(
  base: IndoorDataset,
  historical: IndoorDataset,
  saved: SteppedStairSavedReplay,
) {
  let cursor = base;
  for (const application of saved.applications) {
    assertExactPostcompileInputFields(cursor, application);
    const id = application.finalizedEdge.nativeSteppedStairV2!.sourceIndexId,
      index = historical.nativeSteppedStairV2SourceIndices!.find(
        (row) => row.id === id,
      )!;
    cursor = {
      ...cursor,
      edges: cursor.edges.map((edge) =>
        edge.id === application.edgeId ? application.finalizedEdge : edge,
      ),
      nativeSteppedStairV2SourceIndices: [
        ...(cursor.nativeSteppedStairV2SourceIndices ?? []),
        index,
      ],
    };
  }
  const comparable = {
    ...historical,
    source: { ...historical.source, roomsSha256: base.source.roomsSha256 },
  };
  delete comparable.nativeExploreMapping;
  for (const [key, value] of Object.entries(cursor))
    if (value === undefined && !Object.hasOwn(comparable, key))
      (comparable as unknown as Record<string, unknown>)[key] = undefined;
  assert.deepEqual(
    fieldHashes(cursor),
    fieldHashes(comparable),
    "Historical finalizer chain does not reproduce the compiled master fields",
  );
}

export async function replayPostcompileSteppedStairs(options: {
  historicalDataset: IndoorDataset;
  strictHeldDataset: IndoorDataset;
  saved: SteppedStairSavedReplay;
  sourceReview: SourceSteppedStairV2Review;
  originalRVTBytes: Uint8Array;
  originalDatasetBytes: Uint8Array;
  originalSourceRoomsBytes: Uint8Array;
  currentSourceRooms: ProjectRooms;
  nativeCacheSha256: string;
  log?: (message: unknown) => void;
}) {
  const { historicalDataset, saved, sourceReview } = options;
  assertHistoricalSteppedAppend(historicalDataset, saved);
  assert.deepEqual(
    saved.applications.map((a) => a.edgeId),
    sourceReview.requests.map((r) => r.originalEdgeId),
  );
  const base = reconstructPostcompileFinalizerInput(
      historicalDataset,
      saved,
      options.currentSourceRooms,
    ),
    importedComparable = {
      ...options.strictHeldDataset,
      source: {
        ...options.strictHeldDataset.source,
        roomsSha256: base.source.roomsSha256,
      },
    };
  delete importedComparable.nativeExploreMapping;
  for (const [key, value] of Object.entries(base))
    if (value === undefined && !Object.hasOwn(importedComparable, key))
      (importedComparable as unknown as Record<string, unknown>)[key] =
        undefined;
  assert.deepEqual(
    fieldHashes(importedComparable),
    fieldHashes(base),
    "Strict held import changed reconstructed native compiler operands",
  );
  assertHistoricalPostcompileInputChain(base, historicalDataset, saved);
  validateIndoorDataset(base);
  const modulePath = fileURLToPath(
      new URL(
        "../../app/indoor-project/native-stepped-stair-v2-flat-policy.ts",
        import.meta.url,
      ),
    ),
    policy = (await import(
      pathToFileURL(path.resolve(modulePath)).href
    )) as PolicyModule;
  assert.equal(
    typeof policy.inspectCurrentSteppedFlatApproachPolicy,
    "function",
  );
  const initialized = initializeReviewedSourceSteppedStairV2Proofs({
    originalRVTBytes: options.originalRVTBytes,
    originalDatasetBytes: options.originalDatasetBytes,
    originalSourceRoomsBytes: options.originalSourceRoomsBytes,
    sourceModelSha256: sourceReview.sourceModelSha256,
    sourceRoomsSha256: sourceReview.sourceRoomsSha256,
    nativeCacheSha256: options.nativeCacheSha256,
    reviewedDrawingReferences:
      options.currentSourceRooms.reviewedDrawingReferences,
    review: sourceReview,
    log: options.log,
  });
  assert.deepEqual(
    initialized.receipt,
    saved.initialization,
    "Original physical source reissuance changed; historical receipts cannot supply authority",
  );
  let dataset = base;
  const applications: PostcompileSteppedReplayReceipt["applications"] = [],
    qualifiedEdgeIds: string[] = [],
    declinedEdgeIds: string[] = [];
  for (const [i, capability] of initialized.proofs.entries()) {
    const original = readOriginalSteppedStairV2SourceProof(capability),
      oldApplication = saved.applications[i]!,
      edgeId = oldApplication.edgeId,
      old = dataset.edges.find((edge) => edge.id === edgeId)!;
    assert.deepEqual(original.bindings, oldApplication.source);
    assert.deepEqual(
      original.sourceIndex,
      historicalDataset.nativeSteppedStairV2SourceIndices!.find(
        (row) => row.id === original.sourceIndex.id,
      ),
    );
    assert.deepEqual(
      original.receipt,
      oldApplication.finalizedEdge.nativeSteppedStairV2!.receipt,
    );
    try {
      const finalized = await finalizeSourceSteppedStairV2Dataset(
        dataset,
        capability,
        { sourceRooms: options.currentSourceRooms },
      );
      dataset = finalized.dataset;
      qualifiedEdgeIds.push(edgeId);
      applications.push({
        edgeId,
        outcome: "qualified",
        sourceBindings: original.bindings,
        finalization: finalized.receipt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(
        message,
        failAliasMessage,
        "Unexpected postcompile finalizer error must be investigated",
      );
      const lower = existingClaimedSteppedApproachCandidates(dataset, old, 0),
        upper = existingClaimedSteppedApproachCandidates(dataset, old, 1);
      assert(
        lower.length > 0 && upper.length > 0,
        "Missing original claimed aliases cannot be labelled a policy refusal",
      );
      assert(
        lower.length * upper.length <= 4096,
        "Current alias review exceeds bounded explicit scope",
      );
      const run = createImmutableRoutingSession(dataset),
        checks = run(() =>
          lower.flatMap((a) =>
            upper.map((b) => {
              const proof: NativeSteppedStairV2EdgeProof = {
                version: 2,
                sourceIndexId: original.sourceIndex.id,
                receipt: original.receipt,
                originalGraphBinding: original.originalGraphBinding,
                anchorPolicy: "existing-claimed-cell-only",
                circulationGeometryKey: nativeCirculationGeometryKey(dataset),
                terminalApproaches: [a, b],
              };
              return policy.inspectCurrentSteppedFlatApproachPolicy(
                dataset,
                old,
                proof,
              );
            }),
          ),
        );
      const decline = checkedCurrentPolicyDecline(message, checks);
      assert.deepEqual(
        old,
        oldApplication.previousHeldEdge,
        "Current-policy refusal changed the original held edge",
      );
      assert(
        !dataset.nativeSteppedStairV2SourceIndices?.some(
          (row) => row.id === original.sourceIndex.id,
        ),
      );
      declinedEdgeIds.push(edgeId);
      applications.push({
        edgeId,
        outcome: "declined-current-flat-policy",
        sourceBindings: original.bindings,
        refusal: {
          finalizerMessage: message,
          ...decline,
          aliasChecks: checks,
          originalHeldEdgeSha256: postcompileJsonHash(old),
          newSourceIndexOmitted: true,
        },
      });
    }
  }
  const requestedEdgeIds = sourceReview.requests.map((r) => r.originalEdgeId);
  assertExactSteppedOutcomeInventory(
    requestedEdgeIds,
    qualifiedEdgeIds,
    declinedEdgeIds,
    applications.map((row) => row.edgeId),
  );
  for (const key of Object.keys(base) as (keyof IndoorDataset)[])
    if (key !== "edges" && key !== "nativeSteppedStairV2SourceIndices") {
      assert.equal(dataset[key], base[key]);
      assert.equal(
        postcompileJsonHash(dataset[key]),
        postcompileJsonHash(base[key]),
        `Unrelated compiled field changed: ${key}`,
      );
    }
  base.edges.forEach((edge, i) => {
    if (!requestedEdgeIds.includes(edge.id))
      assert.equal(dataset.edges[i], edge);
  });
  assert.deepEqual(
    dataset.edges
      .filter((edge) => edge.nativeSteppedStairV2)
      .map((edge) => edge.id)
      .sort(),
    [...qualifiedEdgeIds].sort(),
  );
  assert.equal(
    dataset.nativeSteppedStairV2SourceIndices?.length ?? 0,
    qualifiedEdgeIds.length,
  );
  validateIndoorDataset(dataset);
  const receipt: PostcompileSteppedReplayReceipt = {
    format: "openindoormaps-postcompile-stepped-replay-v1",
    historicalFinalizerSha256: postcompileJsonHash(saved),
    historicalCompiledDatasetSha256: postcompileJsonHash(historicalDataset),
    reconstructedInitialFieldSha256: fieldHashes(base),
    currentRoomsSha256: base.source.roomsSha256,
    originalSourceInitialization: initialized.receipt,
    requestedEdgeIds,
    qualifiedEdgeIds,
    declinedEdgeIds,
    applications,
    finalDatasetFieldSha256: fieldHashes(dataset),
    allUnrelatedCompiledFieldsUnchanged: true,
    sourcePhysicalProofsReissuedFromOriginalRvt: true,
    currentCompleteValidationPassed: true,
    historicalSuccessfulReceiptRelabelled: false,
    originalCompilerRerunClaimed: false,
    actualCalculatorRoutesPassed: false,
  };
  return { dataset, receipt };
}
