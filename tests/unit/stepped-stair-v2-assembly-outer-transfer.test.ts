import test from "node:test";
import assert from "node:assert/strict";
import { fixture as portableFixture } from "../fixtures/stepped-stair-v2.ts";
import { encodeSteppedStairV2Operands as encodeBrowser } from "../../app/indoor-project/native-stepped-stair-v2-kernel.ts";
import {
  rational,
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import { inspectOriginalFloorCapBoundaryDemand } from "../../../reviter/lib/reviter/native-source-floor-cap-demand.ts";
import type { OriginalLocalFloorCapEnvelope } from "../../../reviter/lib/reviter/native-source-floor-local-support.ts";
import { deriveUntrustedAssemblyOuterTransferFloorGap } from "../../scripts/indoor/proposals/stepped-stair-v2-assembly-source-adapter.ts";
import {
  decodeSteppedStairV2Operands,
  encodeSteppedStairV2Operands,
  replayUntrustedSteppedRunPiece,
  type PortableSteppedSourceIndex,
  type PortableSteppedReceipt,
  type PortableSteppedRunPieceReceipt,
  type PortableSteppedRunPieceDemand,
} from "../../scripts/indoor/proposals/stepped-stair-v2-kernel.ts";
const rect = (x0: number, x1: number, y0 = -2, y1 = 2): NativeRationalParts => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map((p) => [rational(p[0]!), rational(p[1]!)]),
  ],
];
type Original = Extract<
  PortableSteppedRunPieceDemand["terminals"][number],
  { kind: "original-graph" }
