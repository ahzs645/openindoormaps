import assert from "node:assert/strict";
import test from "node:test";
import OverlayOp from "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js";
import { exactNativeDoorFloorDifference } from "../../app/indoor-project/native-door-exact-overlay";
import { exactNativeDoorFloorDifference as sourceDifference } from "../../../reviter/lib/reviter/native-door-exact-overlay.ts";
import { nativePlanarPointInParts } from "../../app/indoor-project/native-planar-path-support";
type P = [number, number];
const rect = (a: number, b: number, c: number, d: number): P[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
test("independent exact threshold overlay bypasses the JSTS hidden snapping wrapper and preserves a thin real gap", () => {
  const subject = [rect(1000, 1000, 1010, 1010)],
    gap = 1e-10,
    floors = [
      [rect(1000, 1000, 1005 - gap / 2, 1010)],
      [rect(1005 + gap / 2, 1000, 1010, 1010)],
    ];
  const before = JSON.stringify([subject, floors]),
    original = OverlayOp.difference;
  OverlayOp.difference = () => {
    throw new Error(
      "The snapping wrapper must never be used by the exact fallback.",
    );
  };
  try {
    const result = exactNativeDoorFloorDifference(subject, floors);
    assert.ok(nativePlanarPointInParts([1005, 1005], result));
    assert.deepEqual(result, sourceDifference(subject, floors));
    assert.equal(JSON.stringify([subject, floors]), before);
  } finally {
    OverlayOp.difference = original;
  }
});
