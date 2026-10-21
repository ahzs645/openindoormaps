import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  symlink,
  writeFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  persistUnacceptedRegenerationArchive,
  copyCheckedRegenerationArchive,
  createFinalRegenerationPreservationChecks,
} from "../../scripts/indoor/native-regeneration-phase-io";
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

test("unaccepted exports persist exact bytes and exclusive streaming final copies", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "native-phase-io-"));
  try {
    const bytes = Uint8Array.from([0, 255, 3, 7, 19]);
    const artifact = await persistUnacceptedRegenerationArchive(
      directory,
      "master",
      bytes,
      { compiledDatasetEntrySha256: "a".repeat(64) },
    );
    assert.equal(artifact.sha256, sha(bytes));
    assert.deepEqual(new Uint8Array(await readFile(artifact.path)), bytes);
    const metadata = JSON.parse(await readFile(artifact.metadataPath, "utf8"));
    assert.equal(metadata.accepted, false);
    assert.equal(metadata.validationAuthorityRestored, false);
    assert.equal(metadata.bytes, bytes.length);
    assert.equal(metadata.sha256, sha(bytes));
    assert.deepEqual(metadata.context, {
      compiledDatasetEntrySha256: "a".repeat(64),
    });
    await assert.rejects(
      persistUnacceptedRegenerationArchive(directory, "master", bytes),
      /EEXIST/,
    );
    const final = path.join(directory, "final.zip");
    await copyCheckedRegenerationArchive(artifact, final);
    assert.deepEqual(new Uint8Array(await readFile(final)), bytes);
    await assert.rejects(
      copyCheckedRegenerationArchive(artifact, final),
      /EEXIST/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("changed candidate bytes fail their final streaming checksum", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "native-phase-change-"),
  );
  try {
    const artifact = await persistUnacceptedRegenerationArchive(
      directory,
      "viewer",
      Uint8Array.from([1, 2, 3]),
    );
    await writeFile(artifact.path, Uint8Array.from([1, 2, 4]));
    await assert.rejects(
      copyCheckedRegenerationArchive(
        artifact,
        path.join(directory, "final.zip"),
      ),
      /metadata changed/,
    );
    const now = await lstat(artifact.path, { bigint: true });
    const changed = {
      ...artifact,
      identity: {
        device: String(now.dev),
        inode: String(now.ino),
        bytes: Number(now.size),
        mtimeNs: String(now.mtimeNs),
        ctimeNs: String(now.ctimeNs),
      },
    };
    await assert.rejects(
      copyCheckedRegenerationArchive(
        changed,
        path.join(directory, "corrupt-final.zip"),
      ),
      /bytes changed/,
    );
    await assert.rejects(
      lstat(path.join(directory, "corrupt-final.zip")),
      /ENOENT/,
    );
    assert.equal(
      (await readdir(directory)).some((name) =>
        name.includes("unaccepted-copy-"),
      ),
      false,
    );
    await writeFile(artifact.path, Uint8Array.from([1]));
    await assert.rejects(
      copyCheckedRegenerationArchive(
        artifact,
        path.join(directory, "truncated-final.zip"),
      ),
      /metadata changed/,
    );
    await assert.rejects(
      lstat(path.join(directory, "truncated-final.zip")),
      /ENOENT/,
    );
    const metadata = JSON.parse(await readFile(artifact.metadataPath, "utf8"));
    assert.equal(metadata.accepted, false);
    assert.equal(metadata.validationAuthorityRestored, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("late checks preserve bare original callbacks, drawing, archive and both review byte checks", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "native-phase-late-"));
  try {
    const source = path.join(directory, "original.zip"),
      baseReview = path.join(directory, "base.json"),
      doorReview = path.join(directory, "door.json"),
      drawing = path.join(directory, "drawing.json");
    const sourceBytes = Buffer.from("exact synthetic original archive"),
      baseBytes = Buffer.from("exact synthetic base review"),
      doorBytes = Buffer.from("exact synthetic door review"),
      drawingBytes = Buffer.from('{ "original": [1, 2, 3] }');
    await writeFile(source, sourceBytes);
    await writeFile(baseReview, baseBytes);
    await writeFile(doorReview, doorBytes);
    await writeFile(drawing, drawingBytes);
    const calls: string[] = [];
    const checks = createFinalRegenerationPreservationChecks({
      doorAssert: () => {
        calls.push("door");
      },
      stairBase: {
        assertUnchanged: () => {
          calls.push("base");
        },
        drawingCanonicalSha256: sha(
          JSON.stringify(JSON.parse(drawingBytes.toString("utf8"))),
        ),
        drawingInput: drawingBytes,
        drawingPath: drawing,
        drawingFileSha256: sha(drawingBytes),
        inputPath: source,
        inputArchiveSha256: sha(sourceBytes),
        reviewPath: baseReview,
        reviewBytes: baseBytes,
      },
      doorReview: { path: doorReview, bytes: doorBytes },
    });
    await checks();
    assert.deepEqual(calls, ["door", "base"]);
    for (const [file, original, message] of [
      [drawing, drawingBytes, /drawing review file changed/],
      [source, sourceBytes, /source archive changed/],
      [baseReview, baseBytes, /stair-base locator review changed/],
      [doorReview, doorBytes, /standing locator review changed/],
    ] as const) {
      await writeFile(file, Buffer.from("changed"));
      await assert.rejects(checks(), message);
      await writeFile(file, original);
    }
    drawingBytes[3] ^= 1;
    await assert.rejects(checks());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("late source callback refusal remains a refusal with no later callback work", async () => {
  const calls: string[] = [];
  const checks = createFinalRegenerationPreservationChecks({
    doorAssert: () => {
      calls.push("door");
      throw new Error("original source mutated");
    },
  });
  await assert.rejects(checks(), /original source mutated/);
  assert.deepEqual(calls, ["door"]);
});

test("streaming copy refuses symlink source aliases without touching final names", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "native-phase-link-"));
  try {
    const artifact = await persistUnacceptedRegenerationArchive(
      directory,
      "master",
      Uint8Array.from([1, 2, 3]),
    );
    const alias = path.join(directory, "alias.zip"),
      final = path.join(directory, "final.zip");
    await symlink(artifact.path, alias);
    await assert.rejects(
      copyCheckedRegenerationArchive({ ...artifact, path: alias }, final),
      /ELOOP/,
    );
    await assert.rejects(lstat(final), /ENOENT/);
    assert.deepEqual(
      new Uint8Array(await readFile(artifact.path)),
      Uint8Array.from([1, 2, 3]),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
