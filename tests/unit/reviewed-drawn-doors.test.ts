/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit records into invalid shapes */
import { test } from "node:test";
import assert from "node:assert/strict";
import { project } from "../fixtures/native-area-project";
import { deriveNativeAreas } from "../../app/indoor-project/native-area-review";
import {
  doorApertureGeometryKey,
  preparedReviewedDoorApertures,
  validateDoorApertureBinding,
  validateReviewedDoorApertures,
  type ReviewedDoorApertures,
} from "../../app/indoor-project/reviewed-door-apertures";
import {
  DRAWING_BACKED_DOOR_EVIDENCE,
  dwgDrawnDoorDatasetId,
  dwgDrawnDoorElementId,
  verifyDwgDrawnDoorDrawing,
  type DwgDrawnDoorPatch,
} from "../../app/indoor-project/reviewed-drawn-doors";
import { nativeDerivedFrameHash } from "../../app/indoor-project/native-derived-frame-returns";
import { reviewedBoundaryWalls } from "../../app/indoor-project/native-boundary-patches";

type P2 = [number, number];
const rect = (x: number, y: number, w: number, h: number): P2[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
// Host wall #200 x 14.8..15.2 along y 0..20; the DWG draws a 3.333 ft rough opening (caps at
// y 8 and 11.3333) with a 3 ft leaf hinged 0.1667 ft above the lower cap, swinging east into "1".
const X0 = 14.8,
  X1 = 15.2,
  Y0 = 8,
  Y1 = 8 + 10 / 3,
  hinge: P2 = [15.03, Y0 + 1 / 6],
  dwgSha = "d".repeat(64),
  sectionId = "01 synthetic",
  reg = { re: 0.5, im: 0.25, t: [10, -5] as [number, number] };
const f = ([x, y]: P2): P2 => [
  reg.re * x - reg.im * y + reg.t[0],
  reg.im * x + reg.re * y + reg.t[1],
];
const inv = ([X, Y]: P2): P2 => {
  const x = X - reg.t[0],
    y = Y - reg.t[1],
    d = reg.re ** 2 + reg.im ** 2;
  return [(reg.re * x + reg.im * y) / d, (-reg.im * x + reg.re * y) / d];
};
const drawn: { role: "cap" | "face" | "leaf" | "jamb"; s: [P2, P2] }[] = [
  {
    role: "face",
    s: [
      [X0, 0],
      [X0, Y0],
    ],
  },
  {
    role: "face",
    s: [
      [X1, 0],
      [X1, Y0],
    ],
  },
  {
    role: "face",
    s: [
      [X0, Y1],
      [X0, 20],
    ],
  },
  {
    role: "face",
    s: [
      [X1, Y1],
      [X1, 20],
    ],
  },
  {
    role: "cap",
    s: [
      [X0, Y0],
      [X1, Y0],
    ],
  },
  {
    role: "cap",
    s: [
      [X0, Y1],
      [X1, Y1],
    ],
  },
  { role: "leaf", s: [hinge, [hinge[0] + 3, hinge[1]]] },
];
async function drawing() {
  const { buildDwgDerivedOutlines } = await import(
    "../../../reviter/lib/reviter/dwg-derived-outlines.ts"
  );
  const raw = drawn.map((d) => d.s.map(inv) as [P2, P2]),
    wallSegments = raw.map((s) => s.map(f) as [P2, P2]),
    boundaryReference = {
      format: "reviter-boundary-reference" as const,
      version: 1 as const,
      coordinateSystem: "revit-model-feet" as const,
      sourceSha256: dwgSha,
      sections: [
        {
          sectionId,
          levelId: 1,
          registrationErrorFeet: 0,
          wallSegments,
          doorSegments: [],
        },
      ],
    },
    entities = raw.map((p, i) => ({
      h: (0x3_b0_00 + i).toString(16).toUpperCase(),
      t: "LINE",
      l: "1_Wall_Exist",
      p,
    })),
    derived = buildDwgDerivedOutlines({
      sourceDwgSha256: dwgSha,
      rawExtract: [{ file: "layer-1_Wall_Exist.json", sha256: "e".repeat(64) }],
      layers: ["1_Wall_Exist"],
      entities,
      boundaryReference,
      registrations: { [sectionId]: reg },
    }),
    rotation = Math.atan2(reg.im, reg.re);
  const p: DwgDrawnDoorPatch & { notes: string; frameEvidence: [] } = {
    kind: "dwg-drawn-door",
    id: "dwg-door:1:0-1:200",
    levelId: 1,
    hostWallNativeElementId: 200,
    apertureFeet: [
      [X0, Y0],
      [X1, Y0],
      [X1, Y1],
      [X0, Y1],
    ],
    normalFeet: [1, 0],
    pointFeet: [(X0 + X1) / 2, (Y0 + Y1) / 2],
    roomKeys: ["0", "1"],
    swing: {
      hingeFeet: hinge,
      radiusFeet: 3,
      closedLeafFeet: [hinge, [hinge[0], hinge[1] + 3]],
      openLeafTipFeet: [hinge[0] + 3, hinge[1]],
      intoRoomKey: "1",
    },
    wallEvidence: [{ nativeElementId: 200, partsFeet: [rect(X0, 0, 0.4, 20)] }],
    frameEvidence: [],
    dwgEvidence: {
      sourceDwgSha256: dwgSha,
      sectionId,
      registrationSha256: nativeDerivedFrameHash([
        dwgSha,
        boundaryReference.sections[0],
      ]),
      derivedOutlinesSha256: nativeDerivedFrameHash([
        dwgSha,
        derived.sections[0],
      ]),
      toleranceFeet: 0.05,
      arc: {
        handle: "3991C",
        layer: "1_Wall_Exist",
        centerRaw: inv(hinge),
        radiusRaw: 3 / Math.hypot(reg.re, reg.im),
        anglesRadians: [-rotation, Math.PI / 2 - rotation],
      },
      segments: drawn.map((d, i) => ({
        role: d.role,
        index: i,
        segmentFeet: wallSegments[i]!,
        rawLine: {
          handle: entities[i]!.h,
          layer: "1_Wall_Exist",
          pointsRaw: raw[i]!,
        },
      })),
    },
    assumption: {
      kind: "drawing-backed",
      decisionId: "2026-10-10-round3#Q5.2",
      authorizationRecorded: true,
    },
    state: "applied",
    notes: "Owner-approved drawing-backed door through a solid native wall.",
  };
  return { p: structuredClone(p), boundaryReference, derived };
}
/** Prepared selection dataset: one solid host between rooms "0" and "1" on one native slab. */
async function selectionProject() {
  const pr = await project(),
    d = pr.dataset;
  d.records = d.records.slice(0, 2);
  d.records[0]!.ringsFeet = [rect(1, 1, 10, 10)];
  d.records[1]!.ringsFeet = [rect(18, 1, 10, 10)];
  pr.rooms.annotations = pr.rooms.annotations.slice(0, 2);
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 30, 20)],
      },
    ],
  };
  d.walls = [
    {
      kind: "wall",
      nativeElementId: 200,
      levelId: 1,
      ringsFeet: [rect(X0, 0, 0.4, 20)],
    },
  ];
  d.doors = [];
  return pr;
}
/** What the compiler emits for an applied record: cut host, synthetic door, one door edge. */
function applied(
  pr: Awaited<ReturnType<typeof selectionProject>>,
  p: DwgDrawnDoorPatch,
) {
  const d = pr.dataset,
    id = dwgDrawnDoorDatasetId(p),
    elementId = dwgDrawnDoorElementId(p.levelId, p.id),
    value: ReviewedDoorApertures = {
      version: 1,
      sourceModelSha256: d.source.modelSha256,
      patches: [p as ReviewedDoorApertures["patches"][number]],
    };
  value.patches[0]!.wallEvidence = [
    { nativeElementId: 200, partsFeet: [rect(X0, 0, 0.4, 20)] },
  ];
  d.walls = [
    {
      kind: "wall",
      nativeElementId: 200,
      levelId: 1,
      ringsFeet: [rect(X0, 0, 0.4, Y0)],
    },
    {
      kind: "wall",
      nativeElementId: 200,
      levelId: 1,
      ringsFeet: [rect(X0, Y1, 0.4, 20 - Y1)],
    },
  ];
  d.doors = [
    {
      id,
      levelId: 1,
      nativeElementId: elementId,
      hostWallNativeElementId: 200,
      pointFeet: p.pointFeet,
      footprintFeet: p.apertureFeet,
      normalFeet: p.normalFeet,
      roomKeys: ["0", "1"],
      state: "connected",
      drawingBackedPatchId: p.id,
    },
  ];
  d.edges = [
    {
      id,
      from: `${id}:0`,
      to: `${id}:1`,
      kind: "door",
      lengthMetres: 0.2,
      pointsFeet: [
        [11, p.pointFeet[1], 0],
        [18, p.pointFeet[1], 0],
      ],
      roomKeys: ["0", "1"],
      evidence: DRAWING_BACKED_DOOR_EVIDENCE,
      nativeElementId: elementId,
      accessible: "unknown",
      enabled: true,
    },
  ];
  d.doorAperturePatchState = {
    regenerated: true,
    sourceGeometryKey: doorApertureGeometryKey(value),
  };
  pr.rooms.reviewedDoorApertures = value;
  return value;
}
const summary = (r: Awaited<ReturnType<typeof deriveNativeAreas>>) =>
  r.regions
    .map((x) => ({
      roomKeys: [...x.roomKeys].sort(),
      area: Math.round(x.areaSquareFeet * 1e6) / 1e6,
    }))
    .sort(
      (a, b) =>
        a.area - b.area ||
        a.roomKeys.join(",").localeCompare(b.roomKeys.join(",")),
    );

