import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "fflate";
import { preparedDeliveryFixture } from "../fixtures/prepared-delivery-small";
import { decodeProgressiveFloor } from "../../app/indoor-project/progressive-delivery";
import { decodeStoredProgressiveFloor } from "../../app/indoor-project/progressive-stored-floor";
import {
  decodePublishedProgressiveFloor,
  restorePublishedFloorPool,
} from "../../app/indoor-project/published-floor-decoder";
import { PUBLISHED_PROJECT_RECEIPTS } from "../../app/indoor-project/published-project-receipts";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";

const pinned = (
  manifest: ReturnType<typeof preparedDeliveryFixture>["manifest"],
) => [
  {
    ...PUBLISHED_PROJECT_RECEIPTS[0],
    validatorSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    progressiveRevisionSha256: manifest.revisionSha256,
    datasetSha256: manifest.provenance.datasetSha256,
    packageSha256: manifest.provenance.packageSha256,
  },
];
test("stored and admitted in-place decoders preserve the full original checked graph", async () => {
  const { manifest, logical } = preparedDeliveryFixture();
  const scope = manifest.scopes[0];
  const expected = await decodeProgressiveFloor(
    manifest,
    scope,
    async (id) => logical.get(id)!,
  );
  const read = async (asset: (typeof manifest.assets)[string]) =>
    gzipSync(logical.get(asset.id)!, { level: 6, mtime: 0 });
  const stored = await decodeStoredProgressiveFloor(manifest, scope, read);
  const published = await decodePublishedProgressiveFloor(
    manifest,
    scope,
    read,
    pinned(manifest),
  );
  assert.deepEqual(stored, expected);
  assert.deepEqual(published, expected);
  assert(Object.isFrozen(published));
  assert(Object.isFrozen(published!.nativeFaces));
  // HTTP Content-Encoding can deliver original expanded chunks instead.
  assert.deepEqual(
    await decodePublishedProgressiveFloor(
      manifest,
      scope,
      async (a) => logical.get(a.id)!,
      pinned(manifest),
    ),
    expected,
  );
});
test("unlisted/stale publications cannot skip the established decoder", async () => {
  const { manifest } = preparedDeliveryFixture();
  let reads = 0;
  const read = async () => {
    reads++;
    return new Uint8Array();
  };
  assert.equal(
    await decodePublishedProgressiveFloor(manifest, manifest.scopes[0], read),
    undefined,
  );
  assert.equal(
    await decodePublishedProgressiveFloor(
      manifest,
      manifest.scopes[0],
      read,
      pinned(manifest).map((r) => ({ ...r, validatorSha256: "0".repeat(64) })),
    ),
    undefined,
  );
  assert.equal(reads, 0);
});
test("admitted floor transport still rejects changed bytes and a scope from another revision", async () => {
  const { manifest, logical } = preparedDeliveryFixture();
  await assert.rejects(
    decodePublishedProgressiveFloor(
      manifest,
      manifest.scopes[0],
      async (a) => {
        const value = logical.get(a.id)!.slice();
        value[value.length - 1] ^= 1;
        return value;
      },
      pinned(manifest),
    ),
    /checksum/,
  );
  await assert.rejects(
    decodePublishedProgressiveFloor(
      manifest,
      { ...manifest.scopes[0], levelIds: [999] },
      async () => new Uint8Array(),
      pinned(manifest),
    ),
    /outside/,
  );
});
test("in-place restoration keeps shared identity, unusual JSON keys and exact scalar bytes; invalid references fail", () => {
  const shared = {
    unicode: "階段😀",
    tiny: Number.MIN_VALUE,
    fraction: ["123456789012345678901", "9007199254740992"],
  };
  const value = JSON.parse(
    '{"__proto__":{"safe":true},"a":{"__preparedDisplaySubtreeReference":0},"b":{"__preparedDisplaySubtreeReference":0}}',
  );
  const actual = restorePublishedFloorPool({
    version: 1,
    pool: [shared],
    value,
    logicalJsonBytes: 1,
    logicalJsonSha256: "a".repeat(64),
  }) as unknown as Record<string, unknown>;
  assert.equal(actual.a, actual.b);
  assert.deepEqual(actual.a, shared);
  assert(Object.hasOwn(actual, "__proto__"));
  assert.equal(({} as Record<string, unknown>).safe, undefined);
  for (const pool of [
    [{ __preparedDisplaySubtreeReference: 0 }],
    [{ __preparedDisplaySubtreeReference: -1 }],
    [{ __preparedDisplaySubtreeReference: 0, extra: true }],
  ])
    assert.throws(
      () =>
        restorePublishedFloorPool({
          version: 1,
          pool,
          value: {},
          logicalJsonBytes: 1,
          logicalJsonSha256: "a".repeat(64),
        }),
      /reference/,
    );
});
