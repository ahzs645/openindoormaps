import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory";
import { roomsWithInterdoorPassage } from "../../scripts/indoor/reviewed-interdoor-passage";

type Point = [number, number];
const rectangle = (lower: number, upper: number): Point[] => [
  [0, lower],
  [3, lower],
  [3, upper],
  [0, upper],
];
const ends = [1, 9].map((y) => ({
  nativeElementId: y,
  hostWallNativeElementId: y + 100,
  pointFeet: [1.5, y] as Point,
  footprintFeet: rectangle(y - 0.25, y + 0.25),
  normalFeet: [0, 1] as Point,
  roomKeys: [String(y)],
}));
const sourceModelSha256 = "a".repeat(64);
const review = {
  version: 1 as const,
  levelId: 2,
  building: "07",
  key: "reviewed-passage:2:1:9",
  sourceModelSha256,
  decision: "Surveyed indoor passage",
  ends: ends as [(typeof ends)[number], (typeof ends)[number]],
};
const floor = [rectangle(-1, 11)];
const dataset = {
  source: { modelSha256: sourceModelSha256 },
  doors: ends.map((e) => ({ ...e, levelId: 2, state: "unmatched" })),
  records: ends.map((e) => ({
    key: e.roomKeys[0],
    levelId: 2,
    building: "07",
    elevationFeet: 0,
    walkable: true,
  })),
  walkingSupport: { floors: [{ elevationFeet: 0, ringsFeet: floor }] },
  nativeIndoorEnvelopes: { levels: [{ elevationFeet: 0, partsFeet: [floor] }] },
} as unknown as IndoorDataset;
const rooms = { annotations: [] } as unknown as RoomDirectoryData;

test("the connecting floor starts and ends on the inward physical door faces", () => {
  const updated = roomsWithInterdoorPassage(rooms, dataset, review);
  const ys = updated.annotations[0]!.polygonFeet.map((p) => p[1]);
  assert.deepEqual([Math.min(...ys), Math.max(...ys)], [1.25, 8.75]);
  assert.deepEqual(
    updated.navigation!.doorLinks.map((l) => l.doorId),
    [1, 9],
  );
  assert.deepEqual(
    roomsWithInterdoorPassage(updated, dataset, review),
    updated,
  );
});

test("an unsupported strip or a changed source threshold refuses the passage", () => {
  const unsupported = structuredClone(dataset);
  unsupported.walkingSupport!.floors[0]!.ringsFeet = [rectangle(-1, 5)];
  assert.throws(
    () => roomsWithInterdoorPassage(rooms, unsupported, review),
    /floor and envelope/,
  );
  const moved = structuredClone(review);
  moved.ends[0].pointFeet[0] += 0.1;
  assert.throws(
    () => roomsWithInterdoorPassage(rooms, dataset, moved),
    /geometry or ownership/,
  );
});
