import test from "node:test";
import assert from "node:assert/strict";
import { rational as r } from "../../app/indoor-project/native-rational-overlay";
import {
  replayPortableSteppedStairV2,
  encodeSteppedStairV2WireValue,
  type PortableSteppedSourceIndex,
} from "../../app/indoor-project/native-stepped-stair-v2-kernel";
import { replayPortableSteppedStairV2Wire } from "../../app/indoor-project/native-stepped-stair-v2-lazy-wire";
import { fixture, p, rect } from "../fixtures/stepped-stair-v2";
const replay = (f: ReturnType<typeof fixture>) =>
  replayPortableSteppedStairV2(f.index, f.receipt, f.demand, f.demand);
test("mandatory original source census scope refuses missing, malformed and inverted operands before material replay", () => {
  for (const change of [
    (i: PortableSteppedSourceIndex) => {
      delete (i as Partial<PortableSteppedSourceIndex>).sourceCensusScopeFeet;
    },
    (i: PortableSteppedSourceIndex) => {
      i.sourceCensusScopeFeet.minimum[0] = r(11);
    },
    (i: PortableSteppedSourceIndex) => {
      i.sourceCensusScopeFeet.maximum[2] = r(-10);
    },
    (i: PortableSteppedSourceIndex) => {
      i.sourceCensusScopeFeet.minimum[0] = 0 as never;
    },
  ]) {
    const f = fixture();
    change(f.index);
    const result = replay(f);
    assert.equal(result.mathematicalReplayPassed, false);
    assert.match(result.issues.join(";"), /census scope/);
    assert.equal(result.checkedMovements, 0);
  }
});
test("two-foot XY margin and complete six-foot headroom remain within original census coverage including exact boundary", () => {
  const f = fixture();
  f.index.sourceCensusScopeFeet = {
    minimum: p(-4, -2, 0),
    maximum: p(6, 2, 9),
  };
  assert.equal(replay(f).mathematicalReplayPassed, true);
  for (const change of [
    (i: PortableSteppedSourceIndex) => {
      i.sourceCensusScopeFeet.minimum[0] = r(-4 + 1e-12);
    },
    (i: PortableSteppedSourceIndex) => {
      i.sourceCensusScopeFeet.maximum[1] = r(2 - 1e-12);
    },
    (i: PortableSteppedSourceIndex) => {
      i.sourceCensusScopeFeet.maximum[2] = r(9 - 1e-12);
    },
  ]) {
    const g = fixture();
    g.index.sourceCensusScopeFeet = {
      minimum: p(-4, -2, 0),
      maximum: p(6, 2, 9),
    };
    change(g.index);
    const result = replay(g);
    assert.equal(result.mathematicalReplayPassed, false);
    assert.match(result.issues.join(";"), /census scope/);
  }
});
test("a changed receipt cannot detour outside the original census on a large valid named floor", () => {
  const f = fixture(),
    floor = f.index.supports[0]!;
  floor.referencePartsFeet = rect(-100, 0);
  floor.innerPartsFeet = rect(-100, 0);
  f.index.cells[0]!.partsFeet = floor.referencePartsFeet;
  f.receipt.terminals[0].approachFeet.splice(1, 0, p(-50, 0, 0));
  const full = replay(f),
    lazy = replayPortableSteppedStairV2Wire(
      encodeSteppedStairV2WireValue(f.index),
      encodeSteppedStairV2WireValue(f.receipt),
      f.demand,
      f.demand,
    );
  for (const result of [full, lazy]) {
    assert.equal(result.mathematicalReplayPassed, false);
    assert.match(result.issues.join(";"), /census scope/);
    assert.equal(result.checkedMovements, 0);
    assert.equal(result.originalSourceAuthorityGranted, false);
  }
});
