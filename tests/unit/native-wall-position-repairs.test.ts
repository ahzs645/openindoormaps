import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nativeWallPositionRepairedWalls,
  validateNativeWallPositionRepairs,
} from "../../app/indoor-project/native-wall-position-repairs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const sha = "a".repeat(64),
  quad = (x: number, y: number, w: number, h: number): [number, number][][] => [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  ];
function setup() {
  const original = quad(0, 1.002, 10, 0.3),
    corrected = quad(0, 0.9998, 10, 0.3),
    support = quad(0, 0, 10, 1);
  return {
    source: { modelSha256: sha },
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    walls: [
      { levelId: 1, nativeElementId: 10, ringsFeet: original },
      { levelId: 1, nativeElementId: 11, ringsFeet: support },
    ],
    walkingSupport: {
      version: 1,
      sourceModelSha256: sha,
      floors: [
        {
          nativeElementId: 20,
          elevationFeet: 0,
          ringsFeet: quad(-1, -1, 12, 4),
        },
      ],
    },
    records: [],
    doors: [],
    nativeWallPositionRepairs: {
      version: 1,
      sourceModelSha256: sha,
      walls: [
        {
          id: "normal-contact",
          levelId: 1,
          nativeElementId: 10,
          originalRingsFeet: original,
          ringsFeet: corrected,
          supportEvidence: { nativeElementId: 11, ringsFeet: support },
          evidenceSha256: sha,
          notes:
            "Native parallel face gap; same full thickness and original axis.",
        },
      ],
    },
  } as unknown as IndoorDataset & { nativeWallPositionRepairs: any };
}
test("full wall normal contact is immutable and idempotently validated after compilation", () => {
  const d = setup(),
    before = JSON.stringify(d),
    walls = nativeWallPositionRepairedWalls(d);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(
    walls[0].ringsFeet,
    d.nativeWallPositionRepairs.walls[0].ringsFeet,
  );
  assert.deepEqual(nativeWallPositionRepairedWalls({ ...d, walls }), walls);
  assert.throws(
    () =>
      nativeWallPositionRepairedWalls(
        { ...d, walls },
        { requireOriginal: true },
      ),
    /stale/,
  );
});
test("wrong source, axial translation, thickness change and larger moves fail", () => {
  const d = setup();
  assert.throws(
    () =>
      validateNativeWallPositionRepairs(
        d.nativeWallPositionRepairs,
        "b".repeat(64),
      ),
    /different/,
  );
  for (const mutate of [
    (x: any) => (x.ringsFeet = quad(0.001, 1.002, 10, 0.3)),
    (x: any) => (x.ringsFeet = quad(0, 0.9998, 10, 0.4)),
    (x: any) => (x.ringsFeet = quad(0, 0.98, 10, 0.3)),
  ]) {
    const x = structuredClone(d.nativeWallPositionRepairs);
    mutate(x.walls[0]);
    assert.throws(() => validateNativeWallPositionRepairs(x, sha));
  }
});
test("stale wall support, absent native contact and original overlaps fail", () => {
  for (const mutate of [
    (d: any) => (d.walls[1].ringsFeet = quad(0, 0, 9, 1)),
    (d: any) => {
      d.nativeWallPositionRepairs.walls[0].ringsFeet = quad(0, 1.001, 10, 0.3);
    },
    (d: any) => {
      d.walls[1].ringsFeet = quad(0, 0, 10, 1.003);
      d.nativeWallPositionRepairs.walls[0].supportEvidence.ringsFeet =
        d.walls[1].ringsFeet;
    },
  ]) {
    const d = setup();
    mutate(d);
    assert.throws(() => nativeWallPositionRepairedWalls(d));
  }
});
test("unsupported floor and floor holes remain protected", () => {
  for (const rs of [
    quad(0, 0, 2, 2),
    [quad(-1, -1, 12, 4)[0], quad(1, 0.9999, 1, 0.1)[0]],
  ]) {
    const d = setup();
    d.walkingSupport!.floors[0].ringsFeet = rs;
    assert.throws(() => nativeWallPositionRepairedWalls(d), /unsupported/);
  }
});
test("doors columns and fixtures cannot be covered", () => {
  for (const kind of ["door", "column", "fixture"]) {
    const d = setup(),
      rs = quad(1, 1.1, 1, 0.1);
    if (kind === "door")
      d.doors = [{ levelId: 1, footprintFeet: rs[0] } as any];
    if (kind === "column")
      d.walls.push({
        kind: "column",
        levelId: 1,
        nativeElementId: 99,
        ringsFeet: rs,
      });
    if (kind === "fixture")
      d.circulationGeometry = {
        fixtures: [{ levelIds: [1], ringsFeet: rs }],
      } as any;
    assert.throws(
      () => nativeWallPositionRepairedWalls(d),
      /door, column or fixture/,
    );
  }
});
test("early source compiler can defer physical checks, late checks are mandatory", () => {
  const d = setup();
  delete d.walkingSupport;
  assert.equal(
    nativeWallPositionRepairedWalls(d, {
      deferPhysicalChecks: true,
      requireOriginal: true,
    }).length,
    2,
  );
  assert.throws(() => nativeWallPositionRepairedWalls(d), /unsupported/);
});
test("early per-level compiler skips absent floors but refuses missing wall on a loaded floor", () => {
  const d = setup();
  d.walls = [];
  assert.deepEqual(
    nativeWallPositionRepairedWalls(d, { deferPhysicalChecks: true }),
    [],
  );
  d.walls = [{ levelId: 1, nativeElementId: 11, ringsFeet: quad(0, 0, 10, 1) }];
  assert.throws(
    () => nativeWallPositionRepairedWalls(d, { deferPhysicalChecks: true }),
    /stale/,
  );
  assert.throws(
    () => nativeWallPositionRepairedWalls({ ...d, walls: [] }),
    /stale/,
  );
});
test("standalone metadata shape checks never replace runtime source model binding", () => {
  const d = setup();
  assert.doesNotThrow(() =>
    validateNativeWallPositionRepairs(d.nativeWallPositionRepairs),
  );
  d.source.modelSha256 = "b".repeat(64);
  assert.throws(
    () => nativeWallPositionRepairedWalls(d),
    /different native source/,
  );
});
