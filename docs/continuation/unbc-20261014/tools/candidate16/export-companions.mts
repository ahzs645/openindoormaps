/** Moderate. Writes the master's review-bundle companions that the folder lacks into <folder>/review-recommendations and
 *  updates its manifest (masterSha256 + entries). Refuses any existing file with different bytes. --write to apply (else dry run).
 *  node --import tsx export-companions.mts <master.zip> <folder> [--write] */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const { readIndoorProject } = await import(A + "package.ts");
const [zip, folder] = process.argv.slice(2);
const write = process.argv.includes("--write");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = new Uint8Array(await readFile(zip!));
const p = await readIndoorProject(bytes);
const root = join(folder!, "review-recommendations");
const m = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const have = new Set(m.files.map((e: any) => e.sha256));
const add: any[] = [], refused: string[] = [];
for (const f of p.rooms.reviewBundle!.files) {
  if (have.has(f.sha256)) continue;
  const rel = f.path.replace(/^review-recommendations\//, "");
  if (rel.includes("..") || rel.startsWith("/")) { refused.push(f.path + " unsafe"); continue; }
  const content = new Uint8Array(inflateRawSync(Buffer.from(f.compressedBase64, "base64")));
  if (sha(content) !== f.sha256 || content.length !== f.bytes) { refused.push(f.path + " bundle bytes do not match their hash"); continue; }
  const target = join(root, rel);
  const exists = await access(target).then(() => true, () => false);
  if (exists) {
    const old = new Uint8Array(await readFile(target));
    if (sha(old) !== f.sha256) { refused.push(rel + " exists with different bytes"); continue; }
  }
  add.push({ rel, target, content, exists, entry: { file: rel, bytes: f.bytes, sha256: f.sha256 } });
}
console.log(JSON.stringify({ masterSha256: sha(bytes), add: add.length, alreadyOnDisk: add.filter((a) => a.exists).length, refused, sample: add.slice(0, 8).map((a) => a.rel) }, null, 1));
if (write && !refused.length) {
  for (const a of add) if (!a.exists) { await mkdir(dirname(a.target), { recursive: true }); await writeFile(a.target, a.content, { flag: "wx" }); }
  m.files = [...m.files, ...add.map((a) => a.entry)];
  m.masterSha256 = sha(bytes);
  m.savedDate = "2026-10-14";
  m.status = "Native indoor final (candidate 16): every native room enclosed and selectable under the leak audit, routing on (1,535 of 1,842 named rooms reachable), Round 12 owner answers applied. Earlier companions are unchanged; companions carried by the master that the folder lacked were added.";
  await writeFile(join(root, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  console.log("written", add.length, "manifest files", m.files.length);
}
