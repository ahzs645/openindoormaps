import test from "node:test";
import assert from "node:assert/strict";
import {
  checkNoNewMaterialBeyondFirstNativeSurface,
  roomsWithCheckedNativeBoundaryMemberReview,
  nativeBoundaryMemberDigest as sha,
  nativeBoundaryMemberReviewEvidenceSha256 as evidence,
  type NativeBoundaryMemberReview,
} from "../../scripts/indoor/source-native-boundary-member-review";
import type { RoomDirectoryData } from "../../../reviter/lib/reviter/room-directory.ts";
import { nativeMaterialSectionsHash } from "../../../reviter/lib/reviter/native-material-sections.ts";
const rect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][][] => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
];
const wall = (id: number, x0: number, y0: number, x1: number, y1: number) => ({
  levelId: 7,
  nativeElementId: id,
  kind: "wall" as const,
  ringsFeet: rect(x0, y0, x1, y1),
});
const patch = () => ({
  id: "replacement",
  levelId: 7,
  sourceModelSha256: "a".repeat(64),
  status: "proposed" as const,
  widthFeet: 4,
  ringsFeet: rect(-0.0002, 0, 4.0002, 2),
  wallEvidence: [
    { nativeElementId: 1, ringsFeet: rect(-1, 0, 0, 2) },
    { nativeElementId: 2, ringsFeet: rect(4, 0, 5, 2) },
  ],
  nativeDoorIds: [],
  notes: "Measured full original cap reconstruction.",
  continuationProof: {
    sourceWallId: 1,
    sourceCapFeet: [
      [0, 0],
      [0, 2],
    ] as [[number, number], [number, number]],
    targetContactFeet: [
      [4, 0],
      [4, 2],
    ] as [[number, number], [number, number]],
    evidenceSha256: "b".repeat(64),
  },
});
test("whole-cap shadow accepts penetration wholly inside an existing nearer partial frame", () => {
  assert.equal(
    checkNoNewMaterialBeyondFirstNativeSurface(patch(), [
      wall(1, -1, 0, 0, 2),
      wall(2, 4, 0, 5, 2),
      wall(3, 2, 1, 5, 2),
    ]).addsNoNewMaterialBehindAnyFirstSurface,
    true,
  );
});
test("whole-cap shadow refuses new material after passing through a nearer foreign body", () => {
  assert.throws(
    () =>
      checkNoNewMaterialBeyondFirstNativeSurface(patch(), [
        wall(1, -1, 0, 0, 2),
        wall(2, 4, 0, 5, 2),
        wall(3, 1, 0.25, 2, 0.75),
      ]),
    /behind a nearer/,
  );
});
test("a disconnected piece of the SAME source owner retains its native shadow", () => {
  assert.throws(
    () =>
      checkNoNewMaterialBeyondFirstNativeSurface(patch(), [
        wall(1, -1, 0, 0, 2),
        wall(2, 4, 0, 5, 2),
        wall(1, 1, 0.25, 2, 0.75),
      ]),
    /behind a nearer/,
  );
});
test("a true hole inside a target remains forbidden downstream material", () => {
  const target = wall(2, 3, 0, 5, 2);
  target.ringsFeet.push(rect(3.5, 0.5, 4.5, 1.5)[0]!);
  assert.throws(
    () =>
      checkNoNewMaterialBeyondFirstNativeSurface(patch(), [
        wall(1, -1, 0, 0, 2),
        target,
      ]),
    /behind a nearer/,
  );
});
test("rotating all original cap/body operands retains the conservative shadow result", () => {
  const rotate = (p: [number, number]): [number, number] => [-p[1], p[0]],
    p = patch(),
    walls = [wall(1, -1, 0, 0, 2), wall(2, 4, 0, 5, 2), wall(3, 2, 1, 5, 2)];
  p.ringsFeet = p.ringsFeet.map((r) => r.map(rotate));
  p.wallEvidence = p.wallEvidence.map((w) => ({
    ...w,
    ringsFeet: w.ringsFeet.map((r) => r.map(rotate)),
  }));
  p.continuationProof.sourceCapFeet = p.continuationProof.sourceCapFeet.map(
    rotate,
  ) as never;
  p.continuationProof.targetContactFeet =
    p.continuationProof.targetContactFeet.map(rotate) as never;
  assert.equal(
    checkNoNewMaterialBeyondFirstNativeSurface(
      p,
      walls.map((w) => ({
        ...w,
        ringsFeet: w.ringsFeet.map((r) => r.map(rotate)),
      })),
    ).addsNoNewMaterialBehindAnyFirstSurface,
    true,
  );
});
async function fixture() {
  const modelSha = "a".repeat(64),
    roomsSha = "b".repeat(64),
    cacheSha = "c".repeat(64),
    bounds = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      z0 = 0,
      z1 = 8,
    ) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } }),
    sourceRings = rect(-5, 0, 0, 2),
    targetRings = rect(4, 0, 5, 2),
    oldTarget = rect(2, -1, 3, 3);
  const body = {
      elementId: 3,
      categoryId: -2000170,
      renderGeometryProvenance: "native",
      boundsFeet: bounds(4, 0, 5, 2),
    },
    host = {
      elementId: 3,
      hostId: 20,
      fieldOffset: 151,
      recordOffset: 0,
      objectLength: 563,
      objectMarker: 2031,
      kind: "host",
      source: "Partitions/InsertableInst.m_hostId",
      evidence: "persisted",
    };
  const sections = {
    version: 1,
    sourceModelSha256: modelSha,
    geometrySha256: "",
    levels: [
      {
        levelId: 7,
        elevationFeet: 0,
        cutElevationFeet: 4,
        evidenceSha256: "d".repeat(64),
        sourceElementIds: [1, 2, 3, 4],
        sections: [
          {
            nativeElementId: 1,
            categoryId: -2000011,
            kind: "wall",
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [sourceRings],
          },
          {
            nativeElementId: 3,
            categoryId: -2000170,
            kind: "wall",
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [targetRings],
          },
          {
            nativeElementId: 4,
            categoryId: -2000171,
            kind: "wall",
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [rect(2, 1, 5, 2)],
          },
        ],
      },
    ],
  };
  sections.geometrySha256 = await nativeMaterialSectionsHash(sections as never);
  const old = {
    id: "old",
    levelId: 7,
    sourceModelSha256: modelSha,
    status: "applied",
    widthFeet: 2,
    ringsFeet: rect(-0.0002, 0, 2.0002, 2),
    wallEvidence: [
      { nativeElementId: 1, ringsFeet: sourceRings },
      { nativeElementId: 2, ringsFeet: oldTarget },
    ],
    nativeDoorIds: [],
    notes: "Original historical support kept verbatim.",
    continuationProof: {
      sourceWallId: 1,
      sourceCapFeet: [
        [0, 0],
        [0, 2],
      ],
      targetContactFeet: [
        [2, 0],
        [2, 2],
      ],
      evidenceSha256: "e".repeat(64),
    },
  };
  const next = {
    ...old,
    id: "new",
    status: "proposed",
    widthFeet: 4,
    ringsFeet: rect(-0.0002, 0, 4.0002, 2),
    wallEvidence: [
      old.wallEvidence[0]!,
      { nativeElementId: 3, ringsFeet: targetRings, kind: "wall" },
    ],
    continuationProof: {
      ...old.continuationProof,
      targetContactFeet: [
        [4, 0],
        [4, 2],
      ],
      evidenceSha256: "",
    },
  };
  const floor = {
      elementId: 10,
      categoryId: -2000032,
      boundsFeet: bounds(-10, -10, 10, 10, -0.5, 0),
      loops: [rect(-10, -10, 10, 10)[0]!.map(([x, y]) => [x, y, 0])],
    },
    model = {
      origin: { x: 0, y: 0, z: 0 },
      levels: [{ levelId: 7, elevation: 0, name: "L0" }],
      meshes: [],
      elementBounds: [
        {
          elementId: 1,
          categoryId: -2000011,
          boundsFeet: bounds(-5, 0, 0, 2),
          solid: {
            elementId: 1,
            start: { x: -5, y: 1 },
            end: { x: 0, y: 1 },
            baseElevation: 0,
            topElevation: 8,
            thickness: 2,
          },
        },
        body,
        floor,
      ],
      nativeHostRelations: [host],
      nativeAssociatedLevelRelations: [{ elementId: 10, levelId: 7 }],
    };
  const rooms = {
      annotations: [
        {
          key: "room",
          levelId: 7,
          polygonFeet: rect(6, 4, 8, 6)[0],
          labelPointFeet: [7, 5],
          status: "active",
        },
      ],
      nativeMaterialSections: sections,
      nativeBoundaryPatches: { version: 1, patches: [old] },
      history: { keep: "original" },
      georeference: { points: [] },
    },
    context = {
      source: { modelSha256: modelSha, roomsSha256: roomsSha },
      nativeLevels: [{ id: 7, name: "L0", elevationFeet: 0 }],
      records: [],
      nativeMaterialSections: sections,
      walls: [],
      doors: [],
      nodes: [],
      edges: [],
    };
  const review: NativeBoundaryMemberReview = {
    format: "source-native-boundary-member-supersession-v1",
    sourceModelSha256: modelSha,
    sourceRoomsSha256: roomsSha,
    nativeCacheSha256: cacheSha,
    oldPatchId: old.id,
    oldPatchSha256: sha(old),
    sourceWallId: 1,
    targetNativeElementId: 3,
    targetNativeBodySha256: sha(body),
    targetNativeHostRelationsSha256: sha([host]),
    newPatch: next as never,
  };
  next.continuationProof.evidenceSha256 = evidence(
    review,
    sourceRings,
    targetRings,
  );
  return {
    rooms,
    context,
    model,
    options: {
      sourceRoomsSha256: roomsSha,
      nativeCacheSha256: cacheSha,
      review,
    },
  };
}
const apply = async (f: Awaited<ReturnType<typeof fixture>>) =>
  roomsWithCheckedNativeBoundaryMemberReview(
    f.rooms as unknown as RoomDirectoryData & typeof f.rooms,
    f.context as never,
    f.model as never,
    f.options,
  );
