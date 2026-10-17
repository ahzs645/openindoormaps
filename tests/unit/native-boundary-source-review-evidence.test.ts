import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateNativeBoundarySourceReviewEvidence as appValidate } from "../../app/indoor-project/native-boundary-source-review-evidence";
import { validateNativeBoundarySourceReviewEvidence as sourceValidate } from "../../../reviter/lib/reviter/native-boundary-source-review-evidence.ts";
import { validateNativeBoundaryPatches as appPatches } from "../../app/indoor-project/native-boundary-patches";
import { validateNativeBoundaryPatches as sourcePatches } from "../../../reviter/lib/reviter/native-boundary-patches.ts";

const model = "a".repeat(64);
type EvidenceValidator = (value: unknown, sourceModelSha256?: string) => void;
const evidenceValidators: EvidenceValidator[] = [appValidate, sourceValidate];
const patchValidators: EvidenceValidator[] = [appPatches, sourcePatches];
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function entry(id = "original-recipe") {
  const review = {
    format: "source-native-boundary-review-bundle-v1",
    sourceModelSha256: model,
    sourceRoomsSha256: "b".repeat(64),
    nativeCacheSha256: "c".repeat(64),
    entries: [{ oldPatchId: id }],
  };
  return {
    format: "source-native-boundary-review-evidence-v1",
    sourceModelSha256: model,
    reviewSha256: sha(review),
    review,
  };
}
test("both readers retain exact portable review data through JSON round-trip without approving geometry", () => {
  const evidence = [entry(), entry("another-original-recipe")];
  const bytes = JSON.stringify(evidence);
  for (const validate of evidenceValidators) {
    validate(undefined, model);
    validate(evidence, model);
    validate(JSON.parse(bytes), model);
    assert.equal(JSON.stringify(evidence), bytes);
  }
  for (const validate of patchValidators) {
    validate(
      { version: 1, patches: [], sourceReviewEvidence: evidence },
      model,
    );
    assert.throws(
      () =>
        validate(
          {
            version: 1,
            sourceReviewEvidence: evidence,
            patches: [
              { id: "invalid-geometry", status: "applied", ringsFeet: [] },
            ],
          },
          model,
        ),
      /boundary patch geometry/,
    );
  }
});
test("both readers reject altered, foreign, duplicate and malformed review evidence", () => {
  const cases: unknown[] = [];
  const changed = entry();
  changed.review.entries[0].oldPatchId = "changed";
  cases.push([changed]);
  const foreign = entry();
  foreign.sourceModelSha256 = "d".repeat(64);
  cases.push([foreign]);
  const foreignReview = entry();
  foreignReview.review.sourceModelSha256 = "d".repeat(64);
  foreignReview.reviewSha256 = sha(foreignReview.review);
  cases.push([foreignReview]);
  const duplicate = entry();
  cases.push([duplicate, structuredClone(duplicate)]);
  cases.push([], {}, [{ ...entry(), approval: true }]);
  const wrongFormat = entry();
  wrongFormat.review.format = "saved-approval";
  wrongFormat.reviewSha256 = sha(wrongFormat.review);
  cases.push([wrongFormat]);
  for (const validate of evidenceValidators)
    for (const value of cases)
      assert.throws(() => validate(value, model), /source-review evidence/);
});
test("non-JSON values, getters, cycles, sparse arrays and excessive payloads cannot enter portable evidence", () => {
  const cases: unknown[] = [];
  for (const value of [NaN, Infinity, 1n, undefined, new Date(), () => true]) {
    cases.push([{ ...entry(), review: { ...entry().review, extra: value } }]);
  }
  const cyclic: Record<string, unknown> = { ...entry().review };
  cyclic.self = cyclic;
  cases.push([{ ...entry(), review: cyclic }]);
  let getterCalls = 0;
  const getter = { ...entry().review };
  Object.defineProperty(getter, "extra", {
    enumerable: true,
    get() {
      getterCalls++;
      return true;
    },
  });
  cases.push([{ ...entry(), review: getter }]);
  cases.push([
    { ...entry(), review: { ...entry().review, extra: new Array(2) } },
  ]);
  cases.push([
    {
      ...entry(),
      review: { ...entry().review, extra: "x".repeat(16 * 1024 * 1024 + 1) },
    },
  ]);
  for (const validate of evidenceValidators)
    for (const value of cases)
      assert.throws(() => validate(value, model), /source-review evidence/);
  assert.equal(getterCalls, 0);
});
