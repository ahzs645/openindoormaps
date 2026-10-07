import assert from "node:assert/strict";
import test from "node:test";
import pc from "polygon-clipping";
import {
  closeSmallCoverageHoles,
  nativeExploreScopedParts,
} from "../../app/indoor-project/native-explore-display-scope";
import { fixture } from "../fixtures/native-area-project";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
test("temporary coverage removes small metadata slivers while preserving outer bounds and large courtyard gaps", () => {
  const outer = rect(0, 0, 20, 20),
    tiny = rect(2, 2, 0.5, 0.5),
    court = rect(8, 8, 5, 5);
  const source = [[outer, tiny, court]],
    before = JSON.stringify(source);
  assert.deepEqual(closeSmallCoverageHoles(source), [[outer, court]]);
  assert.equal(JSON.stringify(source), before);
});
test("exact native floor hole survives even when smaller than a removed metadata-coverage gap", () => {
  const outer = rect(0, 0, 20, 20),
    trueOpening = rect(2, 2, 0.5, 0.5),
    smallClaimGap = rect(4, 4, 0.4, 0.4);
  const scope = closeSmallCoverageHoles([[outer, trueOpening, smallClaimGap]]);
  const clipped = pc.intersection([outer, trueOpening], scope);
  assert.equal(pc.intersection(clipped, [trueOpening]).length, 0);
  assert(pc.intersection(clipped, [smallClaimGap]).length > 0);
});
test("native residuals restore an internal metadata notch without rendering its separate centre or outdoor apron", () => {
  const data = fixture();
  const outer = rect(0, 0, 40, 40),
    missing = rect(10, 10, 12, 12);
  // The compact metadata hole spans a separate component and a narrow strip
  // of the named native face. Only that exact strip may be recovered.
  const separate = rect(10, 10, 9, 12),
    trueVoid = rect(20, 12, 1, 2);
  const native = [rect(-5, -5, 50, 50), separate, trueVoid];
  const coverage = [[outer, missing]];
  const before = JSON.stringify({ native, coverage });
  const result = nativeExploreScopedParts(data, native, coverage);
  assert(pc.intersection(result, [rect(19, 10, 3, 2)]).length > 0);
  assert.equal(pc.intersection(result, [separate]).length, 0);
  assert.equal(pc.intersection(result, [trueVoid]).length, 0);
  assert.equal(pc.intersection(result, [rect(-5, 0, 4, 5)]).length, 0);
  assert.equal(JSON.stringify({ native, coverage }), before);
});
test("wide unclaimed internal floor retains its coverage hole", () => {
  const data = fixture(),
    outer = rect(0, 0, 60, 60),
    court = rect(10, 10, 30, 30);
  const result = nativeExploreScopedParts(data, [outer], [[outer, court]]);
  assert.equal(pc.intersection(result, [court]).length, 0);
});
