/** Moderate. Imports a master folder exactly as the editor's "Import master folder" does (readProjectFolder) from disk:
 *  the master ZIP plus every file under review-recommendations/.  node --import tsx verify-folder.mts <folder> */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const { readProjectFolder } = await import(A + "review-bundle.ts");
const folder = process.argv[2]!, base = folder.split("/").filter(Boolean).at(-1)!;
const walk = async (d: string): Promise<string[]> => (await Promise.all((await readdir(d, { withFileTypes: true })).map((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))).flat();
const paths = [join(folder, "UNBC.master.reviter.zip"), ...(await walk(join(folder, "review-recommendations")))];
const files = await Promise.all(paths.map(async (p) => ({ name: p.split("/").at(-1)!, webkitRelativePath: base + "/" + relative(folder, p), size: (await stat(p)).size, arrayBuffer: async () => { const b = await readFile(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } })));
const t = Date.now();
const r = await readProjectFolder(files as any);
console.log(JSON.stringify({ ok: true, fileName: r.fileName, companions: r.project.rooms.reviewBundle?.files.length, bundleMasterSha256: r.project.rooms.reviewBundle?.masterSha256, seconds: (Date.now() - t) / 1000 }));
