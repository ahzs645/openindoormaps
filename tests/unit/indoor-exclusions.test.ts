import assert from "node:assert/strict";
import test from "node:test";
import { fixture, project } from "../fixtures/native-area-project";
import {
  createIndoorExclusionQuery,
  validateIndoorExclusions,
} from "../../app/indoor-project/indoor-exclusions";
import {
  createIndoorExclusionQuery as compilerQuery,
  validateIndoorExclusions as compilerValidate,
} from "../../../reviter/lib/reviter/indoor-exclusions.ts";
import {
  deriveNativeAreas,
  applyNativeAreaDecision,
  saveNativeAreaDecision,
  pointInNativeArea,
  removeOutdoorExclusion,
} from "../../app/indoor-project/native-area-review";
import {
  exportIndoorProject,
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { createProjectRouteDiagnostics } from "../../app/indoor-project/route-diagnostics";
import {
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";
import type {
  IndoorDataset,
  IndoorExclusions,
} from "../../app/indoor-project/contract";
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
function exclusion(
  d: IndoorDataset,
  partsFeet: [number, number][][][] = [[rect(14, 0, 2, 20)]],
): IndoorExclusions {
  return {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    areas: [
      {
        id: "outside-bridge",
        levelId: 1,
        elevationFeet: 0,
        label: "Outdoor bridge",
        notes: "Full facade and building doors reviewed",
        nativeFloorIds: [100],
        partsFeet,
      },
    ],
  };
}
function graph() {
  const d = fixture();
  d.records = d.records.slice(0, 2);
  d.records.forEach((r, i) => {
    r.circulation = true;
    r.arrivalNodeId = i ? "b" : "a";
    r.ringsFeet = [rect(i * 20, 0, 10, 10)];
  });
  d.nodes = [
    ["a", 5, 0],
    ["b", 25, 0],
    ["c", 5, 10],
    ["e", 25, 10],
  ].map(([id, x, z]) => ({
    id: String(id),
    roomKey: id === "a" || id === "c" ? "0" : "1",
    building: "01",
    levelId: z ? 2 : 1,
    surfaceId: "first",
    pointFeet: [Number(x), 5, Number(z)],
    geographic: [0, 0],
    kind: "arrival",
  }));
  d.nativeLevels.push({ id: 2, name: "Floor 2", elevationFeet: 10 });
  d.edges = [
    {
      id: "shortcut",
      from: "a",
      to: "b",
      kind: "walk",
      lengthMetres: 6,
      pointsFeet: [
        [5, 5, 0],
        [25, 5, 0],
      ],
      roomKeys: [],
      accessible: "yes",
      enabled: true,
      evidence: "native-supported source walk",
    },
  ];
  return d;
}

test("exact exterior veto covers thin gaps, hole rings, heights and vertical endpoints identically in both apps", () => {
  const d = fixture();
  d.indoorExclusions = exclusion(d, [
    [rect(5.001, 0, 0.00001, 10)],
    [rect(20, 0, 10, 10), rect(22, 2, 6, 6)],
  ]);
  const visitor = createIndoorExclusionQuery(d),
    compiler = compilerQuery(d);
  const paths = [
    [
      [0, 5, 0],
      [10, 5, 0],
    ], // arbitrarily narrow crossing
    [
      [0, 5, 10],
      [10, 5, 10],
    ], // different floor
    [
      [23, 5, 0],
      [27, 5, 0],
    ], // polygon hole
    [
      [21, 5, 0],
      [23, 5, 0],
    ], // hole entry crosses exterior
    [
      [21, 5, 10],
      [21, 5, 0],
    ], // vertical arrival at exterior slab
    [
      [21, 0, 0],
      [29, 0, 0],
    ], // boundary is not a bypass
  ];
  assert.deepEqual(paths.map(visitor), [
    ["outside-bridge"],
    [],
    [],
    ["outside-bridge"],
    ["outside-bridge"],
    ["outside-bridge"],
  ]);
  assert.deepEqual(paths.map(visitor), paths.map(compiler));
});

test("all indoor profiles, retained diagnostics and reachability observe in-place scope edits on roomless links", () => {
  const d = graph();
  const diagnostic = createProjectRouteDiagnostics(d);
  const retained = projectRoutingGraph(d);
  assert.ok(findProjectRoute(d, "0", "1"));
  assert.ok(findProjectRoute(d, "0", "1", "accessible"));
  d.indoorExclusions = exclusion(d);
  assert.equal(findProjectRoute(d, "0", "1"), null);
  assert.equal(findProjectRoute(d, "0", "1", "accessible"), null);
  assert.ok(!reachableProjectDestinations(retained, "0").has("1"));
  assert.match(diagnostic.inspect("0", "1").message, /confirmed outdoor area/);
  assert.ok(
    diagnostic.inspect("0", "1").blockers.some((b) => b.kind === "outdoor"),
  );
  delete d.indoorExclusions;
  assert.ok(findProjectRoute(d, "0", "1"));
  assert.ok(reachableProjectDestinations(retained, "0").has("1"));
});

test("an enclosed alternative across another floor survives an outdoor shortcut exclusion", () => {
  const d = graph();
  d.indoorExclusions = exclusion(d);
  for (const [id, from, to, pointsFeet, kind] of [
    [
      "lift-up",
      "a",
      "c",
      [
        [5, 5, 0],
        [5, 5, 10],
      ],
      "elevator",
    ],
    [
      "upper-hall",
      "c",
      "e",
      [
        [5, 5, 10],
        [25, 5, 10],
      ],
      "walk",
    ],
    [
      "lift-down",
      "e",
      "b",
      [
        [25, 5, 10],
        [25, 5, 0],
      ],
      "elevator",
    ],
  ] as const)
    d.edges.push({
      id,
      from,
      to,
      pointsFeet: pointsFeet.map((p) => [...p]),
      kind,
      lengthMetres: 20,
      roomKeys: [],
      accessible: "yes",
      enabled: true,
      evidence: "reviewed indoor connection",
    });
  for (const mode of ["public", "accessible"] as const) {
    const route = findProjectRoute(d, "0", "1", mode);
    assert.deepEqual(
      route?.edges.map((e) => e.id),
      ["lift-up", "upper-hall", "lift-down"],
    );
    assert.ok(
      route!.paths.every(
        (p) => createIndoorExclusionQuery(d)(p.pointsFeet).length === 0,
      ),
    );
  }
});

test("an outdoor arrival cannot return a zero-length route", () => {
  const d = graph();
  d.indoorExclusions = exclusion(d, [[rect(0, 0, 10, 10)]]);
  assert.equal(findProjectRoute(d, "0", "0"), null);
});

async function native() {
  const p = await project();
  p.dataset.records = p.dataset.records.slice(0, 2);
  p.rooms.annotations = p.rooms.annotations.slice(0, 2);
  p.dataset.records[0].ringsFeet = [rect(0, 0, 10, 10)];
  p.dataset.records[1].ringsFeet = [rect(20, 0, 10, 10)];
  p.dataset.walkingSupport = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 30, 20), rect(22, 13, 3, 3)],
      },
    ],
  };
  p.dataset.walls = [
    {
      nativeElementId: 200,
      levelId: 1,
      kind: "wall",
      ringsFeet: [rect(14, 0, 1, 20)],
    },
  ];
  p.dataset.doors = [];
  return p;
}
test("native slab focus limits selection to its measured footprint and preserves its hole", async () => {
  const p = await native();
  p.dataset.walls = [];
  p.dataset.walkingSupport!.floors = [
    { nativeElementId: 100, elevationFeet: 0, ringsFeet: [rect(0, 0, 14, 20)] },
    {
      nativeElementId: 101,
      elevationFeet: 0,
      ringsFeet: [rect(14, 0, 16, 20), rect(22, 13, 3, 3)],
    },
  ];
  const all = await deriveNativeAreas(p.dataset, 1);
  const focused = await deriveNativeAreas(p.dataset, 1, { nativeFloorId: 101 });
  assert.equal(all.regions.length, 1);
  assert.equal(focused.regions.length, 1);
  assert.deepEqual(focused.regions[0].nativeFloorIds, [101]);
  assert.ok(pointInNativeArea([20, 5], focused.regions[0].ringsFeet));
  assert.ok(!pointInNativeArea([5, 5], focused.regions[0].ringsFeet));
  assert.ok(!pointInNativeArea([23, 14], focused.regions[0].ringsFeet));
  assert.notEqual(all.geometrySha256, focused.geometrySha256);
  await assert.rejects(
    deriveNativeAreas(p.dataset, 1, { nativeFloorId: 999 }),
    /slab/i,
  );
});
test("proposal has no effect; applying exterior removes native selection and retains real holes, rooms and source bytes through ZIP/viewer export", async () => {
  const p = await native(),
    before = JSON.stringify([
      p.rooms.annotations,
      p.dataset.records,
      p.dataset.walkingSupport,
      p.dataset.walls,
    ]);
  const result = await deriveNativeAreas(p.dataset, 1),
    right = result.regions.find((r) =>
      pointInNativeArea([25, 5], r.ringsFeet),
    )!;
  const patch = {
    kind: "outdoor" as const,
    label: "Confirmed outdoor courtyard link",
    notes: "Full model facade and entry thresholds reviewed.",
  };
  const proposed = await saveNativeAreaDecision(p, result, [right.id], patch);
  assert.equal(proposed.dataset.indoorExclusions, undefined);
  assert.equal(
    (await deriveNativeAreas(proposed.dataset, 1)).regions.length,
    result.regions.length,
  );
  const applied = await applyNativeAreaDecision(
    proposed,
    result,
    [right.id],
    patch,
    [],
  );
  const retraced = await deriveNativeAreas(applied.dataset, 1);
  assert.ok(
    !retraced.regions.some((r) => pointInNativeArea([25, 5], r.ringsFeet)),
  );
  assert.ok(
    retraced.regions.some((r) => pointInNativeArea([5, 5], r.ringsFeet)),
  );
  assert.notEqual(retraced.geometrySha256, result.geometrySha256);
  assert.equal(
    createIndoorExclusionQuery(applied.dataset)([[23, 14, 0]]).length,
    0,
    "real slab hole is not absorbed into the exterior footprint",
  );
  assert.equal(
    JSON.stringify([
      applied.rooms.annotations,
      applied.dataset.records,
      applied.dataset.walkingSupport,
      applied.dataset.walls,
    ]),
    before,
  );
  const reopened = await readIndoorProject(await exportIndoorProject(applied));
  assert.deepEqual(
    reopened.rooms.indoorExclusions,
    applied.rooms.indoorExclusions,
  );
  for (const file of ["model/review.rvt", "gis/reference-points.json"])
    assert.deepEqual(reopened.files[file], p.files[file]);
  const viewer = await readIndoorProject(await exportCampusViewer(applied));
  assert.equal(viewer.dataset.indoorExclusions!.areas[0].notes, undefined);
  assert.deepEqual(
    viewer.dataset.indoorExclusions!.areas[0].partsFeet,
    right ? [right.ringsFeet] : [],
  );
  assert.equal(viewer.rooms.nativeAreaReviews, undefined);
  const restored = removeOutdoorExclusion(
    reopened,
    reopened.dataset.indoorExclusions!.areas[0].id,
  );
  assert.equal(restored.dataset.indoorExclusions, undefined);
  assert.equal(
    restored.rooms.nativeAreaReviews!.decisions[0].status,
    "proposed",
  );
  assert.equal(
    (await deriveNativeAreas(restored.dataset, 1)).geometrySha256,
    result.geometrySha256,
  );
});

