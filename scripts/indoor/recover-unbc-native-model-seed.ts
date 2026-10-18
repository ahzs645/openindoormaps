/** Exact V8 data seed from the already verified enriched JSON cache. No source
 * capability or geometry/route authority is restored. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { serialize } from "node:v8";
const [input, output] = process.argv.slice(2),
  hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
assert(input && output, "native-cache.json NEW-seed.bin required");
const bytes = await readFile(input);
assert.equal(
  hash(bytes),
  "bfc1f2611d233c593b0749e0d48ff357ab2d105cf1a7878ea847a96cece446fb",
);
const cache = JSON.parse(bytes.toString("utf8"));
assert.equal(
  cache.sourceModelSha256,
  "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
);
const seed = serialize(cache.nativeModel);
await writeFile(output, seed, { flag: "wx" });
await writeFile(
  output + ".json",
  JSON.stringify(
    {
      format: "native-model-restoration-seed-v1",
      node: process.version,
      nativeCacheSha256: hash(bytes),
      bytes: seed.length,
      sha256: hash(seed),
      validationAuthorityRestored: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    bytes: seed.length,
    sha256: hash(seed),
    validationAuthorityRestored: false,
  }),
);
