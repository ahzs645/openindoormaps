import assert from "node:assert/strict";
import test from "node:test";
import {
  validateNativePositiveMaterialBand,
  nativePositiveMaterialBandPartsAt,
  type NativePositiveMaterialBand,
} from "../../app/indoor-project/native-positive-material-bands";
import * as source from "../../../reviter/lib/reviter/native-positive-material-bands";
import { createNativeRoutingMaterialQuery } from "../../app/indoor-project/native-routing-material";
import { createNativeRoutingMaterialQuery as sourceQuery } from "../../../reviter/lib/reviter/native-routing-material";
import {
  nativeMaterialSectionsHash,
  verifyNativeMaterialSections,
} from "../../app/indoor-project/native-material-sections";
import { nativeMaterialPlanWalls } from "../../app/indoor-project/native-material-plan";
import { nativeMaterialPlanWalls as sourcePlan } from "../../../reviter/lib/reviter/native-material-plan";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const band = (): NativePositiveMaterialBand => ({
  nativeElementId: 99,
  categoryId: -2000011,
  kind: "wall",
  baseElevationFeet: 0,
  topElevationFeet: 8,
  sourceBandBaseExactFraction: "0",
  sourceBandTopExactFraction: "8",
  positiveSubsetOnly: true,
  profileRule: "exact-common-contained-profile-of-affine-band",
  originalOwnedBodySha256: "a".repeat(64),
  originalFaceLoopEvidenceSha256: "b".repeat(64),
  independentContainmentProofSha256: "c".repeat(64),
  evidenceSha256: "d".repeat(64),
  cells: [
    {
      partsFeet: [
        [
          [
            [1, 0],
            [2, 0],
            [2, 1],
            [1, 1],
            [1, 0],
          ],
        ],
      ],
      sourceLowerProfileExactFractions: [
        ["0", "0"],
        ["2", "0"],
        ["2", "1"],
        ["0", "1"],
      ],
      sourceUpperProfileExactFractions: [
        ["1", "0"],
        ["3", "0"],
        ["3", "1"],
        ["1", "1"],
      ],
      sourceSurfaceEnvelopeHalfspacesExactFractions: [
        ["1", "0", "0"],
        ["-1", "0", "3"],
        ["0", "1", "0"],
        ["0", "-1", "1"],
      ],
    },
  ],
});
test("guaranteed common subset of affine profiles is finite at the actual cut with source parity", () => {
  const b = band();
  validateNativePositiveMaterialBand(b);
  source.validateNativePositiveMaterialBand(b);
  for (const z of [0, 0.1, 4, 7.999])
    assert.deepEqual(
      nativePositiveMaterialBandPartsAt(b, z),
      source.nativePositiveMaterialBandPartsAt(b, z),
    );
  assert.deepEqual(nativePositiveMaterialBandPartsAt(b, 8), []);
  assert.deepEqual(nativePositiveMaterialBandPartsAt(b, -Number.MIN_VALUE), []);
  assert.equal(
    nativePositiveMaterialBandPartsAt(b, 4)[0][0][0][0],
    1,
    "never projects the wider lower endpoint",
  );
});
for (const [name, change] of [
  [
    "leaving lower finite trim",
    (b: NativePositiveMaterialBand) => {
      b.cells[0].partsFeet[0][0][1][0] = 2.1;
    },
  ],
  [
    "leaving upper finite trim",
    (b: NativePositiveMaterialBand) => {
      b.cells[0].partsFeet[0][0][0][0] = 0.9;
      b.cells[0].partsFeet[0][0][4][0] = 0.9;
    },
  ],
  [
    "leaving independently stored surface domain",
    (b: NativePositiveMaterialBand) => {
      b.cells[0].sourceSurfaceEnvelopeHalfspacesExactFractions[1][2] = "7/4";
    },
  ],
  [
    "claiming whole owner authority",
    (b: NativePositiveMaterialBand) => {
      (b as any).positiveSubsetOnly = false;
    },
  ],
  [
    "flattening an endpoint instead of the guaranteed profile",
    (b: NativePositiveMaterialBand) => {
      b.cells[0].partsFeet = [
        [
          [
            [0, 0],
            [2, 0],
            [2, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      ];
    },
  ],
  [
    "broadened original finite height",
    (b: NativePositiveMaterialBand) => {
      b.topElevationFeet = 9;
    },
  ],
  [
    "unproved interval",
    (b: NativePositiveMaterialBand) => {
      b.topElevationFeet = 0;
    },
  ],
] as const)
  test(`rejects ${name} in both source and runtime`, () => {
    const b = band();
    change(b);
    assert.throws(() => validateNativePositiveMaterialBand(b));
    assert.throws(() => source.validateNativePositiveMaterialBand(b));
  });
test("additive positive evidence preserves evaluated IDs, complete masks, physical source and parity", async () => {
  const raw = {
    version: 1 as const,
    sourceModelSha256: "a".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 4,
        evidenceSha256: "b".repeat(64),
        sourceElementIds: [11],
        sections: [],
        originalPositiveMaterialBands: [band()],
      },
    ],
  };
  const mat = { ...raw, geometrySha256: await nativeMaterialSectionsHash(raw) };
  await verifyNativeMaterialSections(mat);
  const d = {
    source: { modelSha256: raw.sourceModelSha256 },
    nativeMaterialSections: mat,
    nativeLevels: [{ id: 1, elevationFeet: 0 }],
    walls: [
      {
        levelId: 1,
        nativeElementId: 99,
        kind: "wall",
        ringsFeet: [
          [
            [9, 9],
            [10, 9],
            [10, 10],
            [9, 10],
          ],
        ],
      },
    ],
  } as unknown as IndoorDataset;
  const before = JSON.stringify(d.walls);
  const q = createNativeRoutingMaterialQuery(d)(0, 4);
  assert.deepEqual(q, sourceQuery(d)(0, 4));
  assert.deepEqual([...q.known], [11]);
  assert.deepEqual([...q.present], []);
  assert.equal(q.parts[0].positiveSubsetOnly, true);
  assert.equal(q.known.has(99), false);
  const plan = nativeMaterialPlanWalls(d, 1);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan, sourcePlan(d, 1));
  assert.equal(plan[0].ringsFeet, d.walls[0].ringsFeet);
  assert.equal(JSON.stringify(d.walls), before);
  const changed = structuredClone(mat);
  changed.levels[0].originalPositiveMaterialBands[0].independentContainmentProofSha256 =
    "e".repeat(64);
  await assert.rejects(verifyNativeMaterialSections(changed), /checksum/);
});
