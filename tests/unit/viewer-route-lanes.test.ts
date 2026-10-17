import test from "node:test";
import assert from "node:assert/strict";
import { routeLanes as originalRouteLanes } from "../../app/indoor-project/route-lanes";
import {
  MAX_VIEWER_LANE_GRID_POINTS,
  routeLanes,
} from "../../app/indoor-project/viewer-route-lanes";

test("viewer lane budget declines oversized optional searches before any clearance callback", () => {
  const xs = Array.from({ length: 17 }, (_, i) => i);
  const ys = Array.from({ length: 8 }, (_, i) => i);
  assert.equal(MAX_VIEWER_LANE_GRID_POINTS, 128);
  let calls = 0;
  assert.equal(
    routeLanes(
      xs,
      ys,
      [0, 0],
      [16, 7],
      () => {
        calls++;
        throw Error(
          "An oversized search must not evaluate material predicates",
        );
      },
      100,
    ),
    null,
  );
  assert.equal(calls, 0);
});

test("the exact 128-point boundary delegates unchanged paths and physical refusals", () => {
  const xs = Array.from({ length: 8 }, (_, i) => i);
  const ys = Array.from({ length: 16 }, (_, i) => i);
  const start: [number, number] = [0, 0],
    end: [number, number] = [7, 15];
  const valid = () => true;
  const expected = originalRouteLanes(xs, ys, start, end, valid, 100);
  assert.ok(expected);
  assert.deepEqual(routeLanes(xs, ys, start, end, valid, 100), expected);
  const blocked = (a: number[], b: number[]) =>
    !(Math.min(a[0], b[0]) <= 3.5 && Math.max(a[0], b[0]) >= 3.5);
  assert.equal(originalRouteLanes(xs, ys, start, end, blocked, 100), null);
  assert.equal(routeLanes(xs, ys, start, end, blocked, 100), null);
  assert.equal(
    routeLanes(xs, ys, start, end, () => false, 100),
    null,
  );
  assert.equal(routeLanes(xs, ys, start, end, valid, 1), null);
});
