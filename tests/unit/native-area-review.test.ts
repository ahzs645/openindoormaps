import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { strToU8 } from "fflate";
import pc from "polygon-clipping";
import { nativeAreaDisplayParts } from "../../app/indoor-project/native-area-display";
import { saveNativeBoundaryPatches } from "../../app/indoor-project/native-area-review";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { reviewedBoundaryWalls } from "../../app/indoor-project/native-boundary-patches";
import { project } from "../fixtures/native-area-project";
import {
  deriveNativeAreas,
  pointInNativeArea,
  saveNativeAreaDecision,
  applyNativeAreaDecision,
} from "../../app/indoor-project/native-area-review";
import {
  readProjectFolder,
  reviewFileBytes,
} from "../../app/indoor-project/review-bundle";
import {
  exportIndoorProject,
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { isFlatArea } from "../../app/indoor-project/display-passages";
import {
  isProjectDestination,
  projectLinkPolicy,
} from "../../app/indoor-project/route-policy";
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
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function nativeProject() {
  const p = await project(),
    d = p.dataset;
  d.records = d.records.slice(0, 2);
  d.records[0].ringsFeet = [rect(1, 1, 10, 10)];
  d.records[1].ringsFeet = [rect(18, 1, 10, 10)];
  p.rooms.annotations = p.rooms.annotations.slice(0, 2);
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 30, 20), rect(3, 14, 3, 3)],
      },
    ],
  };
  d.walls = [
    {
      kind: "wall",
      nativeElementId: 200,
      levelId: 1,
      ringsFeet: [rect(14.8, 0, 0.4, 8)],
    },
    {
      kind: "wall",
      nativeElementId: 201,
      levelId: 1,
      ringsFeet: [rect(14.8, 12, 0.4, 8)],
    },
  ];
  d.doors = [
    {
      id: "door",
      nativeElementId: 300,
      levelId: 1,
      pointFeet: [15, 10],
      footprintFeet: rect(14.8, 8, 0.4, 4),
      normalFeet: [1, 0],
      roomKeys: ["0", "1"],
      state: "connected",
    },
  ];
  return p;
}
const patch = {
  kind: "hallway" as const,
  label: "Shared passage",
  notes: "Measured slab, partition and door checked.",
};
test("explicit pass-through tracing preserves physical door, solid barriers, holes and graph", async () => {
  const p = await nativeProject(),
    before = JSON.stringify(p);
  const closed = await deriveNativeAreas(p.dataset, 1, {
    mode: "connected",
    maxGapFeet: 0,
  });
  const open = await deriveNativeAreas(p.dataset, 1, {
    mode: "connected",
    maxGapFeet: 0,
    passThroughDoorIds: [300],
  });
  assert.equal(closed.regions.length, 2);
  assert.equal(open.regions.length, 1);
  assert.notEqual(closed.geometrySha256, open.geometrySha256);
  assert.ok(pointInNativeArea([15, 10], open.regions[0].ringsFeet));
  assert.ok(
    !pointInNativeArea([15, 5], open.regions[0].ringsFeet),
    "wall remains solid",
  );
  assert.ok(
    !pointInNativeArea([4, 15], open.regions[0].ringsFeet),
    "slab hole preserved",
  );
  assert.equal(JSON.stringify(p), before);
  await assert.rejects(
    deriveNativeAreas(p.dataset, 1, { passThroughDoorIds: [999] }),
    /stale or missing measured door/,
  );
  await assert.rejects(
    deriveNativeAreas(p.dataset, 1, { passThroughDoorIds: [300, 300] }),
    /Invalid native-area/,
  );
  const saved = await saveNativeAreaDecision(p, open, [open.regions[0].id], {
    ...patch,
    kind: "unclassified",
  });
  const reopened = await readIndoorProject(await exportIndoorProject(saved));
  assert.deepEqual(
    reopened.rooms.nativeAreaReviews!.decisions.at(-1)!.selectionOptions!
      .passThroughDoorIds,
    [300],
  );
});
test("5/6-foot recommendations and previews are separate from source patches and preserve voids", async () => {
  const p = await nativeProject();
  p.dataset.doors = [];
  p.dataset.walls[0].ringsFeet = [rect(14.8, 0, 0.4, 7.25)];
  p.dataset.walls[1].ringsFeet = [rect(14.8, 12.75, 0.4, 7.25)];
  const before = JSON.stringify(p);
  const five = await deriveNativeAreas(p.dataset, 1, { maxGapFeet: 5 }),
    six = await deriveNativeAreas(p.dataset, 1, { maxGapFeet: 6 });
  assert.equal(five.gapCandidates!.length, 0);
  assert.equal(six.gapCandidates!.length, 1);
  const ids = six.gapCandidates!.map((c) => c.id);
  const preview = await deriveNativeAreas(p.dataset, 1, {
    maxGapFeet: 6,
    previewGapIds: ids,
  });
  assert.equal(six.regions.length, 1);
  assert.equal(preview.regions.length, 2);
  assert.ok(
    !preview.regions.some((r) => pointInNativeArea([4, 15], r.ringsFeet)),
  );
  assert.equal(JSON.stringify(p), before);
  const proposal = await saveNativeBoundaryPatches(
    p,
    preview,
    ids,
    "Source-wall evidence reviewed; candidate only.",
  );
  assert.equal(proposal.dataset, p.dataset);
  assert.equal(
    proposal.rooms.nativeBoundaryPatches!.patches[0].status,
    "proposed",
  );
  const applied = await saveNativeBoundaryPatches(
    proposal,
    preview,
    ids,
    "Confirmed missing partition continuation.",
    true,
  );
  assert.equal(applied.dataset.boundaryPatchState!.regenerated, false);
  assert.equal(findProjectRoute(applied.dataset, "0", "1"), null);
  await assert.rejects(exportCampusViewer(applied), /Regenerate/);
  assert.equal(applied.dataset.walls.filter((w) => w.reviewPatchId).length, 1);
  const missingBinding = {
    ...applied,
    dataset: { ...applied.dataset, boundaryPatchState: undefined },
  };
  await assert.rejects(exportIndoorProject(missingBinding), /do not match/);
  const wrongFace = structuredClone(applied.dataset);
  wrongFace.walls.find((w) => w.reviewPatchId)!.ringsFeet[0][0][0] += 0.5;
  await assert.rejects(
    exportIndoorProject({ ...applied, dataset: wrongFace }),
    /do not match/,
  );
  const opened = await readIndoorProject(await exportIndoorProject(applied));
  assert.deepEqual(
    opened.rooms.nativeBoundaryPatches,
    applied.rooms.nativeBoundaryPatches,
  );
  assert.deepEqual(
    opened.files["model/review.rvt"],
    p.files["model/review.rvt"],
  );
  const edited = structuredClone(p.dataset.walls);
  edited[0].ringsFeet[0][0][0] += 1;
  assert.throws(
    () =>
      reviewedBoundaryWalls(
        edited,
        applied.rooms.nativeBoundaryPatches,
        p.dataset.source.modelSha256,
      ),
    /stale/,
  );
  p.dataset.walkingSupport!.floors[0].ringsFeet.push(rect(14.8, 9, 1, 1));
  assert.equal(
    (await deriveNativeAreas(p.dataset, 1, { maxGapFeet: 6 })).gapCandidates!
      .length,
    0,
  );
});
test("room focus crops native supported space and labels source-only boundaries as unverified", async () => {
  const p = await nativeProject();
  p.dataset.doors = [];
  const source = JSON.stringify(p.dataset.records);
  const r = await deriveNativeAreas(p.dataset, 1, {
    mode: "room",
    roomKey: "0",
  });
  assert.equal(r.regions.length, 1);
  assert.deepEqual(r.regions[0].roomKeys, ["0"]);
  assert.match(r.cropEvidence!, /unverified/);
  assert.ok(!pointInNativeArea([20, 5], r.regions[0].ringsFeet));
  assert.equal(JSON.stringify(p.dataset.records), source);
});
test("display partitioning retains a complex polygon and all holes exactly", () => {
  const outer = Array.from(
    { length: 240 },
    (_, i) =>
      [
        100 + 90 * Math.cos((i * Math.PI) / 120),
        100 + 90 * Math.sin((i * Math.PI) / 120),
      ] as [number, number],
  );
  const rings = [outer, rect(90, 90, 20, 20)];
  const parts = nativeAreaDisplayParts(rings);
  assert.ok(parts.length > 10);
  assert.equal(pc.xor(pc.union(parts), [rings]).length, 0);
  assert.ok(!parts.some((p) => pointInNativeArea([100, 100], p)));
  const closed = [
    rect(0, 0, 30, 20),
    rect(3, 14, 3, 3),
    rect(12, 8, 0.02, 6),
  ].map((r) => [...r, r[0]]);
  const triangles = nativeAreaDisplayParts(closed);
  assert.ok(triangles.every((p) => p.length === 1 && p[0].length === 3));
  assert.equal(pc.xor(pc.union(triangles), [closed]).length, 0);
  assert.ok(!triangles.some((p) => pointInNativeArea([12.01, 10], p)));
});
test("native slabs and closed measured doors define regions, preserve voids, and ignore source masks", async () => {
  const p = await nativeProject(),
    before = JSON.stringify(p.dataset),
    r = await deriveNativeAreas(p.dataset, 1);
  assert.equal(r.regions.length, 2);
  assert.equal(r.doorChecks[0].status, "separated");
  assert.notEqual(...r.doorChecks[0].sideRegionIds);
  assert.equal(
    r.regions.filter((r) => pointInNativeArea([3.5, 15], r.ringsFeet)).length,
    0,
  );
  assert.equal(
    r.regions.filter((r) => pointInNativeArea([15, 10], r.ringsFeet)).length,
    0,
  );
  assert.equal(JSON.stringify(p.dataset), before);
  p.dataset.records[0].ringsFeet = [rect(-100, -100, 200, 200)];
  const again = await deriveNativeAreas(p.dataset, 1);
  assert.deepEqual(
    again.regions.map((r) => r.ringsFeet),
    r.regions.map((r) => r.ringsFeet),
  );
});
test("door checks expose a bypass without treating an aperture as a certified enclosure", async () => {
  const p = await nativeProject();
  p.dataset.doors![0].footprintFeet = rect(14.8, 9, 0.4, 2);
  const before = JSON.stringify(p.dataset),
    r = await deriveNativeAreas(p.dataset, 1);
  assert.equal(r.regions.length, 1);
  assert.equal(r.doorChecks[0].status, "same-region");
  assert.equal(r.doorChecks[0].sideRegionIds[0], r.regions[0].id);
  assert.equal(r.doorChecks[0].sideRegionIds[1], r.regions[0].id);
  assert.equal(JSON.stringify(p.dataset), before);
});
test("door checks report unsupported sides rather than inventing a connected region", async () => {
  const p = await nativeProject();
  p.dataset.doors![0].normalFeet = [0, 0];
  const r = await deriveNativeAreas(p.dataset, 1);
  assert.equal(r.doorChecks[0].status, "unsupported-side");
  assert.deepEqual(r.doorChecks[0].sideRegionIds, [null, null]);
});
test("unlabelled gaps remain open and approximate envelopes are explicitly excluded", async () => {
  const p = await nativeProject();
  p.dataset.doors = [];
  p.dataset.walls.push({
    nativeElementId: 202,
    levelId: 1,
    approximate: true,
    ringsFeet: [rect(0, 0, 30, 20)],
  });
  const r = await deriveNativeAreas(p.dataset, 1);
  assert.equal(r.regions.length, 1);
  assert.ok(r.warnings.some((w) => w.includes("approximate")));
  assert.ok(pointInNativeArea([15, 10], r.regions[0].ringsFeet));
});
test("multiple region proposal roundtrips with holes, identities and source bytes without changing access", async () => {
  const p = await nativeProject(),
    r = await deriveNativeAreas(p.dataset, 1),
    ids = r.regions.map((r) => r.id);
  const next = await saveNativeAreaDecision(p, r, ids, patch);
  assert.equal(next.dataset, p.dataset);
  assert.equal(next.files, p.files);
  const twice = await saveNativeAreaDecision(next, r, ids, {
    ...patch,
    label: "Reviewed passage",
  });
  assert.equal(twice.rooms.nativeAreaReviews?.decisions.length, 1);
  const reopened = await readIndoorProject(await exportIndoorProject(twice));
  assert.deepEqual(
    reopened.rooms.nativeAreaReviews,
    twice.rooms.nativeAreaReviews,
  );
  assert.deepEqual(
    reopened.files["model/review.rvt"],
    p.files["model/review.rvt"],
  );
  assert.deepEqual(reopened.rooms.annotations, p.rooms.annotations);
  const viewer = await readIndoorProject(await exportCampusViewer(twice));
  assert.equal(viewer.rooms.nativeAreaReviews, undefined);
});
test("changed native geometry or source identity prevents applying a stale selection", async () => {
  const p = await nativeProject(),
    r = await deriveNativeAreas(p.dataset, 1);
  p.dataset.walls[0].ringsFeet[0][1][0] += 1;
  await assert.rejects(
    saveNativeAreaDecision(p, r, [r.regions[0].id], patch),
    /changed/,
  );
});
test("apply hallway uses source space-use review, keeps names, doors and graph and flattens display", async () => {
  const p = await nativeProject(),
    r = await deriveNativeAreas(p.dataset, 1),
    reg = r.regions.find((r) => r.roomKeys.includes("0"))!;
  const next = await applyNativeAreaDecision(p, r, [reg.id], patch, ["0"]);
  assert.equal(next.dataset.records[0].name, "Office");
  assert.equal(next.dataset.records[0].circulation, true);
  assert.equal(next.dataset.records[0].access, "public");
  assert.ok(isFlatArea(next.dataset.records[0]));
  assert.equal(
    (next.rooms.annotations[0].spaceUse as { kind: string }).kind,
    "hallway",
  );
  assert.deepEqual(next.dataset.doors, p.dataset.doors);
  assert.deepEqual(next.dataset.edges, p.dataset.edges);
  assert.deepEqual(
    next.dataset.records[0].ringsFeet,
    p.dataset.records[0].ringsFeet,
  );
  assert.equal(next.rooms.nativeAreaReviews?.decisions[0].status, "applied");
  assert.equal(p.dataset.records[0].access, "unknown");
  const saved = await readIndoorProject(await exportIndoorProject(next));
  assert.equal(saved.dataset.records[0].access, "public");
});
test("staff and off limits immediately exclude public routes; no door leaf creates access", async () => {
  for (const kind of ["staff", "off-limits"] as const) {
    const p = await nativeProject(),
      r = await deriveNativeAreas(p.dataset, 1),
      reg = r.regions.find((r) => r.roomKeys.includes("0"))!;
    const next = await applyNativeAreaDecision(
      p,
      r,
      [reg.id],
      { ...patch, kind },
      ["0"],
    );
    const room = next.dataset.records[0];
    assert.equal(isProjectDestination(room), false);
    const edge = {
      id: "existing",
      from: "a",
      to: "b",
      kind: "door" as const,
      roomKeys: ["0", "1"],
      lengthMetres: 1,
      pointsFeet: [
        [10, 10, 0],
        [20, 10, 0],
      ] as [number, number, number][],
      evidence: "Native door",
      accessible: "yes" as const,
      enabled: true,
    };
    const policy = projectLinkPolicy(
      new Map(next.dataset.records.map((r) => [r.key, r])),
      edge,
      [],
      true,
      "public",
      next.dataset.source.modelSha256,
      next.dataset,
    );
    assert.ok(
      policy.blockers.some(
        (b) => b.kind === (kind === "staff" ? "staff" : "non-walkable"),
      ),
    );
  }
});
test("apply rejects unknown places, vertical connectors and restoring unsupported blocked areas atomically", async () => {
  const p = await nativeProject(),
    r = await deriveNativeAreas(p.dataset, 1),
    reg = r.regions.find((r) => r.roomKeys.includes("0"))!;
  await assert.rejects(
    applyNativeAreaDecision(p, r, [reg.id], patch, ["not-here"]),
    /existing places/,
  );
  p.dataset.records[0].stair = true;
  await assert.rejects(
    applyNativeAreaDecision(p, r, [reg.id], patch, ["0"]),
    /vertical connector/,
  );
  p.dataset.records[0].stair = false;
  p.dataset.records[0].walkable = false;
  await assert.rejects(
    applyNativeAreaDecision(p, r, [reg.id], patch, ["0"]),
    /geometry rebuild/,
  );
  assert.equal(p.rooms.nativeAreaReviews, undefined);
});
const file = (path: string, b: Uint8Array) => ({
  name: path.split("/").at(-1)!,
  size: b.length,
  webkitRelativePath: path,
  arrayBuffer: async () => new Uint8Array(b).buffer,
});
async function folder() {
  const p = await nativeProject(),
    master = await exportIndoorProject(p),
    report = strToU8("Scan and recommendations\nMeasured evidence required.");
  const manifest = strToU8(
    JSON.stringify({
      format: "openindoormaps-review-companion",
      version: 1,
      masterFile: "master.zip",
      masterSha256: hash(master),
      files: [{ file: "scan.md", bytes: report.length, sha256: hash(report) }],
    }),
  );
  return [
    file("Final/master.zip", master),
    file("Final/review-recommendations/manifest.json", manifest),
    file("Final/review-recommendations/scan.md", report),
    file("Final/old.zip", strToU8("ignore older archive")),
  ];
}
test("folder selects the checksummed master, embeds companions and roundtrips them without visitor leakage", async () => {
  const files = await folder(),
    { project: p, fileName } = await readProjectFolder(files);
  assert.equal(fileName, "master.zip");
  assert.equal(p.rooms.reviewBundle?.files.length, 1);
  const saved = await readIndoorProject(await exportIndoorProject(p));
  assert.equal(
    new TextDecoder().decode(
      reviewFileBytes(saved.rooms.reviewBundle!.files[0]),
    ),
    "Scan and recommendations\nMeasured evidence required.",
  );
  const viewer = await readIndoorProject(await exportCampusViewer(saved));
  assert.equal(viewer.rooms.reviewBundle, undefined);
});
test("folder rejects changed master, changed report, missing companions and duplicate manifests", async () => {
  let files = await folder();
  files[0] = file(files[0].webkitRelativePath, strToU8("changed"));
  await assert.rejects(readProjectFolder(files), /master ZIP has changed/);
  files = await folder();
  files[2] = file(files[2].webkitRelativePath, strToU8("bad"));
  await assert.rejects(readProjectFolder(files), /Missing or changed/);
  files = await folder();
  await assert.rejects(
    readProjectFolder(files.filter((f) => !f.name.endsWith(".md"))),
    /Missing or changed/,
  );
  files = await folder();
  await assert.rejects(readProjectFolder([...files, files[1]]), /one review/);
});

