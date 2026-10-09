import test from "node:test";
import assert from "node:assert/strict";
import {
  validateNativeBoundaryPatches as runtime,
  validNativeContinuation as runtimeValid,
} from "../../app/indoor-project/native-boundary-patches";
import {
  validateNativeBoundaryPatches as compiler,
  validNativeContinuation as compilerValid,
} from "../../../reviter/lib/reviter/native-boundary-patches";
const hash = "a".repeat(64),
  p: any = {
    id: "original-native-stepped-first-material",
    levelId: 1,
    status: "proposed",
    sourceModelSha256: hash,
    notes:
      "Exact source-axis120mm wall meets original finite frame and pane depth step.",
    widthFeet: 1.5,
    nativeDoorIds: [],
    ringsFeet: [
      [
        [-0.00002, -0.1],
        [-0.00002, 0.1],
        [1.50002, 0.1],
        [1.50002, 0],
        [1.00002, 0],
        [1.00002, -0.1],
      ],
    ],
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
            [1, -1],
            [2, -1],
            [2, 1],
            [1.5, 1],
            [1.5, 0],
            [1, 0],
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
        [1.5, 0.1],
      ],
      targetContactPathFeet: [
        [1, -0.1],
        [1, 0],
        [1.5, 0],
        [1.5, 0.1],
      ],
      targetWallFirstMaterialProfile: true,
      evidenceSha256: hash,
    },
  };
for (const [name, validate, valid] of [
  ["runtime", runtime, runtimeValid],
  ["compiler", compiler, compilerValid],
] as const) {
  test(
    name +
      " retains each exact first-material depth step without changing source width",
    () => {
      const snapshot = structuredClone(p);
      assert(valid(p));
      validate({ version: 1, patches: [p] }, hash);
      assert.deepEqual(snapshot, p);
    },
  );
  test(
    name + " keeps default locally convex wall and column contracts strict",
    () => {
      for (const mutate of [
        (q: any) => {
          delete q.continuationProof.targetWallFirstMaterialProfile;
          q.continuationProof.targetWallFaceChain = true;
        },
        (q: any) => (q.wallEvidence[1].kind = "column"),
        (q: any) =>
          (q.continuationProof.targetWallFirstMaterialProfile = false),
        (q: any) => (q.continuationProof.targetWallFaceChain = true),
      ]) {
        const q = structuredClone(p);
        mutate(q);
        assert(!valid(q));
        assert.throws(() => validate({ version: 1, patches: [q] }, hash));
      }
    },
  );
  test(
    name +
      " rejects skipped recess, second contact and disconnected original support",
    () => {
      for (const mutate of [
        (q: any) => q.continuationProof.targetContactPathFeet.splice(1, 2),
        (q: any) => {
          q.wallEvidence[1].ringsFeet = [
            [
              [1, -1],
              [2, -1],
              [2, 1],
              [1.5, 1],
              [1.5, 0.04],
              [1.25, 0.04],
              [1.25, 0.02],
              [1.5, 0.02],
              [1.5, 0],
              [1, 0],
            ],
          ];
        },
        (q: any) =>
          q.wallEvidence[1].ringsFeet.push([
            [
              [1.7, -0.1],
              [1.8, -0.1],
              [1.8, 0.1],
              [1.7, 0.1],
            ],
          ]),
        (q: any) => (q.continuationProof.targetContactPathFeet[1][1] = 0.01),
      ]) {
        const q = structuredClone(p);
        mutate(q);
        assert(!valid(q));
        assert.throws(() => validate({ version: 1, patches: [q] }, hash));
      }
    },
  );
  test(
    name + " rejects cap rotation, widening, and a door-spanning declaration",
    () => {
      for (const mutate of [
        (q: any) => (q.ringsFeet[0][2][1] += 0.02),
        (q: any) => (q.continuationProof.sourceCapFeet[0][0] += 0.02),
        (q: any) => (q.nativeDoorIds = [10]),
        (q: any) => q.continuationProof.targetContactPathFeet.reverse(),
      ]) {
        const q = structuredClone(p);
        mutate(q);
        assert(!valid(q));
        assert.throws(() => validate({ version: 1, patches: [q] }, hash));
      }
    },
  );
}
