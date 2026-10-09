import pc from "polygon-clipping";
import assert from "node:assert/strict";
import test from "node:test";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material.ts";
import { createNativeRoutingMaterialQuery as compilerQuery } from "../../../reviter/lib/reviter/native-routing-material.ts";
import {
  nativeMaterialSectionsHash,
  verifyNativeMaterialSections,
  type NativeMaterialSections,
} from "../../app/indoor-project/native-material-sections.ts";
import { nativeMaterialPlanWalls } from "../../app/indoor-project/native-material-plan.ts";
import { nativeMaterialPlanWalls as compilerPlan } from "../../../reviter/lib/reviter/native-material-plan.ts";
import type { IndoorDataset } from "../../app/indoor-project/contract.ts";
const rect = (x: number) =>
  [
    [
      [x, 0],
      [x + 1, 0],
      [x + 1, 10],
      [x, 10],
    ],
  ] as [number, number][][];
test("original material cuts distinguish known absence, actual bodies, and checked placement repairs with compiler parity", async () => {
  const raw = {
    version: 1 as const,
    sourceModelSha256: "a".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 0.1,
        evidenceSha256: "b".repeat(64),
        sourceElementIds: [12, 13],
        sections: [
          {
            nativeElementId: 12,
            categoryId: -2000011,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [rect(4)],
          },
        ],
      },
    ],
  };
  const sections: NativeMaterialSections = {
    ...raw,
    geometrySha256: await nativeMaterialSectionsHash(raw),
  };
  await verifyNativeMaterialSections(sections, raw.sourceModelSha256);
  const data = {
    source: { modelSha256: raw.sourceModelSha256 },
    nativeMaterialSections: sections,
    nativeWallPositionRepairs: {
      sourceModelSha256: raw.sourceModelSha256,
      walls: [
        { nativeElementId: 12, originalRingsFeet: rect(4), ringsFeet: rect(7) },
      ],
    },
  };
  const run = createNativeRoutingMaterialQuery(data),
    material = run(0);
  assert.deepEqual([...material.known], [12, 13]);
  assert.deepEqual([...material.present], [12]);
  assert.deepEqual(material.parts[0]!.rings, rect(7));
  assert.deepEqual(material, compilerQuery(data)(0));
  assert.equal(run(0), material, "immutable phase reuses the exact cut");
  assert.equal(
    run(0, 4).parts.length,
    0,
    "a plan cut does not become an ankle cut",
  );
  const changed = structuredClone(data);
  changed.nativeMaterialSections.levels[0]!.sections[0]!.partsFeet = [rect(8)];
  await assert.rejects(
    verifyNativeMaterialSections(changed.nativeMaterialSections),
    /checksum/,
  );
  assert.deepEqual(
    createNativeRoutingMaterialQuery(changed)(0).parts[0]!.rings,
    rect(11),
    "new calculation observes changed source geometry",
  );
  assert.throws(
    () =>
      createNativeRoutingMaterialQuery({
        ...data,
        source: { modelSha256: "c".repeat(64) },
      }),
    /binding/,
  );
});

test("source presentation and native selection use exact plan cuts without historical proxy material", async () => {
  const raw = {
    version: 1 as const,
    sourceModelSha256: "a".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 4,
        evidenceSha256: "b".repeat(64),
        sourceElementIds: [12, 13],
        sections: [
          {
            nativeElementId: 12,
            categoryId: -2000011,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [rect(4)],
          },
        ],
      },
    ],
  };
  const data = {
    source: { modelSha256: raw.sourceModelSha256 },
    nativeLevels: [{ id: 1, name: "Floor", elevationFeet: 0 }],
    walls: [
      { levelId: 1, nativeElementId: 12, kind: "wall", ringsFeet: rect(999) },
      { levelId: 1, nativeElementId: 13, kind: "wall", ringsFeet: rect(999) },
      { levelId: 1, nativeElementId: 14, kind: "column", ringsFeet: rect(8) },
    ],
    nativeMaterialSections: {
      ...raw,
      geometrySha256: await nativeMaterialSectionsHash(raw),
    },
  } as unknown as IndoorDataset;
  const actual = nativeMaterialPlanWalls(data, 1);
  assert.deepEqual(actual, compilerPlan(data, 1));
  assert.equal(actual.length, 2);
  assert.deepEqual(
    actual.find((w) => w.nativeElementId === 12)!.ringsFeet,
    rect(4),
  );
  assert.ok(
    actual.some((w) => w.nativeElementId === 14),
    "unknown original column remains a veto",
  );
  assert.equal(
    data.walls[0]!.ringsFeet[0]![0]![0],
    999,
    "historical source binding remains unchanged",
  );
  assert.deepEqual(
    compilerPlan(data, 1, undefined, 0.1),
    data.walls,
    "a plan section cannot stand in for an unchecked ankle cut",
  );
});

