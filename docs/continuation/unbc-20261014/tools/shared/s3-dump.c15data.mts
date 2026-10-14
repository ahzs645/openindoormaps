/** candidate-5 copy (adds DUMP_DOOR_CLOSURES = gen-closures.c5 output + comma list of record ids, appended to nativeDoorBoundaryClosures). candidate-floors-3/regress copy of fix-seams/scripts/s3-dump.mts: candidate-2 prepared dataset (candidate-floors-2/data/candidate), outputs in candidate-floors-3/regress/work. */
/** HEAVY (shared lock). Exact windowed selection + barrier dump on the candidate prepared dataset
 * (candidate-floors/data/candidate/dataset-prepared.json, the dataset derive-areas.mts derived the candidate areas from).
 * Per level with targets: production deriveNativeAreas (dump-probe copy generated from OIM HEAD) up to the final strict
 * subtraction, then the same exact subtraction + point-contact split inside each target window; dumps the windowed exact
 * faces and every barrier piece / door / contact mask / partition / exterior / slab / seal row near a window.
 * The runtime-refused contact repairs of derive-areas (receipt.runtimeRefusedContacts) are left out exactly as there.
 * Also writes the drawing-backed validation input built from the same dataset (fields of db-load-inputs.ts).
 * Resumable per level. Writes only to candidate-floors/fix-seams/work/. */
