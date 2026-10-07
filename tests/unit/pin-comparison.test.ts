import test from "node:test";
import assert from "node:assert/strict";
import { gapProject } from "../fixtures/native-area-project";
import {
  deriveNativeAreas,
  pointInNativeArea,
} from "../../app/indoor-project/native-area-review";
import { comparePinBoundary } from "../../app/indoor-project/pin-comparison";
import { coloredComparisonRegions } from "../../app/indoor-project/patch-comparison-colors";
import { reviewedBoundaryWalls } from "../../app/indoor-project/native-boundary-patches";
import type { NativeBoundaryPatch } from "../../app/indoor-project/native-boundary-patches";
async function sample() {
  const p = await gapProject();
  const experiment = await deriveNativeAreas(p.dataset, 1, { maxGapFeet: 6 });
  const c = experiment.gapCandidates![0];
  const patch: NativeBoundaryPatch = {
    ...c,
    status: "proposed",
    notes: "Review divider against original geometry.",
  };
  return { p, patch };
}
test("comparison separates native areas without modifying source and preserves floor hole", async () => {
  const { p, patch } = await sample();
  const before = JSON.stringify(p);
  const result = await comparePinBoundary(p.dataset, 1, [6, 6], [patch]);
  assert.deepEqual(result.current?.roomKeys, ["0", "1"]);
  assert.deepEqual(result.updated?.roomKeys, ["0"]);
  assert.equal(result.currentRegions?.length, 1);
  assert.equal(result.updatedRegions?.length, 2);
  assert.deepEqual(result.updatedRegions?.flatMap((r) => r.roomKeys).sort(), [
    "0",
    "1",
  ]);
  const colors = coloredComparisonRegions(result, true);
  assert.equal(new Set(colors.map((r) => r.color)).size, 2);
  assert.equal(
    coloredComparisonRegions(result, false)[0].color,
    colors.find((r) => r.region.roomKeys.includes("0"))?.color,
  );
  assert.ok(result.updated!.areaSquareFeet < result.current!.areaSquareFeet);
  assert.equal(pointInNativeArea([4, 15], result.updated!.ringsFeet), false);
  assert.equal(JSON.stringify(p), before);
  assert.equal(patch.status, "proposed");
});
test("current selection is available without invented geometric proposals", async () => {
  const { p } = await sample();
  const result = await comparePinBoundary(p.dataset, 1, [6, 6], []);
  assert.ok(result.current);
  assert.equal(result.updated, undefined);
  assert.equal(result.patches.length, 0);
});
test("stale source and unsupported patch are refused", async () => {
  const { p, patch } = await sample();
  await assert.rejects(
    comparePinBoundary(
      p.dataset,
      1,
      [6, 6],
      [{ ...patch, sourceModelSha256: "c".repeat(64) }],
    ),
    /does not match/,
  );
  await assert.rejects(
    comparePinBoundary(
      p.dataset,
      1,
      [6, 6],
      [
        {
          ...patch,
          ringsFeet: [
            [
              [3, 14],
              [4, 14],
              [4, 15],
              [3, 15],
            ],
          ],
        },
      ],
    ),
    /protected opening/,
  );
});

test("individual joins leave a bypass open while the combined experiment separates rooms", async () => {
  const { coupledGapProject } = await import("../fixtures/native-area-project");
  const p = await coupledGapProject();
  const experiment = await deriveNativeAreas(p.dataset, 1, { maxGapFeet: 1 });
  const patches = experiment.gapCandidates!.map((p) => ({
    ...p,
    status: "proposed" as const,
    notes: "Test source-supported join.",
  }));
  assert.equal(patches.length, 2);
  const before = JSON.stringify(p);
  for (const patch of patches) {
    const result = await comparePinBoundary(p.dataset, 1, [6, 6], [patch]);
    assert.equal(result.patches.length, 1);
    assert.deepEqual(result.updated?.roomKeys, ["0", "1"]);
    assert.equal(coloredComparisonRegions(result, true).length, 1);
  }
  const together = await comparePinBoundary(p.dataset, 1, [6, 6], patches);
  assert.deepEqual(together.updated?.roomKeys, ["0"]);
  assert.equal(JSON.stringify(p), before);
});

test("applied patch comparison reconstructs the connected before and retains independent after areas", async () => {
  const { p, patch } = await sample();
  const applied = { ...patch, status: "applied" as const };
  const walls = reviewedBoundaryWalls(
    p.dataset.walls,
    { version: 1, patches: [applied] },
    p.dataset.source.modelSha256,
    1,
  );
  const data = { ...p.dataset, walls: [...p.dataset.walls, ...walls] };
  const snapshot = JSON.stringify(data);
  const result = await comparePinBoundary(data, 1, [6, 6], [applied]);
  assert.equal(result.beforeAppliedPatch, true);
  assert.deepEqual(result.current?.roomKeys, ["0", "1"]);
  assert.equal(result.updatedRegions?.length, 2);
  assert.equal(JSON.stringify(data), snapshot);
});
