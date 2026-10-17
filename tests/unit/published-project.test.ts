import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import {
  tryReadPublishedProject,
  type PublishedProjectReceipt,
} from "../../app/indoor-project/published-project";
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const source = {
    modelFileName: "test.rvt",
    modelSha256: "1".repeat(64),
    roomsSha256: "2".repeat(64),
  };
  const dataset = {
    format: "reviter-indoor",
    version: 1,
    source,
    records: [
      {
        key: "room-a",
        ringsFeet: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
          ],
        ],
      },
    ],
    floors: [{ id: "combined", levelIds: [10, 20] }],
  };
  const rooms = {
    format: "openindoormaps-viewer-metadata",
    version: 1,
    model: { fileName: source.modelFileName },
    annotations: [{ key: "room-a" }],
  };
  const files: Record<string, Uint8Array> = {
    "viewer/indoor.json": strToU8(JSON.stringify(dataset)),
    "viewer/metadata.json": strToU8(JSON.stringify(rooms)),
    "gis/reference-points.json": strToU8("{}"),
  };
  const entry = (path: string) => ({
    path,
    bytes: files[path].length,
    sha256: digest(files[path]),
  });
  const manifest = {
    format: "openindoormaps-viewer",
    version: 1,
    model: { fileName: source.modelFileName, sha256: source.modelSha256 },
    sourceRoomsSha256: source.roomsSha256,
    views: ["2d", "3d"],
    indoor: entry("viewer/indoor.json"),
    floors: entry("viewer/metadata.json"),
    georeference: entry("gis/reference-points.json"),
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  const bytes = zipSync(files);
  const receipt: PublishedProjectReceipt = {
    id: "test-publication",
    packageSha256: digest(bytes),
    packageBytes: bytes.length,
    validatorSha256: "3".repeat(64),
    datasetSha256: manifest.indoor.sha256,
    source,
    entries: Object.fromEntries(
      Object.entries(files).map(([path, value]) => [
        path,
        { bytes: value.length, sha256: digest(value) },
      ]),
    ),
    progressiveRevisionSha256: "4".repeat(64),
    validationReportSha256: "5".repeat(64),
    validationElapsedMs: 1,
  };
  return {
    bytes,
    receipt,
    files,
    dataset,
    rooms,
    manifest,
    policy: { receipts: [receipt], validatorSha256: receipt.validatorSha256 },
  };
}
test("compiled publication checks retain exact decoded geometry and metadata without rerunning geometry stages", async () => {
  const f = fixture(),
    stages: string[] = [];
  const result = await tryReadPublishedProject(
    f.bytes,
    (p) => stages.push(p.stage),
    f.policy,
  );
  assert(result);
  assert.deepEqual(result.project.dataset, f.dataset);
  assert.deepEqual(result.project.rooms, f.rooms);
  for (const [path, value] of Object.entries(f.files))
    assert.deepEqual(result.project.files[path], value);
  assert.deepEqual(stages, [
    "checksums",
    "archive",
    "decode",
    "identity",
    "transfer",
  ]);
});
test("unlisted, modified, and stale-validator packages receive no publication admission", async () => {
  const f = fixture();
  assert.equal(
    await tryReadPublishedProject(f.bytes, undefined, {
      ...f.policy,
      receipts: [],
    }),
    undefined,
  );
  assert.equal(
    await tryReadPublishedProject(f.bytes, undefined, {
      ...f.policy,
      validatorSha256: "0".repeat(64),
    }),
    undefined,
  );
  const changed = new Uint8Array(f.bytes);
  changed[changed.length - 1] ^= 1;
  assert.equal(
    await tryReadPublishedProject(changed, undefined, f.policy),
    undefined,
  );
  // A remote ZIP cannot nominate its own receipts; default policy is compiled.
  assert.equal(await tryReadPublishedProject(f.bytes), undefined);
});
test("inconsistent checked inventories, entry hashes and source identities fail explicitly", async () => {
  const f = fixture();
  const missing = structuredClone(f.receipt);
  delete missing.entries["viewer/metadata.json"];
  await assert.rejects(
    tryReadPublishedProject(f.bytes, undefined, {
      ...f.policy,
      receipts: [missing],
    }),
    /inventory/,
  );
  const corrupt = structuredClone(f.receipt);
  corrupt.entries["viewer/indoor.json"].sha256 = "0".repeat(64);
  await assert.rejects(
    tryReadPublishedProject(f.bytes, undefined, {
      ...f.policy,
      receipts: [corrupt],
    }),
    /checksum/,
  );
  const source = structuredClone(f.receipt);
  source.source.modelSha256 = "0".repeat(64);
  await assert.rejects(
    tryReadPublishedProject(f.bytes, undefined, {
      ...f.policy,
      receipts: [source],
    }),
    /identity/,
  );
});
