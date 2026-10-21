import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "fflate";
import {
  IndexedDbVisitorDeliveryCache,
  MemoryVisitorDeliveryCache,
} from "../../app/indoor-project/visitor-delivery-cache";

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

function persistentTransportFixture() {
  const cache = new IndexedDbVisitorDeliveryCache({} as IDBFactory);
  const records = new Map<string, unknown>();
  const writes: { key: string; storedBytes: number }[] = [];
  // Replace only database I/O; exercise real transport ownership and gzip reads.
  Object.defineProperty(cache, "write", {
    value: async (
      _store: string,
      key: string,
      value: unknown,
      size: number,
    ) => {
      await Promise.resolve();
      records.set(key, value);
      writes.push({ key, storedBytes: size });
    },
  });
  Object.defineProperty(cache, "read", {
    value: async (_store: string, key: string) => records.get(key),
  });
  return { cache, records, writes };
}

test("raw gzip storage keeps exact transport bytes, owns subarray aliases before await and reopens logical bytes", async () => {
  const f = persistentTransportFixture();
  const logical = new TextEncoder().encode("original source bytes ".repeat(30));
  const gzip = gzipSync(logical);
  const container = new Uint8Array(gzip.length + 8);
  container.set(gzip, 4);
  const view = container.subarray(4, 4 + gzip.length);
  Object.defineProperty(view, "slice", { value: () => new Uint8Array([0]) });
  Object.defineProperty(view, "byteOffset", { value: 0 });
  Object.defineProperty(view, "byteLength", { value: 1 });
  const pending = f.cache.putGzipAsset("source", view, logical.length);
  container.fill(0);
  await pending;
  const stored = f.records.get("source") as { bytes: ArrayBuffer };
  assert.deepEqual(new Uint8Array(stored.bytes), gzip);
  assert.deepEqual(f.writes, [{ key: "source", storedBytes: gzip.length }]);
  assert.deepEqual(await f.cache.getAsset("source"), logical);
});

test("gzip storage is not an approval: shared bytes, invalid limits and malformed or oversized decoded streams refuse", async () => {
  const f = persistentTransportFixture();
  const logical = new TextEncoder().encode("original bytes");
  const gzip = gzipSync(logical);
  for (const limit of [0, -1, Number.NaN, 1.5, 256 * 1024 * 1024 + 1])
    await assert.rejects(
      f.cache.putGzipAsset("source", gzip, limit),
      /logical byte limit/,
    );
  await assert.rejects(
    f.cache.putGzipAsset(
      "source",
      new Uint8Array(new SharedArrayBuffer(gzip.length)),
      logical.length,
    ),
    /unshared/,
  );
  await f.cache.putGzipAsset(
    "source",
    new Uint8Array([1, 2, 3]),
    logical.length,
  );
  await assert.rejects(f.cache.getAsset("source"));
  await f.cache.putGzipAsset("source", gzip, logical.length - 1);
  await assert.rejects(f.cache.getAsset("source"), /byte limit/);
});

test("unavailable IDB raw-gzip save fails without recompressing the logical source", async () => {
  const original = globalThis.CompressionStream;
  class ForbiddenCompression {
    constructor() {
      throw new Error("Unexpected recompression");
    }
  }
  const cache = new IndexedDbVisitorDeliveryCache({
    open() {
      throw new Error("IDB unavailable");
    },
  } as unknown as IDBFactory);
  const logical = new TextEncoder().encode("original source");
  try {
    globalThis.CompressionStream =
      ForbiddenCompression as unknown as typeof CompressionStream;
    await assert.rejects(
      cache.putGzipAsset("source", gzipSync(logical), logical.length),
      /IDB unavailable/,
    );
  } finally {
    globalThis.CompressionStream = original;
  }
});
