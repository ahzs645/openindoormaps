import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeDisplayRegionHash,
  nativeDisplayScopeParts,
  validateNativeDisplayScopes,
  type NativeDisplayScopes,
} from "../../app/indoor-project/native-display-scopes";
const rect = (
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
const native = [rect(0, 0, 20, 20), rect(5, 5, 3, 3)];
async function scope(): Promise<NativeDisplayScopes> {
  return {
    version: 1,
    sourceModelSha256: "a".repeat(64),
    scopes: [
      {
        id: "checked",
        levelId: 1,
        regionId: "region",
        regionRingsSha256: await nativeDisplayRegionHash(native),
        partsFeet: [[rect(4, 4, 8, 8)]],
        evidence: "reviewed-source-enclosure",
      },
    ],
  };
}
test("checked scope clips to exact native floor preserving holes and original bytes", async () => {
  const s = await scope(),
    before = JSON.stringify({ s, native });
  const r = await nativeDisplayScopeParts(
    s,
    s.sourceModelSha256,
    1,
    "region",
    native,
  );
  assert.equal(r.parts[0].length, 2);
  assert.equal(r.stale.length, 0);
  assert.equal(JSON.stringify({ s, native }), before);
});
test("changed native geometry invalidates reviewed display rather than spreading old mask", async () => {
  const s = await scope();
  const r = await nativeDisplayScopeParts(s, s.sourceModelSha256, 1, "region", [
    rect(0, 0, 22, 20),
  ]);
  assert.equal(r.parts.length, 0);
  assert.deepEqual(r.stale, ["checked"]);
});
test("other levels and regions never inherit scope", async () => {
  const s = await scope();
  for (const [level, id] of [
    [2, "region"],
    [1, "other"],
  ] as const) {
    assert.equal(
      (await nativeDisplayScopeParts(s, s.sourceModelSha256, level, id, native))
        .parts.length,
      0,
    );
  }
});
test("wrong model and malformed geometry reject import", async () => {
  const s = await scope();
  assert.throws(() => validateNativeDisplayScopes(s, "b".repeat(64)));
  s.scopes[0].partsFeet[0][0][0][0] = NaN;
  assert.throws(() => validateNativeDisplayScopes(s));
});