>["original"];
function fixture(outerSide: 0 | 1 = 0) {
  const raw = portableFixture();
  const f = decodeSteppedStairV2Operands(encodeBrowser(raw)) as {
    index: PortableSteppedSourceIndex;
    receipt: PortableSteppedReceipt;
    demand: {
      sourceModelSha256: string;
      edge: PortableSteppedRunPieceDemand["edge"];
      terminals: [Original, Original];
    };
  };
  const innerSide = outerSide === 0 ? 1 : 0,
    old = f.receipt.terminals[innerSide],
    landing = f.index.supports.find((s) => s.id === old.floorSupportId)!;
  landing.role = "landing";
  landing.sourceGeometryOwnerElementId = landing.nativeOwnerId + 1;
  delete landing.nativeLevelId;
  landing.sourceOccurrenceFrameSha256 = "c".repeat(64);
  f.index.cells
    .filter((c) => c.nativeOwnerId === landing.nativeOwnerId)
    .forEach((c) => {
      c.sourceGeometryOwnerElementId = landing.sourceGeometryOwnerElementId;
    });
  const bound = {
    kind: "source-landing" as const,
    nativeLandingId: landing.nativeOwnerId,
    nativeDefinitionId: landing.sourceGeometryOwnerElementId,
    originalLandingSemanticFrameSha256: "d".repeat(64),
    originalOccurrenceFrameSha256: "c".repeat(64),
    originalCapFaceToken: landing.physicalFaceToken,
    originalNominalElevationFeet: innerSide ? 3 : 0,
    requestedBoundaryPointFeet: old.physicalAttachmentPointFeet,
  };
  const receipt: PortableSteppedRunPieceReceipt = {
    ...f.receipt,
    terminals: [...f.receipt.terminals],
  };
  receipt.terminals[innerSide] = {
    ...bound,
    physicalAttachmentPointFeet: old.physicalAttachmentPointFeet,
    nominalToPhysicalHeightDeltaFeet: rational(0),
    boundarySupportId: landing.id,
    approachFeet: old.approachFeet,
    lateralAxis: "y",
  };
  const boundary: PortableSteppedRunPieceDemand = {
    sourceModelSha256: f.demand.sourceModelSha256,
    edge: f.demand.edge,
    terminals: f.demand.terminals.map((original) => ({
      kind: "original-graph" as const,
      original,
    })) as PortableSteppedRunPieceDemand["terminals"],
  };
  boundary.terminals[innerSide] = bound;
  const outer = receipt.terminals[outerSide];
  assert("floorSupportId" in outer);
  const floor = f.index.supports.find((s) => s.id === outer.floorSupportId)!;
  floor.referencePartsFeet = outerSide ? rect(2.25, 6) : rect(-5, -0.25);
  floor.innerPartsFeet = floor.referencePartsFeet;
  return { index: f.index, receipt, boundary, floor, landing, outerSide };
}
const expand = (f: ReturnType<typeof fixture>) => {
  const gap = deriveUntrustedAssemblyOuterTransferFloorGap(
    f.index,
    f.receipt,
    f.outerSide,
  );
  f.floor.referencePartsFeet = nativeRationalOverlay(
    "union",
    f.floor.referencePartsFeet,
    gap,
  );
  f.floor.innerPartsFeet = f.floor.referencePartsFeet;
  return gap;
};
test("only the selected original outer floor receives the exact missing transfer demand; unchanged full kernels still run in both directions", () => {
  for (const side of [0, 1] as const) {
    const f = fixture(side),
      before = encodeSteppedStairV2Operands({
        receipt: f.receipt,
        landing: f.landing,
        boundary: f.boundary,
      });
    const prior = replayUntrustedSteppedRunPiece(
      f.index,
      f.receipt,
      f.boundary,
    );
    assert.equal(prior.mathematicalReplayPassed, false);
    assert.match(prior.issues.join(";"), /body\/cap\/intent corridor/);
    const gap = expand(f),
      expected = side ? rect(2, 2.25, -1, 1) : rect(-0.25, 0, -1, 1);
    assert.deepEqual(nativeRationalOverlay("difference", gap, expected), []);
    assert.deepEqual(nativeRationalOverlay("difference", expected, gap), []);
    assert.equal(
      encodeSteppedStairV2Operands({
        receipt: f.receipt,
        landing: f.landing,
        boundary: f.boundary,
      }),
      before,
    );
    assert.deepEqual(
      deriveUntrustedAssemblyOuterTransferFloorGap(f.index, f.receipt, side),
      [],
    );
    for (const direction of ["forward", "reverse"] as const) {
      const result = replayUntrustedSteppedRunPiece(
        f.index,
        f.receipt,
        f.boundary,
        { direction },
      );
      assert.equal(
        result.mathematicalReplayPassed,
        true,
        result.issues.join(";"),
      );
      assert.equal(result.originalSourceAuthorityGranted, false);
      assert.equal(result.routeApproved, false);
    }
  }
});
test("a source landing, foreign snapshot, stale level and incomplete local sequence cannot request an outer floor expansion", () => {
  const changes = [
    (f: ReturnType<typeof fixture>) => {
      f.receipt.sourceModelSha256 = "f".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.run.nativeRunId = 999;
    },
    (f: ReturnType<typeof fixture>) => {
      f.floor.nativeLevelId = 999;
    },
    (f: ReturnType<typeof fixture>) => {
      f.landing.sourceGeometryOwnerElementId = 999;
    },
    (f: ReturnType<typeof fixture>) => {
      f.receipt.stations.shift();
    },
    (f: ReturnType<typeof fixture>) => {
      f.index.run.root.m_topRiserIndex = 4;
    },
  ];
  for (const change of changes) {
    const f = fixture();
    change(f);
    assert.throws(
      () => deriveUntrustedAssemblyOuterTransferFloorGap(f.index, f.receipt, 0),
      /binding|identity|sequence/,
    );
  }
  const f = fixture(),
    before = encodeSteppedStairV2Operands(f.landing);
  assert.throws(
    () => deriveUntrustedAssemblyOuterTransferFloorGap(f.index, f.receipt, 1),
    /binding/,
  );
  assert.equal(encodeSteppedStairV2Operands(f.landing), before);
});
test("a missing gap is still only a demand: full original floor holes and closed uncertainty can refuse it", () => {
  const f = fixture(),
    gap = deriveUntrustedAssemblyOuterTransferFloorGap(f.index, f.receipt, 0),
    hole = rect(-0.2, -0.1, -0.5, 0.5)[0]![0]!;
  const cap = {
    nativeFloorElementId: f.floor.nativeOwnerId,
    originalFaceToken: f.floor.physicalFaceToken,
    originalPhysicalTopElevationFeet: rational(0),
    originalCapLoopTokens: [1],
    originalCapEdgeTokens: [1, 2, 3, 4],
    originalChainEnvelopeLoops: [],
    originalReferenceWindingPartsFeet: rect(-5, 6, -3, 3),
    retainedPositiveBoundaryUncertaintyPartsFeet: [],
    retainedZeroAreaBoundarySegmentsFeet: [],
  } as unknown as OriginalLocalFloorCapEnvelope;
  assert.equal(
    inspectOriginalFloorCapBoundaryDemand(cap, gap)
      .completeConnectedDemandSupported,
    true,
  );
  cap.originalReferenceWindingPartsFeet[0]!.push(hole);
  cap.originalCapLoopTokens.push(2);
  cap.retainedZeroAreaBoundarySegmentsFeet = hole.map((p, i) => [
    p,
    hole[(i + 1) % hole.length]!,
  ]);
  const proof = inspectOriginalFloorCapBoundaryDemand(cap, gap);
  assert.equal(proof.completeConnectedDemandSupported, false);
  assert.equal(proof.retainedOriginalHoleCount, 1);
  assert.equal(proof.originalSourceAuthorityGranted, false);
  assert.equal(proof.routeApproved, false);
});
test("expanding a proved floor patch never clears foreign bodies, unknown material or an unsupported internal landing", () => {
  for (const mode of ["foreign", "unknown", "landing"] as const) {
    const f = fixture();
    expand(f);
    if (mode === "landing") f.landing.innerPartsFeet = [];
    else {
      const key = "retained:foreign";
      f.index.requiredPhysicalBodyKeys.push(key);
      if (mode === "unknown")
        f.index.physicalBodies.push({
          key,
          nativeOwnerId: 999,
          representation: {
            kind: "unknown",
            reason: "complete source body unresolved",
          },
        });
      else {
        const id = "retained:foreign:cell";
        f.index.cells.push({
          id,
          nativeOwnerId: 999,
          originalFaceTokens: [900],
          minimumElevationFeet: rational(0.75),
          maximumElevationFeet: rational(2),
          partsFeet: rect(-0.15, -0.05, -0.5, 0.5),
          closedSegmentsFeet: [],
        });
        f.index.physicalBodies.push({
          key,
          nativeOwnerId: 999,
          representation: { kind: "cells", cellIds: [id] },
        });
      }
    }
    const result = replayUntrustedSteppedRunPiece(
      f.index,
      f.receipt,
      f.boundary,
    );
    assert.equal(result.mathematicalReplayPassed, false);
    assert.equal(result.routeApproved, false);
    assert.equal(result.originalSourceAuthorityGranted, false);
    if (mode === "foreign")
      assert.equal(result.materialContacts[0]?.nativeOwnerId, 999);
    if (mode === "unknown")
      assert.deepEqual(result.unknownPhysicalBodyKeys, ["retained:foreign"]);
  }
});