test("a source-certified curtain host aperture includes only its contained original physical children", async () => {
  const { createNativeHostApertureQuery } = await import(
    "../../app/indoor-project/native-routing-material.ts"
  );
  const { createNativeHostApertureQuery: compilerHost } = await import(
    "../../../reviter/lib/reviter/native-routing-material.ts"
  );
  const raw = {
    version: 1 as const,
    sourceModelSha256: "a".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 0.1,
        evidenceSha256: "b".repeat(64),
        sourceElementIds: [10, 11, 12, 13],
        sections: [
          {
            nativeElementId: 10,
            categoryId: -2000011,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [rect(4)],
            sourceAssemblyChildIds: [11, 12],
            originalPhysicalDoorChildIds: [20],
            sourceNativeHostRelationsVerified: true as const,
          },
          {
            nativeElementId: 11,
            categoryId: -2000170,
            kind: "window" as const,
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [rect(4)],
          },
          // Membership alone cannot exempt a stale child outside its parent.
          {
            nativeElementId: 12,
            categoryId: -2000170,
            kind: "window" as const,
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [rect(8)],
          },
          {
            nativeElementId: 13,
            categoryId: -2000011,
            kind: "wall" as const,
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: [rect(4)],
          },
        ],
      },
    ],
  };
  const data = {
    source: { modelSha256: raw.sourceModelSha256 },
    nativeMaterialSections: {
      ...raw,
      geometrySha256: await nativeMaterialSectionsHash(raw),
    },
  };
  await verifyNativeMaterialSections(
    data.nativeMaterialSections,
    raw.sourceModelSha256,
  );
  const material = createNativeRoutingMaterialQuery(data)(0);
  for (const owns of [
    createNativeHostApertureQuery(material),
    compilerHost(compilerQuery(data)(0)),
  ]) {
    assert.equal(owns(10, 20, 10), true);
    assert.equal(
      owns(10, 20, 11),
      true,
      "original child has the same actual source material",
    );
    assert.equal(
      owns(10, 20, 12),
      false,
      "stale/outside assembly material is retained",
    );
    assert.equal(
      owns(10, 20, 13),
      false,
      "foreign overlapping material is retained",
    );
    assert.equal(
      owns(10, 21, 11),
      false,
      "an unrelated door cannot exempt an assembly child",
    );
    assert.equal(owns(undefined, 20, 11), false);
  }
  const invalid = structuredClone(data);
  invalid.nativeMaterialSections.levels[0]!.sections[0]!.sourceAssemblyChildIds =
    [999];
  assert.throws(
    () => createNativeRoutingMaterialQuery(invalid),
    /host assembly/,
  );
});

test("tagged cap material composes only its checked carrier aperture with source/runtime parity", async () => {
  const { createNativeBoundaryMaterialQuery } = await import(
    "../../app/indoor-project/native-boundary-material"
  );
  const { createNativeBoundaryMaterialQuery: sourceBoundary } = await import(
    "../../../reviter/lib/reviter/native-boundary-material"
  );
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
  const aperture = rectangle(5, 3, 1, 4),
    original = rectangle(0, 0, 10, 10),
    normal: [number, number] = [1, 0];
  const patch = {
    kind: "basic-wall-overlap",
    id: "physical-aperture",
    levelId: 1,
    nativeDoorId: 30,
    apertureFeet: aperture,
    normalFeet: normal,
    doorEvidence: {
      hostId: 20,
      orientedBox: [
        ...aperture.map((p) => [...p, 0]),
        ...aperture.map((p) => [...p, 8]),
      ],
    },
    wallEvidence: [{ nativeElementId: 20, partsFeet: [original] }],
    frameEvidence: [],
  };
  const wall = {
    levelId: 1,
    nativeElementId: 20,
    kind: "wall" as const,
    ringsFeet: [rectangle(4, 4, 2, 2)],
    reviewPatchId: "checked-cap",
  };
  const data = {
    source: { modelSha256: "a".repeat(64) },
    nativeIndoorEnvelopes: { version: 1 },
    walls: [
      ...pc.difference([original], [aperture]).map((ringsFeet) => ({
        levelId: 1,
        nativeElementId: 20,
        kind: "wall",
        ringsFeet,
      })),
      wall,
    ],
    doors: [
      {
        id: "door",
        levelId: 1,
        nativeElementId: 30,
        state: "connected",
        roomKeys: ["a", "b"],
        footprintFeet: aperture,
        normalFeet: normal,
        pointFeet: [5.5, 5],
      },
    ],
    doorAperturePatchState: {
      regenerated: true,
      sourceGeometryKey: JSON.stringify([patch]),
    },
  } as unknown as IndoorDataset;
  const before = JSON.stringify(data);
  for (const query of [
    createNativeBoundaryMaterialQuery(data),
    sourceBoundary(data),
  ]) {
    assert.deepEqual(query(wall), pc.difference(wall.ringsFeet, [aperture]));
    assert.deepEqual(
      query({ ...wall, nativeElementId: 21 }),
      [wall.ringsFeet],
      "foreign repair retains all its material",
    );
    assert.deepEqual(
      query({ ...wall, kind: "column" }),
      [wall.ringsFeet],
      "a column is not cut even with a matching owner ID",
    );
  }
  assert.equal(
    JSON.stringify(data),
    before,
    "original tagged recipe material remains unchanged",
  );
  const legacy = structuredClone(data);
  delete legacy.nativeIndoorEnvelopes;
  assert.deepEqual(
    createNativeBoundaryMaterialQuery(legacy)(wall),
    [wall.ringsFeet],
    "legacy geometry remains unchanged",
  );
  const stale = structuredClone(data);
  stale.doors![0]!.normalFeet = [0, 1];
  assert.throws(
    () => createNativeBoundaryMaterialQuery(stale),
    /reviewed aperture/,
  );
});
