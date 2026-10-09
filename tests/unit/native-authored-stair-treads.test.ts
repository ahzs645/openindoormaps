import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeAuthoredStairTreads,
  nativeAuthoredStairTreadRolesHash,
  type NativeAuthoredStairTreadRoles,
} from "../../app/indoor-project/native-authored-stair-treads";
import { nativeAuthoredStairTreads as sourceTreads } from "../../../reviter/lib/reviter/native-authored-stair-treads.ts";
const H = "a".repeat(64),
  span = { start: 1, end: 2, sha256: H };
function fixture(): NativeAuthoredStairTreadRoles {
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
function rehash(v: NativeAuthoredStairTreadRoles) {
  v.geometrySha256 = nativeAuthoredStairTreadRolesHash(v);
  return v;
}
test("source/runtime exact authored typed face parity excludes original reference face", () => {
  const v = fixture(),
    before = JSON.stringify(v),
    a = nativeAuthoredStairTreads(v, H);
  assert.deepEqual(a, sourceTreads(v, H));
  assert.equal(a.get(10)?.length, 1);
  assert.equal(a.get(10)?.[0].elevationFeet, 1);
  assert.equal(JSON.stringify(v), before);
});
test("missing typed primitive provenance or declared Face inventory fails closed", () => {
  const v = fixture();
  v.runs[0].faces[0].typed!.startLine.token = 0;
  assert.throws(() => nativeAuthoredStairTreads(rehash(v), H));
  const x = fixture();
  x.runs[0].geometry.declaredFaceTokens.pop();
  assert.throws(() => nativeAuthoredStairTreads(rehash(x), H));
});
test("stale owner model and moved original face cannot be accepted by rehashing", () => {
  assert.throws(() => nativeAuthoredStairTreads(fixture(), "b".repeat(64)));
  const v = fixture();
  v.runs[0].faces[0].originalTrianglesFeet
    .flat()
    .forEach((p) => (p[0] += 1e-10));
  assert.throws(() => nativeAuthoredStairTreads(rehash(v), H));
});
test("sloped and incomplete source face bodies do not become authored walking tops", () => {
  const v = fixture();
  v.runs[0].faces[0].originalTrianglesFeet[0][0][2] += 0.001;
  assert.throws(() => nativeAuthoredStairTreads(rehash(v), H));
  const x = fixture();
  x.runs[0].faces[0].originalTrianglesFeet.pop();
  assert.throws(() => nativeAuthoredStairTreads(rehash(x), H));
});
test("unchanged reversed original triangle winding preserves exact face coordinates", () => {
  const v = fixture();
  v.runs[0].faces[0].originalTrianglesFeet.forEach(
    (t) => ([t[1], t[2]] = [t[2], t[1]]),
  );
  const before = JSON.stringify(v.runs[0].faces[0].originalTrianglesFeet);
  const a = nativeAuthoredStairTreads(rehash(v), H);
  assert.equal(a.get(10)?.length, 1);
  assert.equal(
    JSON.stringify(v.runs[0].faces[0].originalTrianglesFeet),
    before,
  );
});
test("finite typed boundary controls preserve a complete original six-vertex winder", () => {
  const v = fixture(),
    f = v.runs[0].faces[0];
  const p: [number, number, number][] = [
    [0, 0, 1],
    [2, 0, 1],
    [4, 1, 1],
    [4, 3, 1],
    [2, 3, 1],
    [0, 1, 1],
  ];
  f.originalTrianglesFeet = [
    [p[0], p[1], p[2]],
    [p[0], p[2], p[3]],
    [p[0], p[3], p[4]],
    [p[0], p[4], p[5]],
  ];
  f.typed!.startLine.endParameters = [0, 2];
  f.typed!.endLine = {
    token: 6,
    sourceSpan: span,
    origin: [4, 1, 0],
    direction: [0, 1, 0],
    endParameters: [0, 2],
  };
  const before = JSON.stringify(f.originalTrianglesFeet),
    out = nativeAuthoredStairTreads(rehash(v), H).get(10)!;
  assert.equal(out[0].ringFeet.length, 6);
  assert.equal(JSON.stringify(f.originalTrianglesFeet), before);
  assert.deepEqual(sourceTreads(v, H), nativeAuthoredStairTreads(v, H));
});
test("finite controls that only touch endpoints but cross the face interior are rejected", () => {
  const v = fixture();
  v.runs[0].faces[0].typed!.startLine = {
    token: 5,
    sourceSpan: span,
    origin: [0, 0, 0],
    direction: [4, 1, 0],
    endParameters: [0, 1],
  };
  assert.throws(() => nativeAuthoredStairTreads(rehash(v), H));
});

test("rehashed private authoring fields are rejected at every physical role carrier layer", () => {
  for (const select of [
    (v: ReturnType<typeof fixture>) => v,
    (v: ReturnType<typeof fixture>) => v.runs[0],
    (v: ReturnType<typeof fixture>) => v.runs[0].geometry,
    (v: ReturnType<typeof fixture>) => v.runs[0].faces[0],
    (v: ReturnType<typeof fixture>) => v.runs[0].faces[0].typed!,
    (v: ReturnType<typeof fixture>) => v.runs[0].faces[0].typed!.startLine,
    (v: ReturnType<typeof fixture>) => v.runs[0].faces[0].sourceSpan,
  ]) {
    const value = fixture();
    Object.assign(select(value), {
      reviewNote: "Private source investigation",
    });
    rehash(value);
    assert.throws(() => nativeAuthoredStairTreads(value, H));
    assert.throws(() => sourceTreads(value, H));
  }
});
