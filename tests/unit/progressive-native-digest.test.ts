import test from "node:test";
import assert from "node:assert/strict";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import {
  progressiveSha256,
  progressiveSha256Async,
  verifyProgressiveAssetBytesAsync,
  type ProgressiveAsset,
} from "../../app/indoor-project/progressive-delivery";
import {
  parseVerifiedRoutingDataset,
  parseVerifiedRoutingDatasetAsync,
  verifiedRoutingDatasetSha256,
  isPrivateImmutableRoutingDataset,
} from "../../app/indoor-project/verified-routing-dataset";

const samples = [
  new Uint8Array(0),
  new TextEncoder().encode("abc"),
  new Uint8Array(1_000_003).map((_, i) => (i * 31) & 255),
];

test("the native digest is the same SHA-256 as the portable digest", async () => {
  assert(globalThis.crypto?.subtle, "this test needs WebCrypto");
  for (const bytes of samples)
    assert.equal(await progressiveSha256Async(bytes), progressiveSha256(bytes));
  // A view of part of a larger buffer digests only its own bytes.
  const whole = samples[2]!;
  const view = whole.subarray(17, 50_017);
  assert.equal(await progressiveSha256Async(view), progressiveSha256(view));
});

test("without WebCrypto the identical portable digest is used", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });
  try {
    for (const bytes of samples)
      assert.equal(
        await progressiveSha256Async(bytes),
        progressiveSha256(bytes),
      );
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});

test("the native logical asset check keeps its length and checksum requirement", async () => {
  const bytes = samples[2]!;
  const asset = {
    logicalBytes: bytes.length,
    logicalSha256: progressiveSha256(bytes),
  } as ProgressiveAsset;
  await verifyProgressiveAssetBytesAsync(asset, bytes);
  await assert.rejects(
    verifyProgressiveAssetBytesAsync(asset, bytes.subarray(1)),
    /checksum\/length mismatch/,
  );
  const changed = bytes.slice();
  changed[5] ^= 1;
  await assert.rejects(
    verifyProgressiveAssetBytesAsync(asset, changed),
    /checksum\/length mismatch/,
  );
});

test("the native verified parser attests exactly what the synchronous parser does", async () => {
  const original = progressiveRoutingFixture();
  const bytes = new TextEncoder().encode(JSON.stringify(original));
  const digest = progressiveSha256(bytes);
  const asyncData = await parseVerifiedRoutingDatasetAsync(bytes, digest);
  const syncData = parseVerifiedRoutingDataset(bytes, digest);
  assert.deepEqual(asyncData, syncData);
  assert.deepEqual(asyncData, original);
  assert.equal(verifiedRoutingDatasetSha256(asyncData), digest);
  assert(isPrivateImmutableRoutingDataset(asyncData));
  assert(Object.isFrozen(asyncData.records[0].ringsFeet[0][0]));
  // Later changes to the source bytes cannot alter the parsed graph.
  bytes.fill(0);
  assert.deepEqual(asyncData, original);
});

test("the native verified parser refuses wrong checksums, shared storage and invalid text", async () => {
  const original = progressiveRoutingFixture();
  const bytes = new TextEncoder().encode(JSON.stringify(original));
  const digest = progressiveSha256(bytes);
  await assert.rejects(
    parseVerifiedRoutingDatasetAsync(bytes, "0".repeat(64)),
    /checksum mismatch/,
  );
  await assert.rejects(
    parseVerifiedRoutingDatasetAsync(bytes, digest.toUpperCase()),
    /checksum mismatch/,
  );
  const changed = bytes.slice();
  changed[changed.length - 2] ^= 1;
  await assert.rejects(
    parseVerifiedRoutingDatasetAsync(changed, digest),
    /checksum mismatch/,
  );
  const shared = new Uint8Array(new SharedArrayBuffer(bytes.length));
  shared.set(bytes);
  await assert.rejects(
    parseVerifiedRoutingDatasetAsync(shared, digest),
    /unshared source bytes/,
  );
  // Invalid UTF-8 with its own correct checksum still refuses.
  const invalid = new Uint8Array([0x7b, 0xff, 0x7d]);
  await assert.rejects(
    parseVerifiedRoutingDatasetAsync(invalid, progressiveSha256(invalid)),
    TypeError,
  );
  // Invalid UTF-8 with a wrong checksum reports the checksum first.
  await assert.rejects(
    parseVerifiedRoutingDatasetAsync(invalid, digest),
    /checksum mismatch/,
  );
  // JSON number overflow refuses, as in the synchronous parser.
  const overflow = new TextEncoder().encode(
    JSON.stringify(original).replace(/^\{/, '{"extra":1e400,'),
  );
  await assert.rejects(
    parseVerifiedRoutingDatasetAsync(overflow, progressiveSha256(overflow)),
  );
});
