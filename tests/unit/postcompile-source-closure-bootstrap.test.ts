/** Runtime byte-binding fixtures only; no worker task or map is executed. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { collectClosure } from "../../scripts/indoor/postcompile-stepped-stair-source-review";
import { postcompileHash } from "../../scripts/indoor/postcompile-stepped-stair-artifacts";

const reviter = fileURLToPath(new URL("../../../reviter/", import.meta.url));
const bootstrap = path.join(
  reviter,
  "scripts/indoor/bounded-checkpoint-worker.ts",
);
const checkpoint = path.join(
  reviter,
  "scripts/indoor/bounded-worker-checkpoints.ts",
);
const loaders = [
  "register-local-typescript.mjs",
  "local-typescript-resolver.mjs",
].map((name) => path.join(reviter, "scripts", name));

test("dynamic bootstrap graph and both exact loader bytes supplement analysis without changing declared roots", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "postcompile-bootstrap-"),
  );
  try {
    const entry = path.join(dir, "semantic.ts");
    await fs.writeFile(entry, "export const semanticFixture = true;\n");
    const closure = await collectClosure([entry]);
    assert.deepEqual(closure.entryPoints, [entry]);
    for (const file of [bootstrap, checkpoint, ...loaders]) {
      assert.equal(
        closure.files[file],
        postcompileHash(await fs.readFile(file)),
      );
    }
    assert.notEqual(closure.files[bootstrap], undefined);
    assert.notEqual(closure.files[checkpoint], undefined);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("bootstrap, transitive checkpoint and loader byte changes invalidate the closure without editing source files", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "postcompile-bootstrap-change-"),
  );
  try {
    const entry = path.join(dir, "semantic.ts");
    await fs.writeFile(entry, "export const semanticFixture = true;\n");
    const baseline = await collectClosure([entry]);
    for (const file of [bootstrap, checkpoint, ...loaders]) {
      const original = new Uint8Array(await fs.readFile(file));
      const changed = new Uint8Array(
        Buffer.concat([
          original,
          Buffer.from("\n// Test-only bound runtime-byte change.\n"),
        ]),
      );
      const next = await collectClosure([entry], new Map([[file, changed]]));
      assert.deepEqual(next.entryPoints, baseline.entryPoints);
      assert.equal(next.files[file], postcompileHash(changed));
      assert.notEqual(
        postcompileHash(JSON.stringify(next.files)),
        postcompileHash(JSON.stringify(baseline.files)),
      );
      assert.deepEqual(new Uint8Array(await fs.readFile(file)), original);
      for (const [other, digest] of Object.entries(baseline.files))
        if (other !== file) assert.equal(next.files[other], digest);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