test("actual constructors replay source amendment and preserve every unrelated source reference and original record", async () => {
  const f = await fixture(),
    before = JSON.stringify(f.rooms),
    old = f.rooms.nativeBoundaryPatches.patches[0],
    result = await apply(f);
  assert.equal(JSON.stringify(f.rooms), before);
  assert.equal(result.rooms.annotations, f.rooms.annotations);
  assert.equal(result.rooms.history, f.rooms.history);
  assert.equal(
    result.rooms.nativeBoundaryPatches!.patches[0]!.status,
    "proposed",
  );
  assert.deepEqual(
    { ...result.rooms.nativeBoundaryPatches!.patches[0], status: "applied" },
    old,
  );
  assert.equal(
    result.rooms.nativeBoundaryPatches!.patches[1]!.status,
    "applied",
  );
  assert.equal(result.receipt.physicalGuardsWaived, false);
  assert.equal(result.receipt.appliedBefore, result.receipt.appliedAfter);
});
test("different physical/source context and stale actual cache bindings fail closed", async () => {
  let f = await fixture();
  f.context.source.roomsSha256 = "f".repeat(64);
  await assert.rejects(() => apply(f), /different source room bytes/);
  f = await fixture();
  f.options.nativeCacheSha256 = "f".repeat(64);
  await assert.rejects(() => apply(f), /cache bytes changed/);
});
test("duplicate target native body identities and contradictory original hosts refuse", async () => {
  let f = await fixture();
  f.model.elementBounds.push(f.model.elementBounds[1]!);
  await assert.rejects(() => apply(f), /identity is duplicated/);
  f = await fixture();
  f.model.nativeHostRelations.push({
    ...f.model.nativeHostRelations[0]!,
    hostId: 21,
  });
  await assert.rejects(() => apply(f), /Exactly one resolved/);
});
test("new real floor holes cannot be filled by the continued barrier", async () => {
  const f = await fixture(),
    floor: any = f.model.elementBounds.find((r) => r.elementId === 10)!;
  floor.loops!.push(rect(1, 0.5, 1.02, 0.7)[0]!.map(([x, y]) => [x, y, 0]));
  await assert.rejects(() => apply(f), /native floor hole/);
});
test("changed historical record and moving the original full cap refuse", async () => {
  let f = await fixture();
  f.rooms.nativeBoundaryPatches.patches[0]!.notes += " changed";
  await assert.rejects(() => apply(f), /Historical continuation changed/);
  f = await fixture();
  f.options.review.newPatch.continuationProof!.sourceCapFeet[0]![1] = 0.25;
  await assert.rejects(
    () => apply(f),
    /Invalid native boundary|Moving or splitting/,
  );
});
test("preserved reviewed doorway apertures cannot be filled even when they belong to another native host", async () => {
  const f: any = await fixture(),
    ring = rect(1, 0.25, 2, 0.75)[0]!,
    box = [
      ...ring.map(([x, y]) => [x, y, 0]),
      ...ring.map(([x, y]) => [x, y, 7]),
    ];
  f.rooms.reviewedDoorApertures = {
    version: 1,
    sourceModelSha256: f.options.review.sourceModelSha256,
    patches: [
      {
        id: "real-reviewed-opening",
        levelId: 7,
        nativeDoorId: 99,
        normalFeet: [1, 0],
        apertureFeet: ring,
        wallEvidence: [
          { nativeElementId: 8, partsFeet: [rect(1, 0, 2, 2)[0]] },
        ],
        frameEvidence: [90, 91, 92, 93].map((nativeElementId) => ({
          nativeElementId,
          orientedBox: box,
        })),
        notes: "Original preserved physical source aperture.",
      },
    ],
  };
  await assert.rejects(() => apply(f), /reviewed doorway aperture/);
});
test("preserved off-limits/native-void exclusion cannot be occupied by a new boundary", async () => {
  const f: any = await fixture();
  f.rooms.indoorExclusions = {
    version: 1,
    sourceModelSha256: f.options.review.sourceModelSha256,
    areas: [
      {
        id: "real-void",
        levelId: 7,
        elevationFeet: 0,
        label: "Off limits",
        reason: "off-limits",
        nativeFloorIds: [10],
        partsFeet: [rect(1, 0.25, 2, 0.75)],
      },
    ],
  };
  await assert.rejects(() => apply(f), /preserved indoor exclusion or void/);
});
test("original measured native door footprint remains open without an authoring aperture override", async () => {
  const f: any = await fixture(),
    ring = rect(1, 0.25, 2, 0.75)[0]!,
    box = [
      ...ring.map(([x, y]) => [x, y, 0]),
      ...ring.map(([x, y]) => [x, y, 7]),
    ];
  f.model.elementBounds.push({
    elementId: 99,
    categoryId: -2000023,
    boundsFeet: { min: { x: 1, y: 0.25, z: 0 }, max: { x: 2, y: 0.75, z: 7 } },
    orientedBox: box,
  });
  f.model.nativeAssociatedLevelRelations.push({ elementId: 99, levelId: 7 });
  await assert.rejects(() => apply(f), /real original doorway footprint/);
});
test("an unrelated stale historical evidence record blocks the entire amendment without source mutation", async () => {
  const f: any = await fixture(),
    other = structuredClone(f.options.review.newPatch);
  other.id = "unrelated-stale-native-evidence";
  other.status = "applied";
  other.wallEvidence[1].ringsFeet = rect(4, 0, 5.1, 2);
  f.rooms.nativeBoundaryPatches.patches.push(other);
  const original = JSON.stringify(f.rooms);
  await assert.rejects(
    () => apply(f),
    /unrelated-stale-native-evidence has stale native wall evidence/,
  );
  assert.equal(JSON.stringify(f.rooms), original);
});
import {
  roomsWithCheckedNativeBoundaryReviewBundle,
  nativeBoundaryReviewBundleEntryEvidenceSha256,
  checkRegisteredBodyNativeShadow,
  type NativeBoundaryReviewBundle,
} from "../../scripts/indoor/source-native-boundary-review-bundle";
async function bundleFixture() {
  const f = await fixture(),
    m = f.options.review,
    entry = {
      oldPatchId: m.oldPatchId,
      oldPatchSha256: m.oldPatchSha256,
      kind: "native-member" as const,
      sourceWallId: m.sourceWallId,
      targetNativeElementId: m.targetNativeElementId,
      targetNativeBodySha256: m.targetNativeBodySha256,
      targetNativeHostRelationsSha256: m.targetNativeHostRelationsSha256,
      replacementPatches: [structuredClone(m.newPatch)],
    },
    review: NativeBoundaryReviewBundle = {
      format: "source-native-boundary-review-bundle-v1",
      sourceModelSha256: m.sourceModelSha256,
      sourceRoomsSha256: m.sourceRoomsSha256,
      nativeCacheSha256: m.nativeCacheSha256,
      entries: [entry],
    };
  entry.replacementPatches[0]!.continuationProof!.evidenceSha256 =
    nativeBoundaryReviewBundleEntryEvidenceSha256(
      review,
      entry,
      entry.replacementPatches[0]!,
    );
  return {
    ...f,
    bundleOptions: {
      sourceRoomsSha256: f.options.sourceRoomsSha256,
      nativeCacheSha256: f.options.nativeCacheSha256,
      review,
    },
  };
}
const applyBundle = async (f: Awaited<ReturnType<typeof bundleFixture>>) =>
  roomsWithCheckedNativeBoundaryReviewBundle(
    f.rooms as unknown as RoomDirectoryData & typeof f.rooms,
    f.context as never,
    f.model as never,
    f.bundleOptions,
  );
