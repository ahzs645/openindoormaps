import assert from "node:assert/strict";
import test from "node:test";
import {
  progressiveInstructionPreview,
  progressivePlaceScope,
} from "../../app/pages/progressive-instruction-preview";
import type { ProjectStep } from "../../app/indoor-project/navigation-steps";

const main = { id: "combined-main", building: "all", levelIds: [1, 2] };
const narrow = { id: "building-05", building: "05", levelIds: [2] };
const step: ProjectStep = {
  type: "floor-change",
  message: "Take the elevator up to Floor 2",
  distanceMeters: 3,
  fromLevel: 1,
  toLevel: 2,
  levelId: 2,
  building: "05",
  position: [-122.8, 53.8],
  arrivalPosition: [-122.7, 53.9],
  pointsFeet: [
    [0, 0, 0],
    [1, 1, 10],
  ],
};

test("instruction preview retains the compatible loaded Main scope and focuses the connector's arrival anchor", () => {
  const before = JSON.stringify(step);
  const result = progressiveInstructionPreview([narrow, main], main.id, step);
  assert.equal(result?.scope, main);
  assert.deepEqual(result?.position, step.arrivalPosition);
  assert.notDeepEqual(result?.position, step.position);
  assert.equal(JSON.stringify(step), before);
});

test("walking keeps its own anchor; an absent connector arrival uses only the supplied start anchor", () => {
  assert.deepEqual(
    progressiveInstructionPreview([main], main.id, {
      ...step,
      type: "straight",
    })?.position,
    step.position,
  );
  assert.deepEqual(
    progressiveInstructionPreview([main], main.id, {
      ...step,
      arrivalPosition: undefined,
    })?.position,
    step.position,
  );
  assert.equal(
    progressiveInstructionPreview([main], main.id, {
      ...step,
      position: undefined,
      arrivalPosition: undefined,
    })?.position,
    undefined,
  );
});

test("an unavailable floor/building has no camera focus; compatible all-building fallback precedes a narrower new scope", () => {
  const wrongBuilding = { id: "other-building", building: "07", levelIds: [2] };
  assert.equal(
    progressiveInstructionPreview([wrongBuilding], wrongBuilding.id, step),
    undefined,
  );
  assert.equal(
    progressiveInstructionPreview([main], main.id, { ...step, levelId: 3 }),
    undefined,
  );
  assert.equal(
    progressivePlaceScope([narrow, main], "unloaded", 2, "05"),
    main,
  );
});
