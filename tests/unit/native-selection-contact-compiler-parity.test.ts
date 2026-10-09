import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nativeMaterialSectionsHash } from "../../app/indoor-project/native-material-sections";
import {
  deriveNativeSelectionContactRepair,
  type NativeSelectionContactRepair,
} from "../../app/indoor-project/native-selection-contact-repairs";
import { assertNativeSelectionContactPhysicalGuards } from "../../app/indoor-project/native-selection-contact-guards";
import { deriveNativeSelectionContactRepair as compilerDerive } from "../../../reviter/lib/reviter/native-selection-contact-repairs.ts";
import { assertNativeSelectionContactPhysicalGuards as compilerGuard } from "../../../reviter/lib/reviter/native-selection-contact-guards.ts";
import { parseRoomDirectory } from "../../../reviter/lib/reviter/room-directory.ts";

type P = [number, number];
async function fixture(trim = 0) {
  const gap = 2 ** -45,
    model = "a".repeat(64);
  const source: P[] = [
      [-10, 0],
      [0, 0],
      [0, 1],
      [-10, 1],
    ],
    target: P[] = trim
      ? [
          [gap, trim],
          [3, trim],
          [3, 1 - trim],
          [gap, 1 - trim],
        ]
      : [
          [gap, -2],
          [3, -2],
          [3, 3],
          [gap, 3],
        ];
  const material = {
    version: 1 as const,
    sourceModelSha256: model,
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 4,
        evidenceSha256: "c".repeat(64),
        sourceElementIds: [10, 20],
        sections: [source, target].map((ring, i) => ({
          nativeElementId: i ? 20 : 10,
          categoryId: -2000011,
          kind: "wall" as const,
          baseElevationFeet: 0,
          topElevationFeet: 10,
          partsFeet: [[ring]],
        })),
      },
    ],
  };
  const data = {
    source: { modelSha256: model },
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    walls: [],
    records: [],
    doors: [],
    edges: [],
    walkingSupport: {
      version: 1,
      sourceModelSha256: model,
      floors: [
        {
          nativeElementId: 30,
          elevationFeet: 0,
          ringsFeet: [
            [
              [-20, -5],
              [10, -5],
              [10, 5],
              [-20, 5],
            ],
          ],
        },
      ],
    },
    nativeMaterialSections: {
      ...material,
      geometrySha256: await nativeMaterialSectionsHash(material),
    },
  } as unknown as IndoorDataset;
  const repair: NativeSelectionContactRepair = {
    id: "contact:1:10-20",
    sourceModelSha256: model,
    sourceMaterialGeometrySha256: data.nativeMaterialSections!.geometrySha256,
    levelId: 1,
    elevationFeet: 0,
    status: "applied",
    source: {
      nativeElementId: 10,
      ringsFeet: [source],
      capFeet: [source[1], source[2]],
    },
    target: {
      nativeElementId: 20,
      ringsFeet: [target],
      faceFeet: [target[3], target[0]],
    },
    evidenceSha256: "d".repeat(64),
    notes: "Provisional native contact; selection only.",
    assumption: {
      kind: "provisional-extracted-native-contact",
      revisitRequired: true,
    },
  };
  return { data, repair, gap };
}
const plain = (v: unknown): unknown =>
  typeof v === "bigint"
    ? String(v)
    : Array.isArray(v)
      ? v.map(plain)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
        : v;
const wire = (value: unknown) => JSON.stringify(plain(value));

