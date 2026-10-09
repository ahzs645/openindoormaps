import test from "node:test";
import assert from "node:assert/strict";
import { fixture, project } from "../fixtures/native-area-project";
import {
  nativeWindowGeometry,
  validateNativeWindowDisplay,
  withWindowExportMode,
  nativeWindowDisplayInput,
} from "../../app/indoor-project/native-window-display";
import {
  exportCampusViewer,
  readIndoorProject,
  exportIndoorProject,
} from "../../app/indoor-project/package";
import { geographicPoint } from "../../app/indoor-project/routing";
import { prepareNativeWindowDisplay } from "../../../reviter/lib/reviter/native-window-display";
import type { ConvertResult } from "../../../reviter/lib/reviter/types";
const rectangle = (
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
function displayData() {
  const d = fixture();
  d.walls = [
    {
      nativeElementId: 10,
      levelId: 1,
      kind: "wall",
      approximate: false,
      ringsFeet: [rectangle(0, -0.5, 20, 1)],
    },
  ];
  d.windowDisplay = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    mode: "native",
    routing: "original-barriers",
    elements: [
      {
        nativeElementId: 21,
        hostId: 20,
        levelId: 1,
        role: "glazing",
        footprintFeet: rectangle(3, -0.04, 3, 0.08),
        baseElevationFeet: 3,
        topElevationFeet: 7,
        assemblyTopElevationFeet: 9,
        materialEvidence: "native-material",
        transparency: 0.9,
      },
    ],
    wallCuts: [
      {
        hostId: 20,
        nativeWallId: 10,
        levelId: 1,
        wallGeometryKey: JSON.stringify(d.walls[0].ringsFeet),
        ringsFeet: [rectangle(3, -0.5, 3, 1)],
        baseElevationFeet: 3,
        topElevationFeet: 7,
        assemblyTopElevationFeet: 9,
      },
    ],
    unresolvedNativeElementIds: [],
  };
  return d;
}
test("window evidence rejects another model, duplicate members and stale wall cuts", () => {
  const d = displayData();
  validateNativeWindowDisplay(d);
  for (const mutate of [
    (x: typeof d) => (x.windowDisplay!.sourceModelSha256 = "f".repeat(64)),
    (x: typeof d) =>
      x.windowDisplay!.elements.push(x.windowDisplay!.elements[0]),
    (x: typeof d) => (x.walls[0].ringsFeet = [rectangle(0, 0, 20, 1)]),
  ]) {
    const bad = structuredClone(d);
    mutate(bad);
    assert.throws(() => validateNativeWindowDisplay(bad));
  }
});
test("native preview replaces proven curtain envelopes before merging without changing original barriers", () => {
  const d = displayData();
  d.walls.push(
    {
      nativeElementId: 20,
      levelId: 1,
      kind: "wall",
      approximate: true,
      ringsFeet: [rectangle(3, -2, 3, 4)],
    },
    {
      nativeElementId: 21,
      levelId: 1,
      kind: "wall",
      approximate: true,
      ringsFeet: [rectangle(3, -0.04, 3, 0.08)],
    },
  );
  const before = JSON.stringify(d);
  const preview = nativeWindowDisplayInput(d);
  assert.deepEqual(
    preview.walls.map((w) => w.nativeElementId),
    [10],
  );
  assert.equal(preview.records, d.records);
  assert.equal(preview.edges, d.edges);
  assert.equal(preview.doors, d.doors);
  assert.equal(JSON.stringify(d), before);
  assert.equal(
    nativeWindowDisplayInput(withWindowExportMode(d, "simplified")).walls
      .length,
    3,
  );
  for (const mutate of [
    (x: typeof d) => x.windowDisplay!.unresolvedNativeElementIds.push(20),
    (x: typeof d) => x.windowDisplay!.wallCuts.splice(0),
    (x: typeof d) => (x.walls[0].ringsFeet = [rectangle(0, 0, 20, 1)]),
    (x: typeof d) => (x.walls[1].approximate = false),
    (x: typeof d) =>
      (x.windowDisplay!.elements[0].footprintFeet = rectangle(30, 0, 3, 0.08)),
  ]) {
    const changed = structuredClone(d);
    mutate(changed);
    assert.equal(
      nativeWindowDisplayInput(changed),
      changed,
      "Unproven assembly keeps its fallback",
    );
  }
});
test("preserved window display cuts only its level, retains sill/head and leaves navigation untouched", () => {
  const d = displayData(),
    before = JSON.stringify(d);
  const w = nativeWindowGeometry(d, [1], "all");
  const wall = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { levelId: 1, base: 0, height: 0.61 },
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: [
            [d.walls[0].ringsFeet[0].map((p) => geographicPoint(d, p))],
          ],
        },
      },
    ],
  };
  const plan = w.cutWalls(wall, false);
  assert.equal(
    plan.features.length,
    2,
    "Plan opening stays clear despite 3D sill/head bands",
  );
  const three = w.cutWalls(wall, true);
  assert.equal(new Set(three.features.map((f) => f.properties?.base)).size, 3);
  for (const f of w.features.features)
    for (const p of f.geometry.coordinates)
      for (const r of p) assert.deepEqual(r[0], r.at(-1));
  assert.equal(three.features[0].properties?.base, 0);
  assert.equal(three.features.at(-1)?.properties?.height, 0.61);
  assert.equal(
    three.features.filter(
      (f) => f.properties?.base === three.features[1].properties?.base,
    ).length,
    2,
  );
  assert.equal(nativeWindowGeometry(d, [2], "all").features.features.length, 0);
  assert.equal(JSON.stringify(d), before);
  assert.equal(
    nativeWindowGeometry(
      withWindowExportMode(d, "simplified"),
      [1],
      "all",
    ).cutWalls(wall, true),
    wall,
  );
});
test("strict material sections preserve the original window/host inventory instead of legacy comparison omission", () => {
  const d = displayData();
  d.walls.push({
    nativeElementId: 20,
    levelId: 1,
    kind: "wall",
    approximate: true,
    ringsFeet: [rectangle(3, -2, 3, 4)],
  });
  assert.notEqual(
    nativeWindowDisplayInput(d),
    d,
    "legacy comparison can omit the independently covered proxy",
  );
  d.nativeIndoorEnvelopes = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "a".repeat(64),
    levels: [],
  };
  d.nativeMaterialSections = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    geometrySha256: "b".repeat(64),
    elements: [],
  } as unknown as NonNullable<typeof d.nativeMaterialSections>;
  const before = JSON.stringify(d);
  assert.equal(nativeWindowDisplayInput(d), d);
  assert.equal(nativeWindowDisplayInput(d).walls, d.walls);
  assert.equal(JSON.stringify(d), before);
});
test("both viewer exports round-trip with identical rooms, doors, graph and original source, while simplified omits detail", async () => {
  const p = await project();
  const d = displayData();
  d.source = structuredClone(p.dataset.source);
  d.windowDisplay!.sourceModelSha256 = d.source.modelSha256;
  d.presentation!.sourceModelSha256 = d.source.modelSha256;
  p.dataset = d;
  const before = JSON.stringify(p.dataset);
  const native = await readIndoorProject(
      await exportCampusViewer(p, { windows: "native" }),
    ),
    simple = await readIndoorProject(
      await exportCampusViewer(p, { windows: "simplified" }),
    );
  assert.equal(native.dataset.windowDisplay?.mode, "native");
  assert.equal(simple.dataset.windowDisplay, undefined);
  for (const k of [
    "walls",
    "records",
    "nodes",
    "edges",
    "doors",
    "alignment",
    "indoorExclusions",
  ] as const)
    assert.deepEqual(native.dataset[k], simple.dataset[k]);
  assert.equal(JSON.stringify(p.dataset), before);
  const master = await readIndoorProject(await exportIndoorProject(p));
  assert.deepEqual(
    master.files["model/review.rvt"],
    p.files["model/review.rvt"],
  );
  assert.ok(master.dataset.windowDisplay);
  const old = await project();
  await assert.rejects(
    () => exportCampusViewer(old, { windows: "native" }),
    /evidence is missing/,
  );
});
test("source extraction honors decoded opaque spandrel and vetoes a host with missing members", () => {
  const d = displayData();
  delete d.windowDisplay;
  const bounds = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    depth: number,
  ) => ({ min: { x, y, z }, max: { x: x + w, y: y + h, z: z + depth } });
  const panel = {
    elementId: 21,
    categoryId: -2000170,
    typeName: "With Glazing",
    boundsFeet: bounds(3, -0.04, 3, 3, 0.08, 4),
    orientedBox: [
      ...[3, 7].flatMap((z) =>
        rectangle(3, -0.04, 3, 0.08).map((p) => [...p, z]),
      ),
    ],
  };
  const wall = {
    elementId: 10,
    categoryId: -2000011,
    wallKind: "basic",
    boundsFeet: bounds(0, -0.5, 0, 20, 1, 9),
    solid: {
      elementId: 10,
      start: { x: 0, y: 0 },
      end: { x: 20, y: 0 },
      baseElevation: 0,
      topElevation: 9,
      thickness: 1,
    },
  };
  const host = {
    elementId: 20,
    categoryId: -2000011,
    wallKind: "curtain",
    boundsFeet: bounds(3, -0.1, 3, 3, 0.2, 4),
  };
  const model = {
    elementBounds: [wall, host, panel],
    nativeHostRelations: [{ kind: "host", elementId: 21, hostId: 20 }],
    nativeMaterialDefinitions: [
      { elementId: 50, appearance: { transparency: 0 } },
    ],
    nativeElementMaterialAssignments: [{ elementId: 21, materialId: 50 }],
  } as unknown as ConvertResult;
  const rich = prepareNativeWindowDisplay(model, d as any);
  assert.equal(rich.elements[0].role, "opaque-panel");
  assert.equal(rich.wallCuts.length, 1);
  model.nativeHostRelations!.push({
    kind: "host",
    elementId: 99,
    hostId: 20,
  } as any);
  const incomplete = prepareNativeWindowDisplay(model, d as any);
  assert.equal(incomplete.wallCuts.length, 0);
  assert.ok(incomplete.unresolvedNativeElementIds.includes(20));
});
