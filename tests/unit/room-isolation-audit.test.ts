import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture as baseFixture } from "../fixtures/native-area-project";
import {
  nativeAreaGeometrySha256,
  type NativeAreaResult,
} from "../../app/indoor-project/native-area-review";
import { auditRoomIsolation } from "../../app/indoor-project/room-isolation-audit";
const fixture = () => {
  const data = baseFixture();
  data.walkingSupport = {
    version: 1,
    sourceModelSha256: data.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [
          [
            [0, 0],
            [100, 0],
            [100, 20],
            [0, 20],
          ],
        ],
      },
    ],
  };
  return data;
};
const trace = async (): Promise<NativeAreaResult> => ({
  levelId: 1,
  sourceModelSha256: "a".repeat(64),
  geometrySha256: await nativeAreaGeometrySha256(fixture(), 1, {
    mode: "connected",
    maxGapFeet: 0,
  }),
  warnings: [],
  doorChecks: [],
  gapCandidates: [],
  hallwayPartsFeet: [],
  regions: [
    {
      id: "shared",
      roomKeys: ["0", "1"],
      areaSquareFeet: 200,
      ringsFeet: [],
      displayPartsFeet: [],
      nativeFloorIds: [],
      nativeDoorIds: [],
      exposedFloorEdgeFeet: 0,
    },
  ],
  options: { mode: "connected", maxGapFeet: 0 },
});
test("each source key is counted once; shared circulation is not certified as a defective room", async () => {
  const rows = await auditRoomIsolation(fixture(), [await trace()]);
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map((r) => r.key)).size, 5);
  assert.equal(rows[0].state, "shared-native-region");
  assert.equal(rows[1].declaredUse.circulation, true);
  assert.match(rows[1].interpretation, /without forcing/);
  assert.equal(rows[2].state, "no-native-region");
  const duplicate = await trace();
  duplicate.regions.push({
    ...duplicate.regions[0],
    id: "second",
    roomKeys: ["0"],
  });
  assert.equal(
    (await auditRoomIsolation(fixture(), [duplicate]))[0].state,
    "multiple-native-regions",
  );
});
test("rejects partial/experimental, stale-source, wrong-level and duplicate trace inputs", async () => {
  const partial = await trace();
  partial.options = { mode: "connected", roomKey: "0" };
  partial.geometrySha256 = await nativeAreaGeometrySha256(
    fixture(),
    1,
    partial.options,
  );
  await assert.rejects(
    () => auditRoomIsolation(fixture(), [partial]),
    /whole-level/,
  );
  const stale = await trace();
  stale.sourceModelSha256 = "c".repeat(64);
  await assert.rejects(
    () => auditRoomIsolation(fixture(), [stale]),
    /source model/,
  );
  const wrong = await trace();
  wrong.regions[0].roomKeys = ["missing"];
  await assert.rejects(() => auditRoomIsolation(fixture(), [wrong]), /unknown/);
  const complete = await trace();
  await assert.rejects(
    () => auditRoomIsolation(fixture(), [complete, complete]),
    /Duplicate native level/,
  );
});

test("a same-model geometry edit invalidates a cached selection audit", async () => {
  const current = fixture();
  const cached = await trace();
  current.walkingSupport!.floors[0].ringsFeet[0][0][0] += 1;
  await assert.rejects(
    () => auditRoomIsolation(current, [cached]),
    /stale geometry/,
  );
});

test("different recovered surface heights are flagged instead of blaming an absent wall", async () => {
  const current = fixture();
  current.records[2].elevationFeet = -3;
  current.walkingSupport!.floors.push({
    nativeElementId: 101,
    elevationFeet: -3,
    ringsFeet: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    ],
  });
  const traceCurrent = await trace();
  traceCurrent.geometrySha256 = await nativeAreaGeometrySha256(
    current,
    1,
    traceCurrent.options,
  );
  const rows = await auditRoomIsolation(current, [traceCurrent]);
  assert.equal(rows[2].surfaceReview.needsHeightReview, true);
  assert.deepEqual(rows[2].surfaceReview.nativeSlabIdsAtRoomElevation, [101]);
  assert.equal(rows[2].state, "no-native-region");
});
