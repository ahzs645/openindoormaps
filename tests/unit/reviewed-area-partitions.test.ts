import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { project } from "../fixtures/native-area-project";
import {
  exportIndoorProject,
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import {
  reviewedAreaPartitionGeometrySha256,
  checkReviewedAreaPartition,
  saveReviewedAreaPartition,
  applyReviewedAreaPartition,
  applyReviewedAreaPartitionGroup,
  restoreReviewedAreaPartition,
  removeReviewedAreaPartition,
  validateReviewedAreaPartitions,
  snapReviewedAreaPartitionPoints,
  type ReviewedAreaPartition,
} from "../../app/indoor-project/reviewed-area-partitions";
import {
  deriveNativeAreas,
  pointInNativeArea,
} from "../../app/indoor-project/native-area-review";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
async function fixture() {
  const p = await project();
  p.dataset.walkingSupport = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 30, 20), rect(3, 14, 3, 3)],
      },
    ],
  };
  p.dataset.walls = [
    { levelId: 1, nativeElementId: 200, ringsFeet: [rect(14.8, 0, 0.4, 8)] },
    { levelId: 1, nativeElementId: 201, ringsFeet: [rect(14.8, 12, 0.4, 8)] },
  ];
  p.dataset.doors = [];
  return p;
}
async function entry(
  p: Awaited<ReturnType<typeof fixture>>,
): Promise<ReviewedAreaPartition> {
  return {
    id: "open-front",
    levelId: 1,
    elevationFeet: 0,
    geometrySha256: await reviewedAreaPartitionGeometrySha256(p.dataset, 1),
    kind: "shutter",
    pointsFeet: [
      [15, 8],
      [15, 12],
    ],
    closed: false,
    status: "proposed",
    label: "Pickup shutter front",
    notes: "User identifies the open shutter front; close selection only.",
    evidence: {
      kind: "native-endpoints",
      nativeElementIds: [200, 201],
      reason: "Exact native wall returns bound the opening.",
    },
    selection: "closed",
    navigation: "unchanged",
  };
}
test("a group previews and applies multiple doorless boundaries atomically, retaining routes and history", async () => {
  const p = await fixture();
  p.dataset.walls.push(
    { levelId: 1, nativeElementId: 202, ringsFeet: [rect(22.8, 0, 0.4, 8)] },
    { levelId: 1, nativeElementId: 203, ringsFeet: [rect(22.8, 12, 0.4, 8)] },
  );
  const a = await entry(p),
    b = {
      ...a,
      id: "second-front",
      label: "Second doorless entrance",
      kind: "open-entrance" as const,
      pointsFeet: [
        [23, 8],
        [23, 12],
      ] as [number, number][],
      evidence: { ...a.evidence, nativeElementIds: [202, 203] },
    };
  const saved = saveReviewedAreaPartition(saveReviewedAreaPartition(p, a), b);
  const before = JSON.stringify(saved);
  const preview = await deriveNativeAreas(saved.dataset, 1, {
    previewPartitionIds: [a.id, b.id],
  });
  assert.equal(preview.regions.length, 3);
  assert.deepEqual(preview.logicalPartitionIds, [a.id, b.id]);
  const applied = applyReviewedAreaPartitionGroup(
    saved,
    [a.id, b.id],
    a.geometrySha256,
  );
  assert(
    applied.rooms.reviewedAreaPartitions!.partitions.every(
      (q) => q.status === "applied",
    ),
  );
  assert.deepEqual(
    applied.rooms
      .reviewedAreaPartitions!.history!.filter((q) => q.action === "apply")
      .map((q) => q.id),
    [a.id, b.id],
  );
  assert.deepEqual(
    applied.dataset.reviewedAreaPartitions,
    applied.rooms.reviewedAreaPartitions,
  );
  assert.equal((await deriveNativeAreas(applied.dataset, 1)).regions.length, 3);
  assert.equal(
    JSON.stringify(saved),
    before,
    "group application never mutates the saved proposals",
  );
  const { reviewedAreaPartitions: _, ...physicalAfter } = applied.dataset;
  const { reviewedAreaPartitions: __, ...physicalBefore } = saved.dataset;
  assert.deepEqual(physicalAfter, physicalBefore);
  const copy = await readIndoorProject(await exportIndoorProject(applied));
  assert.deepEqual(
    copy.rooms.reviewedAreaPartitions,
    applied.rooms.reviewedAreaPartitions,
  );
  const invalid = structuredClone(saved);
  invalid.rooms.reviewedAreaPartitions!.partitions[1]!.geometrySha256 =
    "f".repeat(64);
  invalid.dataset.reviewedAreaPartitions = structuredClone(
    invalid.rooms.reviewedAreaPartitions,
  );
  assert.throws(
    () =>
      applyReviewedAreaPartitionGroup(invalid, [a.id, b.id], a.geometrySha256),
    /review|geometry/i,
  );
  assert(
    invalid.rooms.reviewedAreaPartitions!.partitions.every(
      (q) => q.status === "proposed",
    ),
  );
  assert.throws(
    () =>
      applyReviewedAreaPartitionGroup(
        saved,
        [a.id, "missing"],
        a.geometrySha256,
      ),
    /absent/,
  );
  assert.throws(
    () =>
      applyReviewedAreaPartitionGroup(saved, [a.id, a.id], a.geometrySha256),
    /distinct/,
  );
});
test("supported shutter selection boundary preserves physical walls, source identities, access and routes", async () => {
  const p = await fixture(),
    candidate = await entry(p),
    before = JSON.stringify(p.dataset);
  const checked = checkReviewedAreaPartition(
    p.dataset,
    candidate,
    candidate.geometrySha256,
  );
  assert.equal(checked.valid, true, checked.errors.join(" "));
  assert.equal(checked.provisional, false);
  assert.equal(checked.footprintsFeet.length, 1);
  const saved = saveReviewedAreaPartition(p, candidate);
  assert.equal(
    JSON.stringify(p.dataset),
    before,
    "helpers do not mutate input",
  );
  const applied = applyReviewedAreaPartition(
    saved,
    candidate.id,
    candidate.geometrySha256,
  );
  assert.equal(
    applied.dataset.reviewedAreaPartitions?.partitions[0]?.status,
    "applied",
  );
  const { reviewedAreaPartitions: _, ...physical } = applied.dataset;
  assert.equal(JSON.stringify(physical), before);
  assert.equal(
    await reviewedAreaPartitionGeometrySha256(applied.dataset, 1),
    candidate.geometrySha256,
    "logical boundary is excluded from physical hash",
  );
  assert.equal(
    restoreReviewedAreaPartition(applied, candidate.id).rooms
      .reviewedAreaPartitions?.partitions[0]?.status,
    "proposed",
  );
});
test("selection proposal previews split only the opening, applied outline retraces, and stale physical evidence restores the original region", async () => {
  const p = await fixture(),
    candidate = await entry(p);
  const before = await deriveNativeAreas(p.dataset, 1);
  const saved = saveReviewedAreaPartition(p, candidate);
  assert.equal(before.regions.length, 1);
  assert.equal(
    (await deriveNativeAreas(saved.dataset, 1)).regions.length,
    1,
    "draft never applies automatically",
  );
  const preview = await deriveNativeAreas(saved.dataset, 1, {
    previewPartitionIds: [candidate.id],
  });
  assert.equal(preview.regions.length, 2);
  assert.deepEqual(preview.logicalPartitionIds, [candidate.id]);
  assert(
    preview.regions.every(
      (region) => !pointInNativeArea([4, 15], region.ringsFeet),
    ),
    "protected slab hole remains excluded",
  );
  const applied = applyReviewedAreaPartition(
    saved,
    candidate.id,
    candidate.geometrySha256,
  );
  assert.equal((await deriveNativeAreas(applied.dataset, 1)).regions.length, 2);
  assert.equal(
    (
      await deriveNativeAreas(applied.dataset, 1, {
        ignoreAppliedPartitions: true,
      })
    ).regions.length,
    1,
  );
  applied.dataset.walls = applied.dataset.walls.map((w, i) =>
    i ? w : { ...w, ringsFeet: [rect(14.8, 0, 0.4, 7.9)] },
  );
  const stale = await deriveNativeAreas(applied.dataset, 1);
  assert.equal(stale.regions.length, 1);
  assert(stale.warnings.some((w) => w.includes("omitted from selection")));
  await assert.rejects(
    deriveNativeAreas(applied.dataset, 1, {
      previewPartitionIds: [candidate.id],
    }),
    /needs review/,
  );
});
test("unconfirmed missing partition is an explicit provisional proposal, not a physical construction", async () => {
  const p = await fixture(),
    candidate = await entry(p);
  candidate.kind = "missing-partition";
  candidate.pointsFeet = [
    [7, 1],
    [7, 12],
  ];
  candidate.evidence = {
    kind: "reviewed-assumption",
    nativeElementIds: [],
    reason: "Reviewer sketches intended division; revisit on site.",
  };
  const checked = checkReviewedAreaPartition(
    p.dataset,
    candidate,
    candidate.geometrySha256,
  );
  assert.equal(checked.valid, true);
  assert.equal(checked.provisional, true);
  assert.equal(saveReviewedAreaPartition(p, candidate).dataset.walls.length, 2);
});
test("native support endpoints must contact actual precise faces; bounded click snap records exact evidence", async () => {
  const p = await fixture(),
    candidate = await entry(p);
  candidate.pointsFeet = [
    [15, 8.15],
    [15, 11.85],
  ];
  assert.match(
    checkReviewedAreaPartition(
      p.dataset,
      candidate,
      candidate.geometrySha256,
    ).errors.join(" "),
    /Endpoint/,
  );
  const snapped = snapReviewedAreaPartitionPoints(
    p.dataset,
    1,
    candidate.pointsFeet as [[number, number], [number, number]],
  );
  assert.deepEqual(snapped.pointsFeet, [
    [15, 8],
    [15, 12],
  ]);
  assert.deepEqual(snapped.nativeElementIds, [200, 201]);
  assert.equal(snapped.details[0]?.originalPointFeet[1], 8.15);
  candidate.pointsFeet = snapped.pointsFeet;
  assert.equal(
    checkReviewedAreaPartition(p.dataset, candidate, candidate.geometrySha256)
      .valid,
    true,
  );
  p.dataset.walls[0]!.approximate = true;
  assert.match(
    checkReviewedAreaPartition(
      p.dataset,
      candidate,
      candidate.geometrySha256,
    ).errors.join(" "),
    /approximate/,
  );
});
test("protected slab holes, unsupported floor, measured doors and foreign columns veto closure", async () => {
  const p = await fixture(),
    candidate = await entry(p);
  candidate.evidence = {
    kind: "reviewed-assumption",
    nativeElementIds: [],
    reason: "Explicit reviewed boundary.",
  };
  candidate.pointsFeet = [
    [4, 12],
    [4, 18],
  ];
  assert.match(
    checkReviewedAreaPartition(
      p.dataset,
      candidate,
      candidate.geometrySha256,
    ).errors.join(" "),
    /protected floor/,
  );
  candidate.pointsFeet = [
    [31, 1],
    [31, 8],
  ];
  assert.match(
    checkReviewedAreaPartition(
      p.dataset,
      candidate,
      candidate.geometrySha256,
    ).errors.join(" "),
    /supported native floor/,
  );
  candidate.pointsFeet = [
    [15, 8],
    [15, 12],
  ];
  p.dataset.doors = [
    {
      id: "door-1",
      nativeElementId: 300,
      levelId: 1,
      pointFeet: [15, 10],
      footprintFeet: rect(14.8, 9, 0.4, 2),
      roomKeys: ["0", "1"],
      state: "connected",
    },
  ];
  assert.match(
    checkReviewedAreaPartition(
      p.dataset,
      candidate,
      candidate.geometrySha256,
    ).errors.join(" "),
    /physical door/,
  );
  p.dataset.doors = [];
  p.dataset.walls.push({
    kind: "column",
    levelId: 1,
    nativeElementId: 202,
    ringsFeet: [rect(14, 9, 2, 2)],
  });
  assert.match(
    checkReviewedAreaPartition(
      p.dataset,
      candidate,
      candidate.geometrySha256,
    ).errors.join(" "),
    /physical wall or column/,
  );
});
test("shaft outline stays an inspection proposal and cannot authorize routes or fill a native void", async () => {
  const p = await fixture(),
    candidate = await entry(p);
  candidate.kind = "shaft-boundary";
  candidate.closed = true;
  candidate.pointsFeet = rect(3, 14, 3, 3);
  candidate.evidence = {
    kind: "reviewed-assumption",
    nativeElementIds: [],
    reason: "Review shaft perimeter against source geometry.",
  };
  const saved = saveReviewedAreaPartition(p, candidate);
  assert.throws(
    () =>
      applyReviewedAreaPartition(saved, candidate.id, candidate.geometrySha256),
    /inspection only/,
  );
  assert.throws(
    () =>
      validateReviewedAreaPartitions({
        version: 1,
        sourceModelSha256: p.dataset.source.modelSha256,
        partitions: [{ ...candidate, status: "applied" }],
      }),
    /inspection metadata/,
  );
});
test("physical edits and invalid model/elevation/crossed geometry fail closed", async () => {
  const p = await fixture(),
    candidate = await entry(p),
    saved = saveReviewedAreaPartition(p, candidate);
  saved.dataset.walls[0]!.ringsFeet[0]![0]![0] += 0.01;
  const current = await reviewedAreaPartitionGeometrySha256(saved.dataset, 1);
  assert.notEqual(current, candidate.geometrySha256);
  assert.throws(
    () => applyReviewedAreaPartition(saved, candidate.id, current),
    /Physical evidence changed/,
  );
  assert.throws(
    () =>
      validateReviewedAreaPartitions(
        {
          version: 1,
          sourceModelSha256: "b".repeat(64),
          partitions: [candidate],
        },
        p.dataset.source.modelSha256,
      ),
    /source identity/,
  );
  assert.throws(
    () => saveReviewedAreaPartition(p, { ...candidate, elevationFeet: 1 }),
    /missing native level/,
  );
  assert.throws(
    () =>
      saveReviewedAreaPartition(p, {
        ...candidate,
        pointsFeet: [
          [1, 1],
          [4, 4],
          [1, 4],
          [4, 1],
        ],
      }),
    /crossed/,
  );
});
test("portable master preserves logical evidence; visitor omits it and mismatched source/prepared metadata is rejected", async () => {
  const p = await fixture(),
    candidate = await entry(p),
    saved = saveReviewedAreaPartition(p, candidate);
  const applied = applyReviewedAreaPartition(
    saved,
    candidate.id,
    candidate.geometrySha256,
  );
  const copy = await readIndoorProject(await exportIndoorProject(applied));
  assert.deepEqual(
    copy.rooms.reviewedAreaPartitions,
    applied.rooms.reviewedAreaPartitions,
  );
  assert.deepEqual(
    copy.dataset.reviewedAreaPartitions,
    applied.dataset.reviewedAreaPartitions,
  );
  const viewer = unzipSync(await exportCampusViewer(copy));
  assert.equal(
    JSON.parse(strFromU8(viewer["viewer/indoor.json"]!)).reviewedAreaPartitions,
    undefined,
  );
  assert.equal(
    JSON.parse(strFromU8(viewer["viewer/metadata.json"]!))
      .reviewedAreaPartitions,
    undefined,
  );
  copy.dataset.reviewedAreaPartitions!.partitions[0]!.notes = "tampered";
  await assert.rejects(exportIndoorProject(copy), /logical boundaries differ/);
});
test("reversible logical boundary history archives each before and after without changing physical evidence", async () => {
  const p = await fixture(),
    candidate = await entry(p);
  const saved = saveReviewedAreaPartition(p, candidate);
  const applied = applyReviewedAreaPartition(
    saved,
    candidate.id,
    candidate.geometrySha256,
  );
  const restored = restoreReviewedAreaPartition(applied, candidate.id);
  const removed = removeReviewedAreaPartition(restored, candidate.id);
  const history = removed.rooms.reviewedAreaPartitions!.history!;
  assert.deepEqual(
    history.map((h) => h.action),
    ["propose", "apply", "restore", "remove"],
  );
  assert.equal(history[0]!.before, undefined);
  assert.equal(history[1]!.before?.status, "proposed");
  assert.equal(history[1]!.after?.status, "applied");
  assert.equal(history[2]!.before?.status, "applied");
  assert.equal(history[2]!.after?.status, "proposed");
  assert.equal(history[3]!.before?.notes, candidate.notes);
  assert.equal(history[3]!.after, undefined);
  assert.equal(removed.rooms.reviewedAreaPartitions!.partitions.length, 0);
  const reread = await readIndoorProject(await exportIndoorProject(removed));
  assert.deepEqual(reread.rooms.reviewedAreaPartitions!.history, history);
  assert.equal(
    await reviewedAreaPartitionGeometrySha256(reread.dataset, 1),
    candidate.geometrySha256,
  );
  const bad = structuredClone(reread.rooms.reviewedAreaPartitions!);
  bad.history![1]!.after!.navigation = "blocked" as "unchanged";
  assert.throws(
    () => validateReviewedAreaPartitions(bad),
    /Invalid logical boundary/,
  );
});