test("enclosed-room application overrides a hallway display name without assuming public access", async () => {
  const p = await nativeProject(),
    r = await deriveNativeAreas(p.dataset, 1),
    region = r.regions.find((r) => r.roomKeys.includes("1"))!;
  const next = await applyNativeAreaDecision(
    p,
    r,
    [region.id],
    { ...patch, kind: "room", label: "Enclosed room review" },
    ["1"],
  );
  assert.equal(next.dataset.records[1].name, "Corridor");
  assert.equal(next.dataset.records[1].access, "unknown");
  assert.equal(isFlatArea(next.dataset.records[1]), false);
  assert.equal(next.dataset.records[1].circulation, false);
});

test("a new proposal keeps prior applied access and its application record", async () => {
  const p = await nativeProject(),
    r = await deriveNativeAreas(p.dataset, 1),
    region = r.regions.find((r) => r.roomKeys.includes("0"))!;
  const applied = await applyNativeAreaDecision(
    p,
    r,
    [region.id],
    { ...patch, kind: "staff" },
    ["0"],
  );
  const proposal = await saveNativeAreaDecision(applied, r, [region.id], {
    ...patch,
    kind: "room",
  });
  assert.equal(proposal.dataset.records[0].access, "staff");
  assert.deepEqual(
    proposal.rooms.nativeAreaReviews!.decisions.map((d) => d.status),
    ["applied", "proposed"],
  );
  assert.deepEqual(
    proposal.rooms.nativeAreaReviews!.decisions[0].appliedRoomKeys,
    ["0"],
  );
});

