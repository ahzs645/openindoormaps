import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import assert from "node:assert/strict";
import test from "node:test";
import { project } from "../fixtures/native-area-project";
import {
  deriveNativeExplore,
  hasNativeExploreGeometry,
  initialMapPresentation,
  nativeExplorePlaces,
  nativeExplorePickRegions,
} from "../../app/indoor-project/native-explore";
import { pointInNativeArea } from "../../app/indoor-project/native-area-review";
import { nativeIndoorEnvelopeHash } from "../../app/indoor-project/native-indoor-envelopes";
import { nativeDisplayRegionHash } from "../../app/indoor-project/native-display-scopes";
import {
  reviewedAreaPartitionGeometrySha256,
  saveReviewedAreaPartition,
  applyReviewedAreaPartition,
  type ReviewedAreaPartition,
} from "../../app/indoor-project/reviewed-area-partitions";
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
async function enclose(
  p: Awaited<ReturnType<typeof project>>,
  parts: [number, number][][][],
) {
  const value = {
    version: 1 as const,
    sourceModelSha256: p.dataset.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        partsFeet: parts,
        sourceElementIds: [100, 200, 201],
        cutElevationsFeet: [4, 8],
        evidenceSha256: "c".repeat(64),
      },
    ],
  };
  p.dataset.nativeIndoorEnvelopes = {
    ...value,
    geometrySha256: await nativeIndoorEnvelopeHash(value),
  };
  p.rooms.nativeIndoorEnvelopes = p.dataset.nativeIndoorEnvelopes;
}
async function fixture() {
  const p = await project();
  p.dataset.records = p.dataset.records.slice(0, 2);
  p.dataset.records[0].ringsFeet = [rect(1, 1, 10, 10)];
  p.dataset.records[1].ringsFeet = [rect(18, 1, 10, 10)];
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
  await enclose(p, [p.dataset.walkingSupport.floors[0].ringsFeet]);
  return p;
}
async function boundary(
  p: Awaited<ReturnType<typeof fixture>>,
): Promise<ReviewedAreaPartition> {
  return {
    id: "shutter",
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
    label: "Shutter",
    notes: "Selection only",
    evidence: {
      kind: "native-endpoints",
      nativeElementIds: [200, 201],
      reason: "Original returns",
    },
    selection: "closed",
    navigation: "unchanged",
  };
}
test("native Explore requires source-matching floor geometry", async () => {
  const p = await fixture();
  assert.equal(hasNativeExploreGeometry(p.dataset), true);
  p.dataset.walkingSupport!.sourceModelSha256 = "0".repeat(64);
  assert.equal(hasNativeExploreGeometry(p.dataset), false);
  await assert.rejects(
    deriveNativeExplore(p.dataset, [1]),
    /matching native floor/,
  );
});
test("native Explore leaves unexplained joins open, preserves floor holes and named-place identity", async () => {
  const p = await fixture(),
    before = JSON.stringify(p.dataset);
  const r = await deriveNativeExplore(p.dataset, [1, 1]);
  assert.deepEqual(r.levelIds, [1]);
  assert.equal(r.regions.length, 1);
  assert.equal(
    r.regions.some((r) => pointInNativeArea([4, 15], r.ringsFeet)),
    false,
  );
  assert.deepEqual(
    nativeExplorePlaces(p.dataset, r.regions[0]).map((r) => r.key),
    ["0", "1"],
  );
  const office = p.dataset.records[0];
  const hallway = p.dataset.records[1];
  const originalHallway = {
    circulation: hallway.circulation,
    name: hallway.name,
  };
  hallway.circulation = true;
  hallway.name = "Corridor";
  const outsideOffice: [number, number] = [19, 5];
  assert.equal(
    nativeExplorePickRegions(p.dataset, r.regions, outsideOffice).length,
    1,
    "a connected room is selected by its native face, never a metadata hit mask",
  );
  assert.equal(
    nativeExplorePickRegions(p.dataset, r.regions, office.ringsFeet[0][0])
      .length,
    1,
  );
  const corridorOnly = { ...r.regions[0], roomKeys: [hallway.key] };
  assert.deepEqual(
    nativeExplorePickRegions(p.dataset, [corridorOnly], outsideOffice),
    [],
  );
  hallway.name = "Reception";
  assert.equal(
    nativeExplorePickRegions(p.dataset, [corridorOnly], outsideOffice).length,
    1,
  );
  Object.assign(hallway, originalHallway);
  assert.equal(
    r.regions[0].ringsFeet.length,
    2,
    "floor hole stays an excluded ring",
  );
  assert.equal(
    JSON.stringify(p.dataset),
    before,
    "trace does not edit graph, arrivals, access or source outlines",
  );
});
test("native Explore shows only revalidated applied logical boundaries; proposals and stale evidence cannot split destinations", async () => {
  const p = await fixture(),
    b = await boundary(p),
    proposed = saveReviewedAreaPartition(p, b);
  assert.equal(
    (await deriveNativeExplore(proposed.dataset, [1])).regions.length,
    1,
  );
  const applied = applyReviewedAreaPartition(proposed, b.id, b.geometrySha256);
  const r = await deriveNativeExplore(applied.dataset, [1]);
  assert.equal(r.regions.length, 2);
  assert.equal(r.partitions.features.length, 1);
  assert.deepEqual(
    r.regions.map((region) =>
      nativeExplorePlaces(applied.dataset, region).map((r) => r.key),
    ),
    [["0"], ["1"]],
  );
  const stale = structuredClone(applied.dataset);
  stale.walls[0].ringsFeet[0][0][0] -= 0.01;
  const untrusted = await deriveNativeExplore(stale, [1]);
  assert.equal(untrusted.partitions.features.length, 0);
  assert.equal(untrusted.regions.length, 1);
  assert.ok(untrusted.warnings.some((w) => w.includes("needs review")));
});
test("native Explore retains per-native-level provenance and limits building choices without inventing destinations", async () => {
  const p = await fixture();
  p.dataset.records[1].building = "02";
  const all = await deriveNativeExplore(p.dataset, [1]);
  assert.deepEqual(
    nativeExplorePlaces(p.dataset, all.regions[0], "02").map((r) => r.key),
    ["1"],
  );
  assert.equal(
    (await deriveNativeExplore(p.dataset, [1], "02")).regions.length,
    1,
  );
  await assert.rejects(
    deriveNativeExplore(p.dataset, [1], "missing"),
    /No native floor geometry/,
  );
  assert.equal(all.regions[0].levelId, 1);
});

