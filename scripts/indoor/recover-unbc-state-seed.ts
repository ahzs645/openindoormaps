/** Lossless data restoration seed only. Recreates no geometry/validation authority.
 * Usage: recover-unbc-state-seed.ts TASK_ROOT NEW-seed.bin
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { serialize } from "node:v8";
import path from "node:path";
import { unzipSync } from "fflate";
import { hydrateRoomNativeMaterials } from "../../../reviter/lib/reviter/native-material-wire.ts";
import { unpackReviewBundle } from "../../../reviter/lib/reviter/review-bundle-wire.ts";
const root = path.resolve(process.argv[2]!),
  output = path.resolve(process.argv[3]!),
  hash = (b: Uint8Array | string) =>
    createHash("sha256").update(b).digest("hex");
const master = await readFile(
  path.resolve(
    root,
    "../unbc-recovery-20261017/UNBC.master.20261014.reviter.zip",
  ),
);
assert.equal(
  hash(master),
  "13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520",
);
const files = unzipSync(master, {
  filter: (f) =>
    [
      "floors/rooms.json",
      "review/companions.bin",
      "viewer/indoor.json",
      "manifest.json",
    ].includes(f.name),
});
const decoder = new TextDecoder();
const rooms = await hydrateRoomNativeMaterials(
  JSON.parse(decoder.decode(files["floors/rooms.json"])),
);
rooms.reviewBundle = await unpackReviewBundle(rooms.reviewBundle, files);
const data = JSON.parse(decoder.decode(files["viewer/indoor.json"]));
delete data.nativeExploreMapping;
const wire = Buffer.from(JSON.stringify(data));
assert.equal(
  hash(wire),
  "4f814aca91b3550186953f101824ce9f6528b1994a391760cbfed26e3312931d",
);
const context = await hydrateRoomNativeMaterials(
  JSON.parse(wire.toString("utf8")),
);
const receipt = JSON.parse(
  await readFile(
    path.join(root, "materials/reissued/material-regeneration-receipt.json"),
    "utf8",
  ),
);
const seed = serialize({
  rooms,
  context,
  modelSha: "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
  sourceRoomsSha256: hash(files["floors/rooms.json"]!),
  nativeCacheSha256: receipt.result.sha256,
});
await writeFile(output, seed, { flag: "wx" });
await writeFile(
  output + ".json",
  JSON.stringify(
    {
      format: "unbc-source-state-restoration-seed-v1",
      node: process.version,
      bytes: seed.length,
      sha256: hash(seed),
      originalMasterSha256: hash(master),
      originalRoomsSha256: hash(files["floors/rooms.json"]!),
      originalDatasetSha256: hash(wire),
      nativeCacheSha256: receipt.result.sha256,
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
