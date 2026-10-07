import test from "node:test";
import assert from "node:assert/strict";
import { validateReviewBundle } from "../../app/indoor-project/review-bundle";
test("a growing geometry investigation retains 1000 checksummed companions within the existing byte limits", () => {
  const bundle = {
    version: 1,
    masterSha256: "a".repeat(64),
    files: Array.from({ length: 1000 }, (_, i) => ({
      path: `review-recommendations/evidence-${i}.${i % 2 ? "log" : "json"}`,
      bytes: 0,
      sha256: "b".repeat(64),
      compressedBase64: "",
    })),
  };
  assert.doesNotThrow(() => validateReviewBundle(bundle));
  assert.throws(() =>
    validateReviewBundle({
      ...bundle,
      files: [{ ...bundle.files[0], path: "../unsafe.log" }],
    }),
  );
  assert.throws(() =>
    validateReviewBundle({
      ...bundle,
      files: [{ ...bundle.files[0], path: "executable.html" }],
    }),
  );
  assert.throws(() =>
    validateReviewBundle({
      ...bundle,
      files: Array.from({ length: 1001 }, (_, i) => ({
        ...bundle.files[0],
        path: `review-recommendations/evidence-${i}.json`,
      })),
    }),
  );
  assert.throws(() =>
    validateReviewBundle({
      ...bundle,
      files: bundle.files.map((f) => ({ ...f, bytes: 2 * 1024 * 1024 })),
    }),
  );
});
test("a master over 64 MiB retains review history within the 256 MiB aggregate bound", () => {
  const bundle = {
    version: 1,
    masterSha256: "a".repeat(64),
    files: [32, 32, 32, 32, 6].map((mib, i) => ({
      path: `review/history-${i}.json`,
      bytes: mib * 1024 * 1024,
      sha256: "b".repeat(64),
      compressedBase64: "",
    })),
  };
  assert.doesNotThrow(() => validateReviewBundle(bundle));
  assert.throws(() =>
    validateReviewBundle({
      ...bundle,
      files: [32, 32, 32, 32, 32, 32, 32, 32, 1].map((mib, i) => ({
        ...bundle.files[0],
        path: `review/too-large-${i}.json`,
        bytes: mib * 1024 * 1024,
      })),
    }),
  );
  assert.throws(() =>
    validateReviewBundle({
      ...bundle,
      files: [{ ...bundle.files[0], bytes: 33 * 1024 * 1024 }],
    }),
  );
});

