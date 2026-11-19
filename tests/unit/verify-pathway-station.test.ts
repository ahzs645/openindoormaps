import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
import type { SharedPathwayStop } from "../../app/indoor-project/shared-pathway-routing";
import { createPathwayStopVerifier } from "../../scripts/indoor/lib/verify-pathway-station";

const guide: PreparedRouting["guides"][number] = {
  edgeId: "walk",
  kind: "shared-corridor",
  pointsFeet: [
    [-1, 0, 0],
    [0, 0, 0],
    [4, 0, 0],
    [4, 1, 0],
  ],
  hallwayJoins: [1, 2],
};
const stop: SharedPathwayStop = {
  cellId: "hall",
  levelId: 1,
  building: "test",
  guideEdgeId: "walk",
  terminalNodeId: "door",
  stopId: '["hall",1,0,0]',
  pointFeet: [1, 0, 0],
  station: {
    guideEdgeId: "walk",
    segment: 1,
    fraction: 0.25,
    previousPointFeet: [0, 0, 0],
    previousStopId: '["hall",0,0,0]',
  },
};
const verify = createPathwayStopVerifier(
  new Map([["walk", guide]]),
  (id) => (id === "walk" ? "hall" : undefined),
  (cell, [x, y, z]) =>
    cell === "hall" && [0, 4].includes(x) && y === 0 && z === 0,
);

test("reconstruct a fractional T from the saved hallway core", () =>
  verify(stop));
test("reject a T attributed to the doorway approach, wrong segment fraction or different cell", () => {
  for (const change of [
    { segment: 0 },
    { fraction: 0.5 },
    { fraction: NaN },
    { guideEdgeId: "elsewhere" },
  ]) {
    assert.throws(() =>
      verify({ ...stop, station: { ...stop.station!, ...change } }),
    );
  }
});
