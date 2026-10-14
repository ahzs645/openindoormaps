/** Moderate. Compares a master ZIP's review bundle with a folder companion manifest.  node --import tsx compare-companions.mts <zip> <manifest.json> */
import { readFile } from "node:fs/promises";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const { readIndoorProject } = await import(A + "package.ts");
const p = await readIndoorProject(new Uint8Array(await readFile(process.argv[2]!)));
const m = JSON.parse(await readFile(process.argv[3]!, "utf8"));
const files = p.rooms.reviewBundle?.files ?? [];
const bySha = new Map(files.map((f: any) => [f.sha256, f]));
const missing = m.files.filter((e: any) => !bySha.has(e.sha256));
const folderShas = new Set(m.files.map((e: any) => e.sha256));
const extra = files.filter((f: any) => !folderShas.has(f.sha256));
console.log(JSON.stringify({ bundleMasterSha256: p.rooms.reviewBundle?.masterSha256, bundleFiles: files.length, folderFiles: m.files.length, folderNotInBundle: missing.length, bundleNotInFolder: extra.length, sampleMissing: missing.slice(0, 5).map((e: any) => e.file), sampleExtra: extra.slice(0, 5).map((f: any) => f.path) }, null, 1));