test("campus viewer retains exact applied native outlines without authoring notes/proposals/history", async () => {
  const { exportCampusViewer, readIndoorProject } = await import(
    "../../app/indoor-project/package"
  );
  const { unzipSync, strFromU8 } = await import("fflate");
  const p = await fixture(),
    b = await boundary(p);
  b.notes = "PRIVATE authoring rationale";
  b.evidence.reason = "PRIVATE source proof path";
  const applied = applyReviewedAreaPartition(
    saveReviewedAreaPartition(p, b),
    b.id,
    b.geometrySha256,
  );
  const original = await deriveNativeExplore(applied.dataset, [1]);
  const bytes = await exportCampusViewer(applied),
    raw = unzipSync(bytes);
  assert.equal(strFromU8(raw["viewer/indoor.json"]).includes("PRIVATE"), false);
  const viewer = await readIndoorProject(bytes);
  assert.equal(viewer.dataset.reviewedAreaPartitions, undefined);
  assert.equal(viewer.rooms.reviewedAreaPartitions, undefined);
  assert.ok(viewer.dataset.nativeExploreMapping);
  const published = await deriveNativeExplore(viewer.dataset, [1]);
  assert.deepEqual(published.regions, original.regions);
  assert.deepEqual(published.outlines, original.outlines);
  assert.deepEqual(published.partitions, original.partitions);
  assert.deepEqual(viewer.dataset.doors, applied.dataset.doors);
  assert.deepEqual(viewer.dataset.edges, applied.dataset.edges);
  assert.deepEqual(viewer.dataset.records, applied.dataset.records);
  const changed = structuredClone(viewer.dataset);
  changed.walls[0].ringsFeet[0][0][0] -= 0.01;
  await assert.rejects(
    deriveNativeExplore(changed, [1]),
    /stale source geometry/,
  );
  const damaged = structuredClone(viewer.dataset);
  damaged.nativeExploreMapping!.levels[0].regions[0].ringsFeet[0][0][0] += 0.01;
  await assert.rejects(deriveNativeExplore(damaged, [1]), /changed or damaged/);
  const privateNote = structuredClone(viewer.dataset);
  (
    privateNote.nativeExploreMapping!.levels[0].boundaries[0] as unknown as {
      notes: string;
    }
  ).notes = "hidden authoring note";
  await assert.rejects(
    deriveNativeExplore(privateNote, [1]),
    /Invalid published analytical/,
  );
});

