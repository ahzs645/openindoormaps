import test from "node:test";
import assert from "node:assert/strict";
import { FloorMemoryCache } from "../../app/indoor-project/floor-memory-cache";
import {
  floorMemoryCostBytes,
  createFloorMemoryCostQuery,
} from "../../app/indoor-project/floor-memory-cost";

test("DAG estimate charges shared geometry/buffers once and never serializes or invokes getters", () => {
  const branch = {
    coordinates: [
      [1, 2],
      [3, 4],
    ],
    name: "native",
  };
  assert(
    floorMemoryCostBytes({ a: branch, b: structuredClone(branch) }) >
      floorMemoryCostBytes({ a: branch, b: branch }),
  );
  const buffer = new ArrayBuffer(1024);
  assert(
    floorMemoryCostBytes([new Uint8Array(buffer), new Uint16Array(buffer)]) <
      floorMemoryCostBytes([
        new Uint8Array(buffer),
        new Uint16Array(buffer.slice(0)),
      ]),
  );
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert(Number.isFinite(floorMemoryCostBytes(cyclic)));
  assert(
    Number.isFinite(
      floorMemoryCostBytes({
        toJSON() {
          throw Error("no JSON traversal");
        },
        value: branch,
      }),
    ),
  );
  let called = false;
  assert.equal(
    floorMemoryCostBytes({
      get privateGeometry() {
        called = true;
        throw Error("accessor");
      },
    }),
    Infinity,
  );
  assert.equal(called, false);
  const measured = createFloorMemoryCostQuery();
  assert.equal(measured(branch), measured(branch));
});

test("scalar byte and count budgets evict LRU, oversized/unknown output cannot poison cache", () => {
  const cache = new FloorMemoryCache<string, object>(3, 100);
  const a = {},
    b = {},
    c = {};
  cache.set("a", a, 40);
  cache.set("b", b, 40);
  assert.equal(cache.get("a"), a);
  cache.set("c", c, 40);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), a);
  assert.equal(cache.get("c"), c);
  assert.equal(cache.set("large", {}, 101), false);
  for (const cost of [undefined, NaN, Infinity, -1, 0.5])
    assert.equal(cache.set("unknown", {}, cost), false);
  assert.deepEqual(cache.statistics(), {
    entries: 2,
    memoryCostBytes: 80,
    maximumBytes: 100,
    capacity: 3,
  });
  cache.clear();
  for (let i = 0; i < 4; i++) cache.set(String(i), {}, 1);
  assert.equal(cache.get("0"), undefined);
  assert.equal(cache.statistics().entries, 3);
});
