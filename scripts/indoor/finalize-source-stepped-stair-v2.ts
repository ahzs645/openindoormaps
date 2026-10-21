/** Post-cell finalization of one genuinely source-proved existing stair.
 * No floor, cell, node, room, access policy or source annotation is repaired by
 * this adapter. An absent current claimed approach is a refusal, not a request
 * for a nearby connection or a new connector anchor. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import {
  assertExistingClaimedSteppedApproaches,
  inspectNativeSteppedStairV2Binding,
  nativeSteppedStairV2Digest,
  nativeSteppedStairV2DrawingPoints,
  type NativeSteppedStairV2Approach,
  type NativeSteppedStairV2EdgeProof,
} from "../../app/indoor-project/native-stepped-stair-v2";
import {
  assertPortableSteppedGraphBindingPreserved,
  createCurrentSteppedStairGraphBinding,
} from "../../app/indoor-project/native-stepped-stair-v2-graph-binding";
import { replayPortableSteppedStairV2Wire } from "../../app/indoor-project/native-stepped-stair-v2-lazy-wire";
import { nativeRationalScalarToIEEE } from "../../app/indoor-project/native-rational-overlay";
import { nativeCirculationGeometryKey } from "../../app/indoor-project/native-circulation";
import * as DMath from "../../app/indoor-project/deterministic-math";
import { withRoutingCalculation } from "../../app/indoor-project/routing-cache";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import {
  readOriginalSteppedStairV2SourceProof,
  type OriginalSteppedStairV2SourceProof,
} from "./source-stepped-stair-v2-producer";

type SourceReview = {
  indoorReviews?: unknown;
};
export type FinalizeSourceSteppedStairV2Options = {
  sourceRooms: SourceReview;
};

/** Current source-context guard, not original-RVT authority. The same exact
 * snapshot supplies both the constructor checksum and explicit review decision;
 * a getter or toJSON cannot swap the decision after the hashed read. */
export function checkedCurrentSteppedStairSourceReview(
  expectedRoomsSha256: string,
  sourceRooms: unknown,
  edgeId: string,
) {
  const serialized = JSON.stringify(sourceRooms);
  if (
    typeof serialized !== "string" ||
    !/^[a-f0-9]{64}$/.test(expectedRoomsSha256) ||
    createHash("sha256").update(serialized).digest("hex") !==
      expectedRoomsSha256
  )
    throw new Error(
      "Current source room snapshot differs from the compiled constructor checksum",
    );
  const snapshot = JSON.parse(serialized) as unknown,
    object = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === "object" && !Array.isArray(value);
  if (
    !object(snapshot) ||
    snapshot.format !== "reviter-room-annotations" ||
    snapshot.version !== 1
  )
    throw new Error("Missing checked current source room annotations");
  const reviews = snapshot.indoorReviews;
  if (
    reviews !== undefined &&
    (!object(reviews) || reviews.version !== 1 || !object(reviews.edges))
  )
    throw new Error(
      "Current source edge reviews require direct version1 data; packed placeholders refuse",
    );
  const decision =
    reviews === undefined ||
    !Object.hasOwn((reviews as Record<string, unknown>).edges as object, edgeId)
      ? null
      : ((reviews as Record<string, unknown>).edges as Record<string, unknown>)[
          edgeId
        ];
  if (
    decision !== null &&
    (!object(decision) ||
      (decision.enabled !== undefined && typeof decision.enabled !== "boolean"))
  )
    throw new Error("Malformed checked current source edge review");
  if (decision?.enabled === false)
    throw new Error("An explicit current source review disables this stair");
  return {
    sourceRoomsSha256: expectedRoomsSha256,
    explicitSourceReview: decision,
  };
}

/** Locates candidates by original graph incidence and exact claimed owner only.
 * Each candidate must additionally pass the unchanged original floor/material
 * authority. Deterministic ID order selects between independently valid aliases.
 * This exported locator grants no source or route authority. */