test("published native map keeps pass-through selection and excluded footprint while leaving doors/routes intact", async () => {
  const { exportCampusViewer, readIndoorProject } = await import(
    "../../app/indoor-project/package"
  );
  const p = await fixture(),
    d = p.dataset;
  const door = {
    id: "threshold",
    nativeElementId: 300,
    levelId: 1,
    pointFeet: [15, 10] as [number, number],
    normalFeet: [1, 0] as [number, number],
    footprintFeet: rect(14.8, 8, 0.4, 4),
    roomKeys: ["0", "1"],
    state: "connected" as const,
  };
  d.doors = [door];
  d.nodes = ["0", "1"].map((roomKey, i) => ({
    id: `portal${i}`,
    roomKey,
    levelId: 1,
    building: "01",
    surfaceId: "first",
    pointFeet: [i ? 16 : 14, 10, 0] as [number, number, number],
    geographic: [0, 0] as [number, number],
    kind: "portal",
  }));
  d.edges = [
    {
      id: door.id,
      from: "portal0",
      to: "portal1",
      kind: "door",
      lengthMetres: 0.6096,
      evidence: "measured-native-door",
      accessible: "unknown",
      enabled: true,
      nativeElementId: 300,
      roomKeys: door.roomKeys,
      pointsFeet: [
        [14, 10, 0],
        [16, 10, 0],
      ],
    },
  ];
  const { id: _, state: __, ...saved } = door;
  p.rooms.selectionDoorThresholds = d.selectionDoorThresholds = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    doors: [{ ...saved, notes: "PRIVATE threshold reviewer notes" }],
  };
  p.rooms.indoorExclusions = d.indoorExclusions = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    areas: [
      {
        id: "lip",
        reason: "off-limits",
        levelId: 1,
        elevationFeet: 0,
        label: "Railing lip",
        notes: "PRIVATE restriction rationale",
        nativeFloorIds: [100],
        partsFeet: [[rect(1, 17, 10, 2)]],
      },
    ],
  };
  const before = await deriveNativeExplore(d, [1]);
  assert.equal(before.regions.length, 1);
  assert.equal(
    before.regions.some((r) => pointInNativeArea([15, 10], r.ringsFeet)),
    true,
  );
  assert.equal(
    before.regions.some((r) => pointInNativeArea([5, 18], r.ringsFeet)),
    false,
  );
  const viewer = await readIndoorProject(await exportCampusViewer(p));
  assert.equal(viewer.dataset.selectionDoorThresholds, undefined);
  assert.equal(viewer.dataset.indoorExclusions?.areas[0].notes, undefined);
  const published = await deriveNativeExplore(viewer.dataset, [1]);
  assert.deepEqual(published.regions, before.regions);
  assert.deepEqual(viewer.dataset.doors, d.doors);
  assert.deepEqual(viewer.dataset.edges, d.edges);
  viewer.dataset.edges[0].enabled = false;
  await assert.rejects(
    deriveNativeExplore(viewer.dataset, [1]),
    /stale source geometry/,
  );
});

test("viewer import rejects a checksummed changed physical dataset with an older native mapping", async () => {
  const { exportCampusViewer, readIndoorProject } = await import(
    "../../app/indoor-project/package"
  );
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import("fflate");
  const { createHash } = await import("node:crypto");
  const files = unzipSync(await exportCampusViewer(await fixture()));
  const data = JSON.parse(strFromU8(files["viewer/indoor.json"]));
  data.walls[0].ringsFeet[0][0][0] -= 0.01;
  const changed = strToU8(JSON.stringify(data)),
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
  manifest.indoor.bytes = changed.length;
  manifest.indoor.sha256 = createHash("sha256").update(changed).digest("hex");
  files["viewer/indoor.json"] = changed;
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  await assert.rejects(
    readIndoorProject(zipSync(files)),
    /stale source geometry/,
  );
});