test("unsupported native levels never fall back to drawing contours", async () => {
  const p = await nativeProject();
  p.dataset.nativeLevels.push({
    id: 2,
    name: "Intermediate reference level",
    elevationFeet: 20,
  });
  await assert.rejects(deriveNativeAreas(p.dataset, 2), /No native slabs/);
  p.dataset.walkingSupport!.sourceModelSha256 = "0".repeat(64);
  await assert.rejects(deriveNativeAreas(p.dataset, 1), /model-bound/);
});

test("a user-drawn native wall repair previews, applies and survives ZIP round trip", async () => {
  const p = await nativeProject();
  p.dataset.doors = [];
  const original = JSON.stringify([
    p.model,
    p.scene,
    p.dataset.walkingSupport,
    p.dataset.records,
  ]);
  const options = {
    manualGapPoints: [
      [15, 8],
      [15, 12],
    ] as [[number, number], [number, number]],
  };
  const raw = await deriveNativeAreas(p.dataset, 1, options);
  const patch = raw.gapCandidates!.find((c) => c.manualPointsFeet)!;
  assert.equal(raw.regions.length, 1);
  const preview = await deriveNativeAreas(p.dataset, 1, {
    ...options,
    previewGapIds: [patch.id],
  });
  assert.equal(preview.regions.length, 2);
  assert.equal(
    preview.regions.some((r) => pointInNativeArea([4, 15], r.ringsFeet)),
    false,
  );
  const next = await saveNativeBoundaryPatches(
    p,
    preview,
    [patch.id],
    "User checked the missing wall between native wall ends 200 and 201.",
    true,
  );
  assert.equal(next.dataset.boundaryPatchState!.regenerated, false);
  assert.equal(
    JSON.stringify([
      next.model,
      next.scene,
      next.dataset.walkingSupport,
      next.dataset.records,
    ]),
    original,
  );
  const reopened = await readIndoorProject(await exportIndoorProject(next));
  assert.deepEqual(
    reopened.rooms.nativeBoundaryPatches!.patches[0].manualPointsFeet,
    options.manualGapPoints,
  );
  assert.equal(
    (await deriveNativeAreas(reopened.dataset, 1)).regions.length,
    2,
  );
  await assert.rejects(exportCampusViewer(next), /regenerat/i);
});

