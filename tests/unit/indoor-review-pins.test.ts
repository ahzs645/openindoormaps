import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { IndoorProject } from "../../app/indoor-project/package";
import {
  nearbyPinWall,
  preserveReviewPins,
  reviewPinContext,
  setReviewPins,
  validateReviewPins,
  type ReviewPin,
} from "../../app/indoor-project/review-pins";
const fixture = (): IndoorDataset =>
  JSON.parse(
    readFileSync(
      new URL("../fixtures/unbc-pass-through-display.json", import.meta.url),
      "utf8",
    ),
  );
const pin: ReviewPin = {
  id: "pin-1",
  label: "Wall joint",
  notes: "Check the gap",
  levelId: 311,
  pointFeet: [-56, 326],
};
test("loading a viewer after a pinned master does not turn it into an authoring export", () => {
  const data = fixture();
  const previous = setReviewPins(
    { dataset: data, rooms: {} } as IndoorProject,
    [pin],
  );
  const next = {
    dataset: data,
    rooms: {},
    manifest: { format: "openindoormaps-viewer" },
  } as IndoorProject;
  assert.equal(preserveReviewPins(next, previous), next);
  assert.equal(next.rooms.reviewPins, undefined);
  assert.deepEqual(previous.rooms.reviewPins?.pins, [pin]);
});
test("updated archives keep same-model reference pins while preserving the incoming graph and pin edits", () => {
  const data = fixture();
  const previous = setReviewPins(
    { dataset: data, rooms: {} } as IndoorProject,
    [pin, { ...pin, id: "pin-2", wallKey: "wall:311:948472" }],
  );
  const next = setReviewPins(
    {
      dataset: {
        ...structuredClone(data),
        walls: data.walls.filter((w) => w.nativeElementId !== 948_472),
      },
      rooms: {},
    } as IndoorProject,
    [{ ...pin, notes: "Updated archive note" }],
  );
  const before = JSON.stringify(next.dataset);
  const merged = preserveReviewPins(next, previous);
  assert.equal(merged.dataset, next.dataset);
  assert.equal(JSON.stringify(merged.dataset), before);
  assert.equal(merged.rooms.reviewPins!.pins.length, 2);
  assert.equal(merged.rooms.reviewPins!.pins[0].notes, "Updated archive note");
  assert.equal(merged.rooms.reviewPins!.pins[1].wallKey, undefined);
  const other = {
    ...next,
    dataset: {
      ...next.dataset,
      source: { ...next.dataset.source, modelSha256: "other" },
    },
  };
  assert.equal(preserveReviewPins(other, previous), other);
});
test("pin reviews preserve arbitrary coordinates and source routing while updating only review metadata", () => {
  const data = fixture();
  const project = {
    dataset: data,
    rooms: { reviewPins: undefined },
  } as IndoorProject;
  const before = JSON.stringify(data);
  const next = setReviewPins(project, [pin]);
  assert.equal(project.rooms.reviewPins, undefined);
  assert.deepEqual(next.rooms.reviewPins?.pins, [pin]);
  assert.equal(JSON.stringify(data), before);
  assert.equal(next.dataset, project.dataset);
  const context = reviewPinContext(data, pin);
  assert.deepEqual(context.pin.pointFeet, pin.pointFeet);
  assert.ok(context.nearbyRooms.some((r) => r.number === "07-165"));
  assert.equal(context.nearbyWall, null);
  assert.equal(context.source.modelSha256, data.source.modelSha256);
});
test("pin near a real wall records an optional source hint without snapping its dot", () => {
  const data = fixture();
  const wall = data.walls.find((w) => w.nativeElementId === 948_472)!;
  const a = wall.ringsFeet[0][0],
    b = wall.ringsFeet[0][1];
  const point: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const wallKey = nearbyPinWall(data, 311, point);
  assert.ok(wallKey);
  const reference = { ...pin, pointFeet: point, wallKey };
  const context = reviewPinContext(data, reference);
  assert.ok(context.nearbyWall);
  assert.deepEqual(context.pin.pointFeet, point);
  assert.equal(nearbyPinWall(data, -1, point), undefined);
  assert.equal(nearbyPinWall(data, 311, [100_000, 100_000]), undefined);
});
test("pin validation rejects invalid model bindings, duplicate IDs, foreign wall IDs and coordinates", () => {
  const data = fixture(),
    store = {
      version: 1 as const,
      sourceModelSha256: data.source.modelSha256,
      pins: [pin],
    };
  validateReviewPins(store, data);
  for (const invalid of [
    { ...store, sourceModelSha256: "wrong" },
    { ...store, pins: [pin, pin] },
    { ...store, pins: [{ ...pin, wallKey: "wall:312:948472" }] },
    { ...store, pins: [{ ...pin, pointFeet: [Infinity, 0] }] },
    { ...store, pins: [{ ...pin, levelId: -1 }] },
  ])
    assert.throws(() => validateReviewPins(invalid, data));
});