// Master/viewer imports and startup restores must resolve the same presentation.
test("main native map default retains explicit comparison links and legacy fallback", async () => {
  const p = await fixture();
  assert.deepEqual(initialMapPresentation(p.dataset, null), {
    view: "2d",
    nativeFloor: true,
  });
  for (const view of ["3d", "relative", "native"] as const)
    assert.equal(initialMapPresentation(p.dataset, view).view, view);
  assert.deepEqual(initialMapPresentation(p.dataset, "2d"), {
    view: "2d",
    nativeFloor: true,
  });
  for (const inheritedView of ["2d", "3d", "relative", "native"])
    assert.deepEqual(initialMapPresentation(p.dataset, inheritedView, true), {
      view: "2d",
      nativeFloor: true,
    });
  p.dataset.walkingSupport!.sourceModelSha256 = "stale";
  assert.equal(initialMapPresentation(p.dataset, null).view, "3d");
  delete p.dataset.nativeIndoorEnvelopes;
  assert.deepEqual(initialMapPresentation(p.dataset, "2d"), {
    view: "2d",
    nativeFloor: false,
  });
});

test("native playback reports unavailable levels without inventing native faces", async () => {
  const p = await fixture();
  p.dataset.nativeLevels.push({
    id: 99,
    name: "Unsupported",
    elevationFeet: 100,
  });
  const result = await deriveNativeExplore(p.dataset, [1, 99]);
  assert.deepEqual(result.levelIds, [1]);
  assert.ok(
    result.warnings.some(
      (w) => w.includes("#99") && w.includes("No native slabs"),
    ),
  );
  assert.ok(result.regions.every((r) => r.levelId === 1));
  await assert.rejects(deriveNativeExplore(p.dataset, [99]), /No native slabs/);
});

test("shared native area search preserves room identities across names, numbers and native levels", async () => {
  const { filterNativeExplorePlaces, nativeExploreControlHit } = await import(
    "../../app/indoor-project/native-explore"
  );
  const p = await fixture();
  const first = {
    ...p.dataset.records[0],
    number: "10-3052",
    name: "Research Office",
    levelId: 694,
  };
  const second = {
    ...p.dataset.records[1],
    number: "10-4052",
    name: "Research Office",
    levelId: 402367,
  };
  const places = [first, second];
  assert.deepEqual(filterNativeExplorePlaces(places, ""), places);
  assert.deepEqual(filterNativeExplorePlaces(places, "research #694"), [first]);
  assert.deepEqual(filterNativeExplorePlaces(places, "4052 OFFICE"), [second]);
  assert.deepEqual(filterNativeExplorePlaces(places, "no match"), []);
  for (const id of [
    "project-door-fill",
    "project-door-boxes",
    "project-native-stair-fill",
    "project-native-stair-boxes",
    "project-portal-point",
    "project-connector-point",
  ])
    assert.equal(nativeExploreControlHit(id), true, id);
  for (const id of [
    "native-explore-floor",
    "project-room-boxes",
    "project-label",
  ])
    assert.equal(nativeExploreControlHit(id), false, id);
});

test("published evidence warning count stays accurate when messages are summarized", async () => {
  const { compileNativeExploreMapping, nativeExploreDatasetGeometrySha256 } =
    await import("../../app/indoor-project/native-explore-mapping");
  const { createHash } = await import("node:crypto");
  const p = await fixture();
  const mapping = await compileNativeExploreMapping(
    p.dataset,
    await nativeExploreDatasetGeometrySha256(p.dataset),
  );
  mapping.levels[0].warningCount = 5;
  mapping.mappingSha256 = createHash("sha256")
    .update(JSON.stringify([mapping.levels, mapping.unavailableLevelIds]))
    .digest("hex");
  p.dataset.nativeExploreMapping = mapping;
  const result = await deriveNativeExplore(p.dataset, [1]);
  assert.equal(result.warningCount, 5);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /5 source evidence warnings/);
});