test("invalid/stale model masks and mismatched authoring/prepared scope cannot be exported", async () => {
  const p = await native();
  const wrong = exclusion(p.dataset);
  wrong.sourceModelSha256 = "f".repeat(64);
  assert.throws(
    () =>
      validateIndoorExclusions(
        wrong,
        p.dataset.source.modelSha256,
        p.dataset.nativeLevels,
      ),
    /model identity/,
  );
  p.dataset.indoorExclusions = exclusion(p.dataset);
  await assert.rejects(exportIndoorProject(p), /do not match/);
  const bad = structuredClone(p.dataset.indoorExclusions);
  bad.areas[0].partsFeet[0][0][0][0] = NaN;
  assert.throws(() => validateIndoorExclusions(bad), /footprint/);
  const crop = await deriveNativeAreas(p.dataset, 1, {
    roomKey: "0",
    mode: "room",
  });
  await assert.rejects(
    applyNativeAreaDecision(
      p,
      crop,
      [crop.regions[0].id],
      {
        kind: "outdoor",
        label: "Not certified by a crop",
        notes: "outline only",
      },
      [],
    ),
    /complete native region/,
  );
});

test("off-limits footprint blocks selection and every route profile without claiming outdoors or changing place access", async () => {
  const p = await native();
  const original = JSON.stringify([
    p.rooms.annotations,
    p.dataset.records,
    p.dataset.walkingSupport,
    p.dataset.walls,
  ]);
  const result = await deriveNativeAreas(p.dataset, 1);
  const selected = result.regions.find((r) =>
    pointInNativeArea([25, 5], r.ringsFeet),
  )!;
  const patch = {
    kind: "non-traversable" as const,
    label: "Behind native railing",
    notes:
      "Source railing and glass enclose a user-confirmed non-traversable lip; preserve floor and real void.",
  };
  const proposal = await saveNativeAreaDecision(
    p,
    result,
    [selected.id],
    patch,
  );
  assert.equal(proposal.dataset.indoorExclusions, undefined);
  const applied = await applyNativeAreaDecision(
    proposal,
    result,
    [selected.id],
    patch,
    [],
  );
  assert.equal(applied.dataset.indoorExclusions!.areas[0].reason, "off-limits");
  assert.equal(
    applied.rooms.nativeAreaReviews!.decisions.at(-1)!.kind,
    "non-traversable",
  );
  assert.equal(
    JSON.stringify([
      applied.rooms.annotations,
      applied.dataset.records,
      applied.dataset.walkingSupport,
      applied.dataset.walls,
    ]),
    original,
  );
  const after = await deriveNativeAreas(applied.dataset, 1);
  assert.ok(
    !after.regions.some((r) => pointInNativeArea([25, 5], r.ringsFeet)),
  );
  assert.ok(after.regions.some((r) => pointInNativeArea([5, 5], r.ringsFeet)));
  assert.equal(
    createIndoorExclusionQuery(applied.dataset)([[23, 14, 0]]).length,
    0,
  );
  const roundtrip = await readIndoorProject(await exportIndoorProject(applied));
  assert.deepEqual(
    roundtrip.rooms.indoorExclusions,
    applied.rooms.indoorExclusions,
  );
  const viewer = await readIndoorProject(await exportCampusViewer(applied));
  assert.equal(viewer.dataset.indoorExclusions!.areas[0].reason, "off-limits");
  assert.equal(viewer.dataset.indoorExclusions!.areas[0].notes, undefined);
  for (const file of ["model/review.rvt", "gis/reference-points.json"])
    assert.deepEqual(roundtrip.files[file], p.files[file]);
  const restored = removeOutdoorExclusion(
    roundtrip,
    applied.dataset.indoorExclusions!.areas[0].id,
  );
  assert.equal(restored.dataset.indoorExclusions, undefined);
  assert.equal(
    restored.rooms.nativeAreaReviews!.decisions.at(-1)!.status,
    "proposed",
  );
  assert.equal(
    (await deriveNativeAreas(restored.dataset, 1)).geometrySha256,
    result.geometrySha256,
  );

  const data = graph();
  const diagnostic = createProjectRouteDiagnostics(data),
    retained = projectRoutingGraph(data);
  data.indoorExclusions = exclusion(data);
  data.indoorExclusions.areas[0].reason = "off-limits";
  for (const profile of ["public", "accessible"] as const)
    assert.equal(findProjectRoute(data, "0", "1", profile), null);
  assert.ok(!reachableProjectDestinations(retained, "0").has("1"));
  const blocked = diagnostic.inspect("0", "1");
  assert.match(blocked.message, /reviewed non-traversable footprint/);
  assert.doesNotMatch(blocked.message, /outdoor/i);
  assert.ok(blocked.blockers.some((b) => b.kind === "off-limits"));
  assert.deepEqual(
    createIndoorExclusionQuery(data)([
      [5, 5, 0],
      [25, 5, 0],
    ]),
    compilerQuery(data)([
      [5, 5, 0],
      [25, 5, 0],
    ]),
  );
  data.indoorExclusions.areas[0].partsFeet = [[rect(0, 0, 10, 10)]];
  assert.equal(findProjectRoute(data, "0", "0"), null);
  assert.match(
    diagnostic.inspect("0", "1").message,
    /reviewed non-traversable footprint/,
  );
  delete data.indoorExclusions;
  assert.ok(findProjectRoute(data, "0", "1"));
});

test("exclusion reason validation is mirrored, legacy outdoor masks survive and unknown classifications fail", () => {
  const d = fixture();
  for (const reason of [undefined, "outdoor", "off-limits"] as const) {
    const value = exclusion(d);
    if (reason) value.areas[0].reason = reason;
    validateIndoorExclusions(value, d.source.modelSha256, d.nativeLevels);
    compilerValidate(value, d.source.modelSha256, d.nativeLevels);
    const paths = [
      [
        [0, 5, 0],
        [20, 5, 0],
      ],
      [
        [0, 5, 10],
        [20, 5, 10],
      ],
    ];
    assert.deepEqual(
      paths.map(createIndoorExclusionQuery({ ...d, indoorExclusions: value })),
      paths.map(compilerQuery({ ...d, indoorExclusions: value })),
    );
  }
  const invalid = exclusion(d);
  invalid.areas[0].reason = "assumed-void" as never;
  assert.throws(() => validateIndoorExclusions(invalid), /exclusion footprint/);
  assert.throws(() => compilerValidate(invalid), /exclusion footprint/);
});
