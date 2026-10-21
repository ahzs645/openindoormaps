import test from "node:test";
import assert from "node:assert/strict";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import { progressiveSha256 } from "../../app/indoor-project/progressive-delivery";
import {
  parseVerifiedRoutingDataset,
  verifiedRoutingDatasetSha256,
  createImmutableRoutingWorkerDataset,
  isPrivateImmutableRoutingDataset,
} from "../../app/indoor-project/verified-routing-dataset";
import { createVerifiedProgressiveRouteCalculator } from "../../app/indoor-project/progressive-route-validation";
import { publishedRouteCellReceipt } from "../../app/indoor-project/published-route-cells";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
function fixture() {
  const original = progressiveRoutingFixture(),
    bytes = new TextEncoder().encode(JSON.stringify(original)),
    digest = progressiveSha256(bytes);
  return { original, bytes, digest };
}
function assertEveryObjectFrozen(root: object) {
  const pending = [root],
    seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    assert(Object.isFrozen(current));
    for (const value of Object.values(current))
      if (value !== null && typeof value === "object") pending.push(value);
  }
}
test("only the exact checked-byte parser can attest its own deeply immutable graph", () => {
  const { original, bytes, digest } = fixture(),
    data = parseVerifiedRoutingDataset(bytes, digest);
  assert.equal(verifiedRoutingDatasetSha256(data), digest);
  assert(isPrivateImmutableRoutingDataset(data));
  assert.deepEqual(data, original);
  assertEveryObjectFrozen(data);
  assert(Object.isFrozen(data));
  assert(Object.isFrozen(data.records));
  assert(Object.isFrozen(data.records[0].ringsFeet[0][0]));
  assert.throws(() => {
    data.edges[0].enabled = !data.edges[0].enabled;
  }, TypeError);
  assert.throws(() => {
    data.records[0].ringsFeet[0][0][0] += 1;
  }, TypeError);
  bytes.fill(0);
  assert.equal(verifiedRoutingDatasetSha256(data), digest);
  assert.deepEqual(data, original);
  assert.equal(verifiedRoutingDatasetSha256(original), undefined);
  assert.equal(verifiedRoutingDatasetSha256(structuredClone(data)), undefined);
  assert.equal(
    verifiedRoutingDatasetSha256(Object.freeze(original)),
    undefined,
  );
});
test("fresh JSON overflow refuses even when every source byte has its correct checksum", () => {
  const original = JSON.stringify(progressiveRoutingFixture());
  for (const extra of ["1e400", "-1e400", '[{"nested":1e400}]']) {
    const bytes = new TextEncoder().encode(
      `{"overflow":${extra},${original.slice(1)}`,
    );
    assert.throws(
      () => parseVerifiedRoutingDataset(bytes, progressiveSha256(bytes)),
      /nonfinite/,
    );
  }
});
test("checked bytes with an invalid root never acquire a routing graph", () => {
  for (const text of [
    "null",
    "[]",
    "1",
    '{"format":"other","version":1}',
    '{"format":"reviter-indoor","version":2}',
  ]) {
    const bytes = new TextEncoder().encode(text);
    assert.throws(
      () => parseVerifiedRoutingDataset(bytes, progressiveSha256(bytes)),
      /original dataset/,
    );
  }
});
test("fresh checked JSON freezes a deeply nested tree without recursion", () => {
  const depth = 20_000,
    text =
      '{"format":"reviter-indoor","version":1,"deep":' +
      "[".repeat(depth) +
      "0" +
      "]".repeat(depth) +
      "}",
    bytes = new TextEncoder().encode(text),
    data = parseVerifiedRoutingDataset(bytes, progressiveSha256(bytes));
  let value: unknown = Reflect.get(data, "deep"),
    count = 0;
  while (Array.isArray(value)) {
    assert(Object.isFrozen(value));
    value = value[0];
    count++;
  }
  assert.equal(count, depth);
  assert.equal(value, 0);
  assert(isPrivateImmutableRoutingDataset(data));
});
test("prototype-shaped JSON keys remain ordinary owned data and are frozen completely", () => {
  const text =
      '{"__proto__":{"owners":["source-owner"]},"constructor":{"prototype":{"owner":"retained"}},' +
      JSON.stringify(progressiveRoutingFixture()).slice(1),
    bytes = new TextEncoder().encode(text),
    data = parseVerifiedRoutingDataset(bytes, progressiveSha256(bytes)),
    protoKey = Reflect.get(data, "__proto__") as { owners: string[] },
    constructorKey = Reflect.get(data, "constructor") as {
      prototype: { owner: string };
    };
  assert.equal(Object.getPrototypeOf(data), Object.prototype);
  assert(Object.hasOwn(data, "__proto__"));
  assert(Object.hasOwn(data, "constructor"));
  assert.equal(Object.hasOwn(Object.prototype, "owner"), false);
  assert.deepEqual(protoKey.owners, ["source-owner"]);
  assert.equal(constructorKey.prototype.owner, "retained");
  assert.equal(JSON.stringify(data), text);
  assertEveryObjectFrozen(data);
  assert.throws(() => protoKey.owners.push("forged-owner"), TypeError);
  assert.throws(() => {
    constructorKey.prototype.owner = "changed";
  }, TypeError);
});
test("original owner and byte aliases cannot mutate the parser's private snapshot", () => {
  const { original, bytes, digest } = fixture(),
    alias = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    data = parseVerifiedRoutingDataset(bytes, digest),
    before = JSON.stringify(data);
  original.records[0].key = "forged-record-owner";
  original.edges[0].roomKeys[0] = "forged-edge-owner";
  alias.fill(0);
  assert.equal(JSON.stringify(data), before);
  assert.equal(verifiedRoutingDatasetSha256(data), digest);
  assert(isPrivateImmutableRoutingDataset(data));
  for (const forged of [
    Object.freeze(Object.create(data)) as typeof data,
    Object.freeze({
      ...structuredClone(data),
      immutable: true,
      verifiedRoutingDatasetSha256: digest,
    }),
  ]) {
    assert.equal(verifiedRoutingDatasetSha256(forged), undefined);
    assert.equal(isPrivateImmutableRoutingDataset(forged), false);
  }
});
test("tampered carriers and shared or forged view metadata cannot confer byte authority", () => {
  const { bytes, digest } = fixture(),
    changed = bytes.slice();
  changed[changed.length - 1] ^= 1;
  assert.throws(() => parseVerifiedRoutingDataset(changed, digest), /checksum/);
  const shared = new Uint8Array(new SharedArrayBuffer(bytes.length));
  shared.set(bytes);
  Object.defineProperty(shared, "buffer", { value: bytes.buffer });
  assert.throws(() => parseVerifiedRoutingDataset(shared, digest), /unshared/);
  const fake = bytes.slice();
  fake.fill(0);
  Object.defineProperty(fake, "buffer", { value: bytes.buffer });
  assert.throws(() => parseVerifiedRoutingDataset(fake, digest), /checksum/);
});
test("the full-source worker factory owns a separate deeply frozen clone, never a caller's object or shallow freeze", () => {
  const { original } = fixture(),
    data = createImmutableRoutingWorkerDataset(original);
  assert.notEqual(data, original);
  assert.notEqual(data.edges, original.edges);
  assert.deepEqual(data, original);
  assert(isPrivateImmutableRoutingDataset(data));
  assert.equal(verifiedRoutingDatasetSha256(data), undefined);
  assert.equal(isPrivateImmutableRoutingDataset(original), false);
  assert.equal(
    isPrivateImmutableRoutingDataset(Object.freeze(original)),
    false,
  );
  assert.equal(isPrivateImmutableRoutingDataset(structuredClone(data)), false);
  original.edges[0].enabled = !original.edges[0].enabled;
  assert.notEqual(data.edges[0].enabled, original.edges[0].enabled);
  assert.throws(() => {
    data.edges[0].enabled = !data.edges[0].enabled;
  }, TypeError);
  assert.throws(() =>
    createImmutableRoutingWorkerDataset(new Proxy(original, {})),
  );
  for (const mutable of [new Map(), new Date(), new SharedArrayBuffer(16)]) {
    const input = { ...original, mutable };
    assert.throws(
      () => createImmutableRoutingWorkerDataset(input),
      /ordinary immutable/,
    );
  }
});
test("a caller getter can only supply values to a new owned clone", () => {
  const { original } = fixture(),
    input = { ...original };
  Object.defineProperty(input, "edges", {
    enumerable: true,
    get: () => original.edges,
  });
  const data = createImmutableRoutingWorkerDataset(input);
  assert.notEqual(data.edges, original.edges);
  original.edges[0].enabled = !original.edges[0].enabled;
  assert.notEqual(data.edges[0].enabled, original.edges[0].enabled);
  assert.equal(isPrivateImmutableRoutingDataset(input), false);
});
test("the general clone path retains cycle handling and non-JSON refusals", () => {
  const { original } = fixture(),
    nested: { self?: object } = {};
  nested.self = nested;
  const input = { ...original, nested },
    data = createImmutableRoutingWorkerDataset(input),
    clone = Reflect.get(data, "nested") as typeof nested;
  assert.notEqual(clone, nested);
  assert.equal(clone.self, clone);
  assertEveryObjectFrozen(data);
  assert.equal(verifiedRoutingDatasetSha256(data), undefined);
  for (const invalid of [1n, Infinity, -Infinity]) {
    const input = { ...original, invalid };
    assert.throws(
      () => createImmutableRoutingWorkerDataset(input),
      /non-JSON|nonfinite/,
    );
  }
});
test("a custom receipt policy retains the canonical checksum even for genuinely attested bytes", () => {
  const { original } = fixture(),
    canonical = new TextEncoder().encode(JSON.stringify(original)),
    bytes = new TextEncoder().encode("\n" + JSON.stringify(original) + "\n"),
    rawSha256 = progressiveSha256(bytes),
    data = parseVerifiedRoutingDataset(bytes, rawSha256),
    receipt = {
      id: "synthetic-custom-policy-has-no-hydration-capability",
      datasetSha256: rawSha256,
      source: data.source,
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      logicalSha256: "1".repeat(64),
      logicalBytes: 1,
      compressedSha256: "2".repeat(64),
      compressedBytes: 1,
      url: "/synthetic.gz",
    },
    policy = {
      receipts: [receipt],
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    };
  assert.notEqual(rawSha256, progressiveSha256(canonical));
  assert.equal(publishedRouteCellReceipt(data, policy), undefined);
  receipt.datasetSha256 = progressiveSha256(canonical);
  assert.equal(publishedRouteCellReceipt(data, policy), receipt);
});
test("frozen checked visitor data retains the ordinary complete validation and route result when no cache is admitted", () => {
  const { original, bytes, digest } = fixture(),
    data = parseVerifiedRoutingDataset(bytes, digest),
    normal = createVerifiedProgressiveRouteCalculator(original),
    frozen = createVerifiedProgressiveRouteCalculator(data);
  for (const mode of ["public", "accessible"] as const)
    assert.deepEqual(frozen("0", "1", mode), normal("0", "1", mode));
});
