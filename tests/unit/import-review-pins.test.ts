import assert from "node:assert/strict";
import test from "node:test";
import type { IndoorProject } from "../../app/indoor-project/package";
import { preserveReviewPinsOnImport } from "../../app/indoor-project/import-review-pins";
import {
  preserveReviewPins,
  setReviewPins,
  type ReviewPin,
} from "../../app/indoor-project/review-pins";
import { fixture } from "../fixtures/native-area-project";

const pin: ReviewPin = {
  id: "pin-1",
  label: "Entrance",
  notes: "Keep this reference",
  levelId: 1,
  pointFeet: [1, 2],
};
const project = () =>
  ({
    dataset: fixture(),
    rooms: {},
    files: { "floors/rooms.json": new Uint8Array([1, 2, 3]) },
    manifest: { format: "reviter-project" },
    preparedDisplay: { version: 1, descriptors: [], blobs: {} },
  }) as unknown as IndoorProject;

test("identical complete pin metadata keeps exact loaded identity, bytes, mapping and prepared assets", () => {
  const loaded = setReviewPins(project(), [pin]),
    previous = setReviewPins(project(), [pin]);
  const next = preserveReviewPinsOnImport(loaded, previous);
  assert.equal(next, loaded);
  assert.equal(next.dataset, loaded.dataset);
  assert.equal(next.rooms, loaded.rooms);
  assert.equal(next.files, loaded.files);
  assert.equal(
    next.files["floors/rooms.json"],
    loaded.files["floors/rooms.json"],
  );
  assert.equal(next.preparedDisplay, loaded.preparedDisplay);
  assert.equal(next.manifest, loaded.manifest);
});
test("absent previous pins and identical metadata do not read graph, walls, levels or source", () => {
  const loaded = setReviewPins(project(), [pin]);
  const fail = () => {
    throw new Error("No-op import traversed dataset");
  };
  Object.defineProperty(loaded, "dataset", { get: fail });
  assert.equal(preserveReviewPinsOnImport(loaded, null), loaded);
  assert.equal(preserveReviewPinsOnImport(loaded, project()), loaded);
  const previous = setReviewPins(project(), [pin]);
  assert.equal(preserveReviewPinsOnImport(loaded, previous), loaded);
});
test("different metadata uses established incoming-wins merge while preserving graph and source bytes", () => {
  const previous = setReviewPins(project(), [pin, { ...pin, id: "pin-2" }]);
  const loaded = setReviewPins(project(), [
    { ...pin, notes: "New incoming decision" },
  ]);
  const expected = preserveReviewPins(loaded, previous),
    actual = preserveReviewPinsOnImport(loaded, previous);
  assert.deepEqual(actual, expected);
  assert.notEqual(actual, loaded);
  assert.equal(actual.rooms.reviewPins!.pins[0].notes, "New incoming decision");
  assert.equal(actual.rooms.reviewPins!.pins[1].id, "pin-2");
  assert.equal(actual.dataset, loaded.dataset);
  assert.equal(actual.dataset.edges, loaded.dataset.edges);
  assert.equal(actual.files, loaded.files);
  assert.equal(actual.preparedDisplay, loaded.preparedDisplay);
});
test("source model mismatch and visitor imports retain existing behavior", () => {
  const previous = setReviewPins(project(), [pin]);
  const mismatch = project();
  mismatch.dataset.source.modelSha256 = "b".repeat(64);
  assert.equal(preserveReviewPinsOnImport(mismatch, previous), mismatch);
  const viewer = {
    ...project(),
    manifest: { format: "openindoormaps-viewer" },
  } as IndoorProject;
  assert.equal(preserveReviewPinsOnImport(viewer, previous), viewer);
});
test("pin order or any complete authoring metadata difference delegates instead of claiming identity", () => {
  const previous = setReviewPins(project(), [pin, { ...pin, id: "pin-2" }]);
  const loaded = setReviewPins(project(), [{ ...pin, id: "pin-2" }, pin]);
  assert.deepEqual(
    preserveReviewPinsOnImport(loaded, previous),
    preserveReviewPins(loaded, previous),
  );
  assert.notEqual(preserveReviewPinsOnImport(loaded, previous), loaded);
});
