/** CLI-only locator review. Reconstruct live source proofs; never restore facts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { originalSourceConsumerBinding } from "../../../reviter/scripts/indoor/native-source-consumer-binding.ts";
import { reconstructOriginalSourceStairBaseStanding } from "../../../reviter/lib/reviter/native-source-stair-base-standing-reconstruction.ts";
import { originalSourceStairBaseStandingFacts } from "../../../reviter/lib/reviter/native-source-stair-base-standing.ts";
import {
  validateReviewedDrawingReferences,
  type ReviewedDrawingReferences,
} from "../../../reviter/lib/reviter/reviewed-drawing-references.ts";

type Point3 = [number, number, number];
export type OriginalStairBaseStandingLocator = {
  roomKey: string;
  upperRoomKey: string;
  nativeStairId: number;
  nativeRunId: number;
  nativeDefinitionId: number;
  nativeFloorElementId: number;
  originalCapFaceToken: number;
  outsetTreadDepthMultiple: number;
  expectedDerivedPointFeet: Point3;
  originalApproachNodeId: string;
  directWallRefinementElementIds: number[];
  approachXYFeet?: [number, number][];
};
export type OriginalStairBaseStandingReview = {
  format: "original-source-stair-base-standing-review-v1";
  sourceModelSha256: string;
  originalDatasetSha256: string;
  originalSourceRoomsSha256: string;
  /** SHA256 of UTF8 JSON.stringify(actual validated drawing review), not its file. */
  reviewedDrawingReferencesCanonicalJsonSha256: string;
  standings: OriginalStairBaseStandingLocator[];
};
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const validHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): Record<string, unknown> => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
};
function keys(
  value: Record<string, unknown>,
  expected: string[],
  optional: string[] = [],
) {
  assert.ok(
    expected.every((key) => Object.hasOwn(value, key)),
    "Missing source-base locator field",
  );
  assert.ok(
    Object.keys(value).every((key) => [...expected, ...optional].includes(key)),
    "Unknown source-base locator field; saved proofs and flags are not accepted",
  );
}
const id = (value: unknown) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 0x7f_ff_ff_ff;
const key = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 512 &&
  value.trim() === value;
const point = (value: unknown, dimensions: number) =>
  Array.isArray(value) &&
  value.length === dimensions &&
  value.every(
    (coordinate) =>
      typeof coordinate === "number" && Number.isFinite(coordinate),
  );

/** Parse only mathematical locators. This does not construct any capability. */
export function readOriginalStairBaseStandingReview(
  reviewBytes: Uint8Array,
): OriginalStairBaseStandingReview {
  assert.ok(
    reviewBytes.length > 0 && reviewBytes.length <= 1024 * 1024,
    "Source-base locator review exceeds its byte bound",
  );
  const review = object(
    JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(reviewBytes)),
  );
  keys(review, [
    "format",
    "sourceModelSha256",
    "originalDatasetSha256",
    "originalSourceRoomsSha256",
    "reviewedDrawingReferencesCanonicalJsonSha256",
    "standings",
  ]);
  assert.equal(review.format, "original-source-stair-base-standing-review-v1");
  for (const field of [
    "sourceModelSha256",
    "originalDatasetSha256",
    "originalSourceRoomsSha256",
    "reviewedDrawingReferencesCanonicalJsonSha256",
  ])
    assert.ok(
      validHash(review[field]),
      `Invalid source-base review hash: ${field}`,
    );
  assert.ok(
    Array.isArray(review.standings) &&
      review.standings.length > 0 &&
      review.standings.length <= 64,
  );
  for (const value of review.standings) {
    const locator = object(value);
    keys(
      locator,
      [
        "roomKey",
        "upperRoomKey",
        "nativeStairId",
        "nativeRunId",
        "nativeDefinitionId",
        "nativeFloorElementId",
        "originalCapFaceToken",
        "outsetTreadDepthMultiple",
        "expectedDerivedPointFeet",
        "originalApproachNodeId",
        "directWallRefinementElementIds",
      ],
      ["approachXYFeet"],
    );
    assert.ok(
      key(locator.roomKey) &&
        key(locator.upperRoomKey) &&
        locator.roomKey !== locator.upperRoomKey &&
        key(locator.originalApproachNodeId),
      "Invalid original source-base place/node locators",
    );
    const nativeIds = [
      locator.nativeStairId,
      locator.nativeRunId,
      locator.nativeDefinitionId,
      locator.nativeFloorElementId,
    ];
    assert.ok(
      nativeIds.every(id) &&
        new Set(nativeIds).size === nativeIds.length &&
        id(locator.originalCapFaceToken),
      "Invalid or repeated source-base native locators",
    );
    assert.ok(
      Number.isSafeInteger(locator.outsetTreadDepthMultiple) &&
        Number(locator.outsetTreadDepthMultiple) >= 1 &&
        Number(locator.outsetTreadDepthMultiple) <= 64,
      "Invalid source-base setback locator",
    );
    assert.ok(
      point(locator.expectedDerivedPointFeet, 3),
      "Invalid expected source-derived base point",
    );
    assert.ok(
      Array.isArray(locator.directWallRefinementElementIds) &&
        locator.directWallRefinementElementIds.length <= 256 &&
        locator.directWallRefinementElementIds.every(id) &&
        new Set(locator.directWallRefinementElementIds).size ===
          locator.directWallRefinementElementIds.length &&
        locator.directWallRefinementElementIds.every(
          (wall) => !nativeIds.includes(wall),
        ),
      "Invalid or repeated source wall refinement locators",
    );
    if (locator.approachXYFeet !== undefined)
      assert.ok(
        Array.isArray(locator.approachXYFeet) &&
          locator.approachXYFeet.length >= 2 &&
          locator.approachXYFeet.length <= 64 &&
          locator.approachXYFeet.every((p) => point(p, 2)),
        "Invalid finite source-base approach locator",
      );
  }
  for (const field of [
    "roomKey",
    "nativeStairId",
    "nativeRunId",
    "nativeDefinitionId",
  ])
    assert.equal(
      new Set(review.standings.map((row) => object(row)[field])).size,
      review.standings.length,
      `Repeated source-base locator: ${field}`,
    );
  return review as OriginalStairBaseStandingReview;
}

