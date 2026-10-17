import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { PreparedDisplayPayload } from "../../app/indoor-project/prepared-display-assets";
import type { FloorPreparationOptions } from "../../app/indoor-project/prepared-floor";
import {
  packResidentFloor,
  restoreResidentFloor,
} from "../../app/indoor-project/resident-floor-cache";

const options: FloorPreparationOptions = {
  showPillars: false,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
  showStructures: false,
  review: false,
  simplifyGeometry: true,
};
const data = { source: { modelSha256: "a".repeat(64) } } as IndoorDataset;
const fc = () => ({ type: "FeatureCollection", features: [] });
const geometry = {
  rings: [Array.from({ length: 200 }, (_, i) => [i / 17, i / 29])],
  holes: [
    [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 1],
    ],
  ],
};
const payload = {
  nativeFaces: {
    levelIds: [4],
    regions: [],
    warnings: [],
    warningCount: 0,
    fills: fc(),
    overview: fc(),
    outlines: fc(),
    partitions: fc(),
    walls: fc(),
    geometry,
  },
  preparedFloor: {
    presentation: { display: {} },
    nativeStairKeys: [],
    stairSurroundKeys: [],
    assumedRoomBlocks: fc(),
    selectionAreas: fc(),
    physicalGround: fc(),
    nativeStairs: fc(),
    stairCutAreas: fc(),
    stairCutRooms: fc(),
    hallwayPaths: fc(),
    geometry,
  },
} as unknown as PreparedDisplayPayload;

test("private floor compression restores the complete shared graph without changing source, holes or paths", async () => {
  const before = JSON.stringify({ data, payload });
  const packed = packResidentFloor(
    data,
    [4],
    "all",
    options,
    payload.preparedFloor,
    payload.nativeFaces,
  )!;
  const result = await restoreResidentFloor(
    data,
    [4],
    "all",
    options,
    packed.asset,
  );
  assert.deepEqual(result, payload);
  assert.equal(JSON.stringify({ data, payload }), before);
  assert.equal(
    (result.preparedFloor as unknown as { geometry: typeof geometry }).geometry
      .rings[0],
    (result.nativeFaces as unknown as { geometry: typeof geometry }).geometry
      .rings[0],
  );
  assert.ok(packed.memoryCostBytes < 32 * 1024 * 1024);
  assert.ok(Object.isFrozen(result.preparedFloor));
});

test("resident bytes refuse edited source, other floors, building/options/window changes and corrupt blobs", async () => {
  const packed = packResidentFloor(
    data,
    [4],
    "all",
    options,
    payload.preparedFloor,
    payload.nativeFaces,
  )!;
  for (const [source, levels, building, settings] of [
    [{ ...data, records: [] }, [4], "all", options],
    [data, [3], "all", options],
    [data, [4], "05", options],
    [data, [4], "all", { ...options, showPillars: true }],
    [{ ...data, windowDisplay: { mode: "changed" } }, [4], "all", options],
  ] as const)
    await assert.rejects(
      () =>
        restoreResidentFloor(
          source as IndoorDataset,
          [...levels],
          building,
          settings,
          packed.asset,
        ),
      /binding/,
    );
  const corrupt = structuredClone(packed.asset);
  Object.values(corrupt.blobs)[0][0] ^= 1;
  await assert.rejects(
    () => restoreResidentFloor(data, [4], "all", options, corrupt),
    /corrupt/,
  );
  assert.equal(
    packResidentFloor(
      data,
      [4],
      "all",
      { ...options, nativeFaces: payload.nativeFaces },
      payload.preparedFloor,
      payload.nativeFaces,
    ),
    undefined,
  );
  await assert.rejects(
    () =>
      restoreResidentFloor(
        data,
        [4],
        "all",
        { ...options, nativeFaces: payload.nativeFaces },
        packed.asset,
      ),
    /supplied native faces/,
  );
});
