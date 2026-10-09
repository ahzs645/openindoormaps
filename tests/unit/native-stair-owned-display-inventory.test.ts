import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeStairOwnedDisplayBodyHash,
  nativeStairOwnedDisplayInventoryHash,
  nativeStairOwnedHorizontalEvidence,
  validateNativeStairOwnedDisplayInventory,
  type NativeStairOwnedDisplayInventory,
} from "../../app/indoor-project/native-stair-owned-display-inventory";

const hash = "a".repeat(64);
function fixture(): NativeStairOwnedDisplayInventory {
  const value: NativeStairOwnedDisplayInventory = {
    version: 1,
    sourceModelSha256: hash,
    geometrySha256: "",
    evidenceSha256: hash,
    nativeStairId: 1,
    nativeRunId: 2,
    completeOriginalOwnedBody: true,
    unclassifiedBodyOwnerIds: [],
    sourceGeometry: "original-float64-owned-brep",
    semanticTreadRoles: "unresolved",
    displayOverrideApplied: false,
    originalFrameSha256: hash,
    originalRootDeclarationSha256: hash,
    originalBodySha256: "",
    sourceChildElementIds: [3],
    declaredTreadQueues: [
      {
        sourceDeclaredPath: "StairsRun.m_oGeom4TreadFaces",
        sourceFrameOffset: 18,
        sourceClassSlot: 2343,
        token: 1,
        dynamicBodyReplayed: false,
      },
    ],
    faces: [0, 1, 2].map((i) => ({
      originalFaceToken: i + 1,
      sourceChildElementIds: [3],
      originalTriangleIndices: [i],
    })),
    trianglesFeet: [
      [
        [0, 0, 1.23456789012345],
        [2, 0, 1.23456789012345],
        [0, 2, 1.23456789012345],
      ],
      // A tiny original upward lip is preserved as an unresolved body face.
      [
        [0, 0, 1],
        [0.0001, 0, 1],
        [0, 0.0001, 1],
      ],
      // An almost horizontal original face must not become a horizontal tread.
      [
        [0, 0, 0],
        [2, 0, 0],
        [0, 2, 0.000001],
      ],
    ],
  };
  value.originalBodySha256 = nativeStairOwnedDisplayBodyHash(value);
  value.geometrySha256 = nativeStairOwnedDisplayInventoryHash(value);
  return value;
}
test("owned display evidence preserves exact body heights and lips without inventing tread roles", () => {
  const body = fixture(),
    before = JSON.stringify(body);
  const surfaces = nativeStairOwnedHorizontalEvidence(body);
  assert.deepEqual(
    surfaces.map((s) => s.elevationFeet),
    [1.23456789012345, 1],
  );
  assert.ok(
    surfaces.every(
      (s) => s.semanticRole === "unresolved-horizontal-owned-body-surface",
    ),
  );
  assert.equal(JSON.stringify(body), before);
  assert.equal(body.displayOverrideApplied, false);
});
test("partial, stale, wrong-owned and applied-semantic body claims stay unavailable", () => {
  const original = fixture();
  assert.throws(() =>
    validateNativeStairOwnedDisplayInventory(original, "b".repeat(64)),
  );
  assert.throws(() =>
    validateNativeStairOwnedDisplayInventory(original, hash, [
      { stairElementId: 7, runAndLandingIds: [2] },
    ]),
  );
  for (const mutate of [
    (v: any) => {
      v.faces.pop();
    },
    (v: any) => {
      v.faces[1].originalTriangleIndices = [0];
    },
    (v: any) => {
      v.trianglesFeet[0][0][2] += 0.01;
    },
    (v: any) => {
      v.unclassifiedBodyOwnerIds = [4];
    },
    (v: any) => {
      v.completeOriginalOwnedBody = false;
    },
    (v: any) => {
      v.displayOverrideApplied = true;
    },
    (v: any) => {
      v.semanticTreadRoles = "verified";
    },
  ]) {
    const v = structuredClone(original);
    mutate(v);
    v.geometrySha256 = nativeStairOwnedDisplayInventoryHash(v);
    assert.throws(() => validateNativeStairOwnedDisplayInventory(v, hash));
  }
});
