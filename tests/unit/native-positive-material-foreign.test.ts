import assert from "node:assert/strict";
import test from "node:test";
import {
  exactPositiveConvexMaterialOverlap,
  type NativePositiveMaterialBand,
} from "../../app/indoor-project/native-positive-material-bands";
import * as sourceMath from "../../../reviter/lib/reviter/native-positive-material-bands";
import { frameFixture } from "./native-derived-frame-returns.test";
import { provisionalCornerFixture } from "./native-provisional-corner-seals.test";
import {
  createNativeDerivedFrameReturnIndex,
  nativeDerivedFrameHash,
  nativeDerivedFrameReturnsHash,
  nativeDerivedFramePlacementHash,
} from "../../app/indoor-project/native-derived-frame-returns";
import { createNativeDerivedFrameReturnIndex as sourceFrame } from "../../../reviter/lib/reviter/native-derived-frame-returns";
import {
  createNativeProvisionalCornerSealIndex,
  nativeProvisionalCornerSealsHash,
} from "../../app/indoor-project/native-provisional-corner-seals";
import { createNativeProvisionalCornerSealIndex as sourceCorner } from "../../../reviter/lib/reviter/native-provisional-corner-seals";
type P = [number, number];
const rect = (a: number, b: number, c: number, d: number): P[] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
  [a, b],
];
const authority = (
  id: number,
  ring: P[],
  lo = 0,
  hi = 4,
): NativePositiveMaterialBand => ({
  nativeElementId: id,
  categoryId: 1,
  kind: "wall",
  baseElevationFeet: lo,
  topElevationFeet: hi,
  sourceBandBaseExactFraction: String(lo),
  sourceBandTopExactFraction: String(hi),
  positiveSubsetOnly: true,
  profileRule: "exact-common-contained-profile-of-affine-band",
  originalOwnedBodySha256: "a".repeat(64),
  originalFaceLoopEvidenceSha256: "b".repeat(64),
  independentContainmentProofSha256: "c".repeat(64),
  evidenceSha256: "d".repeat(64),
  cells: [
    {
      partsFeet: [[ring]],
      sourceLowerProfileExactFractions: [
        ["-10", "-10"],
        ["10", "-10"],
        ["10", "10"],
        ["-10", "10"],
      ],
      sourceUpperProfileExactFractions: [
        ["-10", "-10"],
        ["10", "-10"],
        ["10", "10"],
        ["-10", "10"],
      ],
      sourceSurfaceEnvelopeHalfspacesExactFractions: [
        ["1", "0", "10"],
        ["-1", "0", "10"],
        ["0", "1", "10"],
        ["0", "-1", "10"],
      ],
    },
  ],
});
function install(d: any, b: NativePositiveMaterialBand) {
  // Deliberately different nominal level: the source body height is authority.
  d.nativeMaterialSections.levels.push({
    levelId: 999,
    elevationFeet: 100,
    cutElevationFeet: 104,
    evidenceSha256: "e".repeat(64),
    sourceElementIds: [],
    sections: [],
    originalPositiveMaterialBands: [b],
  });
  d.nativeMaterialSections.geometrySha256 = nativeDerivedFrameHash([
    d.nativeMaterialSections.version,
    d.nativeMaterialSections.sourceModelSha256,
    d.nativeMaterialSections.levels,
  ]);
  if (d.nativeDerivedFrameReturns) {
    const v = d.nativeDerivedFrameReturns;
    v.sourceMaterialGeometrySha256 = d.nativeMaterialSections.geometrySha256;
    v.sourceWallPositionRepairsSha256 = nativeDerivedFramePlacementHash(
      d.nativeWallPositionRepairs,
    );
    v.geometrySha256 = nativeDerivedFrameReturnsHash(v);
  }
  if (d.nativeProvisionalCornerSeals) {
    const v = d.nativeProvisionalCornerSeals;
    v.sourceMaterialGeometrySha256 = d.nativeMaterialSections.geometrySha256;
    v.sourceWallPositionRepairsSha256 = nativeDerivedFramePlacementHash(
      d.nativeWallPositionRepairs,
    );
    v.geometrySha256 = nativeProvisionalCornerSealsHash(v);
  }
}
test("exact clipping retains two-ULP positive overlap and respects holes and boundary contact", () => {
  const cell = rect(1, 0, 2, 1);
  const cases: [P[][][], boolean][] = [
    [[[rect(0, 0, 1 + 2 * Number.EPSILON, 1)]], true],
    [[[rect(0, 0, 1, 1)]], false],
    [[[rect(0, -1, 3, 2), rect(0.5, -0.5, 2.5, 1.5)]], false],
    [[[rect(0, -1, 3, 2), rect(0.5, -0.5, 2 - 2 * Number.EPSILON, 1.5)]], true],
  ];
  for (const [parts, want] of cases) {
    assert.equal(exactPositiveConvexMaterialOverlap(cell, parts), want);
    assert.equal(
      sourceMath.exactPositiveConvexMaterialOverlap(cell, parts),
      want,
    );
  }
});
test("concave clipped rings retain disconnected material and exact hole subtraction", () => {
  const u: P[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [3, 4],
    [3, 1],
    [1, 1],
    [1, 4],
    [0, 4],
    [0, 0],
  ];
  for (const [cut, want] of [
    [rect(0.5, 2, 3.5, 3), true],
    [rect(1, 2, 3, 3), false],
  ] as const) {
    assert.equal(exactPositiveConvexMaterialOverlap(cut, [[u]]), want);
    assert.equal(
      sourceMath.exactPositiveConvexMaterialOverlap(cut, [[u]]),
      want,
    );
  }
});
for (const kind of ["frame", "corner"] as const) {
  const fixture = async () =>
    kind === "frame" ? await frameFixture() : provisionalCornerFixture();
  const check = (d: any) =>
    kind === "frame"
      ? createNativeDerivedFrameReturnIndex(d)
      : createNativeProvisionalCornerSealIndex(d);
  const source = (d: any) =>
    kind === "frame" ? sourceFrame(d) : sourceCorner(d);
  test(`${kind}: overlapping positive body on another nominal level vetoes a two-ULP intrusion`, async () => {
    const d = await fixture();
    const ring =
      kind === "frame"
        ? rect(1.05, 0.25, 1.05 + 2 * Number.EPSILON, 0.75)
        : rect(0.99999, 0.005, 0.99999 + 2 * Number.EPSILON, 0.006);
    install(d, authority(77, ring));
    assert.throws(() => check(d), /exact positive original/);
    assert.throws(() => source(d), /exact positive original/);
  });
  test(`${kind}: boundary-touch and disjoint finite height remain allowed`, async () => {
    const d = await fixture();
    const ring =
      kind === "frame"
        ? rect(1.05, 0.25, 1.06, 0.75)
        : rect(0.99999, 0.005, 1, 0.006);
    install(d, authority(77, ring, 4, 5));
    assert.deepEqual(check(d).rows, source(d).rows);
  });
  test(`${kind}: exact boundary contact has no positive foreign area`, async () => {
    const d: any = await fixture();
    const row =
      kind === "frame"
        ? d.nativeDerivedFrameReturns.rows[0]
        : d.nativeProvisionalCornerSeals.rows[0];
    const maxY = Math.max(...row.partsFeet.flat(2).map((p: P) => p[1]));
    install(
      d,
      authority(
        77,
        rect(
          kind === "frame" ? 1.05 : 0.99999,
          maxY,
          kind === "frame" ? 1.06 : 1,
          maxY + 0.01,
        ),
      ),
    );
    assert.deepEqual(check(d).rows, source(d).rows);
  });
  test(`${kind}: existing original source-contact owner exemption stays intact`, async () => {
    const d = await fixture();
    const ring =
      kind === "frame"
        ? rect(1.05, 0.25, 1.06, 0.75)
        : rect(0.99999, 0.005, 1, 0.006);
    install(d, authority(1, ring));
    assert.deepEqual(check(d).rows, source(d).rows);
  });
  test(`${kind}: actual existing rigid placement applies to positive foreign material`, async () => {
    const d: any = await fixture();
    const ring =
      kind === "frame"
        ? rect(2.05, 0.25, 2.06, 0.75)
        : rect(1.99999, 0.005, 2, 0.006);
    d.nativeWallPositionRepairs = {
      walls: [
        {
          nativeElementId: 77,
          originalRingsFeet: [rect(0, 0, 1, 1)],
          ringsFeet: [rect(-1, 0, 0, 1)],
        },
      ],
    };
    install(d, authority(77, ring));
    assert.throws(() => check(d), /exact positive original/);
    assert.throws(() => source(d), /exact positive original/);
  });
}