export function initializeOriginalStairBaseStandingReview(options: {
  originalRVTBytes: Uint8Array;
  originalDatasetBytes: Uint8Array;
  originalSourceRoomsBytes: Uint8Array;
  sourceModelSha256: string;
  originalDatasetSha256: string;
  originalSourceRoomsSha256: string;
  reviewedDrawingReferences: ReviewedDrawingReferences | undefined;
  reviewBytes: Uint8Array;
  log?: (value: unknown) => void;
}) {
  const review = readOriginalStairBaseStandingReview(options.reviewBytes),
    reviewSha256 = sha(options.reviewBytes);
  assert.equal(review.sourceModelSha256, options.sourceModelSha256);
  assert.equal(review.originalDatasetSha256, options.originalDatasetSha256);
  assert.equal(
    review.originalSourceRoomsSha256,
    options.originalSourceRoomsSha256,
  );
  assert.ok(
    options.reviewedDrawingReferences,
    "Original source-base review requires the checked drawing-reference input",
  );
  const drawing = options.reviewedDrawingReferences;
  const assertInputsUnchanged = () => {
    assert.equal(
      sha(options.originalRVTBytes),
      review.sourceModelSha256,
      "Original source-base RVT changed",
    );
    assert.equal(
      sha(options.originalDatasetBytes),
      review.originalDatasetSha256,
      "Original source-base graph changed",
    );
    assert.equal(
      sha(options.originalSourceRoomsBytes),
      review.originalSourceRoomsSha256,
      "Original source-base annotations changed",
    );
    assert.equal(
      sha(options.reviewBytes),
      reviewSha256,
      "Original source-base locator review changed",
    );
    validateReviewedDrawingReferences(drawing, review.sourceModelSha256);
    assert.equal(
      sha(JSON.stringify(drawing)),
      review.reviewedDrawingReferencesCanonicalJsonSha256,
      "Original source-base drawing review changed",
    );
  };
  assertInputsUnchanged();
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
    assertUnchanged = () => {
      assert.deepEqual(
        originalSourceConsumerBinding(root, entries),
        binding,
        "Original source-base compiler/source closure changed during regeneration",
      );
      assertInputsUnchanged();
    };
  const proofs = review.standings.map((locator) =>
    reconstructOriginalSourceStairBaseStanding({
      originalRVTBytes: options.originalRVTBytes,
      expectedSourceModelSha256: review.sourceModelSha256,
      originalDatasetBytes: options.originalDatasetBytes,
      expectedOriginalDatasetSha256: review.originalDatasetSha256,
      ...locator,
      recordedIntent: {
        originalSourceRoomsBytes: options.originalSourceRoomsBytes,
        expectedSourceRoomsSha256: review.originalSourceRoomsSha256,
        upperRoomKey: locator.upperRoomKey,
      },
      reviewedDrawingReferences: drawing,
      log: options.log,
    }),
  );
  assertUnchanged();
  return {
    proofs,
    assertUnchanged,
    receipt: {
      format: "original-source-stair-base-standing-regeneration-v1",
      sourceModelSha256: review.sourceModelSha256,
      originalDatasetSha256: review.originalDatasetSha256,
      originalSourceRoomsSha256: review.originalSourceRoomsSha256,
      reviewedDrawingReferencesCanonicalJsonSha256:
        review.reviewedDrawingReferencesCanonicalJsonSha256,
      reviewSha256,
      sourceConsumerBinding: binding,
      standings: proofs.map((proof) => {
        const facts = originalSourceStairBaseStandingFacts(proof);
        assert.equal(facts.fullSourceFiniteApproachQualified, true);
        assert.equal(
          facts.originalRecordedIntentAndNativeBaseCorrespondenceQualified,
          true,
        );
        return {
          roomKey: facts.roomKey,
          nativeStairId: facts.nativeStairId,
          nativeRunId: facts.nativeRunId,
          nativeDefinitionId: facts.nativeDefinitionId,
          sourceSchemaSha256: facts.sourceSchemaSha256,
          sourceCensusSha256: facts.sourceCensusSha256,
          derivedPointFeet: facts.derived.pointFeet,
          originalApproachNodeId: facts.originalSourceApproach!.originalNode.id,
          fullSourceFiniteApproachQualified: true,
          currentCellOwnerQualified: false,
          arrivalPointerApplied: false,
          routeApproved: false,
        };
      }),
      physicalGuardsWaived: false,
      receiptRestoresAuthority: false,
      publicAccessApproved: false,
    },
  };
}
