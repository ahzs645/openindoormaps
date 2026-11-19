import assert from "node:assert/strict";
import test from "node:test";
import {
  straightenReviewedSpan,
  prepareReviewedGuideBends,
  bendReviewContext,
} from "../../app/indoor-project/reviewed-guide-bends";
import type { SharedGuidePoint as Point } from "../../app/indoor-project/shared-corridor-guides";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";

const p = (x: number, y: number, z = 0): Point => [x, y, z];
const span = [p(1, 0), p(2, 0), p(3, 1), p(4, 1)];
test("a clipped hallway span is identical in both directions on all shared owners", () => {
  const full = [p(0, 0), p(2, 0), p(3, 1), p(5, 1)];
  const result = [p(0, 0), p(1, 0), p(4, 1), p(5, 1)];
  assert.deepEqual(straightenReviewedSpan(full, span), result);
  assert.deepEqual(
    straightenReviewedSpan(full.toReversed(), span),
    result.toReversed(),
  );
  assert.deepEqual(straightenReviewedSpan(span, span), [span[0], span.at(-1)]);
  assert.deepEqual(straightenReviewedSpan(result, span), result);
});
test("preserves intermediate source departures and a cut inside a proposed span", () => {
  for (const source of [
    [...span.slice(0, 2), p(2.5, 0.5), ...span.slice(2)],
    [p(1.5, 0), ...span.slice(1)],
    [p(0, 0.01), ...span.slice(1)],
    [p(1, 0, 0.01), ...span.slice(1)],
  ])
    assert.strictEqual(straightenReviewedSpan(source, span), source);
});
test("preserves original paths when the certificate belongs to another source", () => {
  const data = { source: { modelSha256: "changed" } } as IndoorDataset;
  assert.equal(
    prepareReviewedGuideBends(data, {
      sourceModelSha256: "original",
    } as PreparedRouting),
    undefined,
  );
});

test("an access-zone-only edit invalidates the bend review", () => {
  const source = { modelSha256: "same" };
  const original = {
    source,
    records: [],
    nativeLevels: [],
    nativeAccessZones: { zones: [] },
  } as unknown as IndoorDataset;
  const changed = structuredClone(original);
  Object.assign(changed.nativeAccessZones!, {
    zones: [{ id: "closed", levelId: 1 }],
  });
  assert.notEqual(bendReviewContext(changed), bendReviewContext(original));
});
