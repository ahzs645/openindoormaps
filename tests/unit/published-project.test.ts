import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import type { IndoorProject } from "../../app/indoor-project/package";
import {
  tryReadPublishedProject,
  type PublishedProjectReceipt,
} from "../../app/indoor-project/published-project";
import {
  visitorRuntimeProject,
  projectRuntimeTransfers,
} from "../../app/indoor-project/visitor-project-runtime";
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
test("visitor import releases checked JSON bytes while retaining exact decoded values and receipt", async () => {
  const f = fixture();
  const result = await tryReadPublishedProject(f.bytes, undefined, f.policy, {
    retainArchiveFiles: false,
  });
  assert(result);
  assert.deepEqual(result.project.dataset, f.dataset);
  assert.deepEqual(result.project.rooms, f.rooms);
  assert.deepEqual(result.project.manifest, f.manifest);
  assert.equal(result.receipt, f.receipt);
  assert.deepEqual(result.project.files, {});
  assert.deepEqual(projectRuntimeTransfers(result.project), []);
  assert.equal(digest(f.bytes), f.receipt.packageSha256);

  // Releasing runtime files must never weaken the checked-entry hash gate.
  const corrupt = structuredClone(f.receipt);
  corrupt.entries["viewer/metadata.json"].sha256 = "0".repeat(64);
  await assert.rejects(
    tryReadPublishedProject(
      f.bytes,
      undefined,
      { ...f.policy, receipts: [corrupt] },
      { retainArchiveFiles: false },
    ),
    /checksum/,
  );
});
test("visitor runtime keeps prepared blobs transferable and leaves source archive bytes intact", async () => {
  const f = fixture();
  const imported = await tryReadPublishedProject(f.bytes, undefined, f.policy);
  assert(imported);
  const display = new Uint8Array([4, 5, 6]);
  const project = {
    ...imported.project,
    preparedDisplay: {
      version: 1 as const,
      descriptors: [],
      blobs: { display, shared: display.subarray(1) },
    },
  };
  const runtime = visitorRuntimeProject(project);
  assert.deepEqual(runtime.files, {});
  assert.equal(runtime.dataset, project.dataset);
  assert.equal(runtime.rooms, project.rooms);
  assert.equal(runtime.preparedDisplay, project.preparedDisplay);
  assert.deepEqual(projectRuntimeTransfers(runtime), [display.buffer]);
  assert.deepEqual(project.files, f.files);

  const source: IndoorProject = {
    ...project,
    manifest: {
      ...project.manifest,
      format: "reviter-project",
      version: 2,
    } as IndoorProject["manifest"],
    scene: display,
  };
  assert.equal(visitorRuntimeProject(source), source);
  const transfers = projectRuntimeTransfers(source);
  assert.equal(transfers.length, Object.keys(source.files).length + 1);
  assert.equal(new Set(transfers).size, transfers.length);
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