export function existingClaimedSteppedApproachCandidates(
  data: IndoorDataset,
  edge: IndoorEdge,
  side: 0 | 1,
): NativeSteppedStairV2Approach[] {
  const nodeId = [edge.from, edge.to][side],
    node = data.nodes.find((n) => n.id === nodeId),
    geometry = data.circulationGeometry;
  if (!node || !geometry) return [];
  return data.edges
    .filter(
      (walk) =>
        walk.enabled &&
        walk.kind === "walk" &&
        !!walk.nativeCellId &&
        [walk.from, walk.to].includes(nodeId) &&
        walk.roomKeys.includes(node.roomKey),
    )
    .flatMap((walk) => {
      const cells = geometry.cells.filter(
        (cell) =>
          cell.id === walk.nativeCellId &&
          cell.roomKeys.includes(node.roomKey) &&
          cell.levelIds.includes(node.levelId) &&
          cell.elevationFeet === node.pointFeet[2],
      );
      return cells.length === 1
        ? [
            {
              nodeId,
              nativeCellId: cells[0]!.id,
              walkEdgeId: walk.id,
              cellSha256: nativeSteppedStairV2Digest(cells[0]),
              walkEdgeSha256: nativeSteppedStairV2Digest(walk),
            },
          ]
        : [];
    })
    .sort((a, b) => a.walkEdgeId.localeCompare(b.walkEdgeId));
}