test("manual corner repair supports two nonaligned native faces, not approximate boxes", async () => {
  const p = await nativeProject();
  p.dataset.doors = [];
  p.dataset.walls = [
    {
      kind: "wall",
      levelId: 1,
      nativeElementId: 200,
      ringsFeet: [rect(0, 5, 10, 0.4)],
    },
    {
      kind: "wall",
      levelId: 1,
      nativeElementId: 201,
      ringsFeet: [rect(10.5, 6, 0.4, 14)],
    },
  ];
  const options = {
    manualGapPoints: [
      [10, 5.2],
      [10.7, 6],
    ] as [[number, number], [number, number]],
  };
  assert.equal(
    (await deriveNativeAreas(p.dataset, 1, options)).gapCandidates!.length,
    1,
  );
  p.dataset.walls[1].approximate = true;
  await assert.rejects(
    deriveNativeAreas(p.dataset, 1, options),
    /exact native wall/,
  );
});

test("manual repairs reject unsupported floor, protected holes, long gaps and stale evidence", async () => {
  const p = await nativeProject();
  p.dataset.doors = [];
  const options = {
    manualGapPoints: [
      [15, 8],
      [15, 12],
    ] as [[number, number], [number, number]],
  };
  const raw = await deriveNativeAreas(p.dataset, 1, options),
    id = raw.gapCandidates![0].id;
  p.dataset.walls[0].ringsFeet[0][0][0] -= 0.1;
  await assert.rejects(
    saveNativeBoundaryPatches(p, raw, [id], "Stale wall comparison", true),
    /geometry changed/,
  );
  p.dataset.records[0].properties.floorOpeningsFeet = [rect(14.8, 9, 0.4, 2)];
  await assert.rejects(
    deriveNativeAreas(p.dataset, 1, options),
    /protected opening/,
  );
  delete p.dataset.records[0].properties.floorOpeningsFeet;
  await assert.rejects(
    deriveNativeAreas(p.dataset, 1, {
      manualGapPoints: [
        [15, 1],
        [15, 19],
      ],
    }),
    /0.02 and 6/,
  );
  p.dataset.walkingSupport!.floors[0].ringsFeet.push(rect(14.5, 9, 1, 2));
  await assert.rejects(
    deriveNativeAreas(p.dataset, 1, options),
    /unsupported floor/,
  );
});

