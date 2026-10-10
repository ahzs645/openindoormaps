import assert from "node:assert/strict";
import test from "node:test";
import {
  NATIVE_PHYSICAL_LEVEL_RECORDS_VERSION,
  nativePhysicalLevelAssignment,
  nativePhysicalLevelAssignments,
  nativePhysicalLevelRecords,
  nativeRecordPhysicalLevelId,
  type NativePhysicalLevelData,
} from "../../app/indoor-project/native-physical-level-records";
import * as mirror from "../../../reviter/lib/reviter/native-physical-level-records";

type P = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): P[][] => [
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
];
const LOWER = 1, UPPER = 2; // Floor 0.5 (-3.28 ft) and Floor 1.25 (+3.28 ft)
const room = (key: string, levelId: number, rings: P[][], extra: Partial<{ elevationFeet: number; stair: boolean; walkable: boolean }> = {}) => ({
  key, levelId, ringsFeet: rings, elevationFeet: extra.elevationFeet ?? (levelId === LOWER ? -3.28 : 3.28),
  stair: extra.stair ?? false, walkable: extra.walkable ?? true,
});
const dataset = (records: ReturnType<typeof room>[], upperSlab = rect(40, 0, 50, 20)): NativePhysicalLevelData => ({
  nativeLevels: [ { id: LOWER, elevationFeet: -3.28 }, { id: UPPER, elevationFeet: 3.28 } ],
  records,
  walkingSupport: { floors: [
    { nativeElementId: 10, elevationFeet: -3.28, ringsFeet: rect(0, 0, 40, 20) },
    { nativeElementId: 11, elevationFeet: 3.28, ringsFeet: upperSlab },
  ] },
  nativePhysicalLevels: { levels: [
    { nativeLevelId: LOWER, elevationFeet: -3.28, nativeFloorElementIds: [10] },
    { nativeLevelId: UPPER, elevationFeet: 3.28, nativeFloorElementIds: [11] },
  ] },
});

test("a stepped theatre registered on its entrance level is labelled on the physical level of its native floor", () => {
  // 80% of the outline descends onto the Floor 0.5 slab; 20% is the Floor 1.25 top aisle.
  const theatre = room("theatre", UPPER, rect(0, 0, 50, 20));
  const data = dataset([theatre]);
  const a = nativePhysicalLevelAssignment(data, theatre)!;
  assert.equal(a.identityLevelId, UPPER);
  assert.equal(a.physicalLevelId, LOWER);
  assert.ok(Math.abs(a.ownSupportFraction - 0.2) < 1e-9);
  assert.ok(Math.abs(a.physicalSupportFraction - 0.8) < 1e-9);
  assert.deepEqual(a.nativeFloorIds, [10]);
  assert.equal(nativeRecordPhysicalLevelId(data, theatre), LOWER);
  assert.deepEqual(nativePhysicalLevelRecords(data, LOWER).map((r) => r.key), ["theatre"]);
  assert.deepEqual(nativePhysicalLevelRecords(data, UPPER), []);
  // levelId remains the directory/display identity.
  assert.equal(theatre.levelId, UPPER);
  assert.match(NATIVE_PHYSICAL_LEVEL_RECORDS_VERSION, /-v1$/);
});

test("a room supported at its own level is unchanged, and stair or non-walkable records are never relabelled", () => {
  const same = room("same", UPPER, rect(40, 0, 50, 20));
  const lower = room("lower", LOWER, rect(0, 0, 40, 20));
  const stair = room("stair", UPPER, rect(0, 0, 30, 20), { stair: true });
  const voidRoom = room("void", UPPER, rect(0, 0, 30, 20), { walkable: false });
  const data = dataset([same, lower, stair, voidRoom]);
  assert.equal(nativePhysicalLevelAssignments(data).size, 0);
  assert.deepEqual(nativePhysicalLevelRecords(data, UPPER).map((r) => r.key), ["same", "stair", "void"]);
  assert.deepEqual(nativePhysicalLevelRecords(data, LOWER).map((r) => r.key), ["lower"]);
  // Without the physical-level inventory nothing moves.
  const legacy = { ...dataset([room("t", UPPER, rect(0, 0, 50, 20))]), nativePhysicalLevels: undefined };
  assert.equal(nativePhysicalLevelAssignments(legacy).size, 0);
});

test("the 50% boundaries: exactly half on the own level stays; exactly half on the other level moves", () => {
  // Outline 20..60 x 0..20 (800 sq ft). Upper slab 40..60: own support exactly 50% -> stays.
  const half = room("half", UPPER, rect(20, 0, 60, 20));
  assert.equal(nativePhysicalLevelAssignment(dataset([half], rect(40, 0, 60, 20)), half), undefined);
  // Upper slab 40.4..60: own 49%; lower slab 0..40 covers exactly 50% -> moves.
  const a = nativePhysicalLevelAssignment(dataset([half], rect(40.4, 0, 60, 20)), half)!;
  assert.equal(a.physicalLevelId, LOWER);
  assert.equal(a.physicalSupportFraction, 0.5);
  // Neither side reaches 50%: identity kept.
  const narrow = room("narrow", UPPER, rect(30, 0, 70, 20)); // lower 25%, upper 50% of 40..60 -> 25% (slab 40.4..60 -> 24.5%)
  assert.equal(nativePhysicalLevelAssignment(dataset([narrow], rect(40.4, 0, 60, 20)), narrow), undefined);
});

test("stacked candidates resolve only by the room's own native surface elevation; beyond a half-storey nothing moves", () => {
  const theatre = room("t", UPPER, rect(0, 0, 50, 20), { elevationFeet: -3.28 });
  const data = dataset([theatre]);
  data.nativeLevels.push({ id: 3, elevationFeet: -1 });
  data.walkingSupport!.floors.push({ nativeElementId: 12, elevationFeet: -1, ringsFeet: rect(0, 0, 40, 20) });
  data.nativePhysicalLevels!.levels.push({ nativeLevelId: 3, elevationFeet: -1, nativeFloorElementIds: [12] });
  assert.equal(nativePhysicalLevelAssignment(data, theatre)!.physicalLevelId, LOWER);
  const ambiguous = { ...theatre, elevationFeet: 3.28 };
  assert.equal(nativePhysicalLevelAssignment(data, ambiguous), undefined);
  const far = dataset([room("far", UPPER, rect(0, 0, 50, 20))]);
  far.nativeLevels[0].elevationFeet = -4;
  far.walkingSupport!.floors[0].elevationFeet = -4;
  far.nativePhysicalLevels!.levels[0].elevationFeet = -4;
  assert.equal(nativePhysicalLevelAssignment(far, far.records[0] as never), undefined);
});

test("the reviter mirror implements the identical rule", () => {
  const cases = [
    dataset([room("theatre", UPPER, rect(0, 0, 50, 20)), room("same", UPPER, rect(40, 0, 50, 20))]),
    dataset([room("half", UPPER, rect(20, 0, 60, 20))], rect(40, 0, 60, 20)),
    dataset([room("half", UPPER, rect(20, 0, 60, 20))], rect(40.4, 0, 60, 20)),
  ];
  assert.equal(mirror.NATIVE_PHYSICAL_LEVEL_RECORDS_VERSION, NATIVE_PHYSICAL_LEVEL_RECORDS_VERSION);
  for (const data of cases)
    assert.deepEqual(
      [...mirror.nativePhysicalLevelAssignments(structuredClone(data) as never).entries()],
      [...nativePhysicalLevelAssignments(data).entries()],
    );
});