import { readFile, writeFile, rename, access } from "node:fs/promises";
import { createHash } from "node:crypto";
const RUN = "/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009", CF = RUN + "/candidate-floors", FS = RUN + "/candidate-floors-3/regress", C2 = RUN + "/candidate-floors-15";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), `[${Math.round((Date.now() - t0) / 1000)}s]`, ...a);
const exists = (p: string) => access(p).then(() => true, () => false);
const put = async (p: string, v: unknown) => { const t = `${p}.${process.pid}.tmp`; await writeFile(t, JSON.stringify(v)); await rename(t, p); };
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const S = await import(A + "native-provisional-corner-seals.ts");
S.setDrawingBackedRowMemoEnabled(true);
const { deriveNativeAreas } = await import(FS + "/scripts/native-area-review.dump-probe.ts");
const raw = await readFile(C2 + "/data/candidate/dataset-prepared.json", "utf8");
const preparedSha = createHash("sha256").update(raw).digest("hex");
const D: any = JSON.parse(raw);
log("loaded prepared", preparedSha.slice(0, 12));
const rc = JSON.parse(await readFile(C2 + "/data/candidate/receipt.json", "utf8"));
const refused = new Set((rc.runtimeRefusedContacts ?? []).map((x: any) => x.id));
D.nativeSelectionContactRepairs.repairs = D.nativeSelectionContactRepairs.repairs.filter((x: any) => !refused.has(x.id));
const WIN = JSON.parse(await readFile(process.env.DUMP_WINDOWS ?? FS + "/work/windows.json", "utf8"));
const ODIR = process.env.DUMP_OUT ?? FS + "/work";
// VERIFY mode: add candidate rows (DUMP_ROWS = comma list of drawing-backed-rows.json) to the seal descriptor, re-binding the
// envelope seal checksum exactly as a regenerated candidate would (round5b datasetWith pattern)
if (process.env.DUMP_ROWS) {
  const { nativeProvisionalCornerSealsHash } = await import(A + "native-provisional-corner-seals.ts");
  const { nativeIndoorEnvelopeHash } = await import(A + "native-indoor-envelopes.ts");
  const extra = (await Promise.all(process.env.DUMP_ROWS.split(",").map(async (f) => JSON.parse(await readFile(f, "utf8")).rows))).flat();
  const seals0 = D.nativeProvisionalCornerSeals;
  const seals = { ...seals0, rows: [...seals0.rows, ...extra] };
  seals.geometrySha256 = nativeProvisionalCornerSealsHash(seals);
  const env = { ...D.nativeIndoorEnvelopes, levels: D.nativeIndoorEnvelopes.levels.map((l: any) => l.provisionalCornerGeometrySha256 === seals0.geometrySha256 ? { ...l, provisionalCornerGeometrySha256: seals.geometrySha256 } : l) };
  env.geometrySha256 = await nativeIndoorEnvelopeHash(env);
  D.nativeProvisionalCornerSeals = seals; D.nativeIndoorEnvelopes = env;
  log("verify: added rows", extra.length, "seals", seals.geometrySha256.slice(0, 12));
}
if (process.env.DUMP_DOOR_CLOSURES) {
  const [file, ids] = process.env.DUMP_DOOR_CLOSURES.split("#");
  const G = JSON.parse(await readFile(file, "utf8"));
  const pick = G.records.filter((r: any) => ids.split(",").includes(r.id));
  if (pick.length !== ids.split(",").length) throw Error("door closure ids not found");
  D.nativeDoorBoundaryClosures = { ...(D.nativeDoorBoundaryClosures ?? { version: 1, sourceModelSha256: D.source.modelSha256, doors: [] }) };
  D.nativeDoorBoundaryClosures.doors = [...D.nativeDoorBoundaryClosures.doors, ...pick];
  log("verify: added door closures", pick.map((r: any) => r.id));
}
const bb = (pts: number[][]) => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b; };
const flat = (v: any): number[][] => { const o: number[][] = []; const go = (u: any) => { if (Array.isArray(u) && u.length >= 2 && typeof u[0] === "number") o.push(u); else if (Array.isArray(u)) u.forEach(go); }; go(v); return o; };
const near = (geom: any, boxes: number[][], pad = 1) => { const p = flat(geom); if (!p.length) return false; const b = bb(p); return boxes.some((W) => !(b[2] < W[0] - pad || b[0] > W[2] + pad || b[3] < W[1] - pad || b[1] > W[3] + pad)); };
const summary: any = { preparedSha256: preparedSha, refusedContacts: [...refused], levels: {} };
for (const [lidS, windows] of Object.entries(WIN) as [string, any[]][]) {
  const lid = Number(lidS), file = `${ODIR}/dump-${lid}.json`;
  if (await exists(file)) { log("level", lid, "done earlier"); continue; }
  const boxes = windows.map((w) => w.box);
  (globalThis as any).__DUMP = { windows }; (globalThis as any).__DUMPED = undefined;
  const t = Date.now();
  try { await deriveNativeAreas(D, lid, { mode: "connected", maxGapFeet: 0 }); throw Error("probe did not stop at the dump hook"); }
  catch (e: any) { if (!/__DUMP_DONE__/.test(String(e.message))) { log("level", lid, "ERROR", e.message); summary.levels[lid] = { error: String(e.message).slice(0, 500) }; continue; } }
  const X = (globalThis as any).__DUMPED;
  const piece = (w: any) => ({ id: w.nativeElementId, kind: w.kind, src: w.geometrySource, patch: w.reviewPatchId ?? null, ringsFeet: w.ringsFeet });
  const lvl = D.nativeLevels.find((l: any) => l.id === lid);
  const out = {
    levelId: lid, elevationFeet: lvl.elevationFeet, preparedSha256: preparedSha, seconds: Math.round((Date.now() - t) / 1000),
    windows: X.windows,
    precise: X.precise.filter((w: any) => near(w.ringsFeet, boxes)).map(piece),
    floorContactPrecise: X.floorContactPrecise.filter((w: any) => near(w.ringsFeet, boxes)).map(piece),
    doors: X.doors.filter((d: any) => near(d.footprintFeet, boxes)).map((d: any) => ({ id: d.id, nativeElementId: d.nativeElementId, state: d.state, roomKeys: d.roomKeys, footprintFeet: d.footprintFeet, passThrough: X.passThroughDoorIds.includes(d.nativeElementId), closedOverride: X.closedDoorOverrides.find((o: any) => o[0] === d.nativeElementId)?.[1] ?? null, hostWall: d.hostWallNativeElementId ?? null })),
    contacts: X.contacts.map((c: any, i: number) => ({ repair: c, mask: X.contactMasks[i] })).filter((c: any) => near(c.mask, boxes)),
    partitionMasks: X.partitionMasks.filter((m: any) => near(m, boxes)),
    checkedPartitionIds: X.checkedPartitionIds,
    exterior: X.exterior.filter((m: any) => near(m, boxes)),
    slabs: D.walkingSupport.floors.filter((f: any) => Math.abs(f.elevationFeet - lvl.elevationFeet) < 0.15).map((f: any) => ({ nativeElementId: f.nativeElementId, elevationFeet: f.elevationFeet, partsFeet: f.partsFeet ?? [[f.ringsFeet]] })),
    sealRows: (D.nativeProvisionalCornerSeals?.rows ?? []).filter((r: any) => near(r.partsFeet, boxes, 0.5)).map((r: any) => ({ id: r.id, levelId: r.levelId, state: r.state, baseElevationFeet: r.baseElevationFeet, topElevationFeet: r.topElevationFeet, materialRole: r.materialRole ?? null, sourceFloorOuterContext: !!r.sourceFloorOuterContext, kind: r.drawingBacked?.kind ?? null, owners: r.drawingBacked?.nativeOwnerIds ?? r.carrierContactNativeElementIds, target: r.targetNativeElementId, partsFeet: r.partsFeet })),
    displayWalls: D.walls.filter((w: any) => w.levelId === lid && near(w.ringsFeet, boxes)).map((w: any) => ({ id: w.nativeElementId, kind: w.kind, patch: w.reviewPatchId ?? null, ringsFeet: w.ringsFeet })),
    contactClosureDuplicates: X.contactClosureDuplicates,
  };
  await put(file, out);
  summary.levels[lid] = { seconds: out.seconds, windows: windows.length, errors: X.windows.filter((w: any) => w.error).length, precise: out.precise.length, floorContact: out.floorContactPrecise.length, contacts: out.contacts.length, sealRows: out.sealRows.length };
  log("level", lid, JSON.stringify(summary.levels[lid]));
}
(globalThis as any).__DUMP = undefined;
// drawing-backed validation input from the same dataset (db-load-inputs.ts field list)
const vin = ODIR + "/db-validation-input.candidate3.json";
if (!process.env.DUMP_ROWS && !(await exists(vin))) {
  const fields = ["source", "nativeMaterialSections", "nativeWallPositionRepairs", "nativeProvisionalCornerSeals", "nativeDerivedFrameReturns", "walkingSupport", "nativeIndoorEnvelopes", "doors", "edges", "boundaryReference"];
  const missing = fields.filter((k) => D[k] === undefined);
  const data: any = Object.fromEntries(fields.filter((k) => D[k] !== undefined).map((k) => [k, D[k]]));
  data.receipt = { dataset: "candidate-floors-4/data/candidate/dataset-prepared.json", datasetSha256: preparedSha, missing, refusedContactsLeftOut: [...refused] };
  await put(vin, data);
  summary.validationInput = { missing, rows: D.nativeProvisionalCornerSeals?.rows?.length, sealsSha: D.nativeProvisionalCornerSeals?.geometrySha256 };
}
await writeFile(ODIR + "/dump-summary.json", JSON.stringify(summary, null, 1));
log("done", JSON.stringify(summary));
