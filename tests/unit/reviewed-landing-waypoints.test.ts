import assert from "node:assert/strict";
import test from "node:test";
import type { SharedGuidePoint } from "../../app/indoor-project/shared-corridor-guides";
import { splitLandingDonor } from "../../app/indoor-project/reviewed-landing-waypoints";

test("a flight-foot waypoint divides only its surviving original hallway segment", () => {
  const path: SharedGuidePoint[] = [
    [12, 8, 3],
    [6, 4, 3],
    [1, 2, 3],
  ];
  const station: SharedGuidePoint = [9, 6, 3];
  assert.deepEqual(splitLandingDonor(path, 0, station), {
    before: [path[0], station],
    after: [station, ...path.slice(1)],
  });
  for (const point of [
    [9, 6.001, 3],
    [9, 6, 4],
    [12, 8, 3],
    [15, 10, 3],
  ] as SharedGuidePoint[])
    assert.equal(splitLandingDonor(path, 0, point), undefined);
  assert.equal(splitLandingDonor(path, 1, station), undefined);
});
