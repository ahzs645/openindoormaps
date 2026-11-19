import assert from "node:assert/strict";
import test from "node:test";
import {
  flatLandingDonor,
  permitsFlatLandingBridge,
} from "../../app/indoor-project/reviewed-flat-landing-bridge";
import type { PathwayArc } from "../../app/indoor-project/shared-pathway-routing";
import type { SharedGuidePoint } from "../../app/indoor-project/shared-corridor-guides";
const points: SharedGuidePoint[] = [
    [0, 5, 3],
    [0, 0, 3],
  ],
  at: SharedGuidePoint = [0, 3, 3];
const forward = {
  from: "source A",
  to: "station B",
  sourceFrom: "A",
  sourceTo: "B",
  points,
  link: { requiredRooms: [], passages: [], blockers: [] },
} as unknown as PathwayArc;
const reverse = {
  ...forward,
  from: forward.to,
  to: forward.from,
  sourceFrom: "B",
  sourceTo: "A",
  points: points.toReversed(),
};
test("a landing station needs the same measured, publicly admitted donor in both directions", () => {
  const result = flatLandingDonor([forward, reverse], at, () => true);
  assert.equal(result?.pieces.length, 2);
  assert.deepEqual(result?.tangents, points);
  assert.equal(
    flatLandingDonor([forward], at, () => true),
    undefined,
  );
  assert.equal(
    flatLandingDonor([forward, reverse], at, (a) => a !== reverse),
    undefined,
  );
  assert.equal(
    flatLandingDonor(
      [
        forward,
        { ...reverse, link: { ...reverse.link, requiredRooms: ["office"] } },
      ],
      at,
      () => true,
    ),
    undefined,
  );
  assert.equal(
    flatLandingDonor(
      [forward, { ...reverse, to: "different hallway" }],
      at,
      () => true,
    ),
    undefined,
  );
  assert.equal(
    flatLandingDonor([forward, reverse], [0, 3, 4], () => true),
    undefined,
  );
  assert.equal(
    flatLandingDonor([forward, reverse], [0.001, 3, 3], () => true),
    undefined,
  );
});

test("changing the field decision to one-way, unknown or stair travel closes the crossing", () => {
  const both = ["corridor-to-reception", "reception-to-corridor"];
  assert(permitsFlatLandingBridge("same-floor-landing", both));
  for (const directions of [
    both.slice(0, 1),
    both.slice(1),
    [],
    ["unknown"],
    [both[1], both[1]],
  ])
    assert.equal(
      permitsFlatLandingBridge("same-floor-landing", directions),
      false,
    );
  assert.equal(permitsFlatLandingBridge("vertical-flight", both), false);
});
