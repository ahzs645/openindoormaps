/** Explicit authoring input. Review JSON supplies locators/proposals only;
 * every positive physical fact is reconstructed from the original RVT. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createOriginalSteppedStairV2SourceProof,
  readOriginalSteppedStairV2SourceProof,
  type OriginalSteppedStairV2SourceInputs,
} from "./source-stepped-stair-v2-producer";

type RequestKeys =
  | "originalEdgeId"
  | "foreignScopeBoundsFeet"
  | "sourceRequest"
  | "riserInterpretation"
  | "treadInterpretation"
  | "terminalMaterials"
  | "placedTrimRequests"
  | "retainedOriginalElementIds"
  | "proposal";
export type SourceSteppedStairV2Review = {
  format: "openindoormaps-original-stepped-stair-v2-review-v1";
  sourceModelSha256: string;
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
  originalDatasetSha256: string;
  requests: Pick<OriginalSteppedStairV2SourceInputs, RequestKeys>[];
};
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function initializeReviewedSourceSteppedStairV2Proofs(options: {
  originalRVTBytes: Uint8Array;
  originalDatasetBytes: Uint8Array;
  originalSourceRoomsBytes: Uint8Array;
  sourceModelSha256: string;
  sourceRoomsSha256: string;
  nativeCacheSha256: string;
  reviewedDrawingReferences: OriginalSteppedStairV2SourceInputs["reviewedDrawingReferences"];
  review: SourceSteppedStairV2Review;
  log?: (message: unknown) => void;
}) {
  const review = options.review;
  assert.equal(
    review?.format,
    "openindoormaps-original-stepped-stair-v2-review-v1",
    "An explicit original-source stepped stair review is required",
  );
  assert(
    [
      review.sourceModelSha256,
      review.sourceRoomsSha256,
      review.nativeCacheSha256,
      review.originalDatasetSha256,
    ].every(isHash),
    "Invalid source review hashes",
  );
  assert.equal(
    review.sourceModelSha256,
    options.sourceModelSha256,
    "Stepped review belongs to a different original model",
  );
  assert.equal(
    hash(options.originalRVTBytes),
    options.sourceModelSha256,
    "Original RVT bytes changed",
  );
  assert.equal(
    review.sourceRoomsSha256,
    options.sourceRoomsSha256,
    "Stepped review belongs to different original room bytes",
  );
  assert.equal(
    hash(options.originalSourceRoomsBytes),
    options.sourceRoomsSha256,
    "Original source room bytes changed",
  );
  assert.equal(
    review.nativeCacheSha256,
    options.nativeCacheSha256,
    "Stepped review belongs to a different native conversion",
  );
  assert.equal(
    review.originalDatasetSha256,
    hash(options.originalDatasetBytes),
    "Original source graph bytes changed",
  );
  assert(
    Array.isArray(review.requests) &&
      review.requests.length > 0 &&
      review.requests.length <= 28,
    "A bounded explicit stair review is required",
  );
  assert.equal(
    new Set(review.requests.map((r) => r.originalEdgeId)).size,
    review.requests.length,
    "Duplicate original stair review identities",
  );
  const proofs = review.requests.map((request) =>
    createOriginalSteppedStairV2SourceProof({
      originalRVTBytes: options.originalRVTBytes,
      expectedSourceModelSha256: options.sourceModelSha256,
      originalDatasetBytes: options.originalDatasetBytes,
      originalSourceRoomsBytes: options.originalSourceRoomsBytes,
      expectedOriginalDatasetSha256: review.originalDatasetSha256,
      originalEdgeId: request.originalEdgeId,
      reviewedDrawingReferences: options.reviewedDrawingReferences,
      foreignScopeBoundsFeet: request.foreignScopeBoundsFeet,
      sourceRequest: request.sourceRequest,
      riserInterpretation: request.riserInterpretation,
      treadInterpretation: request.treadInterpretation,
      terminalMaterials: request.terminalMaterials,
      placedTrimRequests: request.placedTrimRequests,
      retainedOriginalElementIds: request.retainedOriginalElementIds,
      proposal: request.proposal,
      log: options.log,
    }),
  );
  return {
    proofs,
    receipt: {
      format: "original-source-stepped-stair-v2-review-initialized-v1",
      reviewSha256: hash(JSON.stringify(review)),
      sourceModelSha256: options.sourceModelSha256,
      sourceRoomsSha256: options.sourceRoomsSha256,
      nativeCacheSha256: options.nativeCacheSha256,
      originalDatasetSha256: review.originalDatasetSha256,
      reviewedDrawingReferencesSha256: hash(
        JSON.stringify(options.reviewedDrawingReferences ?? null),
      ),
      sourceBindings: proofs.map(
        (proof) => readOriginalSteppedStairV2SourceProof(proof).bindings,
      ),
      runtimeIntegrationApproved: false,
      sourceRoomsChanged: false,
      stepFreeApproved: false,
    },
  };
}