test("drawn outdoor scope removes only checked portion of a leaked region and retains native holes", async () => {
  const p = await nativeProject();
  p.dataset.walls = [];
  p.dataset.doors = [];
  const raw = await deriveNativeAreas(p.dataset, 1, {
    cropPolygonFeet: rect(0, 0, 12, 20),
  });
  assert.ok(raw.cropEvidence!.startsWith("User-drawn"));
  assert.equal(
    raw.regions.some((r) => pointInNativeArea([4, 15], r.ringsFeet)),
    false,
  );
  assert.equal(
    raw.regions.some((r) => pointInNativeArea([20, 5], r.ringsFeet)),
    false,
  );
  const next = await applyNativeAreaDecision(
    p,
    raw,
    raw.regions.map((r) => r.id),
    {
      kind: "outdoor",
      label: "Exterior part",
      notes:
        "User checked only this exterior strip against full source geometry.",
    },
    [],
  );
  const after = await deriveNativeAreas(next.dataset, 1);
  assert.equal(
    after.regions.some((r) => pointInNativeArea([5, 5], r.ringsFeet)),
    false,
  );
  assert.equal(
    after.regions.some((r) => pointInNativeArea([20, 5], r.ringsFeet)),
    true,
  );
  assert.deepEqual(next.dataset.records, p.dataset.records);
  const reopened = await readIndoorProject(await exportIndoorProject(next));
  assert.deepEqual(
    reopened.rooms.nativeAreaReviews!.decisions[0].selectionOptions!
      .cropPolygonFeet,
    raw.options!.cropPolygonFeet,
  );
  assert.deepEqual(
    reopened.dataset.indoorExclusions,
    next.dataset.indoorExclusions,
  );
  await assert.rejects(
    deriveNativeAreas(p.dataset, 1, {
      cropPolygonFeet: [
        [0, 0],
        [10, 10],
        [0, 10],
        [10, 0],
      ],
    }),
    /Invalid native-area/,
  );
});

