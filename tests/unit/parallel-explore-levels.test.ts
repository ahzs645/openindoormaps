import assert from "node:assert/strict";
import test from "node:test";
import { gapProject } from "../fixtures/native-area-project";
import {
  compileNativeExploreMapping,
  nativeExploreDatasetGeometrySha256,
} from "../../app/indoor-project/native-explore-mapping";
import { compileExploreLevelsInParallel } from "../../scripts/indoor/parallel-explore-levels";

test("CLI workers preserve the sequential map, unavailable levels and source order", async () => {
  const { dataset } = await gapProject();
  dataset.nativeLevels.unshift({
    id: 70,
    name: "Unsupported",
    elevationFeet: 100,
  });
  const key = await nativeExploreDatasetGeometrySha256(dataset);
  const expected = await compileNativeExploreMapping(dataset, key);
  const visits: number[] = [];
  const result = await compileNativeExploreMapping(
    dataset,
    key,
    (id) => visits.push(id),
    compileExploreLevelsInParallel,
  );
  assert.deepEqual(result, expected);
  assert.deepEqual(result.unavailableLevelIds, [70]);
  assert.equal(result.levels.length, 1);
  assert.deepEqual(
    visits.sort((a, b) => a - b),
    [1, 70],
  );
});

test("parallel export propagates a failed progress callback and stops its children", async () => {
  const { dataset } = await gapProject();
  await assert.rejects(
    compileExploreLevelsInParallel(dataset, () => {
      throw new Error("stopped export");
    }),
    /stopped export/,
  );
});