test("shared walkway tint uses source native enclosure evidence, preserving holes without metadata cropping", async () => {
  const p = await fixture();
  const [office, hallway] = p.dataset.records;
  hallway.ringsFeet = [rect(-1, -1, 18, 22)];
  p.dataset.records.push({
    ...office,
    key: "right-office-test",
    ringsFeet: [rect(18, 1, 10, 10)],
  });
  await enclose(p, [[rect(0, 0, 28, 20)]]);
  const before = JSON.stringify(p.dataset);
  const result = await deriveNativeExplore(p.dataset, [1]);
  const green = result.fills.features.filter((f) => f.properties?.circulation);
  assert.ok(green.length);
  const { geographicPoint } = await import("../../app/indoor-project/routing");
  const { default: contains } = await import("@turf/boolean-point-in-polygon");
  const isGreen = (point: [number, number]) =>
    green.some((f) => contains(geographicPoint(p.dataset, point), f));
  assert.equal(isGreen([2, 3]), true);
  assert.equal(isGreen([4, 15]), false, "native floor hole");
  assert.equal(isGreen([2, -0.5]), false, "outside the native floor");
  assert.equal(
    isGreen([25, 5]),
    true,
    "native face continues beyond the old hallway outline",
  );
  assert.equal(isGreen([29, 18]), false, "unclaimed exterior slab is hidden");
  assert.equal(
    result.regions[0].enclosureReviewAreaSquareFeet ?? 0,
    0,
    "indoor regions are resolved inside native enclosure evidence before identity assignment",
  );
  const overviewGreen = result.overview.features.filter(
    (f) => f.properties?.circulation,
  );
  assert.equal(
    overviewGreen.some((f) => contains(geographicPoint(p.dataset, [25, 5]), f)),
    true,
    "the overview retains the same native circulation scope",
  );
  assert.equal(
    overviewGreen.some((f) =>
      contains(geographicPoint(p.dataset, [29, 18]), f),
    ),
    false,
    "zooming out cannot restore the hidden slab",
  );
  assert.deepEqual(
    nativeExplorePickRegions(p.dataset, result.regions, [29, 18]),
    [],
    "hidden slab is not selectable in Explore",
  );
  assert.equal(
    result.regions.length,
    1,
    "color does not split a shared enclosure",
  );
  assert.equal(
    JSON.stringify(p.dataset),
    before,
    "color does not change source identities or routes",
  );
});

test("unresolved shared slabs have no old outline fallback and mixed restrictions do not cut metadata shapes", async () => {
  const p = await fixture();
  delete p.dataset.nativeIndoorEnvelopes;
  const missing = await deriveNativeExplore(p.dataset, [1]);
  assert.equal(missing.outlines.features.length, 0);
  assert.ok((missing.regions[0].enclosureReviewAreaSquareFeet ?? 0) > 0);
  await enclose(p, [p.dataset.walkingSupport!.floors[0].ringsFeet]);
  p.dataset.records.push({
    ...p.dataset.records[0],
    key: "restricted",
    access: "staff",
    ringsFeet: [rect(2, 2, 3, 3)],
  });
  const mixed = await deriveNativeExplore(p.dataset, [1]);
  assert.ok(mixed.fills.features.length);
  assert.ok(
    mixed.fills.features.every((f) => f.properties?.color === "#e9edef"),
  );
  assert.equal(
    mixed.outlines.features.length,
    1,
    "the old restricted outline cannot split the native face",
  );
});

test("verified unlabelled native interiors keep their geometry without metadata claims", async () => {
  const p = await fixture();
  p.dataset.records = [];
  const before = JSON.stringify(p.dataset);
  const result = await deriveNativeExplore(p.dataset, [1]);
  assert.equal(result.regions.length, 1);
  assert.ok(result.regions[0].visitorPartsFeet?.length);
  assert.ok(result.fills.features.length);
  assert.ok(result.overview.features.length);
  assert.ok(result.outlines.features.length);
  assert.deepEqual(
    nativeExplorePickRegions(p.dataset, result.regions, [2, 2]),
    [],
  );
  assert.equal(JSON.stringify(p.dataset), before);
});

