import assert from "node:assert/strict";
import test from "node:test";
import { createLocationLoader } from "../../app/data/location-loader";
import type { LocationConfig } from "../../app/types/location";

test("venue loading is lazy, isolated and shares successful/in-flight requests", async () => {
  let firstCalls = 0,
    secondCalls = 0;
  const venue = { slug: "first" } as LocationConfig;
  const load = createLocationLoader({
    first: async () => {
      firstCalls++;
      return { default: venue };
    },
    second: async () => {
      secondCalls++;
      return { default: {} as LocationConfig };
    },
  });
  assert.equal(firstCalls + secondCalls, 0);
  const a = load("first"),
    b = load("first");
  assert.equal(a, b);
  assert.equal(await a, venue);
  assert.equal(await load("first"), venue);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 0);
  assert.equal(await load("missing"), undefined);
  assert.equal(await load("toString"), undefined);
});
test("failed venue chunk can be retried without retaining an error or loading other venues", async () => {
  let attempts = 0;
  const venue = {} as LocationConfig;
  const load = createLocationLoader({
    first: async () => {
      if (++attempts === 1) throw new Error("network failure");
      return { default: venue };
    },
  });
  await assert.rejects(load("first"), /network failure/);
  assert.equal(await load("first"), venue);
  assert.equal(attempts, 2);
});
