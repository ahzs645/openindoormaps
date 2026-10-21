import { encodeSteppedStairV2Operands } from "../../app/indoor-project/native-stepped-stair-v2-kernel.ts";
import test from "node:test";
import { fixture as portableFixture } from "../fixtures/stepped-stair-v2.ts";
import {
  decodeSteppedStairV2Operands,
  type PortableSteppedSourceIndex,
  type PortableSteppedReceipt,
  Point3,
  SteppedMaterialCell,
} from "../../scripts/indoor/proposals/stepped-stair-v2-kernel.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rational,
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import { decodeRevit2027FramedGRepRoot } from "../../../reviter/lib/reviter/revit-2027-framed-grep-root.ts";
import { replayRevit2027GRepFifo } from "../../../reviter/lib/reviter/revit-2027-grep-replay.ts";
import { inspectOriginalNamedFloorCapBoundaryOperands } from "../../../reviter/lib/reviter/native-source-floor-local-support.ts";
import { inspectOriginalFloorCapBoundaryDemand } from "../../../reviter/lib/reviter/native-source-floor-cap-demand.ts";
import {
  deriveUntrustedTerminalTransferFloorGap,
  deriveUntrustedTerminalTransferFloorExtensions,
} from "../../scripts/indoor/proposals/stepped-stair-v2-terminal-transfer-demand.ts";
const rect = (x0: number, x1: number, y0 = -1, y1 = 1): NativeRationalParts => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map((p) => [rational(p[0]!), rational(p[1]!)]),
  ],
];
const support = (referencePartsFeet: NativeRationalParts) => ({
  referencePartsFeet,
  uncertaintyPartsFeet: [],
});
function request() {
  return {
    nativeRunId: 10,
    fromFeet: [rational(0), rational(0), rational(0)] as Point3,
    toFeet: [rational(2), rational(0), rational(1)] as Point3,
    lowerSupport: support(rect(-1, 0)),
    upperSupport: support(rect(2, 3)),
    originalIntentPlanPartsFeet: rect(0, 0.5),
    materialCells: [] as SteppedMaterialCell[],
  };
}
const cell = (
  owner: number,
  partsFeet: NativeRationalParts,
  z0 = 0,
  z1 = 1,
): SteppedMaterialCell => ({
  id: `cell:${owner}`,
  nativeOwnerId: owner,
  originalFaceTokens: [1],
  partsFeet,
  minimumElevationFeet: rational(z0),
  maximumElevationFeet: rational(z1),
  closedSegmentsFeet: [],
});
test("only the exact uncovered terminal strip is requested; foreign or different-height bodies cannot supply own support", () => {
  const demand = request();
  demand.materialCells.push(
    cell(10, rect(1, 2)),
    cell(20, rect(0.5, 1)),
    cell(10, rect(0.5, 1), 3, 4),
  );
  const gap = deriveUntrustedTerminalTransferFloorGap(demand);
  assert.deepEqual(nativeRationalOverlay("difference", gap, rect(0.5, 1)), []);
  assert.deepEqual(nativeRationalOverlay("difference", rect(0.5, 1), gap), []);
  demand.materialCells.push(cell(10, rect(0.5, 1)));
  assert.deepEqual(deriveUntrustedTerminalTransferFloorGap(demand), []);
});
test("empty or descending transfer requests refuse instead of becoming floor permission", () => {
  const d = request();
  d.toFeet = [...d.fromFeet];
  assert.throws(
    () => deriveUntrustedTerminalTransferFloorGap(d),
    /Nonascending|empty/,
  );
  d.toFeet = [rational(2), rational(0), rational(-1)];
  assert.throws(
    () => deriveUntrustedTerminalTransferFloorGap(d),
    /Nonascending/,
  );
});
test("expanded floor demand requires the complete actual original cap including every native hole", () => {
  const bytes = readFileSync(
    new URL(
      "../../../reviter/tests/fixtures/native-trimmed-floor-1505065.bin",
      import.meta.url,
    ),
  );
  const root = decodeRevit2027FramedGRepRoot(
    bytes,
    {
      offset: 0,
      elementId: 1_505_065,
      marker: 2246,
      objectLength: bytes.length - 20,
      typeCode: bytes.readUInt32LE(18),
    },
    2027,
  );
  assert(root.ok);
  const r = replayRevit2027GRepFifo(bytes, root.value);
  assert(r.ok);
  const cap = inspectOriginalNamedFloorCapBoundaryOperands(r.value, 5);
  const y = 528.549_533_827_279_7,
    q = request();
  q.fromFeet = [rational(30), rational(y), rational(24)];
  q.toFeet = [rational(32), rational(y), rational(25)];
  q.lowerSupport = support(rect(29, 30, y - 1, y + 1));
  q.upperSupport = support(rect(32, 33, y - 1, y + 1));
  q.originalIntentPlanPartsFeet = [];
  const gap = deriveUntrustedTerminalTransferFloorGap(q);
  const expanded = nativeRationalOverlay(
    "union",
    q.lowerSupport.referencePartsFeet,
    gap,
  );
  const proof = inspectOriginalFloorCapBoundaryDemand(cap, expanded);
  assert.equal(proof.completeConnectedDemandSupported, true);
  assert.equal(proof.retainedOriginalHoleCount, 5);
  assert.equal(proof.wholeFloorSolidApproved, false);
  assert.equal(proof.routeApproved, false);
  const hole = cap.originalReferenceWindingPartsFeet[0]![1]!;
  assert.equal(
    inspectOriginalFloorCapBoundaryDemand(cap, [[hole]])
      .completeConnectedDemandSupported,
    false,
  );
});

test("terminal wrapper binds the original ordered source sequence and preserves zero-gap requests", () => {
  const raw = portableFixture();
  const values = decodeSteppedStairV2Operands(
    encodeSteppedStairV2Operands({ index: raw.index, receipt: raw.receipt }),
  ) as { index: PortableSteppedSourceIndex; receipt: PortableSteppedReceipt };
  assert.deepEqual(
    deriveUntrustedTerminalTransferFloorExtensions(
      values.index,
      values.receipt,
    ),
    [[], []],
  );
  values.receipt.stations[0]!.supportId = "foreign";
  assert.throws(
    () =>
      deriveUntrustedTerminalTransferFloorExtensions(
        values.index,
        values.receipt,
      ),
    /support\/station/,
  );
});
