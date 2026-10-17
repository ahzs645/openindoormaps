import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import nodePath from "node:path";
import { spawnSync } from "node:child_process";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { boundedInflate } from "../../app/indoor-project/review-bundle-inflate";
import { MAX_REVIEW_CONTAINER_BYTES } from "../../app/indoor-project/review-bundle-limits";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const binary = (length: number) => {
  let state = 0x42_f0_e1_eb;
  return Uint8Array.from({ length }, (_, i) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return i % 65_536 < 1024 ? state & 255 : i % 97 & 255;
  });
};

test("bounded inflation preserves empty, stored and Huffman streams across input/window boundaries", () => {
  for (const length of [0, 1, 1023, 32_768, 65_535, 65_536, 2 * 1024 * 1024]) {
    const original = binary(length);
    for (const level of [0, 1, 9] as const) {
      const compressed = deflateRawSync(original, { level });
      assert.deepEqual(boundedInflate(compressed, length), original);
    }
  }
});

test("bounds reject invalid declarations, missing output, overruns and truncated/invalid blocks", () => {
  const original = binary(128 * 1024),
    compressed = deflateRawSync(original, { level: 0 });
  for (const expected of [
    -1,
    0.5,
    Number.NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
    MAX_REVIEW_CONTAINER_BYTES + 1,
    original.length - 1,
    original.length + 1,
  ])
    assert.throws(() => boundedInflate(compressed, expected), /Invalid packed/);
  for (const length of [1, 1023, 65_535, compressed.length - 3])
    assert.throws(
      () => boundedInflate(compressed.subarray(0, length), original.length),
      /Invalid packed/,
    );
  assert.throws(() => boundedInflate(Uint8Array.of(7), 0), /Invalid packed/);
  // A failed stream cannot leave state behind for the next independent file.
  assert.deepEqual(boundedInflate(compressed, original.length), original);
});

test("an undeclared expansion is rejected without allocating its full bomb output", () => {
  // Load fflate after instrumenting its captured Uint8Array constructor in a
  // fresh process. This detects a naive fixed64KiB push that expands the whole
  //64MiB bomb before the output callback can enforce a tiny declared size.
  const source = `
    import assert from 'node:assert/strict';
    import { deflateRawSync } from 'node:zlib';
    const bomb = deflateRawSync(Buffer.alloc(64 * 1024 * 1024), { level: 9 });
    const Native = globalThis.Uint8Array;
    let largest = 0;
    globalThis.Uint8Array = new Proxy(Native, {
      construct(target, args, receiver) {
        if (typeof args[0] === 'number') largest = Math.max(largest, args[0]);
        return Reflect.construct(target, args, receiver);
      }
    });
    const { boundedInflate } = await import('./app/indoor-project/review-bundle-inflate.ts');
    for (const declared of [0, 10, 4 * 1024 * 1024]) {
      largest = 0;
      assert.throws(() => boundedInflate(bomb, declared), /Invalid packed/);
      assert.ok(largest <= 2 * (declared + 2 * 1024 * 1024),
        'decoder allocated ' + largest + ' bytes for declared output ' + declared);
    }
    console.log(JSON.stringify({ passed: true }));
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", source],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  assert.match(child.stdout, /"passed":true/);
});

const fixtureDirectory = process.env.UNBC_REVIEW_INFLATE_FIXTURE_DIR;
test(
  "actual canonical companion decodes byte-for-byte against independent zlib and original source digests",
  { skip: !fixtureDirectory },
  () => {
    const descriptor = JSON.parse(
      readFileSync(nodePath.join(fixtureDirectory!, "descriptor.json"), "utf8"),
    );
    const compressed = readFileSync(
      nodePath.join(fixtureDirectory!, "canonical-review-companions.deflate"),
    );
    assert.equal(
      sha(compressed),
      "a44aaedef303831b5311a4e04faa14e910cec09837466be6909d93e488f85f8a",
    );
    assert.equal(descriptor.bytes, 188_604_402);
    const output = boundedInflate(compressed, descriptor.bytes);
    assert.equal(
      sha(output),
      "6746d67473c6227cf47f75bfc1265c54a113f1ea436ff2d088a45d30181355e3",
    );
    const independentlyDecoded = inflateRawSync(compressed, {
      maxOutputLength: descriptor.bytes,
    });
    assert.equal(Buffer.compare(output, independentlyDecoded), 0);
  },
);
