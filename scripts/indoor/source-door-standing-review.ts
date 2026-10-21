/** CLI-only reconstruction of live source capabilities from pinned originals.
 * Portable locator recipes and diagnostic receipts grant no authority. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { originalSourceConsumerBinding } from "../../../reviter/scripts/indoor/native-source-consumer-binding.ts";
import {
  reconstructOriginalDoorDerivedStanding,
  type OriginalDoorDerivedStandingReplayRecipe,
} from "../../../reviter/lib/reviter/native-source-door-derived-standing-replay.ts";
import { inspectOriginalDoorDerivedStanding } from "../../../reviter/lib/reviter/native-source-door-derived-standing.ts";

export function initializeOriginalDoorStandingReview(options: {
  originalRVTBytes: Uint8Array;
  originalDatasetBytes: Uint8Array;
  sourceModelSha256: string;
  originalDatasetSha256: string;
  reviewBytes: Uint8Array;
}) {
  const review = JSON.parse(
      new TextDecoder("utf8", { fatal: true }).decode(options.reviewBytes),
    ) as {
      format: "original-source-door-standing-review-v1";
      sourceModelSha256: string;
      originalDatasetSha256: string;
      standings: OriginalDoorDerivedStandingReplayRecipe[];
    },
    sha = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");
  assert.equal(review.format, "original-source-door-standing-review-v1");
  assert.equal(review.sourceModelSha256, options.sourceModelSha256);
  assert.equal(review.originalDatasetSha256, options.originalDatasetSha256);
  assert.equal(sha(options.originalRVTBytes), options.sourceModelSha256);
  assert.equal(
    sha(options.originalDatasetBytes),
    options.originalDatasetSha256,
  );
  assert.ok(
    Array.isArray(review.standings) &&
      review.standings.length > 0 &&
      review.standings.length <= 64,
  );
  assert.equal(
    new Set(review.standings.map((r) => r.roomKey)).size,
    review.standings.length,
  );
  const root = fileURLToPath(new URL("../../", import.meta.url)),
    entries = [
      fileURLToPath(import.meta.url),
      fileURLToPath(
        new URL("regenerate-from-native-cache.ts", import.meta.url),
      ),
      fileURLToPath(
        new URL("../../../reviter/package-lock.json", import.meta.url),
      ),
    ],
    binding = originalSourceConsumerBinding(root, entries),
    assertUnchanged = () =>
      assert.equal(
        originalSourceConsumerBinding(root, entries).sha256,
        binding.sha256,
        "Original standing source/compiler implementation changed during regeneration",
      ),
    proofs = review.standings.map((recipe) =>
      reconstructOriginalDoorDerivedStanding(
        options.originalRVTBytes,
        options.sourceModelSha256,
        options.originalDatasetBytes,
        options.originalDatasetSha256,
        recipe,
      ),
    );
  assertUnchanged();
  return {
    proofs,
    assertUnchanged,
    receipt: {
      format: "original-source-door-standing-regeneration-v1",
      sourceModelSha256: options.sourceModelSha256,
      originalDatasetSha256: options.originalDatasetSha256,
      reviewSha256: sha(options.reviewBytes),
      sourceConsumerBinding: binding,
      standings: proofs.map((proof) => {
        const receipt = inspectOriginalDoorDerivedStanding(proof);
        return {
          roomKey: receipt.roomKey,
          nativeDoorElementId: receipt.nativeDoorElementId,
          nativeFloorElementId: receipt.floor.nativeFloorElementId,
          originalPortalId: receipt.originalPortalId,
          proposedNode: receipt.proposedNode,
          sourceSchemaSha256: receipt.sourceSchemaSha256,
          sourceCensusSha256: receipt.sourceCensusSha256,
          completeStandingAndShortApproachPhysicalPredicatesPassed:
            receipt.completeStandingAndShortApproachPhysicalPredicatesPassed,
          originalPortalCenteredStandingSquareApproved: false,
          closedDoorCrossingApproved: false,
          publicAccessApproved: false,
          routeApproved: false,
        };
      }),
      physicalGuardsWaived: false,
      receiptRestoresAuthority: false,
    },
  };
}
