import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import { datasetWithReviewedLinks } from "../../scripts/indoor/apply-regeneration-links";

test("invalid link batches preserve the source graph and require a review on the same model", () => {
  const data = fixture();
  const review = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    links: [
      {
        id: "missing-link",
        fromNodeId: "absent-a",
        toNodeId: "absent-b",
        pointsFeet: [
          [0, 0, 0],
          [1, 0, 0],
        ],
        decision: { id: "test", source: "fixture", summary: "test link" },
      },
    ],
  };
  const before = structuredClone(data);
  assert.throws(
    () =>
      datasetWithReviewedLinks(data, {
        ...review,
        sourceModelSha256: "f".repeat(64),
      }),
    /Invalid reviewed circulation links/,
  );
  assert.throws(() => datasetWithReviewedLinks(data, review), /existing nodes/);
  assert.deepEqual(data, before);
});
