import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/native-area-project";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { requireOneSupportedDisplayScope } from "../../scripts/indoor/selected-display-scope";

function data() {
  const d = fixture();
  d.nativeLevels.push({ id: 2, name: "Second native plane", elevationFeet: 0 },
    { id: 3, name: "Another floor", elevationFeet: 12 });
  d.floors[0].levelIds = [1, 2];
  d.floors.push({ id: "second", name: "Floor 2", elevationFeet: 12, levelIds: [3] });
  d.nativeExploreMapping = { version: 3, levels: [1, 2, 3].map(levelId => ({ levelId })) } as unknown as IndoorDataset["nativeExploreMapping"];
  return d;
}
test("one selected combined logical floor retains its complete original native-level order", () => {
  const d = data(), before = JSON.stringify(d), levels = [1, 2];
  assert.deepEqual(requireOneSupportedDisplayScope(d, levels), levels);
  assert.deepEqual(requireOneSupportedDisplayScope(d, [3]), [3]);
  assert.equal(JSON.stringify(d), before);
});
test("arbitrary subsets, combined different floors, reordered levels and duplicates refuse", () => {
  for (const levels of [[], [1], [2], [2, 1], [1, 2, 3], [1, 1, 2], [NaN], [Infinity], [1.2]])
    assert.throws(() => requireOneSupportedDisplayScope(data(), levels));
});
test("a selected scope with an unavailable original native mapping refuses", () => {
  const d = data();
  d.nativeExploreMapping!.levels = d.nativeExploreMapping!.levels.filter(l => l.levelId !== 2);
  assert.throws(() => requireOneSupportedDisplayScope(d, [1, 2]));
});
