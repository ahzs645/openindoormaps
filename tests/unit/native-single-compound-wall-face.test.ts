import test from "node:test";
import assert from "node:assert/strict";
import {
  validateNativeBoundaryPatches as runtime,
  sameNativeMaterialEvidence as runtimeSame,
} from "../../app/indoor-project/native-boundary-patches";
import {
  validateNativeBoundaryPatches as compiler,
  sameNativeMaterialEvidence as compilerSame,
} from "../../../reviter/lib/reviter/native-boundary-patches";
const hash = "a".repeat(64);
const patch: any = {
  id: "original-compound-contact",
  sourceModelSha256: hash,
  levelId: 1,
  status: "proposed",
  notes: "Checked original compound wall member face.",
  widthFeet: 1,
  ringsFeet: [
    [
      [-0.00002, -0.1],
      [-0.00002, 0.1],
      [1.00002, 0.1],
      [1.00002, -0.1],
    ],
  ],
  nativeDoorIds: [],
  wallEvidence: [
    {
      nativeElementId: 1,
      kind: "wall",
      ringsFeet: [
        [
          [-2, -0.1],
          [0, -0.1],
          [0, 0.1],
          [-2, 0.1],
        ],
      ],
    },
    {
      nativeElementId: 2,
      kind: "wall",
      ringsFeet: [
        [
          [1, -2],
          [2, -2],
          [2, 2],
          [0.5, 2],
          [0.5, 1],
          [1, 1],
          [1, -2],
        ],
      ],
    },
  ],
  continuationProof: {
    sourceWallId: 1,
    sourceCapFeet: [
      [0, -0.1],
      [0, 0.1],
    ],
    targetContactFeet: [
      [1, -0.1],
      [1, 0.1],
    ],
    targetContactPathFeet: [
      [1, -0.1],
      [1, 0.1],
    ],
    targetWallFaceChain: true,
    evidenceSha256: hash,
  },
};
for (const [name, validate] of [
  ["runtime", runtime],
  ["compiler", compiler],
] as const) {
  test(
    name +
      " certifies a complete original compound wall face without cropping unrelated returns",
    () => {
      const snapshot = structuredClone(patch);
      validate({ version: 1, patches: [patch] }, hash);
      assert.deepEqual(patch, snapshot);
    },
  );
  test(
    name + " rejects a nearer material notch anywhere inside the cap width",
    () => {
      const p = structuredClone(patch);
      p.wallEvidence[1].ringsFeet = [
        [
          [1, -2],
          [2, -2],
          [2, 2],
          [0.5, 2],
          [0.5, 1],
          [1, 1],
          [1, 0.02],
          [0.7, 0.02],
          [0.7, -0.02],
          [1, -0.02],
        ],
      ];
      assert.throws(() => validate({ version: 1, patches: [p] }, hash));
    },
  );
  test(
    name +
      " requires explicit wall-face proof, finite original face and monotonic endpoints",
    () => {
      for (const mutate of [
        (p: any) => delete p.continuationProof.targetWallFaceChain,
        (p: any) => (p.wallEvidence[1].kind = "column"),
        (p: any) => p.continuationProof.targetContactPathFeet.reverse(),
        (p: any) =>
          (p.continuationProof.targetContactPathFeet[0] = [0.9, -0.1]),
        (p: any) => (p.ringsFeet[0][2][1] += 0.02),
      ]) {
        const p = structuredClone(patch);
        mutate(p);
        assert.throws(() => validate({ version: 1, patches: [p] }, hash));
      }
    },
  );
}

for (const [name, same] of [
  ["runtime", runtimeSame],
  ["compiler", compilerSame],
] as const) {
  test(
    name +
      " material comparison retains holes and genuine gaps while canonicalizing only within-owner floating duplicates",
    () => {
      const a: any = [
        [
          [100, 200],
          [102, 200],
          [102, 202],
          [100, 202],
        ],
        [
          [100.5, 200.5],
          [101, 200.5],
          [101, 201],
          [100.5, 201],
        ],
      ];
      const b: any = [
        [
          [102, 202],
          [102, 200],
          [101, 200],
          [100, 200],
          [100, 202],
          [102, 202],
        ],
        a[1].slice().reverse(),
      ];
      const snapshot = structuredClone(a);
      assert.equal(same(a, b), true);
      assert.deepEqual(a, snapshot);
      assert.equal(same(a, [a[0]]), false);
      const c = structuredClone(b);
      c[0][0][0] += 0.00000001;
      assert.equal(same(a, c), false);
      const d = structuredClone(b);
      d[1][1][0] += 0.001;
      assert.equal(same(a, d), false);
    },
  );
}