test("a connected native aperture can cross its analytical wall plan without cutting a column or unproved door", async () => {
  const p = await nativeProject();
  p.dataset.walls[0].ringsFeet = [rect(14.8, 0, 0.4, 20)];
  p.dataset.edges = [
    {
      id: "door",
      from: "a",
      to: "b",
      kind: "door",
      enabled: true,
      nativeElementId: 300,
      roomKeys: ["0", "1"],
      distanceMetres: 1,
      pointsFeet: [
        [14.5, 10, 0],
        [15.5, 10, 0],
      ],
      accessible: "unknown",
    },
  ];
  const options = { passThroughDoorIds: [300] };
  const before = JSON.stringify(p);
  const opened = await deriveNativeAreas(p.dataset, 1, options);
  assert.ok(
    opened.regions.some((r) => pointInNativeArea([15, 10], r.ringsFeet)),
  );
  assert.ok(
    !opened.regions.some((r) => pointInNativeArea([15, 5], r.ringsFeet)),
  );
  assert.equal(JSON.stringify(p), before);
  p.dataset.doors![0].state = "unmatched";
  const unmatched = await deriveNativeAreas(p.dataset, 1, options);
  assert.ok(
    !unmatched.regions.some((r) => pointInNativeArea([15, 10], r.ringsFeet)),
  );
  p.dataset.doors![0].state = "connected";
  p.dataset.edges[0].enabled = false;
  const disabled = await deriveNativeAreas(p.dataset, 1, options);
  assert.notEqual(disabled.geometrySha256, opened.geometrySha256);
  assert.ok(
    !disabled.regions.some((r) => pointInNativeArea([15, 10], r.ringsFeet)),
  );
  p.dataset.edges[0].enabled = true;
  p.dataset.walls.push({
    kind: "column",
    nativeElementId: 999,
    levelId: 1,
    ringsFeet: [rect(14.8, 9, 0.4, 2)],
  });
  const column = await deriveNativeAreas(p.dataset, 1, options);
  assert.ok(
    !column.regions.some((r) => pointInNativeArea([15, 10], r.ringsFeet)),
  );
});