test("app and compiler validators accept the drawing-backed door kind and agree on refusals", async () => {
  const { validateReviewedDoorApertures: compiler } = await import(
    "../../../reviter/lib/reviter/reviewed-door-apertures.ts"
  );
  const { p } = await drawing(),
    value = { version: 1, sourceModelSha256: "a".repeat(64), patches: [p] };
  for (const validate of [validateReviewedDoorApertures, compiler])
    assert.doesNotThrow(() => validate(value));
  for (const edit of [
    (x: any) => (x.nativeDoorId = 7),
    (x: any) => delete x.dwgEvidence.arc,
    (x: any) =>
      (x.dwgEvidence.segments = x.dwgEvidence.segments.filter(
        (g: any) => g.role !== "leaf",
      )),
    (x: any) => (x.state = "maybe"),
    (x: any) => (x.assumption.kind = "user-reported"),
    (x: any) => (x.swing.intoRoomKey = "2"),
  ]) {
    const changed = structuredClone(value);
    edit(changed.patches[0]);
    for (const validate of [validateReviewedDoorApertures, compiler])
      assert.throws(() => validate(changed));
  }
});

test("app and compiler drawing verification agree, including tampered evidence", async () => {
  const { verifyDwgDrawnDoorDrawing: compiler } = await import(
    "../../../reviter/lib/reviter/reviewed-drawn-doors.ts"
  );
  const { p, boundaryReference, derived } = await drawing();
  assert.deepEqual(
    verifyDwgDrawnDoorDrawing(p, boundaryReference, derived as never),
    compiler(p as never, boundaryReference, derived as never),
  );
  for (const edit of [
    (x: any) => (x.dwgEvidence.arc.centerRaw[1] += 0.3),
    (x: any) => (x.apertureFeet[0][1] = x.apertureFeet[1][1] = Y0 - 0.4),
    (x: any) => (x.dwgEvidence.segments[6].segmentFeet[1][0] += 0.01),
  ]) {
    const changed = structuredClone(p);
    edit(changed);
    assert.throws(
      () =>
        verifyDwgDrawnDoorDrawing(changed, boundaryReference, derived as never),
      /refused/,
    );
    assert.throws(
      () => compiler(changed as never, boundaryReference, derived as never),
      /refused/,
    );
  }
});