test("atomic bundle emits source only after complete original production contacts/history pass", async () => {
  const f = await bundleFixture(),
    before = JSON.stringify(f.rooms),
    result = await applyBundle(f);
  assert.equal(JSON.stringify(f.rooms), before);
  assert.equal(result.rooms.annotations, f.rooms.annotations);
  assert.equal(result.rooms.history, f.rooms.history);
  assert.equal(result.receipt.physicalGuardsWaived, false);
  assert(
    result.receipt.finalValidation.currentAllPatchContacts &&
      result.receipt.finalValidation.currentHistoricalBinding,
  );
  assert.equal(result.receipt.entries.length, 1);
  assert.deepEqual(result.receipt.entries[0]!.retainedRecord, {
    ...f.rooms.nativeBoundaryPatches.patches[0],
    status: "proposed",
  });
  assert.equal(
    result.receipt.entries[0]!.physicalGuards[0]!.firstMaterial
      .addsNoNewMaterialBehindAnyFirstSurface,
    true,
  );
});
test("unreviewed stale history prevents any atomic source bundle result", async () => {
  const f: any = await bundleFixture(),
    other = structuredClone(
      f.bundleOptions.review.entries[0].replacementPatches[0],
    );
  other.id = "unreviewed-stale";
  other.status = "applied";
  other.wallEvidence[1].ringsFeet = rect(4, 0, 5.1, 2);
  f.rooms.nativeBoundaryPatches.patches.push(other);
  const before = JSON.stringify(f.rooms);
  await assert.rejects(() => applyBundle(f), /unreviewed-stale has stale/);
  assert.equal(JSON.stringify(f.rooms), before);
});
test("atomic bundle refuses duplicate originals and proof payload mutations", async () => {
  let f = await bundleFixture();
  f.bundleOptions.review.entries.push(f.bundleOptions.review.entries[0]!);
  await assert.rejects(
    () => applyBundle(f),
    /Duplicate original review identities/,
  );
  f = await bundleFixture();
  f.bundleOptions.review.entries[0]!.replacementPatches[0]!.notes += " altered";
  await assert.rejects(() => applyBundle(f), /proof checksum changed/);
});
test("bundle full source-cap support cannot be borrowed from a stale original rectangle", async () => {
  const f: any = await bundleFixture();
  f.rooms.nativeMaterialSections.levels[0].sections[0].partsFeet = [
    rect(-5, 0, -0.1, 2),
  ];
  f.rooms.nativeMaterialSections.geometrySha256 =
    await nativeMaterialSectionsHash(f.rooms.nativeMaterialSections);
  await assert.rejects(() => applyBundle(f), /source cap loses retained/);
});
test("registered source body excludes only its exact supporting part, retaining disconnected same-owner blockers", () => {
  const p: any = patch();
  p.ringsFeet = rect(-1, 0, 4.0002, 2);
  p.wallEvidence[0].ringsFeet = rect(-2, 0, 1, 2);
  p.drawingReconstructionProof = {
    registeredRingsFeet: rect(-1, 0, 4, 2),
    evidenceSha256: "a".repeat(64),
  };
  delete p.continuationProof;
  const support = {
      ...wall(1, -2, 0, 1, 2),
      geometrySource: "original-native-material-section",
    },
    target = wall(2, 4, 0, 5, 2);
  assert(
    checkRegisteredBodyNativeShadow(p, 1, [support, target]).firstMaterial
      .addsNoNewMaterialBehindAnyFirstSurface,
  );
  assert.throws(
    () =>
      checkRegisteredBodyNativeShadow(p, 1, [
        support,
        target,
        wall(1, 2, 0.5, 3, 1.5),
      ]),
    /behind a nearer/,
  );
});
async function currentSourceBundleFixture() {
  const f: any = await bundleFixture(),
    entry = f.bundleOptions.review.entries[0],
    old = f.rooms.nativeBoundaryPatches.patches[0],
    next = entry.replacementPatches[0],
    epsilon = 2 ** -40;
  old.wallEvidence[1].nativeElementId = 3;
  old.wallEvidence[1].kind = "column";
  next.wallEvidence[1].kind = "column";
  f.model.elementBounds[1].categoryId = -2000100;
  f.model.elementBounds[0].renderGeometryProvenance = "native";
  f.rooms.nativeMaterialSections.levels[0].sections[0].partsFeet = [
    rect(-5, 0, epsilon, 2),
  ];
  f.rooms.nativeMaterialSections.levels[0].sections[1].categoryId = -2000100;
  f.rooms.nativeMaterialSections.levels[0].sections[1].kind = "column";
  f.rooms.nativeMaterialSections.geometrySha256 =
    await nativeMaterialSectionsHash(f.rooms.nativeMaterialSections);
  entry.kind = "native-column-cap-current-source";
  delete entry.targetNativeHostRelationsSha256;
  entry.oldPatchSha256 = sha(old);
  entry.targetNativeBodySha256 = sha(f.model.elementBounds[1]);
  next.ringsFeet = rect(epsilon - 0.0002, 0, 4.0002, 2);
  next.widthFeet = 4 - epsilon;
  next.continuationProof.sourceCapFeet = [
    [epsilon, 0],
    [epsilon, 2],
  ];
  entry.sourceCapReview = {
    originalSourceCapFeet: old.continuationProof.sourceCapFeet,
    originalSourceEvidenceSha256: sha(old.wallEvidence[0]),
    sourceNativeBodySha256: sha(f.model.elementBounds[0]),
    currentSourceSectionsSha256: sha([rect(-5, 0, epsilon, 2)]),
    currentSourcePartSha256: sha(rect(-5, 0, epsilon, 2)),
    currentSourceCapFeet: next.continuationProof.sourceCapFeet,
  };
  next.continuationProof.evidenceSha256 =
    nativeBoundaryReviewBundleEntryEvidenceSha256(
      f.bundleOptions.review,
      entry,
      next,
    );
  return f;
}
test("explicit current source-cap review binds the exact separate fragment and preserves original full wall axis evidence", async () => {
  const f = await currentSourceBundleFixture(),
    old = f.rooms.nativeBoundaryPatches.patches[0],
    result = await applyBundle(f),
    guard = result.receipt.entries[0]!.physicalGuards[0]!;
  assert.deepEqual(
    result.rooms.nativeBoundaryPatches!.patches.at(-1)!.wallEvidence[0],
    old.wallEvidence[0],
  );
  assert(guard.currentSourceCapReview!.originalFullWallAxisContractRetained);
  assert(guard.currentSourceCapReview!.allCurrentSourceOwnerVerticesInward);
  assert(guard.currentSourceCapReview!.noSourceMaterialExemption);
});
test("current source cap cannot borrow a partial source edge, reverse its outward direction or replace the native width with a short fragment axis", async () => {
  for (const mutate of [
    (p: any) => {
      p.continuationProof.sourceCapFeet[0][1] = 0.25;
    },
    (p: any) => {
      p.continuationProof.sourceCapFeet = [
        [-5, 0],
        [-5, 2],
      ];
    },
    (p: any) => {
      p.continuationProof.sourceCapFeet = [
        [-5, 0],
        [2 ** -40, 0],
      ];
    },
  ]) {
    const f = await currentSourceBundleFixture(),
      entry = f.bundleOptions.review.entries[0],
      p = entry.replacementPatches[0];
    mutate(p);
    entry.sourceCapReview.currentSourceCapFeet =
      p.continuationProof.sourceCapFeet;
    p.continuationProof.evidenceSha256 =
      nativeBoundaryReviewBundleEntryEvidenceSha256(
        f.bundleOptions.review,
        entry,
        p,
      );
    await assert.rejects(
      () => applyBundle(f),
      /Invalid native boundary|actual complete consecutive|does not face|full-wall/,
    );
  }
});
test("current source cap witness mutations and use on a different variant fail closed", async () => {
  let f = await currentSourceBundleFixture();
  f.bundleOptions.review.entries[0].sourceCapReview.currentSourcePartSha256 =
    "d".repeat(64);
  await assert.rejects(() => applyBundle(f), /fragment selection/);
  f = await currentSourceBundleFixture();
  f.bundleOptions.review.entries[0].kind = "native-column-cap";
  await assert.rejects(() => applyBundle(f), /explicit review variant/);
});
test("registered supporting-part proof refuses notched parts, remote crossings and ambiguous native parts", () => {
  const p: any = patch();
  p.ringsFeet = rect(-1, 0, 4.0002, 2);
  p.wallEvidence[0].ringsFeet = rect(-2, 0, 1, 2);
  p.drawingReconstructionProof = {
    registeredRingsFeet: rect(-1, 0, 4, 2),
    evidenceSha256: "a".repeat(64),
  };
  delete p.continuationProof;
  const support = {
      ...wall(1, -2, 0, 1, 2),
      geometrySource: "original-native-material-section",
    },
    target = wall(2, 4, 0, 5, 2);
  const notched: any = {
    ...support,
    ringsFeet: [
      [
        [-2, 0],
        [1, 0],
        [1, 0.5],
        [0, 0.5],
        [0, 1.5],
        [1, 1.5],
        [1, 2],
        [-2, 2],
      ],
    ],
  };
  assert.throws(
    () => checkRegisteredBodyNativeShadow(p, 1, [notched, target]),
    /one complete convex/,
  );
  assert.throws(
    () =>
      checkRegisteredBodyNativeShadow(p, 1, [
        { ...support, ringsFeet: rect(-2, 4, 1, 6) },
        target,
      ]),
    /one complete convex/,
  );
  assert.throws(
    () =>
      checkRegisteredBodyNativeShadow(p, 1, [support, { ...support }, target]),
    /one complete convex/,
  );
});
import { checkBoundaryExistingWalkingFloorSupport } from "../../scripts/indoor/source-native-boundary-review-bundle";
function slabJoinFixture(gap = 2 ** -40) {
  const slab = (id: number, x0: number, x1: number) => ({
      elementId: id,
      stream: "Partitions/Floors",
      chunkIndex: 0,
      rawOffset: 0,
      recordOffset: 0,
      categoryId: -2000032,
      boundsFeet: {
        min: { x: x0, y: -1, z: -0.5 },
        max: { x: x1, y: 3, z: 0 },
      },
      loops: rect(x0, -1, x1, 3).map((r) =>
        r.map(([x, y]) => [x, y, 0] as [number, number, number]),
      ),
    }),
    records = [slab(10, -2, 2), slab(11, 2 + gap, 6)],
    p = { ...patch(), ringsFeet: rect(0, 0, 4, 2) },
    envelope = [rect(-3, -2, 7, 4)],
    envelopeSha = "f".repeat(64),
    review = {
      kind: "existing-native-slab-join-support" as const,
      nativeFloorIds: [10, 11],
      sourceFloorRecordsSha256: sha(records),
      boundEnvelopeSha256: envelopeSha,
      walkingAuthorityVersion: "native-slab-join-closures-v1" as const,
    };
  return { p, records, envelope, envelopeSha, review };
}
test("raw slab refusal can use only the unchanged named numerical-join walking authority inside its bound envelope", () => {
  const f = slabJoinFixture(),
    result = checkBoundaryExistingWalkingFloorSupport(
      f.p,
      f.records,
      f.envelope,
      f.envelopeSha,
      f.review,
    );
  assert.equal(result.rawNativeFloorUnsupportedPartCount, 1);
  assert(result.existingWalkingSupport!.rawNativeFloorRefused);
  assert(result.existingWalkingSupport!.onlyExistingWalkingAuthorityUsed);
  assert(result.existingWalkingSupport!.noNewTolerance);
  assert.equal(
    result.existingWalkingSupport!.originalFloorHoleIntersections,
    0,
  );
});
test("gap beyond unchanged walking join policy and a missing or duplicate original slab refuse", () => {
  let f = slabJoinFixture(1e-7);
  assert.throws(
    () =>
      checkBoundaryExistingWalkingFloorSupport(
        f.p,
        f.records,
        f.envelope,
        f.envelopeSha,
        f.review,
      ),
    /outside the existing named/,
  );
  f = slabJoinFixture();
  f.review.nativeFloorIds = [10, 10];
  assert.throws(
    () =>
      checkBoundaryExistingWalkingFloorSupport(
        f.p,
        f.records,
        f.envelope,
        f.envelopeSha,
        f.review,
      ),
    /Distinct named/,
  );
  f = slabJoinFixture();
  f.records.pop();
  assert.throws(
    () =>
      checkBoundaryExistingWalkingFloorSupport(
        f.p,
        f.records,
        f.envelope,
        f.envelopeSha,
        f.review,
      ),
    /missing or ambiguous/,
  );
});
test("a positive native floor hole retains its veto despite nearby valid numerical joins", () => {
  const f = slabJoinFixture();
  f.records[0]!.loops.push(
    rect(1, 0.5, 1.1, 0.7)[0]!.map(([x, y]) => [x, y, 0]),
  );
  f.review.sourceFloorRecordsSha256 = sha(f.records);
  assert.throws(
    () =>
      checkBoundaryExistingWalkingFloorSupport(
        f.p,
        f.records,
        f.envelope,
        f.envelopeSha,
        f.review,
      ),
    /real original native floor hole/,
  );
});
test("changed or missing walking envelope cannot admit a source join", () => {
  const f = slabJoinFixture();
  assert.throws(
    () =>
      checkBoundaryExistingWalkingFloorSupport(
        f.p,
        f.records,
        f.envelope,
        "d".repeat(64),
        f.review,
      ),
    /envelope changed/,
  );
  assert.throws(
    () =>
      checkBoundaryExistingWalkingFloorSupport(
        f.p,
        f.records,
        [rect(-3, -2, 2, 4)],
        f.envelopeSha,
        f.review,
      ),
    /outside the existing named|outside the bound/,
  );
  assert.throws(
    () =>
      checkBoundaryExistingWalkingFloorSupport(
        f.p,
        f.records,
        [],
        f.envelopeSha,
        f.review,
      ),
    /Bound original/,
  );
});
test("ordinary raw source floor support cannot silently inherit a stale slab-join review", () => {
  const f = slabJoinFixture(0);
  assert.throws(
    () =>
      checkBoundaryExistingWalkingFloorSupport(
        f.p,
        f.records,
        f.envelope,
        f.envelopeSha,
        f.review,
      ),
    /reproduce its raw native floor refusal/,
  );
  assert.equal(
    checkBoundaryExistingWalkingFloorSupport(
      f.p,
      f.records,
      f.envelope,
      f.envelopeSha,
    ).rawNativeFloorUnsupportedPartCount,
    0,
  );
});
test("atomic source review retains its full portable evidence exactly once and preserves prior history", async () => {
  const f: any = await bundleFixture(),
    priorReview = structuredClone(f.bundleOptions.review);
  priorReview.sourceRoomsSha256 = "d".repeat(64);
  const prior = {
    format: "source-native-boundary-review-evidence-v1",
    sourceModelSha256: priorReview.sourceModelSha256,
    reviewSha256: sha(priorReview),
    review: priorReview,
  };
  f.rooms.nativeBoundaryPatches.sourceReviewEvidence = [prior];
  const before = JSON.stringify(f.rooms),
    result = await applyBundle(f),
    evidence = result.rooms.nativeBoundaryPatches!.sourceReviewEvidence!;
  assert.equal(JSON.stringify(f.rooms), before);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0], prior);
  assert.deepEqual(evidence[1], {
    format: "source-native-boundary-review-evidence-v1",
    sourceModelSha256: f.bundleOptions.review.sourceModelSha256,
    reviewSha256: sha(f.bundleOptions.review),
    review: f.bundleOptions.review,
  });
  assert.deepEqual(result.receipt.portableSourceEvidence, {
    priorCount: 1,
    afterCount: 2,
    appendedRecord: evidence[1],
  });
  assert(
    result.receipt.sourcePreservation
      .onlyEnumeratedPatchRecordsAndPortableEvidenceAppendChanged,
  );
});
test("tampered portable history and a repeated identical source review fail closed", async () => {
  let f: any = await bundleFixture(),
    review = f.bundleOptions.review;
  f.rooms.nativeBoundaryPatches.sourceReviewEvidence = [
    {
      format: "source-native-boundary-review-evidence-v1",
      sourceModelSha256: review.sourceModelSha256,
      reviewSha256: "d".repeat(64),
      review,
    },
  ];
  await assert.rejects(() => applyBundle(f), /portable native boundary/);
  f = await bundleFixture();
  review = f.bundleOptions.review;
  f.rooms.nativeBoundaryPatches.sourceReviewEvidence = [
    {
      format: "source-native-boundary-review-evidence-v1",
      sourceModelSha256: review.sourceModelSha256,
      reviewSha256: sha(review),
      review,
    },
  ];
  await assert.rejects(() => applyBundle(f), /already retained/);
});
