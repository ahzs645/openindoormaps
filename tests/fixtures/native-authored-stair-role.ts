import {
  nativeAuthoredStairTreadRolesHash,
  type NativeAuthoredStairTreadRoles,
} from "../../app/indoor-project/native-authored-stair-treads";
const H = "a".repeat(64),
  span = { start: 1, end: 2, sha256: H };
export function nativeAuthoredStairRoleFixture(): NativeAuthoredStairTreadRoles {
  const v: NativeAuthoredStairTreadRoles = {
    version: 1,
    sourceModelSha256: H,
    geometrySha256: "",
    evidenceSha256: H,
    sourceSchemaSha256: H,
    runs: [
      {
        nativeRunId: 10,
        nativeStairId: 20,
        originalFrameSha256: H,
        completeOriginalTypedRootAndFifoByteReplay: true,
        geometry: { token: 2, sourceSpan: span, declaredFaceTokens: [3, 4] },
        faces: [
          {
            faceToken: 3,
            sourceSpan: span,
            role: "typed-tread",
            originalTrianglesFeet: [
              [
                [0, 0, 1],
                [4, 0, 1],
                [4, 1, 1],
              ],
              [
                [4, 1, 1],
                [0, 1, 1],
                [0, 0, 1],
              ],
            ],
            typed: {
              index: 0,
              sourceSpan: span,
              origin: [0, 0, 1],
              startLine: {
                token: 5,
                sourceSpan: span,
                origin: [0, 0, 0],
                direction: [1, 0, 0],
                endParameters: [0, 4],
              },
              endLine: {
                token: 6,
                sourceSpan: span,
                origin: [0, 1, 0],
                direction: [1, 0, 0],
                endParameters: [0, 4],
              },
            },
          },
          {
            faceToken: 4,
            sourceSpan: span,
            role: "reference",
            originalTrianglesFeet: [
              [
                [0, 0, 0],
                [4, 0, 0],
                [4, 1, 0],
              ],
              [
                [4, 1, 0],
                [0, 1, 0],
                [0, 0, 0],
              ],
            ],
          },
        ],
      },
    ],
  };
  v.geometrySha256 = nativeAuthoredStairTreadRolesHash(v);
  return v;
}