export async function finalizeSourceSteppedStairV2Dataset(
  data: IndoorDataset,
  originalProof: OriginalSteppedStairV2SourceProof,
  options: FinalizeSourceSteppedStairV2Options,
) {
  // This private original-source WeakMap lookup precedes every graph operation.
  // A saved receipt, matching hash or serialized v12 report cannot enter here.
  const source = readOriginalSteppedStairV2SourceProof(originalProof),
    originalBinding = source.originalGraphBinding,
    edgeId = originalBinding.edge.id,
    matches = data.edges.filter((edge) => edge.id === edgeId);
  if (matches.length !== 1)
    throw new Error("Source stair edge is missing or duplicated");
  const currentSourceReview = checkedCurrentSteppedStairSourceReview(
      data.source.roomsSha256,
      options?.sourceRooms,
      edgeId,
    ),
    old = matches[0]!,
    inputFieldHashes = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        nativeSteppedStairV2Digest(value),
      ]),
    );
  if (old.enabled || old.nativeSourceStair || old.nativeSteppedStairV2)
    throw new Error("Only one original held stair may be finalized");
  const current = createCurrentSteppedStairGraphBinding(data, edgeId);
  assertPortableSteppedGraphBindingPreserved(originalBinding, current);
  if (
    source.bindings.sourceModelSha256 !== data.source.modelSha256 ||
    source.bindings.originalEdgeId !== edgeId ||
    source.bindings.bothOriginalSourceDirectionsPassed !== true ||
    !/^[a-f0-9]{64}$/.test(source.bindings.sourceRoomsSha256) ||
    source.bindings.originalExplicitSourceReview?.enabled === false ||
    old.accessible !== "no"
  )
    throw new Error(
      "Source proof and unchanged current stair identity disagree",
    );

  const geometryKey = nativeCirculationGeometryKey(data);
  if (data.circulationGeometry?.sourceGeometryKey !== geometryKey)
    throw new Error("Current circulation source binding is stale");
  const rows = data.nativeSteppedStairV2SourceIndices ?? [];
  if (rows.some((row) => row.id === source.sourceIndex.id))
    throw new Error("Source stair index was already inserted");
  const base: Omit<NativeSteppedStairV2EdgeProof, "terminalApproaches"> = {
    version: 2,
    sourceIndexId: source.sourceIndex.id,
    receipt: source.receipt,
    originalGraphBinding: originalBinding,
    anchorPolicy: "existing-claimed-cell-only",
    circulationGeometryKey: geometryKey,
  };
  const choices = [0, 1].map((side) =>
    existingClaimedSteppedApproachCandidates(data, old, side as 0 | 1),
  );
  const terminalApproaches = withRoutingCalculation(data, () => {
    for (const lower of choices[0]!)
      for (const upper of choices[1]!) {
        const proof: NativeSteppedStairV2EdgeProof = {
          ...base,
          terminalApproaches: [lower, upper],
        };
        try {
          assertExistingClaimedSteppedApproaches(data, old, proof);
          return proof.terminalApproaches;
        } catch {
          // Try only another exact existing claimed alias. Every final physical
          // predicate is identical; there is no weaker fallback after exhaustion.
        }
      }
    throw new Error(
      "Original stair lacks both current physically valid claimed lateral approaches",
    );
  });
  const replay = replayPortableSteppedStairV2Wire(
    source.sourceIndex.physical,
    source.receipt,
    originalBinding,
    current,
  );
  if (!replay.mathematicalReplayPassed)
    throw new Error(
      `Source-produced portable stair replay refuses: ${replay.issues.join("; ")}`,
    );
  const physicalPoints = replay.physicalPointsFeet.map((p) =>
    p.map(nativeRationalScalarToIEEE),
  );
  const horizontal = data.alignment.horizontalMetresPerFoot,
    vertical = data.alignment.verticalMetresPerFoot;
  if (![horizontal, vertical].every((n) => Number.isFinite(n) && n > 0))
    throw new Error("Invalid unchanged map scale");
  const lengthMetres = physicalPoints.slice(1).reduce((sum, p, i) => {
    const a = physicalPoints[i]!;
    return (
      sum +
      DMath.hypot(
        (p[0]! - a[0]!) * horizontal,
        (p[1]! - a[1]!) * horizontal,
        (p[2]! - a[2]!) * vertical,
      )
    );
  }, 0);
  const edge: IndoorEdge = {
    ...old,
    enabled: true,
    pointsFeet: nativeSteppedStairV2DrawingPoints(replay, current),
    lengthMetres,
    nativeSteppedStairV2: { ...base, terminalApproaches },
    evidence: `${old.evidence}; original-source stepped v2 2ft transverse / 6ft swept headroom; step-free unverified`,
  };
  const dataset: IndoorDataset = {
    ...data,
    edges: data.edges.map((e) => (e === old ? edge : e)),
    nativeSteppedStairV2SourceIndices: [...rows, source.sourceIndex],
  };
  // One immutable calculation shares prepared exact operands between the new
  // variant and the usual strict dataset validation, then releases that cache.
  const verified = withRoutingCalculation(dataset, () => {
    const result = inspectNativeSteppedStairV2Binding(dataset, edge);
    validateIndoorDataset(dataset);
    return result;
  });
  assertPortableSteppedGraphBindingPreserved(
    originalBinding,
    createCurrentSteppedStairGraphBinding(dataset, edgeId),
  );
  if (nativeCirculationGeometryKey(dataset) !== geometryKey)
    throw new Error(
      "Stepped finalization changed the original circulation source binding",
    );
  // Exact preservation audit: only the selected edge and one new shared source
  // inventory may differ. Full source room/history/model operands remain owned
  // by the caller and were neither copied into nor modified by this adapter.
  for (const key of Object.keys(data) as (keyof IndoorDataset)[])
    if (key !== "edges" && key !== "nativeSteppedStairV2SourceIndices")
      assert.equal(
        dataset[key],
        data[key],
        `Changed unrelated dataset field ${key}`,
      );
  for (const [key, hash] of Object.entries(inputFieldHashes))
    assert.equal(
      nativeSteppedStairV2Digest(
        (data as unknown as Record<string, unknown>)[key],
      ),
      hash,
      `Mutated input dataset field ${key}`,
    );
  assert.equal(dataset.edges.length, data.edges.length);
  data.edges.forEach((e, i) => {
    if (e !== old) assert.equal(dataset.edges[i], e);
  });
  const retainedOriginal = { ...edge };
  delete retainedOriginal.nativeSteppedStairV2;
  assert.deepEqual(
    {
      ...retainedOriginal,
      enabled: old.enabled,
      pointsFeet: old.pointsFeet,
      lengthMetres: old.lengthMetres,
      evidence: old.evidence,
    },
    old,
    "Changed original stair identity, direction or access",
  );
  return {
    dataset,
    receipt: {
      format: "original-source-stepped-stair-v2-finalization",
      version: 1,
      edgeId,
      source: source.bindings,
      currentSourceReview,
      inputFieldSha256: inputFieldHashes,
      previousHeldEdge: structuredClone(old),
      finalizedEdge: structuredClone(edge),
      circulationGeometryKeyBefore: geometryKey,
      circulationGeometryKeyAfter:
        dataset.circulationGeometry!.sourceGeometryKey,
      terminalApproaches,
      originalNodesLevelsRoomsAndCellsPreserved: true,
      noNewConnectorAnchors: true,
      currentOriginalPhysicalLateralApproachesPassed: true,
      portableMovementsChecked: verified.replay.checkedMovements,
      strictDatasetValidationPassed: true,
      sourceStepFreeApproval: false,
      actualCalculatorRoutesPassed: false,
    },
  };
}
