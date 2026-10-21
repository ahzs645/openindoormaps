import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, type BigIntStats } from "node:fs";
import { lstat, mkdir, open, link, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fileDigest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function fileIdentity(info: BigIntStats) {
  assert.ok(
    info.isFile() && !info.isSymbolicLink(),
    "Expected a regular candidate archive",
  );
  assert.ok(
    Number.isSafeInteger(Number(info.size)),
    "Unsafe candidate archive size",
  );
  return {
    device: String(info.dev),
    inode: String(info.ino),
    bytes: Number(info.size),
    mtimeNs: String(info.mtimeNs),
    ctimeNs: String(info.ctimeNs),
  };
}
export type UnacceptedRegenerationArchive = {
  path: string;
  metadataPath: string;
  bytes: number;
  sha256: string;
  identity: ReturnType<typeof fileIdentity>;
};
/** Retain phase-owned bytes in the separate diagnostic tree before expensive
 * normal imports. Scalar context pins are provenance, never validation authority. */
export async function persistUnacceptedRegenerationArchive(
  diagnosticRoot: string,
  role: "master" | "viewer",
  bytes: Uint8Array,
  context: Readonly<Record<string, string>> = {},
): Promise<UnacceptedRegenerationArchive> {
  const directory = path.join(diagnosticRoot, "unaccepted-exports");
  await mkdir(directory, { recursive: true });
  const pin = {
    path: path.join(directory, `${role}.zip`),
    metadataPath: path.join(directory, `${role}.json`),
    bytes: bytes.length,
    sha256: sha(bytes),
  };
  await writeFile(pin.path, bytes, { flag: "wx" });
  const identity = fileIdentity(await lstat(pin.path, { bigint: true }));
  const artifact = { ...pin, identity };
  assert.equal(
    sha(bytes),
    artifact.sha256,
    "Export bytes changed during persistence",
  );
  assert.equal(
    await fileDigest(artifact.path),
    artifact.sha256,
    "Persisted export bytes differ",
  );
  assert.deepEqual(
    fileIdentity(await lstat(artifact.path, { bigint: true })),
    identity,
    "Persisted export metadata changed",
  );
  await writeFile(
    artifact.metadataPath,
    JSON.stringify(
      {
        format: "native-regeneration-unaccepted-export-v1",
        role,
        bytes: artifact.bytes,
        sha256: artifact.sha256,
        identity: artifact.identity,
        context: { ...context },
        accepted: false,
        validationAuthorityRestored: false,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  return artifact;
}

/** Called only after all final validation. Copy into an owned temporary file,
 * verify complete bytes and stable identities, fsync, then link exclusively to
 * the final name. A failed copy never publishes its temporary bytes as final. */
export async function copyCheckedRegenerationArchive(
  artifact: UnacceptedRegenerationArchive,
  destination: string,
): Promise<void> {
  const temporary = `${destination}.unaccepted-copy-${randomUUID()}`;
  const source = await open(
    artifact.path,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let target: Awaited<ReturnType<typeof open>> | undefined;
  let temporaryCreated = false;
  try {
    const before = fileIdentity(await source.stat({ bigint: true }));
    assert.deepEqual(
      before,
      artifact.identity,
      "Candidate source metadata changed",
    );
    assert.deepEqual(
      fileIdentity(await lstat(artifact.path, { bigint: true })),
      before,
      "Candidate path identity changed",
    );
    target = await open(
      temporary,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o666,
    );
    temporaryCreated = true;
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of source.createReadStream({
      autoClose: false,
      start: 0,
    })) {
      hash.update(chunk);
      bytes += chunk.length;
      let offset = 0;
      while (offset < chunk.length) {
        const written = await target.write(
          chunk,
          offset,
          chunk.length - offset,
        );
        assert.ok(
          written.bytesWritten > 0,
          "Final archive copy made no progress",
        );
        offset += written.bytesWritten;
      }
    }
    assert.equal(
      bytes,
      artifact.bytes,
      "Final archive length changed during copy",
    );
    assert.equal(
      hash.digest("hex"),
      artifact.sha256,
      "Final archive bytes changed during copy",
    );
    assert.deepEqual(
      fileIdentity(await source.stat({ bigint: true })),
      before,
      "Candidate metadata changed during copy",
    );
    assert.deepEqual(
      fileIdentity(await lstat(artifact.path, { bigint: true })),
      before,
      "Candidate path changed during copy",
    );
    await target.sync();
    const temporaryIdentity = fileIdentity(await target.stat({ bigint: true }));
    assert.equal(
      temporaryIdentity.bytes,
      artifact.bytes,
      "Temporary archive length differs",
    );
    const readback = createHash("sha256");
    for await (const chunk of target.createReadStream({
      autoClose: false,
      start: 0,
    }))
      readback.update(chunk);
    assert.equal(
      readback.digest("hex"),
      artifact.sha256,
      "Temporary archive checksum differs",
    );
    assert.deepEqual(
      fileIdentity(await target.stat({ bigint: true })),
      temporaryIdentity,
      "Temporary metadata changed during verification",
    );
    assert.deepEqual(
      fileIdentity(await lstat(temporary, { bigint: true })),
      temporaryIdentity,
      "Temporary path identity changed",
    );
    await link(temporary, destination); // Atomic, exclusive, no overwrite.
    const final = fileIdentity(await lstat(destination, { bigint: true }));
    assert.equal(final.device, temporaryIdentity.device);
    assert.equal(final.inode, temporaryIdentity.inode);
    assert.equal(final.bytes, artifact.bytes);
  } finally {
    try {
      await target?.close();
    } finally {
      try {
        await source.close();
      } finally {
        if (temporaryCreated) await rm(temporary, { force: true });
      }
    }
  }
}

type FinalPreservationInputs = {
  doorAssert?: () => void;
  stairBase?: {
    assertUnchanged: () => void;
    drawingCanonicalSha256: string;
    drawingInput?: Buffer;
    drawingPath?: string;
    drawingFileSha256?: string;
    inputPath: string;
    inputArchiveSha256: string;
    reviewPath: string;
    reviewBytes: Buffer;
  };
  doorReview?: { path: string; bytes: Buffer };
};
/** This factory is OUTSIDE compilation's lexical scope. Its inputs contain
 * bare original-source callbacks and exact raw review inputs, never complete
 * Standings/proofs/current datasets. Original callbacks retain their actual
 * required raw-byte checks; no digest-only replacement is introduced. */
export function createFinalRegenerationPreservationChecks(
  inputs: FinalPreservationInputs,
): () => Promise<void> {
  return async () => {
    inputs.doorAssert?.();
    const base = inputs.stairBase;
    if (base) {
      base.assertUnchanged();
      if (base.drawingInput) {
        assert.equal(
          createHash("sha256")
            .update(
              JSON.stringify(JSON.parse(base.drawingInput.toString("utf8"))),
            )
            .digest("hex"),
          base.drawingCanonicalSha256,
          "Source stair-base drawing input differs from the checked review",
        );
        assert.equal(
          await fileDigest(path.resolve(base.drawingPath!)),
          base.drawingFileSha256,
          "Source stair-base drawing review file changed during regeneration",
        );
      }
      assert.equal(
        await fileDigest(base.inputPath),
        base.inputArchiveSha256,
        "Original stair-base source archive changed during regeneration",
      );
      assert.equal(
        await fileDigest(path.resolve(base.reviewPath)),
        sha(base.reviewBytes),
        "Original stair-base locator review changed during regeneration",
      );
    }
    if (inputs.doorReview)
      assert.equal(
        await fileDigest(path.resolve(inputs.doorReview.path)),
        sha(inputs.doorReview.bytes),
        "Original standing locator review changed during regeneration",
      );
  };
}
