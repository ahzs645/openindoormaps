import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeDoorClearOpening,
  validateNativeDoorClearOpeningProfile,
} from "../../app/indoor-project/native-door-clear-opening";
import { nativeDoorClearOpening as sourceOpening } from "../../../reviter/lib/reviter/native-door-clear-opening";
import { nativeDoorFloorBlockers } from "../../app/indoor-project/native-door-floor-support";
import { nativeDoorFloorBlockers as sourceBlockers } from "../../../reviter/lib/reviter/native-door-floor-support";
import { validateNativeMaterialSections } from "../../app/indoor-project/native-material-sections";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const rect = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];
export function clearOpeningFixture() {
  const sha = "a".repeat(64),
    profile = {
      nativeDoorElementId: 10,
      hostWallNativeElementId: 20,
      sourceMemberNativeElementIds: [10],
      sourceBodyBaseFeet: 0,
      sourceBodyTopFeet: 7,
      originalJambPartsFeet: [
        [rect(4, 1, 4.1, 1.25)],
        [rect(4, 2.75, 4.1, 3)],
        [rect(5.9, 1, 6, 1.25)],
        [rect(5.9, 2.75, 6, 3)],
      ],
      sourceOwnedBodySha256: "b".repeat(64),
      sourceFaceTokens: [1, 2, 3, 4],
      evidenceSha256: "c".repeat(64),
    };
  return {
    source: { modelSha256: sha },
    nativeIndoorEnvelopes: {},
    nodes: [],
    doors: [
      {
        id: "door",
        nativeElementId: 10,
        hostWallNativeElementId: 20,
        pointFeet: [5, 2],
        normalFeet: [1, 0],
        footprintFeet: rect(4, 1, 6, 3),
      },
    ],
    edges: [
      {
        id: "door",
        nativeElementId: 10,
        kind: "door",
        enabled: true,
        pointsFeet: [
          [4.5, 2, 0],
          [5.5, 2, 0],
        ],
      },
    ],
    walkingSupport: {
      version: 1,
      sourceModelSha256: sha,
      floors: [
        {
          nativeElementId: 30,
          elevationFeet: 0,
          ringsFeet: [rect(4, 1.25, 6, 2.75)],
        },
      ],
    },
    nativeMaterialSections: {
      version: 1,
      sourceModelSha256: sha,
      geometrySha256: "d".repeat(64),
      levels: [
        {
          levelId: 1,
          elevationFeet: 0,
          cutElevationFeet: 0.1,
          evidenceSha256: "e".repeat(64),
          sourceElementIds: [20],
          sections: [],
          originalNativeHostRelations: [
            {
              hostNativeElementId: 20,
              memberNativeElementIds: [],
              physicalDoorNativeElementIds: [10],
              evidenceSha256: "f".repeat(64),
            },
          ],
          originalDoorClearOpeningProfiles: [profile],
        },
      ],
    },
  } as unknown as IndoorDataset;
}
test("finite original jambs certify the clear opening, not structural frame-end support", () => {
  const d = clearOpeningFixture(),
    before = JSON.stringify(d);
  validateNativeMaterialSections(
    d.nativeMaterialSections,
    d.source.modelSha256,
  );
  const ring = nativeDoorClearOpening(d, d.doors![0], 0)!;
  assert.ok(ring.every((p) => p[1] >= 1.25 && p[1] <= 2.75));
  assert.deepEqual(ring, sourceOpening(d, d.doors![0], 0));
  assert.equal(nativeDoorFloorBlockers(d).size, 0);
  assert.deepEqual(nativeDoorFloorBlockers(d), sourceBlockers(d));
  assert.equal(JSON.stringify(d), before);
  delete d.nativeMaterialSections;
  assert.ok(nativeDoorFloorBlockers(d).has("door"));
});
test("a real narrow source floor hole inside the independently measured clear opening remains blocked", () => {
  const d = clearOpeningFixture();
  d.walkingSupport!.floors[0].ringsFeet.push(
    rect(5 - 1e-8, 1.5, 5 + 1e-8, 2.5),
  );
  assert.ok(nativeDoorFloorBlockers(d).has("door"));
  assert.deepEqual(nativeDoorFloorBlockers(d), sourceBlockers(d));
});
test("source clear span retains normal depth and refuses a genuinely unsupported clear-opening corner", () => {
  const d = clearOpeningFixture();
  d.walkingSupport!.floors[0].ringsFeet[0] = [
    [4, 1.25],
    [6, 1.25],
    [6, 2.75],
    [4.01, 2.75],
    [4, 2.74],
  ];
  assert.ok(nativeDoorFloorBlockers(d).has("door"));
});
test("wrong host, wrong actual cut and unequal paired inner faces do not narrow the original body", () => {
  for (const edit of [
    (d: IndoorDataset) => (d.doors![0].hostWallNativeElementId = 21),
    (d: IndoorDataset) =>
      (d.nativeMaterialSections!.levels[0].cutElevationFeet = 4),
    (d: IndoorDataset) =>
      (d.nativeMaterialSections!.levels[0].originalDoorClearOpeningProfiles![0].originalJambPartsFeet[2][0][2][1] += 0.001),
  ]) {
    const d = clearOpeningFixture();
    edit(d);
    assert.equal(nativeDoorClearOpening(d, d.doors![0], 0), undefined);
    assert.ok(nativeDoorFloorBlockers(d).has("door"));
  }
});
test("arbitrary malformed original profile metadata is rejected", () => {
  const d = clearOpeningFixture(),
    p =
      d.nativeMaterialSections!.levels[0].originalDoorClearOpeningProfiles![0];
  p.sourceMemberNativeElementIds = [];
  assert.throws(() => validateNativeDoorClearOpeningProfile(p));
  assert.throws(() =>
    validateNativeMaterialSections(
      d.nativeMaterialSections,
      d.source.modelSha256,
    ),
  );
});
test("oblique original jamb clear width uses the preserved normal and keeps source/runtime byte parity", () => {
  const d = clearOpeningFixture(),
    angle = 0.37,
    c = Math.cos(angle),
    s = Math.sin(angle),
    turn = ([x, y]: [number, number]): [number, number] => [
      c * x - s * y,
      s * x + c * y,
    ];
  const door = d.doors![0];
  door.pointFeet = turn(door.pointFeet);
  door.normalFeet = [c, s];
  door.footprintFeet = door.footprintFeet!.map(turn);
  const p =
    d.nativeMaterialSections!.levels[0].originalDoorClearOpeningProfiles![0];
  p.originalJambPartsFeet = p.originalJambPartsFeet.map((q) =>
    q.map((r) => r.map(turn)),
  );
  d.walkingSupport!.floors[0].ringsFeet =
    d.walkingSupport!.floors[0].ringsFeet.map((r) => r.map(turn));
  const opening = nativeDoorClearOpening(d, door, 0);
  assert.ok(opening);
  assert.deepEqual(opening, sourceOpening(d, door, 0));
  // Rotate only the analytical opening proof here; floor overlay roundoff is
  // independently guarded rather than silently widening this original polygon.
  assert.deepEqual(nativeDoorFloorBlockers(d), sourceBlockers(d));
});

test("a malformed three-corner original jamb cannot authorize an invented clear span", () => {
  const d = clearOpeningFixture(),
    p =
      d.nativeMaterialSections!.levels[0].originalDoorClearOpeningProfiles![0];
  p.originalJambPartsFeet[0][0][3] = p.originalJambPartsFeet[0][0][0];
  assert.throws(() => validateNativeDoorClearOpeningProfile(p));
  assert.equal(nativeDoorClearOpening(d, d.doors![0], 0), undefined);
  assert.ok(nativeDoorFloorBlockers(d).has("door"));
});

test("historical physical snapshots may omit host metadata when the independently source-bound jamb packet has a unique persisted host", () => {
  const d = clearOpeningFixture(),
    before = JSON.stringify(d.doors);
  delete d.doors![0].hostWallNativeElementId;
  const without = JSON.stringify(d.doors);
  assert.ok(nativeDoorClearOpening(d, d.doors![0], 0));
  assert.equal(nativeDoorFloorBlockers(d).size, 0);
  assert.deepEqual(
    nativeDoorClearOpening(d, d.doors![0], 0),
    sourceOpening(d, d.doors![0], 0),
  );
  assert.equal(JSON.stringify(d.doors), without);
  assert.notEqual(before, without);
});
