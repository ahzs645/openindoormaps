import test from "node:test";
import assert from "node:assert/strict";
import {
  Rational,
  rational as r,
  nativeRationalOverlay,
  type NativeRationalPoint,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import * as browser from "../../app/indoor-project/native-stepped-stair-v2-kernel";
import * as native from "../../../reviter/lib/reviter/native-stepped-stair-v2-kernel.ts";
import { fixture, p, rect, clone } from "../fixtures/stepped-stair-v2";

function orientedFixture() {
  const f = fixture();
  const add = (a: Rational, b: Rational) =>
    new Rational(a.n * b.d + b.n * a.d, a.d * b.d);
  const turn = ([x, y]: NativeRationalPoint): NativeRationalPoint => [
    add(x, new Rational(-y.n, y.d)),
    add(x, y),
  ];
  const point = ([x, y, z]: browser.Point3): browser.Point3 => [
    ...turn([x, y]),
    z,
  ];
  const parts = (a: NativeRationalParts) =>
    a.map((part) => part.map((ring) => ring.map(turn)));
  for (const s of f.index.supports) {
    s.referencePartsFeet = parts(s.referencePartsFeet);
    s.innerPartsFeet = parts(s.innerPartsFeet);
    s.uncertaintyPartsFeet = parts(s.uncertaintyPartsFeet);
    s.closedUncertaintyFeet = s.closedUncertaintyFeet.map((line) =>
      line.map(turn),
    );
  }
  for (const c of f.index.cells) {
    c.partsFeet = parts(c.partsFeet);
    c.closedSegmentsFeet = c.closedSegmentsFeet.map((line) => line.map(turn));
  }
  for (const e of f.index.run.entries)
    for (const key of ["m_origin", "m_dirVec", "m_runDirProj", "m_riserDir"]) {
      const a = e.value[key];
      if (Array.isArray(a)) e.value[key] = [a[0] - a[1], a[0] + a[1], a[2]];
    }
  for (const t of f.receipt.terminals) {
    t.originalLogicalPointFeet = point(t.originalLogicalPointFeet);
    t.physicalAttachmentPointFeet = point(t.physicalAttachmentPointFeet);
    t.approachFeet = t.approachFeet.map(point);
    delete (t as { lateralAxis?: string }).lateralAxis;
    t.lateralDirectionFeet = [-1, 1];
  }
  for (const s of f.receipt.stations) {
    s.pointFeet = point(s.pointFeet);
    delete (s as { lateralAxis?: string }).lateralAxis;
    s.lateralDirectionFeet = [-1, 1];
  }
  for (const t of f.demand.terminals) {
    const [x, y, z] = t.node.pointFeet;
    t.node.pointFeet = [x - y, x + y, z];
  }
  f.index.sourceCensusScopeFeet = {
    minimum: p(-30, -30, -1),
    maximum: p(30, 30, 20),
  };
  return f;
}
function replayBoth(
  f: ReturnType<typeof fixture>,
  direction: "forward" | "reverse" = "forward",
) {
  const result = browser.replayPortableSteppedStairV2(
    f.index,
    f.receipt,
    f.demand,
    f.demand,
    { direction },
  );
  const index = native.decodeSteppedStairV2Operands(
    browser.encodeSteppedStairV2Operands(f.index),
  ) as native.PortableSteppedSourceIndex;
  const receipt = native.decodeSteppedStairV2Operands(
    browser.encodeSteppedStairV2Operands(f.receipt),
  ) as native.PortableSteppedReceipt;
  const counterpart = native.replayPortableSteppedStairV2(
    index,
    receipt,
    f.demand,
    f.demand,
    { direction },
  );
  assert.equal(
    browser.encodeSteppedStairV2Operands(result),
    native.encodeSteppedStairV2Operands(counterpart),
  );
  return result;
}
test("source-oriented runtime geometry passes both directions with exact native/browser parity and transport", () => {
  const f = orientedFixture();
  for (const direction of ["forward", "reverse"] as const) {
    const result = replayBoth(f, direction);
    assert.equal(
      result.mathematicalReplayPassed,
      true,
      result.issues.join("; "),
    );
    assert.equal(result.routeApproved, false);
    assert.equal(result.originalSourceAuthorityGranted, false);
    assert.equal(result.checkedMovements, 10);
  }
  assert.equal(
    replayBoth({ ...f, receipt: clone(f.receipt) }).mathematicalReplayPassed,
    true,
  );
});
test("oriented runtime retains holes, raised foreign/own material, unknown bodies, stale source and orientation refusals", () => {
  for (const owner of [20, 99]) {
    const f = orientedFixture(),
      id = `raised:${owner}`,
      key = `body:${owner}`;
    f.index.cells.push({
      id,
      nativeOwnerId: owner,
      originalFaceTokens: [999],
      minimumElevationFeet: r(3),
      maximumElevationFeet: r(4),
      partsFeet: rect(0.25, 0.75, 0.25, 0.75),
      closedSegmentsFeet: [],
    });
    const existing = f.index.physicalBodies.find(
      (b) => b.nativeOwnerId === owner,
    );
    if (existing?.representation.kind === "cells")
      existing.representation.cellIds.push(id);
    else {
      f.index.requiredPhysicalBodyKeys.push(key);
      f.index.physicalBodies.push({
        key,
        nativeOwnerId: owner,
        representation: { kind: "cells", cellIds: [id] },
      });
    }
    assert.equal(replayBoth(f).mathematicalReplayPassed, false);
  }
  const hole = orientedFixture();
  hole.index.supports[1]!.innerPartsFeet = nativeRationalOverlay(
    "difference",
    hole.index.supports[1]!.innerPartsFeet,
    rect(0.4, 0.6, 0.4, 0.6),
  );
  assert.equal(replayBoth(hole).mathematicalReplayPassed, false);
  const unknown = orientedFixture();
  unknown.index.physicalBodies[0]!.representation = {
    kind: "unknown",
    reason: "Unqualified source body",
  };
  assert.equal(replayBoth(unknown).mathematicalReplayPassed, false);
  const stale = orientedFixture();
  stale.receipt.sourceModelSha256 = "c".repeat(64);
  assert.equal(replayBoth(stale).mathematicalReplayPassed, false);
  for (const direction of [[0, 0], []]) {
    const f = orientedFixture();
    (
      f.receipt.stations[0] as { lateralDirectionFeet: readonly number[] }
    ).lateralDirectionFeet = direction;
    assert.equal(replayBoth(f).mathematicalReplayPassed, false);
  }
  const nonfinite = orientedFixture();
  (
    nonfinite.receipt.stations[0] as { lateralDirectionFeet: readonly number[] }
  ).lateralDirectionFeet = [Infinity, 1];
  assert.equal(
    browser.replayPortableSteppedStairV2(
      nonfinite.index,
      nonfinite.receipt,
      nonfinite.demand,
      nonfinite.demand,
    ).mathematicalReplayPassed,
    false,
  );
  assert.throws(
    () => browser.encodeSteppedStairV2Operands(nonfinite.receipt),
    /Nonfinite/,
  );
  const ambiguous = orientedFixture();
  (ambiguous.receipt.stations[0] as { lateralAxis?: string }).lateralAxis = "x";
  assert.equal(replayBoth(ambiguous).mathematicalReplayPassed, false);
  const changedGraph = orientedFixture(),
    current = clone(changedGraph.demand);
  current.terminals[0]!.node.pointFeet[0] += 1;
  assert.equal(
    browser.replayPortableSteppedStairV2(
      changedGraph.index,
      changedGraph.receipt,
      changedGraph.demand,
      current,
    ).mathematicalReplayPassed,
    false,
  );
});
test("nonzero authored base retains local typed references and the root extent guard in both runtime copies", () => {
  const f = orientedFixture();
  f.index.run.root.m_baseRiserIndex = 12;
  f.index.run.root.m_topRiserIndex = 15;
  assert.equal(replayBoth(f).mathematicalReplayPassed, true);
  const info = f.index.run.entries.find(
    (e) => e.sourceClassName === "StairsTreadInfo",
  )!;
  (info.value.m_startRiser as { m_specifiedIdx: number }).m_specifiedIdx = 12;
  assert.equal(replayBoth(f).mathematicalReplayPassed, false);
  (info.value.m_startRiser as { m_specifiedIdx: number }).m_specifiedIdx = 0;
  f.index.run.root.m_topRiserIndex = 16;
  assert.equal(replayBoth(f).mathematicalReplayPassed, false);
});
