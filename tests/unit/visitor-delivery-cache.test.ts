import assert from "node:assert/strict";
import test from "node:test";
import { MemoryVisitorDeliveryCache } from "../../app/indoor-project/visitor-delivery-cache";

test("visitor cache isolates mutable byte buffers and shares logical hashes across manifest revisions", async () => {
  const cache = new MemoryVisitorDeliveryCache();
  const original = new Uint8Array([1, 2, 3]);
  await cache.putAsset("same-content", original);
  original[0] = 9;
  const first = (await cache.getAsset("same-content"))!;
  assert.deepEqual([...first], [1, 2, 3]);
  first[1] = 8;
  assert.deepEqual([...(await cache.getAsset("same-content"))!], [1, 2, 3]);
  await cache.putManifest("https://example.test/old.json", original);
  await cache.putManifest("https://example.test/new.json", new Uint8Array([4]));
  assert.deepEqual(
    [...(await cache.getManifest("https://example.test/old.json"))!],
    [9, 2, 3],
  );
  assert.deepEqual(
    [...(await cache.getManifest("https://example.test/new.json"))!],
    [4],
  );
  await cache.deleteAsset("same-content");
  assert.equal(await cache.getAsset("same-content"), undefined);
});
