/** HEAVY (shared lock). Real reviter compiler (HEAD, deterministic math) on the candidate rooms, routing off.
 * Same call as scripts/indoor/regenerate-from-native-cache.ts: prepareIndoorDataset(native cache model, rooms,
 * model sha, progress, { physicalDoorSource: the review ZIP's viewer/indoor.json, ... }) with two option hooks
 * (no code edit):
 *   nativeLandingApproaches -> no landing approach edges (routing deferred);
 *   nativeCirculationCompiler -> the production prepareNativeCirculationGeometry (its fixtures are selection input),
 *     returned without exactTopology/displayResidualTopology so attachNativeCirculationCellRoutes attaches no
 *     walking branches (routing deferred). Cells/fixtures/review surfaces are kept unchanged.
 * Writes candidate-floors-16/data/compiled-candidate.json and compiled-candidate.receipt.json. */
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
// candidate-floors-16 copy: input candidate-floors-16/integration/rooms.candidate16.json, output candidate-floors-16/data. Code: branch claude/unbc-candidate4-rules (corner joins, joint lines); both trees must be clean, heads recorded.
const RUN = "/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009", OUT = RUN + "/candidate-floors-16/data", IN = RUN + "/candidate-floors-16/integration";
const R = "/Users/ahmadjalil/github/reviter/lib/reviter";
const ZIP = "/Users/ahmadjalil/Downloads/UNBC.final/previews/2026-10-09/UNBC.floor1-followup-review-ready-20261009.reviter.zip";
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), `[${Math.round((Date.now() - t0) / 1000)}s]`, ...a);
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const shaFile = (p: string) => new Promise<string>((ok, bad) => { const h = createHash("sha256"); createReadStream(p).on("data", (b) => h.update(b)).on("end", () => ok(h.digest("hex"))).on("error", bad); });
const heads = { openindoormaps: execFileSync("git", ["-C", "/Users/ahmadjalil/github/openindoormaps", "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), reviter: execFileSync("git", ["-C", "/Users/ahmadjalil/github/reviter", "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirty: { openindoormaps: execFileSync("git", ["-C", "/Users/ahmadjalil/github/openindoormaps", "status", "--short", "--", "app", "scripts"], { encoding: "utf8" }).trim(), reviter: execFileSync("git", ["-C", "/Users/ahmadjalil/github/reviter", "status", "--short", "--", "lib", "scripts"], { encoding: "utf8" }).trim() } };
log("heads", JSON.stringify(heads));
const { prepareIndoorDataset } = await import(R + "/indoor-pipeline.ts");
const { assertNativeSelectionContactRepairsPhysicalGuards } = await import(R + "/native-selection-contact-guards.ts");
const { deriveNativeSelectionContactRepairs } = await import(R + "/native-selection-contact-repairs.ts");
const { hydrateRoomNativeMaterials } = await import(R + "/native-material-wire.ts");
if (heads.dirty.openindoormaps || heads.dirty.reviter) throw Error("dirty code trees");
(heads as any).branch = "claude/unbc-candidate4-rules";
const roomsText = await readFile(IN + "/rooms.candidate16.json", "utf8");
const rr = JSON.parse(await readFile(IN + "/receipt.json", "utf8"));
if (sha(roomsText) !== rr.output.sha256 || !rr.output.sha256.startsWith("9f0d1e6e")) throw Error("rooms.candidate16.json differs from its receipt");
const rooms = await hydrateRoomNativeMaterials(JSON.parse(roomsText));
const cacheReceipt = JSON.parse(await readFile(RUN + "/native-cache.json.receipt.json", "utf8"));
const cacheSha = await shaFile(RUN + "/native-cache.json");
if (cacheSha !== cacheReceipt.cacheSha256) throw Error("native cache differs from its receipt");
log("cache verified", cacheSha.slice(0, 12));
const zipEntry = execFileSync("unzip", ["-p", ZIP, "viewer/indoor.json"], { maxBuffer: 400 * 2 ** 20 });
const physicalDoorSource = JSON.parse(zipEntry.toString("utf8"));
const physicalDoorSourceSha256 = sha(zipEntry);
log("physical door source", physicalDoorSourceSha256.slice(0, 12));
let cache: any = JSON.parse(await readFile(RUN + "/native-cache.json", "utf8"));
if (cache.sourceModelSha256 !== physicalDoorSource.source.modelSha256) throw Error("cache/model mismatch");
log("cache parsed");
const stages: { at: number; message: string }[] = [];
let circulationReport: any;
let stash: any;
let compileError: string | undefined;
let dataset: any;
try {
  dataset = await prepareIndoorDataset(cache.nativeModel, rooms, cache.sourceModelSha256,
    (m: string) => { if (!m.includes("region") || /region (?:[0-9]*00)\//.test(m)) { log(m); stages.push({ at: Math.round((Date.now() - t0) / 1000), message: m }); } },
    {
      physicalDoorSource,
      nativeLandingApproaches: async () => ({ edges: [], diagnostics: ["candidate-floors: landing approaches skipped (routing deferred)"] }),
      // Circulation cells are routing. Their only selection input is circulationGeometry.fixtures, which is empty in the
      // published 73f7 and was measured empty for this candidate (attempt 1 ran the production stage: 1209 cells, 0 fixtures).
      nativeCirculationCompiler: async (_model: any, ds: any) => {
        stash = ds;
        circulationReport = { skipped: true, fixtures: 0, note: "attempt 1 (production prepareNativeCirculationGeometry on this candidate): accepted 1209, rejected 4298, fixtures 0" };
        return { geometry: { version: 1, sourceModelSha256: ds.source.modelSha256, sourceGeometryKey: "candidate-floors:circulation-skipped", preparedRoomKeys: [], reviewSurfaces: [], fixtures: [], cells: [] }, report: { accepted: 0, rejected: 0, exactOverlayFallbacks: 0, diagnostics: [] } } as any;
      },
    });
} catch (e) {
  compileError = String((e as Error).message);
  log("compile threw", compileError);
  if (!stash || !/Native selection contact repair/.test(compileError)) throw e;
  dataset = stash; // complete except the window display, which is presentation only
}
// Fail-closed contact replay, one level at a time, bisecting to the repairs the production guard refuses.
const refusedContacts: any[] = [];
{
  const all = dataset.nativeSelectionContactRepairs.repairs.filter((r: any) => r.status === "applied");
  const check = (batch: any[]) => { try { assertNativeSelectionContactRepairsPhysicalGuards(dataset, batch, deriveNativeSelectionContactRepairs(dataset, batch)); return undefined; } catch (e) { return String((e as Error).message); } };
  const bisect = (batch: any[]): void => {
    const err = check(batch);
    if (!err) return;
    if (batch.length === 1) { refusedContacts.push({ id: batch[0].id, levelId: batch[0].levelId, reason: err }); return; }
    const h = Math.ceil(batch.length / 2); bisect(batch.slice(0, h)); bisect(batch.slice(h));
  };
  if (compileError) for (const lid of [...new Set(all.map((r: any) => r.levelId))]) bisect(all.filter((r: any) => r.levelId === lid));
  if (refusedContacts.length) {
    const ids = new Set(refusedContacts.map((r) => r.id));
    dataset.nativeSelectionContactRepairs.repairs = dataset.nativeSelectionContactRepairs.repairs.filter((r: any) => !ids.has(r.id));
    const rest = dataset.nativeSelectionContactRepairs.repairs.filter((r: any) => r.status === "applied");
    const err = check(rest);
    if (err) throw Error("contact replay still fails after removing refused repairs: " + err);
  }
  log("contacts refused", refusedContacts.length, JSON.stringify(refusedContacts.map((r) => r.id)));
}
cache = undefined;
dataset.source.roomsSha256 = rr.output.sha256;
const text = JSON.stringify(dataset);
await writeFile(OUT + "/compiled-candidate.json", text, { flag: "wx" });
const counts: Record<string, number> = {};
for (const i of dataset.issues) counts[i.code] = (counts[i.code] ?? 0) + 1;
const pick = (codes: string[]) => dataset.issues.filter((i: any) => codes.includes(i.code)).map((i: any) => ({ code: i.code, message: String(i.message).slice(0, 600), levelId: i.levelId, roomKey: i.roomKey, nativeElementId: i.nativeElementId }));
const receipt = {
  format: "unbc-candidate-floors-compile-receipt", version: 1, finishedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), node: process.version, heads,
  inputs: { rooms: rr.output, nativeCache: { sha256: cacheSha }, physicalDoorSource: { zip: ZIP, entry: "viewer/indoor.json", sha256: physicalDoorSourceSha256 } },
  routingOff: { landingApproaches: "skipped (stub returns no edges)", circulation: "skipped (stub; no cells, no walking branches; fixtures empty as measured)", circulationReport }, compileError, refusedContacts,
  output: { path: "candidate-floors-16/data/compiled-candidate.json", sha256: sha(text), bytes: Buffer.byteLength(text) },
  materialSectionSupplementSha256: dataset.nativeMaterialSectionSupplement?.geometrySha256,
  issueCounts: counts,
  keyIssues: pick(["native-floor-edge-rules", "native-envelope-supplement", "native-access-zone", "native-access-zone-refused", "reviewed-circulation-link", "reviewed-circulation-link-refused", "drawing-backed-assumptions", "native-local-transition-qualified", "native-local-transition-refused", "reviewed-landing-door-link", "drawing-backed-door"]),
  stages,
  // every issue that reports an input not used (for the refusal report; nothing dropped silently)
  refusalIssues: dataset.issues.filter((i: any) => /refus|not applied|dropped|ignored|rejected|withheld/i.test(i.code + " " + i.message)).map((i: any) => ({ code: i.code, severity: i.severity, message: String(i.message).slice(0, 1500), levelId: i.levelId, roomKey: i.roomKey, nativeElementId: i.nativeElementId })),
  collectionCounts: {
    dataset: { rows: dataset.nativeProvisionalCornerSeals?.rows?.length, contactRepairs: dataset.nativeSelectionContactRepairs?.repairs?.length, exclusions: dataset.indoorExclusions?.areas?.length, doorBoundaryClosures: dataset.nativeDoorBoundaryClosures?.doors?.length, partitions: dataset.reviewedAreaPartitions?.partitions?.length, windowDisplay: !!dataset.windowDisplay, doorAperturePatchState: !!dataset.doorAperturePatchState },
    rooms: { rows: rooms.nativeProvisionalCornerSeals?.rows?.length, contactRepairs: rooms.nativeSelectionContactRepairs?.repairs?.length, exclusions: rooms.indoorExclusions?.areas?.length, doorBoundaryClosures: rooms.nativeDoorBoundaryClosures?.doors?.length, partitions: rooms.reviewedAreaPartitions?.partitions?.length },
  },
};
await writeFile(OUT + "/compiled-candidate.receipt.json", JSON.stringify(receipt, null, 1));
log("done", receipt.output.sha256.slice(0, 12), receipt.seconds, "s");
