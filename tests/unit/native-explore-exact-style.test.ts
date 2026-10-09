import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import { nativeExploreRegionStyle } from "../../app/indoor-project/native-explore";
import { roomDisplayColor } from "../../app/indoor-project/display-geometry";
import {
  Rational,
  rational,
  nativeRationalOverlay,
  type NativeRationalParts,
} from "../../app/indoor-project/native-rational-overlay";
import { nativeRationalArea } from "../../app/indoor-project/native-exact-planar-topology";
import type { NativeAreaRegion } from "../../app/indoor-project/native-area-review";
import type { IndoorRecord } from "../../app/indoor-project/contract";

export const rect = (
  x: number,
  y: number,
  right: number,
  top: number,
): [number, number][] => [
  [x, y],
  [right, y],
  [right, top],
  [x, top],
];
export const region: NativeAreaRegion = {
  id: "style-test",
  ringsFeet: [rect(0, 0, 2, 1)],
  displayPartsFeet: [[rect(0, 0, 2, 1)]],
  roomKeys: [],
  nativeFloorIds: [],
  nativeDoorIds: [],
  areaSquareFeet: 2,
  exposedFloorEdgeFeet: 0,
};
export function food(ringsFeet: [number, number][][]): IndoorRecord {
  return {
    ...fixture().records[0],
    name: "Dining Hall",
    circulation: false,
    ringsFeet,
  };
}
const neutral = { color: "#e9edef", circulation: false };
test("exact style retains strict half ties and arbitrarily small positive majority differences", () => {
  const den = 10n ** 520n;
  const claim = food([rect(0, 0, 1, 1)]);
  for (const step of [-1n, 0n, 1n]) {
    const right = new Rational(2n * den + step, den);
    const exact: NativeRationalParts = [
      [
        [
          [0, 0],
          [right, 0],
          [right, 1],
          [0, 1],
        ].map((p) => p.map(rational) as [Rational, Rational]),
      ],
    ];
    const coverage = nativeRationalOverlay("intersection", exact, [
      [...claim.ringsFeet],
    ]);
    const totalArea = nativeRationalArea(exact),
      coverageArea = nativeRationalArea(coverage);
    const oldMajority =
      totalArea.n > 0n &&
      2n * coverageArea.n * totalArea.d > totalArea.n * coverageArea.d;
    assert.equal(oldMajority, step < 0n);
    assert.deepEqual(
      nativeExploreRegionStyle(region, [claim], undefined, exact),
      oldMajority
        ? { color: roomDisplayColor(claim, false), circulation: false }
        : neutral,
    );
  }
  assert.deepEqual(
    nativeExploreRegionStyle(region, [claim], undefined, []),
    neutral,
  );
});
test("mixed categories, duplicate claims and both ring orientations retain whole-face holes", () => {
  const claims = [
    food([rect(0, 0, 1.2, 1)]),
    {
      ...fixture().records[1],
      name: "Corridor",
      circulation: true,
      ringsFeet: [rect(0.8, 0, 2, 1)],
    },
  ];
  const holes = [rect(0.1, 0.1, 0.3, 0.4), rect(1.6, 0.1, 1.9, 0.4)];
  const exact = nativeRationalOverlay(
    "difference",
    [[rect(0, 0, 2, 1)]],
    holes.map((r) => [r]),
  );
  const before = exact.map((p) =>
    p.map((r) => r.map((q) => q.map((v) => [String(v.n), String(v.d)]))),
  );
  for (const parts of [
    exact,
    exact.map((p) => p.map((r) => [...r].reverse())),
  ]) {
    assert.deepEqual(
      nativeExploreRegionStyle(region, claims, undefined, parts),
      neutral,
    );
    assert.deepEqual(
      nativeExploreRegionStyle(
        region,
        [claims[1], claims[0]],
        undefined,
        parts,
      ),
      neutral,
    );
    const majorityFood = food([rect(0, 0, 1.6, 1)]);
    assert.deepEqual(
      nativeExploreRegionStyle(
        region,
        [majorityFood, majorityFood],
        undefined,
        parts,
      ),
      { color: roomDisplayColor(majorityFood, false), circulation: false },
    );
    const holeClaim = food([holes[0]]);
    assert.deepEqual(
      nativeExploreRegionStyle(region, [holeClaim], undefined, parts),
      neutral,
    );
  }
  assert.deepEqual(
    exact.map((p) =>
      p.map((r) => r.map((q) => q.map((v) => [String(v.n), String(v.d)]))),
    ),
    before,
  );
});