test("historical display crops cannot restore geometry outside a strict native source envelope", async () => {
  const p = await fixture();
  await enclose(p, [[rect(0, 0, 10, 20)]]);
  const before = await deriveNativeExplore(p.dataset, [1]);
  const region = before.regions[0];
  p.dataset.nativeDisplayScopes = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    scopes: [
      {
        id: "historical-crop",
        levelId: 1,
        regionId: region.id,
        regionRingsSha256: await nativeDisplayRegionHash(region.ringsFeet),
        partsFeet: [region.ringsFeet],
        evidence: "reviewed-source-enclosure",
      },
    ],
  };
  const after = await deriveNativeExplore(p.dataset, [1]);
  assert.deepEqual(after.fills, before.fills);
  assert.deepEqual(after.overview, before.overview);
  assert.deepEqual(after.outlines, before.outlines);
  assert.deepEqual(after.regions, before.regions);
  assert.deepEqual(
    nativeExplorePickRegions(p.dataset, after.regions, [25, 10]),
    [],
  );
});

test("native enclosure visibility is independent of label count and old room extent", async () => {
  const p = await fixture();
  await enclose(p, [[rect(0, 0, 28, 20)]]);
  const before = await deriveNativeExplore(p.dataset, [1]);
  const physical = (r: Awaited<ReturnType<typeof deriveNativeExplore>>) =>
    r.outlines.features.map((f) => f.geometry);
  p.dataset.records = [p.dataset.records[0]];
  assert.deepEqual(
    physical(await deriveNativeExplore(p.dataset, [1])),
    physical(before),
  );
  p.dataset.records[0].ringsFeet = [rect(-50, -50, 100, 100)];
  assert.deepEqual(
    physical(await deriveNativeExplore(p.dataset, [1])),
    physical(before),
  );
  p.dataset.records = [];
  const unlabelled = await deriveNativeExplore(p.dataset, [1]);
  assert.deepEqual(physical(unlabelled), physical(before));
  assert.ok(
    unlabelled.regions.every(
      (r) =>
        !r.visitorPartsFeet?.some((part) => pointInNativeArea([29, 18], part)),
    ),
    "removing labels cannot expose the outside slab",
  );
});

test("vestibule metadata colors its full native enclosure rather than the old inset outline", async () => {
  const p = await fixture();
  p.dataset.records = [
    {
      ...p.dataset.records[0],
      name: "Vestibule",
      circulation: false,
      access: "public",
      ringsFeet: [rect(2, 2, 2, 2)],
    },
  ];
  const before = JSON.stringify(p.dataset);
  const result = await deriveNativeExplore(p.dataset, [1]);
  const { geographicPoint } = await import("../../app/indoor-project/routing");
  const { default: contains } = await import("@turf/boolean-point-in-polygon");
  const green = result.fills.features.filter((f) => f.properties?.circulation);
  const isGreen = (point: [number, number]) =>
    green.some((f) => contains(geographicPoint(p.dataset, point), f));
  assert.equal(
    isGreen([28, 6]),
    true,
    "native interior beyond the old outline",
  );
  assert.equal(isGreen([31, 6]), false, "actual native outside edge");
  assert.equal(isGreen([15, 3]), false, "actual wall remains excluded");
  assert.equal(isGreen([4, 15]), false, "actual slab hole remains excluded");
  assert.equal(result.regions.length, 1);
  assert.equal(JSON.stringify(p.dataset), before);
});

