import assert from "node:assert/strict";
import test from "node:test";
import {
  validateNativeMaterialSections,
  type NativeMaterialSections,
} from "../../app/indoor-project/native-material-sections";
import { validateNativeMaterialSections as compilerValidate } from "../../../reviter/lib/reviter/native-material-sections";

function fixture(): NativeMaterialSections {
  const parts = [
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ],
  ] as [number, number][][][];
  return {
    version: 1,
    sourceModelSha256: "a".repeat(64),
    geometrySha256: "b".repeat(64),
    levels: [
      {
        levelId: 1,
        elevationFeet: 0,
        cutElevationFeet: 0.1,
        evidenceSha256: "c".repeat(64),
        sourceElementIds: Array.from({ length: 2000 }, (_, i) => i + 1),
        sections: [],
        originalNativeMemberSections: [
          {
            nativeElementId: 3,
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: parts,
            sourceWidthFeet: 1,
            sourceAxisDirectionFeet: [1, 0],
            sourceCapFeet: [
              [0, 0],
              [1, 0],
            ],
            evidenceSha256: "d".repeat(64),
          },
        ],
        originalNativeHostRelations: [
          {
            hostNativeElementId: 7000,
            memberNativeElementIds: [4],
            physicalDoorNativeElementIds: [8000],
            evidenceSha256: "e".repeat(64),
          },
        ],
        originalFiniteMaterialSections: Array.from(
          { length: 1000 },
          (_, i) => ({
            nativeElementId: i + 1,
            baseElevationFeet: 0,
            topElevationFeet: 8,
            partsFeet: parts,
            evidenceSha256: "f".repeat(64),
          }),
        ),
      },
    ],
  };
}

test("large original censuses retain every member/host/finite-band validation and source parity", () => {
  const data = fixture();
  const before = JSON.stringify(data);
  validateNativeMaterialSections(data, data.sourceModelSha256);
  compilerValidate(data, data.sourceModelSha256);
  assert.equal(JSON.stringify(data), before);
  const edits: ((d: NativeMaterialSections) => void)[] = [
    (d) => {
      d.levels[0]!.sourceElementIds = d.levels[0]!.sourceElementIds.filter(
        (id) => id !== 3,
      );
    },
    (d) => {
      d.levels[0]!.sourceElementIds = d.levels[0]!.sourceElementIds.filter(
        (id) => id !== 4,
      );
    },
    (d) => {
      d.levels[0]!.sourceElementIds = d.levels[0]!.sourceElementIds.filter(
        (id) => id !== 999,
      );
    },
    (d) => {
      d.levels[0]!.sourceElementIds.push(1);
    },
    (d) => {
      d.levels[0]!.originalFiniteMaterialSections![0]!.partsFeet[0]![0]![0]![0] =
        Number.NaN;
    },
    (d) => {
      d.levels[0]!.originalNativeHostRelations![0]!.memberNativeElementIds.push(
        8000,
      );
    },
  ];
  for (const edit of edits) {
    const changed = structuredClone(data);
    edit(changed);
    let actual: unknown, expected: unknown;
    try {
      validateNativeMaterialSections(changed, changed.sourceModelSha256);
    } catch (error) {
      actual = error;
    }
    try {
      compilerValidate(changed, changed.sourceModelSha256);
    } catch (error) {
      expected = error;
    }
    assert(actual instanceof Error);
    assert(expected instanceof Error);
    assert.equal(actual.message, expected.message);
  }
});
