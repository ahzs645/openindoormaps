import assert from "node:assert/strict";
import test from "node:test";
import { compactSharedGuideProposal } from "../../app/indoor-project/compact-shared-guide";
import type { SharedGuidePoint } from "../../app/indoor-project/shared-corridor-guides";

test("compact proposal retains the complete two-leg jamb approach before the start stop, and its reverse", () => {
  const points: SharedGuidePoint[] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [2, 2, 0],
    [3, 1, 0],
    [5, 1, 0],
  ];
  const before = JSON.stringify(points);
  const proposal = compactSharedGuideProposal(points, { start: points[2] });
  assert.deepEqual(proposal, [points[0], points[1], points[2], points.at(-1)]);
  assert.deepEqual(
    compactSharedGuideProposal(points.toReversed(), { end: points[2] }),
    proposal.toReversed(),
  );
  assert.equal(JSON.stringify(points), before);
});

test("both outer approaches stay exact; an internal through-path proposes only its two thresholds", () => {
  const points: SharedGuidePoint[] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [2, 2, 0],
    [3, 1, 0],
    [5, 1, 0],
    [5, 2, 0],
  ];
  assert.deepEqual(
    compactSharedGuideProposal(points, { start: points[2], end: points[4] }),
    [points[0], points[1], points[2], points[4], points[5], points[6]],
  );
  assert.deepEqual(compactSharedGuideProposal(points, {}), [
    points[0],
    points.at(-1),
  ]);
  const vertical = points.map((p, i): SharedGuidePoint => [p[0], p[1], i]);
  assert.deepEqual(compactSharedGuideProposal(vertical, {}), vertical);
});