test("application and compiler replay identical exact native contacts and veto tiny physical door overlap", async () => {
  const { data, repair, gap } = await fixture(),
    before = wire(data);
  const appMask = deriveNativeSelectionContactRepair(data, repair),
    compilerMask = compilerDerive(data, repair);
  assert.equal(wire(appMask), wire(compilerMask));
  assert.doesNotThrow(() =>
    assertNativeSelectionContactPhysicalGuards(data, repair, appMask),
  );
  assert.doesNotThrow(() => compilerGuard(data, repair, compilerMask));
  assert.equal(wire(data), before);
  data.doors = [
    {
      id: "protected-door",
      nativeElementId: 40,
      levelId: 1,
      pointFeet: [gap / 2, 0.5],
      normalFeet: [1, 0],
      footprintFeet: [
        [0, 0.5],
        [gap, 0.5],
        [gap, 0.500001],
        [0, 0.500001],
      ],
      roomKeys: [],
      state: "unmapped",
    },
  ] as unknown as IndoorDataset["doors"];
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(data, repair, appMask),
    /door/,
  );
  assert.throws(() => compilerGuard(data, repair, compilerMask), /door/);
});

test("compiler accepts portable provisional metadata and rejects malformed applications", async () => {
  const { repair } = await fixture();
  const directory = {
    format: "reviter-room-annotations",
    version: 1,
    coordinateSystem: "revit-model-feet",
    model: { fileName: "model.rvt" },
    annotations: [],
    nativeSelectionContactRepairs: {
      version: 1,
      sourceModelSha256: repair.sourceModelSha256,
      repairs: [repair],
    },
  };
  assert.deepEqual(
    parseRoomDirectory(JSON.stringify(directory)).nativeSelectionContactRepairs,
    directory.nativeSelectionContactRepairs,
  );
  directory.nativeSelectionContactRepairs.repairs[0] = {
    ...repair,
    assumption: {
      kind: "provisional-extracted-native-contact",
      revisitRequired: false,
    },
  } as unknown as NativeSelectionContactRepair;
  assert.throws(() => parseRoomDirectory(JSON.stringify(directory)), /contact/);
});

test("physical guards and contact derivation remain byte-equivalent across compiler mirrors", async () => {
  for (const name of [
    "native-selection-contact-repairs",
    "native-selection-contact-guards",
    "native-rational-intersection-broadphase",
  ]) {
    const [app, compiler] = await Promise.all([
      readFile(
        new URL(`../../app/indoor-project/${name}.ts`, import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(`../../../reviter/lib/reviter/${name}.ts`, import.meta.url),
        "utf8",
      ),
    ]);
    const normalized = compiler.replace(
      /(["'])(\.\/[^"']+)\.ts\1/g,
      (_, quote, path) =>
        `${quote}${path === "./indoor-contract" ? "./contract" : path}${quote}`,
    );
    assert.equal(normalized, app, name);
  }
});

test("explicit finite-cap mode has identical rational replay and complete original-cap floor protection in compiler", async () => {
  const { data, repair } = await fixture(1e-10);
  repair.contactMode = "finite-cap-overlap";
  const appMask = deriveNativeSelectionContactRepair(data, repair),
    compilerMask = compilerDerive(data, repair);
  assert.equal(wire(appMask), wire(compilerMask));
  assert.doesNotThrow(() =>
    assertNativeSelectionContactPhysicalGuards(data, repair, appMask),
  );
  assert.doesNotThrow(() => compilerGuard(data, repair, compilerMask));
  const directory = {
    format: "reviter-room-annotations",
    version: 1,
    coordinateSystem: "revit-model-feet",
    model: { fileName: "model.rvt" },
    annotations: [],
    nativeSelectionContactRepairs: {
      version: 1,
      sourceModelSha256: repair.sourceModelSha256,
      repairs: [repair],
    },
  };
  assert.deepEqual(
    parseRoomDirectory(JSON.stringify(directory)).nativeSelectionContactRepairs,
    directory.nativeSelectionContactRepairs,
  );
  data.walkingSupport!.floors[0].ringsFeet = [
    [
      [-20, 5e-11],
      [10, 5e-11],
      [10, 5],
      [-20, 5],
    ],
  ];
  assert.throws(
    () => assertNativeSelectionContactPhysicalGuards(data, repair, appMask),
    /entire original source cap/,
  );
  assert.throws(
    () => compilerGuard(data, repair, compilerMask),
    /entire original source cap/,
  );
});
