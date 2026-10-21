import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  initializeOriginalStairBaseStandingReview,
  readOriginalStairBaseStandingReview,
  type OriginalStairBaseStandingReview,
} from "../../scripts/indoor/source-stair-base-standing-review";
import { reviewedDrawingReferencesHash } from "../../../reviter/lib/reviter/reviewed-drawing-references.ts";

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/05-source-stair-base-standing-review.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as OriginalStairBaseStandingReview;
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

test("the actual05 review contains locators only and preserves both original arrival identities", () => {
  const review = fixture(),
    parsed = readOriginalStairBaseStandingReview(bytes(review));
  assert.deepEqual(parsed, review);
  assert.equal(
    parsed.originalDatasetSha256,
    "4f814aca91b3550186953f101824ce9f6528b1994a391760cbfed26e3312931d",
  );
  assert.equal(
    parsed.originalSourceRoomsSha256,
    "f329b643c18c86fa611b0843da0b8c5924b9e211336005eeaf5020c76bffac50",
  );
  assert.equal(
    parsed.reviewedDrawingReferencesCanonicalJsonSha256,
    "d5817cdeb32f2d3072cd6363c51a9738e16417fb407a832fbb87f21607cf0f67",
  );
  assert.deepEqual(
    parsed.standings[0]!.expectedDerivedPointFeet,
    [148.105_084_014_962_24, 225.865_454_479_531_88, 14.435_695_538_057_743],
  );
  assert.equal(
    parsed.standings[0]!.originalApproachNodeId,
    "arrival:rm-694-64382117d7ea",
  );
  assert.equal(parsed.standings[0]!.upperRoomKey, "rm-400176-f91a4f2d9cb3");
  assert.deepEqual(parsed.standings[0]!.directWallRefinementElementIds, [
    511_277,
  ]);
});

test("saved permissions, capabilities, receipts and unknown locator fields cannot enter reconstruction", () => {
  for (const field of [
    "proof",
    "facts",
    "receipt",
    "routeApproved",
    "currentCellOwnerQualified",
    "arrivalPointerApplied",
    "sourceModelPath",
  ]) {
    const review = fixture();
    assert.throws(
      () =>
        readOriginalStairBaseStandingReview(
          bytes({ ...review, [field]: false }),
        ),
      /Unknown/,
    );
    assert.throws(
      () =>
        readOriginalStairBaseStandingReview(
          bytes({
            ...review,
            standings: [{ ...review.standings[0], [field]: false }],
          }),
        ),
      /Unknown/,
    );
  }
});

test("ambiguous native locators and unbounded mathematical requests refuse before any source read", () => {
  const mutations: ((review: OriginalStairBaseStandingReview) => void)[] = [
    (r) => {
      r.standings.push(structuredClone(r.standings[0]!));
    },
    (r) => {
      r.standings[0]!.nativeRunId = r.standings[0]!.nativeStairId;
    },
    (r) => {
      r.standings[0]!.nativeFloorElementId = 0x80_00_00_00;
    },
    (r) => {
      r.standings[0]!.directWallRefinementElementIds = [511_277, 511_277];
    },
    (r) => {
      r.standings[0]!.directWallRefinementElementIds = [
        r.standings[0]!.nativeRunId,
      ];
    },
    (r) => {
      r.standings[0]!.outsetTreadDepthMultiple = 65;
    },
    (r) => {
      r.standings[0]!.approachXYFeet = Array.from({ length: 65 }, () => [0, 0]);
    },
    (r) => {
      r.originalSourceRoomsSha256 = "wrong";
    },
  ];
  for (const mutate of mutations) {
    const review = fixture();
    mutate(review);
    assert.throws(() => readOriginalStairBaseStandingReview(bytes(review)));
  }
  assert.throws(
    () => readOriginalStairBaseStandingReview(new Uint8Array(1024 * 1024 + 1)),
    /byte bound/,
  );
});

test("changed original bytes and a different drawing review cannot reach the live source constructor", () => {
  // Tiny negative inputs are deliberately not physical source evidence. Every
  // case must refuse before constructing a source context or capability.
  const originalRVTBytes = bytes("not an RVT"),
    originalDatasetBytes = bytes("not a graph"),
    originalSourceRoomsBytes = bytes("not rooms"),
    sourceModelSha256 = sha(originalRVTBytes);
  const rawDrawing = {
    version: 1 as const,
    sourceModelSha256,
    sourceInventorySha256: "1".repeat(64),
    decisionEvidenceSha256: "2".repeat(64),
    instances: [],
  };
  const drawing = {
    ...rawDrawing,
    geometrySha256: reviewedDrawingReferencesHash(rawDrawing),
  };
  const review = {
    ...fixture(),
    sourceModelSha256,
    originalDatasetSha256: sha(originalDatasetBytes),
    originalSourceRoomsSha256: sha(originalSourceRoomsBytes),
    reviewedDrawingReferencesCanonicalJsonSha256: sha(JSON.stringify(drawing)),
  };
  const options = {
    originalRVTBytes,
    originalDatasetBytes,
    originalSourceRoomsBytes,
    sourceModelSha256,
    originalDatasetSha256: review.originalDatasetSha256,
    originalSourceRoomsSha256: review.originalSourceRoomsSha256,
    reviewedDrawingReferences: drawing,
    reviewBytes: bytes(review),
  };
  for (const [field, error] of [
    ["originalRVTBytes", /RVT changed/],
    ["originalDatasetBytes", /graph changed/],
    ["originalSourceRoomsBytes", /annotations changed/],
  ] as const)
    assert.throws(
      () =>
        initializeOriginalStairBaseStandingReview({
          ...options,
          [field]: bytes("changed"),
        }),
      error,
    );
  assert.throws(
    () =>
      initializeOriginalStairBaseStandingReview({
        ...options,
        reviewedDrawingReferences: undefined,
      }),
    /checked drawing-reference/,
  );
  assert.throws(
    () =>
      initializeOriginalStairBaseStandingReview({
        ...options,
        reviewBytes: bytes({
          ...review,
          reviewedDrawingReferencesCanonicalJsonSha256: "0".repeat(64),
        }),
      }),
    /drawing review changed/,
  );
});