test("shared native dining face keeps its food type despite small corridor, vestibule and stair claims", async () => {
  const { nativeExploreRegionStyle } = await import(
    "../../app/indoor-project/native-explore"
  );
  const { roomDisplayColor } = await import(
    "../../app/indoor-project/display-geometry"
  );
  const p = await fixture(),
    base = p.dataset.records[0];
  const region = (await deriveNativeExplore(p.dataset, [1])).regions[0];
  const rooms = [
    {
      ...base,
      key: "food",
      name: "Lower Dining Hall",
      circulation: false,
      ringsFeet: [rect(0, 0, 14, 20)],
    },
    {
      ...base,
      key: "pickup",
      name: "Food Pick Up",
      circulation: false,
      ringsFeet: [rect(17, 0, 13, 20)],
    },
    {
      ...base,
      key: "corridor",
      name: "Corridor",
      circulation: true,
      ringsFeet: [rect(0, 0, 2, 2)],
    },
    {
      ...base,
      key: "vestibule",
      name: "Vestibule",
      circulation: true,
      ringsFeet: [rect(20, 0, 2, 2)],
    },
    {
      ...base,
      key: "stair",
      name: "Stair",
      stair: true,
      circulation: false,
      ringsFeet: [rect(27, 0, 2, 2)],
    },
  ];
  const before = JSON.stringify({ region, rooms });
  assert.deepEqual(nativeExploreRegionStyle(region, rooms), {
    color: roomDisplayColor(rooms[0], false),
    circulation: false,
  });
  assert.notEqual(nativeExploreRegionStyle(region, rooms).color, "#bdd5c9");
  assert.equal(JSON.stringify({ region, rooms }), before);
});

test("native type majority unions overlapping metadata and subtracts native holes", async () => {
  const { nativeExploreRegionStyle } = await import(
    "../../app/indoor-project/native-explore"
  );
  const p = await fixture(),
    base = p.dataset.records[0];
  const region = (await deriveNativeExplore(p.dataset, [1])).regions[0];
  const rooms = [
    {
      ...base,
      key: "a",
      name: "Dining Hall",
      circulation: false,
      ringsFeet: [rect(0, 0, 12, 20)],
    },
    {
      ...base,
      key: "b",
      name: "Food Pick Up",
      circulation: false,
      ringsFeet: [rect(0, 0, 12, 20)],
    },
    {
      ...base,
      key: "hall",
      name: "Corridor",
      circulation: true,
      ringsFeet: [rect(20, 0, 2, 2)],
    },
  ];
  assert.deepEqual(
    nativeExploreRegionStyle(region, rooms),
    { color: "#e9edef", circulation: false },
    "duplicate labels cannot manufacture a majority",
  );
  const holeRegion = {
    ...region,
    ringsFeet: [rect(0, 0, 30, 20), rect(0, 0, 12, 20)],
  };
  assert.deepEqual(
    nativeExploreRegionStyle(holeRegion, rooms),
    { color: "#e9edef", circulation: false },
    "a claim inside an actual opening cannot color the floor",
  );
});

test("reviewed lift shaft gets grey non-selectable architectural context without becoming a walking floor region", async () => {
  const p = await fixture(),
    d = p.dataset;
  d.connectors = [
    {
      id: "lift",
      kind: "elevator",
      nativeElementId: 200,
      sourceModelSha256: d.source.modelSha256,
      evidence: "checked original shaft",
      accessible: "unknown",
      direction: "both",
      reviewedShaft: {
        pinId: "shaft",
        pointFeet: [5, 5],
        wallElementIds: [200, 201, 202],
      },
      entrances: [
        { roomKey: d.records[0].key, nodeId: "lobby", levelId: 1 },
        { roomKey: "upper", nodeId: "lobby2", levelId: 2 },
      ],
    },
  ];
  d.indoorExclusions = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    areas: [
      {
        id: "shaft-mask",
        connectorId: "lift",
        reason: "off-limits",
        levelId: 1,
        elevationFeet: 0,
        label: "Lift shaft",
        nativeFloorIds: [100],
        partsFeet: [[rect(4, 4, 2, 2)]],
      },
    ],
  };
  const before = JSON.stringify(d);
  const result = await deriveNativeExplore(d, [1]);
  const display = result.overview.features.find(
    (f) => f.properties?.shaftConnectorId === "lift",
  );
  assert(display);
  assert.equal(display.properties!.circulation, false);
  assert.equal(display.properties!.restricted, true);
  assert.equal(
    display.properties!.color,
    "#e9edef",
    "shaft context uses the non-walkable grey palette, not staff-room pink",
  );
  assert(!result.regions.some((r) => r.id === "shaft-mask"));
  assert(!result.regions.some((r) => pointInNativeArea([5, 5], r.ringsFeet)));
  assert.equal(JSON.stringify(d), before);
});

