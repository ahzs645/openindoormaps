import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewedDrawingReferencesHash,
  validateReviewedDrawingReferences,
  type ReviewedDrawingReferences,
} from "../../app/indoor-project/reviewed-drawing-references";
import {
  reviewedDrawingReferencesHash as sourceReviewHash,
  validateReviewedDrawingReferences as sourceReviewValidate,
} from "../../../reviter/lib/reviter/reviewed-drawing-references";
import {
  nativeSourceStairMaterialHash,
  nativeSourceStairPlacementHash,
  validNativeSourceStairMaterial,
  type NativeSourceStairMaterial,
} from "../../app/indoor-project/native-source-stair-material";
import {
  nativeSourceStairPlacementHash as sourcePlacementHash,
  validNativeSourceStairMaterial as sourceMaterialValid,
} from "../../../reviter/lib/reviter/native-source-stair-material";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  routingSnapshot,
  withRoutingCalculation,
} from "../../app/indoor-project/routing-cache";

function fixture() {
  const review: ReviewedDrawingReferences = {
    version: 1,
    sourceModelSha256: "a".repeat(64),
    sourceInventorySha256: "b".repeat(64),
    decisionEvidenceSha256: "c".repeat(64),
    instances: [
      {
        nativeElementId: 400,
        nativeUniqueId: "12345678-1234-4321-abcd-0123456789ab-00000190",
        sourceFactSha256: "d".repeat(64),
        sourceName: "UNBC Floor Plan",
        classification: "drawing-reference",
      },
    ],
    geometrySha256: "",
  };
  review.geometrySha256 = reviewedDrawingReferencesHash(review);
  const material: NativeSourceStairMaterial = {
    version: 1,
    sourceModelSha256: review.sourceModelSha256,
    evidenceSha256: "e".repeat(64),
    sourceWallPositionRepairsSha256: nativeSourceStairPlacementHash(
      undefined,
      undefined,
      undefined,
      review,
    ),
    nativeStairId: 200,
    widthFeet: 2,
    pointsFeet: [
      [0, 0, 0],
      [2, 0, 1],
    ],
    sourceElementIds: [],
    bands: [
      {
        segmentIndex: 0,
        minimumElevationFeet: 0,
        maximumElevationFeet: 1.1,
        unclassifiedSourceElementIds: [],
        sections: [],
      },
    ],
    geometrySha256: "",
  };
  material.geometrySha256 = nativeSourceStairMaterialHash(material);
  return { review, material };
}

test("compiler and visitor agree on checked drawing roles and revoke stale clearance proofs", () => {
  const { review, material } = fixture();
  assert.equal(sourceReviewHash(review), review.geometrySha256);
  validateReviewedDrawingReferences(review, review.sourceModelSha256);
  sourceReviewValidate(review, review.sourceModelSha256);
  for (const placement of [
    nativeSourceStairPlacementHash,
    sourcePlacementHash,
  ]) {
    assert.equal(
      placement(undefined, undefined, undefined, review),
      material.sourceWallPositionRepairsSha256,
    );
    assert.notEqual(placement(), material.sourceWallPositionRepairsSha256);
  }
  const revoked = structuredClone(review);
  revoked.instances = [];
  revoked.geometrySha256 = reviewedDrawingReferencesHash(revoked);
  for (const validate of [
    validNativeSourceStairMaterial,
    sourceMaterialValid,
  ]) {
    assert.equal(
      validate(
        material,
        review.sourceModelSha256,
        200,
        material.pointsFeet,
        undefined,
        undefined,
        undefined,
        true,
        review,
      ),
      true,
    );
    assert.equal(
      validate(
        material,
        review.sourceModelSha256,
        200,
        material.pointsFeet,
        undefined,
        undefined,
        undefined,
        true,
      ),
      false,
    );
    assert.equal(
      validate(
        material,
        review.sourceModelSha256,
        200,
        material.pointsFeet,
        undefined,
        undefined,
        undefined,
        true,
        revoked,
      ),
      false,
    );
  }
  review.instances[0]!.sourceName = "different drawing";
  assert.throws(() => validateReviewedDrawingReferences(review));
  assert.throws(() => sourceReviewValidate(review));
});

test("worker projection retains source-bound drawing semantics without granting any stair edge", () => {
  const { review } = fixture();
  const data = {
    source: { modelSha256: review.sourceModelSha256 },
    reviewedDrawingReferences: review,
    edges: [],
    issues: [],
  } as unknown as IndoorDataset;
  const worker = routeWorkerDataset(data);
  assert.deepEqual(worker.reviewedDrawingReferences, review);
  assert.deepEqual(worker.edges, []);
});

test("mutable authoring edits to a drawing review invalidate policy snapshots even with unchanged route arrays", () => {
  const { review } = fixture();
  const data = {
    source: { modelSha256: review.sourceModelSha256 },
    reviewedDrawingReferences: review,
    records: [],
    nodes: [],
    edges: [],
    doors: [],
    walls: [],
    connectors: [],
  } as unknown as IndoorDataset;
  const snapshot = () =>
    withRoutingCalculation(data, () => routingSnapshot(data));
  const original = snapshot();
  const arrays = [data.records, data.nodes, data.edges, data.doors];
  review.instances = [];
  review.geometrySha256 = reviewedDrawingReferencesHash(review);
  assert.notEqual(
    snapshot(),
    original,
    "revocation must discard old clearance admission",
  );
  assert.deepEqual([data.records, data.nodes, data.edges, data.doors], arrays);
  const revoked = snapshot();
  delete data.reviewedDrawingReferences;
  assert.notEqual(
    snapshot(),
    revoked,
    "removing the whole annotation also invalidates admission",
  );
});
