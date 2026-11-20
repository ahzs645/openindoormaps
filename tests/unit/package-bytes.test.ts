import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  packageBytesSha256,
  packageBytesBase64,
  packageBase64Bytes,
  packageBase64Matches,
  samePackageBytes,
} from "../../app/indoor-project/package-bytes";

test("package hash covers the exact subarray and snapshots before later mutation", async () => {
  const source = new Uint8Array([91, 1, 2, 3, 92]);
  const view = source.subarray(1, 4);
  const expected = createHash("sha256").update(view).digest("hex");
  const result = packageBytesSha256(view);
  view.fill(9);
  assert.equal(await result, expected);
  const shared = new Uint8Array(new SharedArrayBuffer(5));
  shared.set([91, 1, 2, 3, 92]);
  const sharedResult = packageBytesSha256(shared.subarray(1, 4));
  shared.fill(0);
  assert.equal(await sharedResult, expected);
  // Buffer is a Uint8Array whose slice returns another shared view. The
  // exceptional fallback must still create an ordinary owned byte snapshot.
  shared.set([91, 1, 2, 3, 92]);
  const sharedBufferResult = packageBytesSha256(
    Buffer.from(shared.buffer).subarray(1, 4),
  );
  shared.fill(0);
  assert.equal(await sharedBufferResult, expected);
});

test("chunked base64 preserves every byte, offsets and final padding across chunk boundaries", () => {
  for (const length of [
    0, 1, 2, 3, 8191, 8192, 24_575, 24_576, 24_577, 65_537,
  ]) {
    const backing = Uint8Array.from({ length: length + 2 }, (_, i) => i % 251);
    const bytes = backing.subarray(1, length + 1);
    const expected = Buffer.from(bytes).toString("base64");
    assert.equal(packageBytesBase64(bytes), expected, String(length));
    assert.deepEqual(packageBase64Bytes(expected), bytes, String(length));
    assert.equal(packageBase64Matches(bytes, expected), true);
    assert.equal(samePackageBytes(bytes, packageBase64Bytes(expected)), true);
    assert.equal(
      samePackageBytes(bytes, new Uint8Array(bytes.length + 1)),
      false,
    );
    if (length) {
      const changed = bytes.slice();
      changed[changed.length - 1] ^= 1;
      assert.equal(packageBase64Matches(changed, expected), false);
      assert.equal(samePackageBytes(bytes, changed), false);
    }
  }
});

test("base64 decoding retains atob compatibility while canonical comparison rejects alternate spelling", () => {
  for (const text of [
    "",
    "YQ==",
    "YQ",
    "YR==",
    "YWE",
    "YWF=",
    " YQ\t=\r=\n\f",
  ]) {
    const expected = Uint8Array.from(atob(text), (c) => c.codePointAt(0)!);
    const bytes = packageBase64Bytes(text);
    assert.deepEqual(bytes, expected, text);
    assert.equal(
      packageBase64Matches(bytes, text),
      Buffer.from(bytes).toString("base64") === text,
    );
  }
  for (const text of [
    "A",
    "YQ=",
    "Y===",
    "====",
    "YQ==x",
    "YQ==\u00A0",
    "YW$=",
  ]) {
    assert.throws(() => atob(text));
    assert.throws(() => packageBase64Bytes(text));
  }
});

test("large base64 values never pass a whole-entry binary string through atob or btoa", () => {
  const bytes = Uint8Array.from({ length: 1024 * 1024 + 2 }, (_, i) => i % 251);
  const nativeAtob = globalThis.atob,
    nativeBtoa = globalThis.btoa;
  let maxDecode = 0,
    maxEncode = 0;
  globalThis.atob = (text) => {
    maxDecode = Math.max(maxDecode, text.length);
    return nativeAtob(text);
  };
  globalThis.btoa = (text) => {
    maxEncode = Math.max(maxEncode, text.length);
    return nativeBtoa(text);
  };
  try {
    const text = packageBytesBase64(bytes);
    assert.deepEqual(packageBase64Bytes(text), bytes);
    assert.equal(packageBase64Matches(bytes, text), true);
    assert.ok(maxDecode > 0 && maxDecode <= 64 * 1024);
    assert.ok(maxEncode > 0 && maxEncode <= 64 * 1024);
  } finally {
    globalThis.atob = nativeAtob;
    globalThis.btoa = nativeBtoa;
  }
});
