import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import {
  proveDerivedMappingDiscard,
  topLevelJsonOperands,
} from "../../scripts/indoor/source-rebuild-input-proof";

const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
function fixture() {
  const model = strToU8("source model bytes"),
    rooms = strToU8('{"annotations":[]}'),
    scene = strToU8("original scene"),
    data = {
      source: { modelSha256: hash(model), roomsSha256: hash(rooms) },
      nodes: [{ id: "original", pointFeet: [1, 2, 3] }],
      nativeExploreMapping: {
        display: 'nested ],} quote \\" example',
        faces: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      },
      doors: [{ original: true }],
      flags: null,
    };
  const manifest = {
    format: "reviter-project",
    version: 2,
    model: {
      path: "model/source.rvt",
      sha256: hash(model),
      bytes: model.length,
    },
    floors: {
      path: "floors/rooms.json",
      sha256: hash(rooms),
      bytes: rooms.length,
    },
    indoor: { path: "viewer/indoor.json", sha256: "", bytes: 0 },
  };
  const pack = (
    d: unknown,
    asset = scene,
    editManifest: (m: typeof manifest) => void = () => {},
  ) => {
    const raw = strToU8(JSON.stringify(d)),
      m = structuredClone(manifest);
    m.indoor.bytes = raw.length;
    m.indoor.sha256 = hash(raw);
    editManifest(m);
    return zipSync(
      {
        "manifest.json": strToU8(JSON.stringify(m)),
        "viewer/indoor.json": raw,
        "model/source.rvt": model,
        "floors/rooms.json": rooms,
        "model/scene.glb": asset,
      },
      { level: 0 },
    );
  };
  const { nativeExploreMapping: _, ...rebuilt } = data;
  return { data, rebuilt, pack };
}
test("source rebuild proof accepts only removed derived mapping and byte-identical retained operands/assets", () => {
  const { data, rebuilt, pack } = fixture(),
    proof = proveDerivedMappingDiscard(pack(data), pack(rebuilt));
  assert.equal(
    proof.removedDerivedField,
    "viewer/indoor.json:nativeExploreMapping",
  );
  assert.equal(proof.retainedAssets.length, 3);
  assert.equal(proof.allOtherParsedDatasetFieldsUnchanged, true);
  assert.deepEqual(proof.unchangedRetainedDatasetFields, Object.keys(rebuilt));
});
test("source rebuild scope refuses any physical/source asset or extra manifest/JSON change", () => {
  const { data, rebuilt, pack } = fixture(),
    original = pack(data);
  assert.throws(
    () => proveDerivedMappingDiscard(original, pack({ ...rebuilt, nodes: [] })),
    /operand changed/,
  );
  assert.throws(
    () =>
      proveDerivedMappingDiscard(
        original,
        pack(rebuilt, strToU8("foreign scene")),
      ),
    /asset changed/,
  );
  assert.throws(
    () =>
      proveDerivedMappingDiscard(
        original,
        pack(rebuilt, undefined, (m) => {
          m.version = 1;
        }),
      ),
    /Only manifest/,
  );
  assert.throws(
    () => proveDerivedMappingDiscard(original, pack(data)),
    /not removed/,
  );
  assert.throws(
    () =>
      proveDerivedMappingDiscard(
        original,
        pack({ ...rebuilt, extra: "unreviewed" }),
      ),
    /Only the derived/,
  );
});
test("raw JSON operand scan handles nested braces/escaped strings and refuses duplicate or truncated keys", () => {
  const value = {
      a: [{ x: 'quote " } ] \\ backslash' }],
      b: null,
      c: true,
      d: -1.25e-6,
    },
    bytes = strToU8(JSON.stringify(value)),
    fields = topLevelJsonOperands(bytes);
  for (const key of Object.keys(value))
    assert.equal(
      fields.get(key)?.sha256,
      hash(JSON.stringify(value[key as keyof typeof value])),
    );
  for (const malformed of [
    '{"x":1,"x":2}',
    '{"x":[1,2}',
    '{"x":1,}',
    '{"x":1} garbage',
  ])
    assert.throws(() => topLevelJsonOperands(strToU8(malformed)));
});