test("1000 companions retain exact history through both codecs, master ZIP and folder import", async () => {
  const { createHash } = await import("node:crypto");
  const { deflateSync } = await import("fflate");
  const { project: fixtureProject } = await import(
    "../fixtures/native-area-project"
  );
  const { exportIndoorProject, readIndoorProject } = await import(
    "../../app/indoor-project/package"
  );
  const { packReviewBundle, unpackReviewBundle } = await import(
    "../../app/indoor-project/review-bundle-wire"
  );
  const sibling = await import(
    "../../../reviter/lib/reviter/review-bundle-wire"
  );
  const siblingCore = await import(
    "../../../reviter/lib/reviter/review-bundle-core"
  );
  const { readProjectFolder, reviewFileBytes, MAX_REVIEW_FILES } = await import(
    "../../app/indoor-project/review-bundle"
  );
  assert.equal(MAX_REVIEW_FILES, 1000);
  const { MAX_REVIEW_BYTES } = await import(
    "../../app/indoor-project/review-bundle"
  );
  const runtimeWire = await import(
    "../../app/indoor-project/review-bundle-wire"
  );
  assert.equal(MAX_REVIEW_BYTES, 256 * 1024 * 1024);
  assert.equal(siblingCore.MAX_REVIEW_BYTES, MAX_REVIEW_BYTES);
  assert.equal(
    runtimeWire.REVIEW_BUNDLE_ARCHIVE_LIMIT,
    MAX_REVIEW_BYTES + 1024 * 1024,
  );
  assert.equal(
    sibling.REVIEW_BUNDLE_ARCHIVE_LIMIT,
    runtimeWire.REVIEW_BUNDLE_ARCHIVE_LIMIT,
  );
  assert.equal(siblingCore.MAX_REVIEW_FILES, MAX_REVIEW_FILES);
  const hash = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const bundle = {
    version: 1 as const,
    masterSha256: "a".repeat(64),
    files: Array.from({ length: MAX_REVIEW_FILES }, (_, i) => {
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          index: i,
          evidence: "Original room evidence and human reply " + i,
        }),
      );
      return {
        path: `review-recommendations/history/evidence-${i}.json`,
        bytes: bytes.length,
        sha256: hash(bytes),
        compressedBase64: Buffer.from(deflateSync(bytes)).toString("base64"),
      };
    }),
  };
  assert.deepEqual(
    await unpackReviewBundle(await packReviewBundle(bundle)),
    bundle,
  );
  assert.deepEqual(
    await sibling.unpackReviewBundle(await packReviewBundle(bundle)),
    bundle,
  );
  assert.deepEqual(
    await unpackReviewBundle(await sibling.packReviewBundle(bundle)),
    bundle,
  );
  const overCount = {
    ...bundle,
    files: [
      ...bundle.files,
      { ...bundle.files[0], path: "review-recommendations/history/extra.json" },
    ],
  };
  assert.throws(() => siblingCore.validateReviewBundle(overCount));
  await assert.rejects(packReviewBundle(overCount));
  await assert.rejects(sibling.packReviewBundle(overCount));
  const project = await fixtureProject();
  project.rooms.reviewBundle = bundle;
  const master = await exportIndoorProject(project);
  const restored = await readIndoorProject(master);
  assert.deepEqual(restored.rooms.reviewBundle, bundle);
  assert.deepEqual(restored.dataset.records, project.dataset.records);
  assert.deepEqual(restored.dataset.edges, project.dataset.edges);
  const manifest = {
    format: "openindoormaps-review-companion",
    version: 1,
    masterFile: "test.reviter.zip",
    masterSha256: hash(master),
    files: bundle.files.map((f) => ({
      file: f.path.replace("review-recommendations/", ""),
      bytes: f.bytes,
      sha256: f.sha256,
    })),
  };
  const file = (path: string, bytes: Uint8Array) => ({
    name: path.split("/").at(-1)!,
    webkitRelativePath: "Master/" + path,
    size: bytes.length,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });
  const manifestFile = (value: unknown) =>
    file(
      "review-recommendations/manifest.json",
      new TextEncoder().encode(JSON.stringify(value)),
    );
  const companionFiles = bundle.files.map((f) =>
    file(f.path, reviewFileBytes(f)),
  );
  const folder = await readProjectFolder([
    file("test.reviter.zip", master),
    manifestFile(manifest),
    ...companionFiles,
  ]);
  assert.deepEqual(folder.project.rooms.reviewBundle!.files, bundle.files);
  assert.deepEqual(folder.project.dataset.records, project.dataset.records);
  assert.deepEqual(folder.project.dataset.edges, project.dataset.edges);
  await assert.rejects(
    readProjectFolder([
      file("test.reviter.zip", master),
      manifestFile({
        ...manifest,
        files: [
          ...manifest.files,
          { ...manifest.files[0], file: "history/extra.json" },
        ],
      }),
      ...companionFiles,
    ]),
    /Invalid master folder manifest/,
  );
});

test("folder import preserves the master namespaces for saved replies and evidence references", async () => {
  const { gapProject } = await import("../fixtures/native-area-project");
  const { saveReviewCompanion } = await import(
    "../../app/indoor-project/review-companion-save"
  );
  const { exportIndoorProject } = await import(
    "../../app/indoor-project/package"
  );
  const { readProjectFolder, reviewFileBytes } = await import(
    "../../app/indoor-project/review-bundle"
  );
  const { createHash } = await import("node:crypto");
  let project = await gapProject();
  project = await saveReviewCompanion(
    project,
    "review-recommendations/evidence/native.json",
    { wall: 200 },
  );
  project = await saveReviewCompanion(project, "pin-review/decisions.json", {
    decision: "accept",
  });
  const bytes = await exportIndoorProject(project);
  const files = project.rooms.reviewBundle!.files;
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      format: "openindoormaps-review-companion",
      version: 1,
      masterFile: "test.reviter.zip",
      masterSha256: createHash("sha256").update(bytes).digest("hex"),
      files: files.map((f) => ({
        file: f.path.replace("review-recommendations/", ""),
        bytes: f.bytes,
        sha256: f.sha256,
      })),
    }),
  );
  const file = (path: string, bytes: Uint8Array) => ({
    name: path.split("/").at(-1)!,
    webkitRelativePath: "Master/" + path,
    size: bytes.length,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });
  const restored = await readProjectFolder([
    file("test.reviter.zip", bytes),
    file("review-recommendations/manifest.json", manifest),
    file("provenance/older/review-recommendations/manifest.json", manifest),
    ...files.map((f) =>
      file(
        "review-recommendations/" +
          f.path.replace("review-recommendations/", ""),
        reviewFileBytes(f),
      ),
    ),
  ]);
  assert.deepEqual(
    restored.project.rooms.reviewBundle!.files.map((f) => f.path),
    files.map((f) => f.path),
  );
  assert.deepEqual(
    restored.project.rooms.reviewBundle!.files.map((f) => f.sha256),
    files.map((f) => f.sha256),
  );
});