test("the prepared binding requires the synthetic door and its one drawing-backed edge", async () => {
  const { p } = await drawing(),
    pr = await selectionProject(),
    value = applied(pr, p);
  assert.doesNotThrow(() => validateDoorApertureBinding(value, pr.dataset));
  assert.equal(preparedReviewedDoorApertures(pr.dataset)?.patches.length, 1);
  assert.doesNotThrow(() =>
    reviewedBoundaryWalls(
      pr.dataset.walls,
      undefined,
      pr.dataset.source.modelSha256,
      undefined,
      value,
    ),
  );
  const id = dwgDrawnDoorDatasetId(p);
  for (const edit of [
    (d: any) => (d.edges[0].evidence = "native-door"),
    (d: any) => (d.edges[0].accessible = "yes"),
    (d: any) => (d.edges[0].enabled = false),
    (d: any) => (d.doors[0].nativeElementId += 1),
    (d: any) => (d.doors[0].roomKeys = ["0", "2"]),
    (d: any) => (d.doors[0].footprintFeet[0][1] -= 0.1),
    (d: any) =>
      (d.walls = [
        {
          kind: "wall",
          nativeElementId: 200,
          levelId: 1,
          ringsFeet: [rect(X0, 0, 0.4, 20)],
        },
      ]),
    (d: any) => d.edges.push({ ...d.edges[0], id: id + ":copy" }),
  ]) {
    const changed = structuredClone(pr.dataset);
    edit(changed);
    assert.throws(
      () => validateDoorApertureBinding(value, changed),
      /Regenerate|differ|does not match/,
    );
  }
  // A restored record keeps its key but must no longer have its door, edge or cut.
  const restored = structuredClone(value);
  restored.patches[0]!.state = "restored";
  const after = structuredClone(pr.dataset);
  after.doorAperturePatchState = {
    regenerated: true,
    sourceGeometryKey: doorApertureGeometryKey(restored),
  };
  assert.throws(() => validateDoorApertureBinding(restored, after), /restored/);
  after.doors = [];
  after.edges = [];
  after.walls = [
    {
      kind: "wall",
      nativeElementId: 200,
      levelId: 1,
      ringsFeet: [rect(X0, 0, 0.4, 20)],
    },
  ];
  assert.doesNotThrow(() => validateDoorApertureBinding(restored, after));
  assert.equal(preparedReviewedDoorApertures(after)?.patches.length, 0);
});

test("selection is unchanged with the drawing-backed door closed", async () => {
  const { p } = await drawing(),
    before = await selectionProject(),
    baseline = summary(await deriveNativeAreas(before.dataset, 1));
  assert.equal(baseline.length, 2);
  const after = await selectionProject();
  applied(after, p);
  const closed = await deriveNativeAreas(after.dataset, 1);
  assert.deepEqual(
    summary(closed),
    baseline,
    "closed door footprint masks the cut aperture",
  );
  assert.ok(
    closed.doorChecks.some((c) => c.status === "separated"),
    "the drawn door separates its two sides",
  );
  // The cut alone (no closed door) would join both rooms: the closure is what keeps selection.
  const open = await selectionProject();
  applied(open, p);
  open.dataset.doors = [];
  assert.equal((await deriveNativeAreas(open.dataset, 1)).regions.length, 1);
  // The door opens only through the existing pass-through review.
  const through = await deriveNativeAreas(after.dataset, 1, {
    passThroughDoorIds: [dwgDrawnDoorElementId(1, p.id)],
  } as never);
  assert.equal(through.regions.length, 1);
});
