import { test } from "node:test";
import assert from "node:assert/strict";
import { gapProject } from "../fixtures/native-area-project";
import {
  selectionDoorIds,
  validateSelectionDoorBinding,
} from "../../app/indoor-project/selection-door-thresholds";
import { deriveNativeAreas } from "../../app/indoor-project/native-area-review";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
async function fixture() {
  const p = await gapProject();
  const d = {
    id: "threshold",
    nativeElementId: 300,
    levelId: 1,
    pointFeet: [15, 10] as [number, number],
    normalFeet: [1, 0] as [number, number],
    footprintFeet: [
      [14.8, 7.25],
      [15.2, 7.25],
      [15.2, 12.75],
      [14.8, 12.75],
    ] as [number, number][],
    roomKeys: ["0", "1"],
    state: "connected" as const,
  };
  p.dataset.doors = [d];
  p.dataset.nodes = ["0", "1"].map((roomKey, i) => ({
    id: "portal" + i,
    roomKey,
    levelId: 1,
    building: "01",
    surfaceId: "first",
    pointFeet: [15, i ? 11 : 9, 0] as [number, number, number],
    geographic: [0, 0] as [number, number],
    kind: "portal" as const,
  }));
  p.dataset.edges.push({
    id: d.id,
    from: p.dataset.nodes[0].id,
    to: p.dataset.nodes[1].id,
    kind: "door",
    lengthMetres: 0.6096,
    evidence: "measured-native-door",
    accessible: "unknown",
    enabled: true,
    nativeElementId: 300,
    roomKeys: d.roomKeys,
    pointsFeet: [
      [15, 9, 0],
      [15, 11, 0],
    ],
  });
  const { id, state, ...saved } = d;
  p.rooms.selectionDoorThresholds = p.dataset.selectionDoorThresholds = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    doors: [
      {
        ...structuredClone(saved),
        notes: "Reviewed shared landing doorway, retain portal.",
      },
    ],
  };
  return p;
}
test("reviewed threshold restores default selection, explicit closed comparison remains available", async () => {
  const p = await fixture();
  const before = JSON.stringify([
    p.dataset.doors,
    p.dataset.edges,
    p.dataset.walls,
    p.dataset.walkingSupport,
  ]);
  assert.deepEqual(selectionDoorIds(p.dataset, 1), [300]);
  assert.equal((await deriveNativeAreas(p.dataset, 1)).regions.length, 1);
  assert.equal(
    (await deriveNativeAreas(p.dataset, 1, { passThroughDoorIds: [] })).regions
      .length,
    2,
  );
  assert.equal(
    JSON.stringify([
      p.dataset.doors,
      p.dataset.edges,
      p.dataset.walls,
      p.dataset.walkingSupport,
    ]),
    before,
  );
});
test("changed geometry, disabled route, source mismatch and duplicate identities fail closed", async () => {
  for (const mutate of [
    (p: any) => p.dataset.doors[0].pointFeet[0]++,
    (p: any) =>
      (p.dataset.edges.find((e: any) => e.id === "threshold").enabled = false),
    (p: any) =>
      (p.dataset.selectionDoorThresholds.sourceModelSha256 = "b".repeat(64)),
    (p: any) =>
      p.dataset.selectionDoorThresholds.doors.push(
        p.dataset.selectionDoorThresholds.doors[0],
      ),
  ]) {
    const p = await fixture();
    mutate(p);
    assert.throws(() => selectionDoorIds(p.dataset, 1));
  }
  const p = await fixture();
  p.rooms.selectionDoorThresholds = undefined;
  assert.throws(() => validateSelectionDoorBinding(p.rooms, p.dataset));
});
test("master round trip preserves applied threshold; visitor omits authoring metadata", async () => {
  const p = await fixture();
  const r = await readIndoorProject(await exportIndoorProject(p));
  assert.deepEqual(selectionDoorIds(r.dataset, 1), [300]);
  assert.deepEqual(
    r.rooms.selectionDoorThresholds,
    p.rooms.selectionDoorThresholds,
  );
  const v = await readIndoorProject(await exportCampusViewer(r));
  assert.equal(v.rooms.selectionDoorThresholds, undefined);
  assert.equal(v.dataset.selectionDoorThresholds, undefined);
  assert.deepEqual(v.dataset.doors, r.dataset.doors);
  assert.deepEqual(v.dataset.edges, r.dataset.edges);
});
