/** FINAL master (routing ON) for a candidate: like package-preview.mts but the dataset is the routing compile
 * (routing/compiled-routing.json + receipt), so directions are usable; no nodes are restored from 73f7 (the reviter pipeline
 * keeps ramp connector nodes since 50b5ffa). Original header: Preview master for a routing-off candidate (no recompile), following scripts/indoor/regenerate-from-native-cache.ts:
 * read the source review master with the production reader, replace its rooms by the candidate's (hydrated; the same review
 * companions as the source) and its dataset by the candidate's compiled dataset, then exportIndoorProject (packs the rooms,
 * binds the rooms checksum, publishes the checked native floor mapping, drops stale display chunks) and read it back.
 * The applied review partitions of the derive step (approved-change re-bind, fresh binds, bound proposals; production functions)
 * are carried into both rooms and dataset so source and prepared logical boundaries stay identical.
 * Routing stays as the candidate has it (off): selection areas and display only; directions are not usable.
 *   node --max-old-space-size=16384 --import tsx package-preview.mts <candidate-dir> <out.zip>
 * Writes <out.zip> and <out.zip>.receipt.json. */
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync, strToU8, strFromU8 } from "/Users/ahmadjalil/github/openindoormaps/node_modules/fflate/esm/index.mjs";
import { createHash } from "node:crypto";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
const SOURCE_ZIP = "/Users/ahmadjalil/Downloads/UNBC.final/previews/2026-10-09/UNBC.floor1-followup-review-ready-20261009.reviter.zip";
const [dir] = process.argv.slice(2, 3);
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), `[${Math.round((Date.now() - t0) / 1000)}s]`, ...a);
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const { readIndoorProject, exportIndoorProject } = await import(A + "package.ts");
const { hydrateRoomNativeMaterials } = await import(A + "native-material-wire.ts");
const rr = JSON.parse(await readFile(dir + "/integration/receipt.json", "utf8"));
const roomsText = await readFile(dir + "/integration/" + rr.output.path.split("/").at(-1), "utf8");
if (sha(roomsText) !== rr.output.sha256) throw Error("rooms differ from their receipt");
const cr = JSON.parse(await readFile(dir + "/routing/compiled-routing.receipt.json", "utf8"));
const compiledText = await readFile(dir + "/routing/compiled-routing.json", "utf8");
if (sha(compiledText) !== cr.output.sha256) throw Error("compiled dataset differs from its receipt");
if (cr.inputs.rooms.sha256 !== rr.output.sha256) throw Error("compiled dataset was not built from these rooms");
const preparedText = await readFile(dir + "/data/candidate/dataset-prepared.json", "utf8");
const preparedPartitions = JSON.parse(preparedText).reviewedAreaPartitions;
log("inputs ok", { rooms: rr.output.sha256.slice(0, 12), compiled: cr.output.sha256.slice(0, 12), prepared: sha(preparedText).slice(0, 12) });
const srcBytes = new Uint8Array(await readFile(SOURCE_ZIP));
if (sha(srcBytes) !== "7fd503d42c435f67ddd50330c80b87da810fd60cc52c124d95d8b50b5cef930b") throw Error("source ZIP is not 7fd503d4");
// The source master's published native floor mapping and display chunks are derived from its old dataset and were made by
// older code; the current reader rejects that mapping as stale. Both are replaced here, so they are dropped before reading.
const srcFiles = unzipSync(srcBytes);
const srcManifest = JSON.parse(strFromU8(srcFiles["manifest.json"]));
const srcDataset = JSON.parse(strFromU8(srcFiles["viewer/indoor.json"]));
delete srcDataset.nativeExploreMapping;
srcFiles["viewer/indoor.json"] = strToU8(JSON.stringify(srcDataset));
srcManifest.indoor = { ...srcManifest.indoor, bytes: srcFiles["viewer/indoor.json"].length, sha256: sha(srcFiles["viewer/indoor.json"]) };
for (const p of Object.keys(srcFiles)) if (p.startsWith("viewer/display/")) delete srcFiles[p];
delete srcManifest.preparedDisplay;
srcFiles["manifest.json"] = strToU8(JSON.stringify(srcManifest, null, 2));
const before = await readIndoorProject(zipSync(srcFiles, { level: 0 }));
log("source read", { manifestReviewBundle: before.manifest.reviewBundle?.sha256?.slice(0, 12) });
const roomsWire = JSON.parse(roomsText);
if (JSON.stringify(roomsWire.reviewBundle) !== JSON.stringify(JSON.parse(new TextDecoder().decode(before.files["floors/rooms.json"])).reviewBundle))
  throw Error("candidate rooms reference other review companions than the source master");
const rooms = await hydrateRoomNativeMaterials(roomsWire);
rooms.reviewBundle = before.rooms.reviewBundle;
rooms.reviewedAreaPartitions = structuredClone(preparedPartitions);
const dataset = JSON.parse(compiledText);
dataset.reviewedAreaPartitions = structuredClone(preparedPartitions);
const restoredNodes: string[] = [];
{
  const ids = new Set(dataset.nodes.map((n: any) => n.id));
  const dangling = dataset.edges.flatMap((e: any) => [e.from, e.to]).filter((id: string) => !ids.has(id));
  if (dangling.length) throw Error("routing dataset has edges naming absent nodes: " + [...new Set(dangling)].slice(0, 10).join(", "));
}
// ---- timing diagnostic: the export checks one by one ----
const P = await import(A + "package.ts");
const tm = async (name: string, f: () => unknown) => { const t = Date.now(); await f(); log("STEP", name, (Date.now() - t) / 1000, "s"); };
const project: any = { ...before, rooms, dataset, preparedDisplay: undefined };
const M = await import(A + "native-explore-mapping.ts");
await tm("publishNativeExploreMapping", () => M.publishNativeExploreMapping(structuredClone(dataset), structuredClone(dataset)));
