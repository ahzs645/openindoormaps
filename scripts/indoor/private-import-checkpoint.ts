/** Local build acceleration only. Never imported by the app or a publisher.
 * A completed pair of original package readers may be reused only while the
 * exact archive, transitive reader/validator source, dependencies, checked WASM
 * and Node runtime remain identical. The payload contains data, not module-local
 * validation authority, prepared route decisions or a visitor trust receipt.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, link, rm, lstat, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serialize, deserialize } from "node:v8";
import type { IndoorProject } from "../../app/indoor-project/package";
import type { readProjectPackage } from "../../../reviter/lib/reviter/project-package";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sourceRoot = path.resolve(root, "../reviter");
const require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild") as typeof import("esbuild");
const format = "openindoormaps-private-validated-import-data-v1";
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function hashFile(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
type Original = Pick<
  Awaited<ReturnType<typeof readProjectPackage>>,
  "manifest" | "rooms" | "indoor"
>;
export type PrivateImportedData = { original: Original; before: IndoorProject };
type FileDigest = { path: string; bytes: number; sha256: string };
type Binding = {
  format: typeof format;
  runtime: { version: string; versions: NodeJS.ProcessVersions; executableSha256: string; execArgv: string[]; nodeOptions: string | null };
  input: FileDigest;
  algorithmFiles: FileDigest[];
};
export type PrivateImportCheckpoint = {
  directory: string;
  binding: Binding;
  bindingSha256: string;
};
async function describe(file: string): Promise<FileDigest> {
  const absolute = path.resolve(file), info = await stat(absolute);
  assert.ok(info.isFile(), `Expected a checkpoint-bound file: ${absolute}`);
  return { path: absolute, bytes: info.size, sha256: await hashFile(absolute) };
}
export async function bindPrivateImportCheckpoint(
  directory: string,
  input: string,
): Promise<PrivateImportCheckpoint> {
  const entryPoints = [
    path.join(root, "app/indoor-project/package.ts"),
    path.join(sourceRoot, "lib/reviter/project-package.ts"),
    fileURLToPath(import.meta.url),
    require.resolve("tsx"),
    require.resolve("esbuild"),
  ];
  const graph = await build({
    entryPoints, absWorkingDir: root, outdir: "/tmp/unused-private-import-analysis",
    bundle: true, platform: "node", format: "esm", write: false,
    metafile: true, logLevel: "silent",
  });
  const extras = [
    path.join(root, "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm"),
    path.join(sourceRoot, "lib/reviter/vendor/native-exact-geos/native-exact-geos.wasm"),
    ...[root, sourceRoot].flatMap((r) => [path.join(r, "package.json"), path.join(r, "package-lock.json")]),
  ];
  extras.push(require.resolve("@esbuild/linux-x64/bin/esbuild"));
  for (const match of execFileSync("ldd", [process.execPath], { encoding: "utf8" })
    .matchAll(/(?:=>\s*)?(\/[^\s(]+)\s*\(/g)) extras.push(match[1]!);
  const paths = [...new Set([
    ...Object.keys(graph.metafile!.inputs).map((p) => path.resolve(root, p)),
    ...extras,
  ])].sort();
  const binding: Binding = {
    format,
    runtime: { version: process.version, versions: process.versions, executableSha256: await hashFile(process.execPath), execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null },
    input: await describe(input),
    algorithmFiles: await Promise.all(paths.map(describe)),
  };
  const resolved = path.resolve(directory);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const info = await lstat(resolved);
  assert.ok(info.isDirectory() && info.uid === process.getuid?.() && (info.mode & 0o077) === 0,
    "Private import checkpoints require an owner-only local directory");
  return { directory: resolved, binding, bindingSha256: sha(JSON.stringify(binding)) };
}
export async function readPrivateImportCheckpoint(checkpoint: PrivateImportCheckpoint): Promise<PrivateImportedData | undefined> {
  let receiptBytes: Buffer;
  try {
    receiptBytes = await readFile(path.join(checkpoint.directory, checkpoint.bindingSha256 + ".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const receipt = JSON.parse(receiptBytes.toString()) as {
    format: string; bindingSha256: string; binding: Binding;
    payload: { name: string; bytes: number; sha256: string };
  };
  assert.equal(receipt.format, format);
  assert.equal(receipt.bindingSha256, checkpoint.bindingSha256);
  assert.deepEqual(receipt.binding, checkpoint.binding);
  assert.match(receipt.payload.sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.payload.name, receipt.payload.sha256 + ".bin");
  assert.ok(Number.isSafeInteger(receipt.payload.bytes) && receipt.payload.bytes > 0 && receipt.payload.bytes < 2 ** 31);
  const payload = await readFile(path.join(checkpoint.directory, receipt.payload.name));
  assert.equal(payload.length, receipt.payload.bytes);
  assert.equal(sha(payload), receipt.payload.sha256, "Private import data changed");
  const data = deserialize(payload) as PrivateImportedData;
  assert.ok(data && data.original?.manifest && data.original.rooms && data.original.indoor && data.before?.files && data.before.dataset);
  assert.deepEqual(data.original.manifest, data.before.manifest);
  assert.deepEqual(data.original.rooms, data.before.rooms);
  await verifyStillBound(checkpoint);
  return data;
}
async function verifyStillBound(checkpoint: PrivateImportCheckpoint) {
  for (const entry of [checkpoint.binding.input, ...checkpoint.binding.algorithmFiles])
    assert.deepEqual(await describe(entry.path), entry,
      "Private import input or validation source changed during import");
  assert.equal(await hashFile(process.execPath), checkpoint.binding.runtime.executableSha256);
}
async function immutableWrite(file: string, bytes: Uint8Array | string) {
  const temporary = file + ".tmp-" + process.pid + "-" + randomUUID();
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  try { await link(temporary, file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    assert.equal(await hashFile(file), sha(bytes),
      "Existing private checkpoint data differs");
  } finally { await rm(temporary, { force: true }); }
}
export async function writePrivateImportCheckpoint(checkpoint: PrivateImportCheckpoint, data: PrivateImportedData) {
  // Source and authoring readers have both completed their original validation.
  // Deliberately omit File objects and every module-local WeakMap/WeakSet.
  assert.deepEqual(data.original.rooms, data.before.rooms);
  assert.deepEqual(data.original.manifest, data.before.manifest);
  await verifyStillBound(checkpoint);
  const payload = serialize({
    original: { manifest: data.original.manifest, rooms: data.original.rooms, indoor: data.original.indoor },
    before: data.before,
  } satisfies PrivateImportedData);
  const digest = sha(payload), name = digest + ".bin";
  await immutableWrite(path.join(checkpoint.directory, name), payload);
  await immutableWrite(path.join(checkpoint.directory, checkpoint.bindingSha256 + ".json"),
    JSON.stringify({ format, bindingSha256: checkpoint.bindingSha256, binding: checkpoint.binding,
      payload: { name, bytes: payload.length, sha256: digest },
      authority: "Local source-import data only. No restored module authority or visitor approval.",
    }, null, 2) + "\n");
  return { bindingSha256: checkpoint.bindingSha256, payloadSha256: digest, payloadBytes: payload.length };
}
