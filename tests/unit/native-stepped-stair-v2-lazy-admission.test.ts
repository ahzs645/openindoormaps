import test from "node:test";
import assert from "node:assert/strict";
import { rational as r } from "../../app/indoor-project/native-rational-overlay";
import {
  replayPortableSteppedStairV2,
  encodeSteppedStairV2WireValue,
  decodeSteppedStairV2WireValue,
  type PortableSteppedSourceIndex,
  type SteppedStairV2WireValue,
} from "../../app/indoor-project/native-stepped-stair-v2-kernel";
import { replayPortableSteppedStairV2Wire } from "../../app/indoor-project/native-stepped-stair-v2-lazy-wire";
import { fixture, rect } from "../fixtures/stepped-stair-v2";
function farFixture() {
  const f = fixture();
  f.index.cells.push({
    id: "foreign:900",
    nativeOwnerId: 900,
    originalFaceTokens: [99],
    geometryKind: "native-face-cells",
    minimumElevationFeet: r(0),
    maximumElevationFeet: r(20),
    partsFeet: rect(100, 102),
    closedSegmentsFeet: [],
  });
  f.index.requiredPhysicalBodyKeys.push("far-body:900");
  f.index.physicalBodies.push({
    key: "far-body:900",
    nativeOwnerId: 900,
    representation: { kind: "cells", cellIds: ["foreign:900"] },
  });
  return f;
}
function both(
  indexWire: SteppedStairV2WireValue,
  f: ReturnType<typeof farFixture>,
) {
  let full = false,
    lazy = false;
  try {
    full = replayPortableSteppedStairV2(
      decodeSteppedStairV2WireValue(indexWire) as PortableSteppedSourceIndex,
      f.receipt,
      f.demand,
      f.demand,
    ).mathematicalReplayPassed;
  } catch {
    /* A malformed exact transport is a refusal. */
  }
  try {
    lazy = replayPortableSteppedStairV2Wire(
      indexWire,
      encodeSteppedStairV2WireValue(f.receipt),
      f.demand,
      f.demand,
    ).mathematicalReplayPassed;
  } catch {
    /* The lazy scanner must refuse the same invalid source shape. */
  }
  return { full, lazy };
}
test("strictly disjoint cell substitution preserves every full-replay metadata, physical-owner and census refusal", () => {
  const changes = [
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.id = "";
    },
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.nativeOwnerId = -1;
    },
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.geometryKind = "unsupported" as never;
    },
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.originalFaceTokens = [99, 99];
    },
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.originalFaceTokens = [];
    },
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.minimumElevationFeet = r(21);
    },
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.partsFeet[0]![0]!.pop();
      i.cells.at(-1)!.partsFeet[0]![0]!.pop();
    },
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.geometryKind = "bounded-source-primitive";
    },
    (i: PortableSteppedSourceIndex) => {
      i.physicalBodies.at(-1)!.representation = {
        kind: "unknown",
        reason: "Unknown original branch",
      };
    },
    (i: PortableSteppedSourceIndex) => {
      i.physicalBodies.at(-1)!.representation = {
        kind: "cells",
        cellIds: ["cell:tread:0"],
      };
    },
    (i: PortableSteppedSourceIndex) => {
      i.physicalBodies.pop();
    },
    (i: PortableSteppedSourceIndex) => {
      i.cells.at(-1)!.id = i.cells[0]!.id;
    },
  ];
  for (const change of changes) {
    const f = farFixture();
    change(f.index);
    assert.deepEqual(both(encodeSteppedStairV2WireValue(f.index), f), {
      full: false,
      lazy: false,
    });
  }
});
test("outer boxes do not grant original-source authority to arbitrary far polygons", () => {
  const f = farFixture();
  f.index.cells.at(-1)!.partsFeet = [
    [
      [
        [r(100), r(0)],
        [r(102), r(2)],
        [r(100), r(2)],
        [r(102), r(0)],
      ],
    ],
  ];
  // The mathematical kernel validates portable shapes, not the original body
  // constructor's independent topology/semantic authority. Both paths retain
  // that boundary and grant no source or route approval.
  const wire = encodeSteppedStairV2WireValue(f.index),
    result = replayPortableSteppedStairV2Wire(
      wire,
      encodeSteppedStairV2WireValue(f.receipt),
      f.demand,
      f.demand,
    );
  assert.deepEqual(both(wire, f), { full: true, lazy: true });
  assert.equal(result.originalSourceAuthorityGranted, false);
  assert.equal(result.routeApproved, false);
});