test("cross-type conflicting majorities stay neutral regardless of metadata record order", async () => {
  const { nativeExploreRegionStyle } = await import(
    "../../app/indoor-project/native-explore"
  );
  const p = await fixture(),
    food = {
      ...p.dataset.records[0],
      name: "Dining Hall",
      circulation: false,
      ringsFeet: [rect(0, 0, 18, 20)],
    },
    hall = {
      ...p.dataset.records[1],
      name: "Corridor",
      circulation: true,
      ringsFeet: [rect(12, 0, 18, 20)],
    };
  const region = { ringsFeet: [rect(0, 0, 30, 20)] } as any;
  const expected = { color: "#e9edef", circulation: false };
  assert.deepEqual(nativeExploreRegionStyle(region, [food, hall]), expected);
  assert.deepEqual(nativeExploreRegionStyle(region, [hall, food]), expected);
});

test("metadata contours and their holes cannot cut the physical native map", async () => {
  const p = await fixture();
  const before = await deriveNativeExplore(p.dataset, [1]);
  // Both records still predominantly identify the same connected physical face.
  // Artificial metadata steps/holes must change neither its geometry nor area.
  p.dataset.records[0].ringsFeet = [rect(1, 1, 7, 9), rect(2, 2, 1, 1)];
  p.dataset.records[1].ringsFeet = [rect(18, 2, 8, 9)];
  const after = await deriveNativeExplore(p.dataset, [1]);
  assert.deepEqual(
    after.outlines.features.map((f) => f.geometry),
    before.outlines.features.map((f) => f.geometry),
  );
  assert.deepEqual(
    after.regions.map((r) => r.visitorPartsFeet),
    before.regions.map((r) => r.visitorPartsFeet),
  );
  assert(
    after.regions.some((r) =>
      r.visitorPartsFeet?.some((part) => pointInNativeArea([2.5, 2.5], part)),
    ),
  );
  assert(
    after.regions.every(
      (r) =>
        !r.visitorPartsFeet?.some((part) => pointInNativeArea([4, 15], part)),
    ),
  );
});

test("native flat wall rendering uses recovered sections and leaves old prepared jamb evidence untouched", async () => {
  const p = await fixture();
  const original = JSON.stringify(p.dataset.walls);
  const value = {
    version: 1 as const,
    sourceModelSha256: p.dataset.source.modelSha256,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 4,
        evidenceSha256: "e".repeat(64),
        sourceElementIds: [200, 201],
        sections: [
          {
            nativeElementId: 200,
            categoryId: -2000011,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 10,
            partsFeet: [[rect(15, 0, 0.25, 20)]],
          },
        ],
      },
    ],
  };
  p.dataset.nativeMaterialSections = {
    ...value,
    geometrySha256: await nativeMaterialSectionsHash(value),
  };
  const result = await deriveNativeExplore(p.dataset, [1]);
  assert.equal(result.walls!.features.length, 1);
  assert.equal(result.walls!.features[0].properties!.nativeElementId, 200);
  assert.equal(result.regions.length, 2);
  assert.equal(JSON.stringify(p.dataset.walls), original);
  const another = structuredClone(p.dataset);
  another.records[0].ringsFeet = [rect(-50, -50, 100, 100)];
  assert.deepEqual(
    (await deriveNativeExplore(another, [1])).walls,
    result.walls,
  );
  const bad = structuredClone(p.dataset);
  bad.nativeMaterialSections!.levels[0].sections[0].partsFeet[0][0][0][0] += 0.1;
  await assert.rejects(deriveNativeExplore(bad, [1]), /checksum changed/);
});

test("a regenerated native floor remains native when its ordinary 2D URL is reopened", async () => {
  const p = await fixture();
  await enclose(p, [[rect(0, 0, 30, 20)]]);
  assert.deepEqual(initialMapPresentation(p.dataset, "2d"), {
    view: "2d",
    nativeFloor: true,
  });
  for (const view of ["2d", "3d", "relative", "native"])
    assert.deepEqual(initialMapPresentation(p.dataset, view, true), {
      view: "2d",
      nativeFloor: true,
    });
});
