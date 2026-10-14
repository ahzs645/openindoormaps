/** HEAVY (shared lock). Production selectable areas per native level (OIM HEAD deriveNativeAreas, mode connected,
 * maxGapFeet 0 — the same call as compileNativeExploreMapping), seal-index memo on.
 *   node derive-areas.mts before     -> published master dataset 73f7c95e (building09-08/routing/fresh-published-dataset.json)
 *   node derive-areas.mts candidate  -> data/compiled-candidate.json, after
 *       (1) label-anchor parity: routing is off, so records lost arrivalNodeId. A record gets back the arrival id it has
 *           in 73f7 when that node exists in the candidate (same production node point); otherwise none (interior point);
 *       (2) re-binding of the applied partitions after the approved changes (combined-build/scripts/rebind-partitions.ts);
 *       (3) the assembled proposed partitions (build receipt toApplyAfterBinding): bindReviewedAreaPartitionEvidence on the
 *           compiled candidate, checkReviewedAreaPartition, applyReviewedAreaPartitionGroup per level (valid ones only).
 * Writes data/<mode>/level-<id>.json (slim regions), data/<mode>/records.json, data/<mode>/walls-<id>.json,
 * data/<mode>/receipt.json. Resumable: finished levels are skipped. */
import { readFile, writeFile, mkdir, rename, access } from "node:fs/promises";
import { createHash } from "node:crypto";
const mode = process.argv[2];
// candidate-floors-3 copy (input candidate-floors-16/data/compiled-candidate.json, re-bind with candidate-floors-16/integration/manifest.c3.json; then the owner-decided partitions the re-bind leaves at needs-review are bound afresh, see (2b)). Was: candidate-floors-2 copy: candidate mode only (before = candidate-floors/data/before, published 73f7, kept). Input candidate-floors-16/data/compiled-candidate.json;
// re-bind with candidate-floors/integration/work/manifest.integration.json; production deriveNativeAreas only (no encode-tolerant copy: an encoder throw is recorded per level).
if (mode !== "candidate") throw Error("usage: derive-areas.mts candidate [levelId...]");
const only = process.argv.slice(3).map(Number);
const OIM = "/Users/ahmadjalil/github/openindoormaps", A = OIM + "/app/indoor-project/", RUN = OIM + "/work/floor1-followup-20261009";
const OUT = RUN + "/candidate-floors-16/data/" + mode;
const MANIFEST = RUN + "/candidate-floors-16/integration/manifest.c16.json";
await mkdir(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), `[${mode} ${Math.round((Date.now() - t0) / 1000)}s]`, ...a);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const exists = async (p: string) => access(p).then(() => true, () => false);
const put = async (p: string, v: unknown) => { const t = `${p}.${process.pid}.tmp`; await writeFile(t, JSON.stringify(v)); await rename(t, p); };
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const S = await import(A + "native-provisional-corner-seals.ts");
S.setDrawingBackedRowMemoEnabled(true);
const P = await import(A + "reviewed-area-partitions.ts");
const { deriveNativeAreas } = await import(A + "native-area-review.ts");
const PUBLISHED = RUN + "/building09-08/routing/fresh-published-dataset.json";
// RECEIPT_PART=<name>: a second process for some levels, after the first one wrote dataset-prepared.json; it keeps its own receipt part.
const part = process.env.RECEIPT_PART;
const receiptPath = OUT + (part ? `/receipt.${part}.json` : "/receipt.json");
if (part && !(await exists(OUT + "/dataset-prepared.json"))) throw Error("RECEIPT_PART needs dataset-prepared.json from the first process");
const receipt: any = (await exists(receiptPath)) ? JSON.parse(await readFile(receiptPath, "utf8"))
  : part ? { ...JSON.parse(await readFile(OUT + "/receipt.json", "utf8")), part, levels: {}, levelFailures: undefined, levelFailureStacks: undefined }
  : { format: "unbc-candidate-floors-areas-receipt", version: 1, mode, levels: {} };
receipt.memo = "drawing-backed row check memo on (setDrawingBackedRowMemoEnabled(true))";
let D: any;
{
  const path = mode === "before" ? PUBLISHED : RUN + "/candidate-floors-16/data/compiled-candidate.json";
  const raw = await readFile(path, "utf8");
  receipt.dataset = { path, sha256: sha(raw) };
  if (mode === "before" && !receipt.dataset.sha256.startsWith("73f7c95e")) throw Error("not the published 73f7 dataset");
  if (mode === "candidate") {
    const cr = JSON.parse(await readFile(RUN + "/candidate-floors-16/data/compiled-candidate.receipt.json", "utf8"));
    if (cr.output.sha256 !== receipt.dataset.sha256) throw Error("compiled candidate differs from its receipt");
  }
  D = JSON.parse(raw);
}
if (mode === "before") {
  // Published mapping (older code) kept for a code-drift cross-check of the HEAD derivation.
  const m = D.nativeExploreMapping;
  if (m) (globalThis as any).__PUBLISHED = new Map(m.levels.map((l: any) => [l.levelId, l]));
  if (m) await put(OUT + "/published-mapping-summary.json", { mappingSha256: m.mappingSha256, levels: m.levels.map((l: any) => ({ levelId: l.levelId, regions: l.regions.map((r: any) => [r.id, r.roomKeys, r.areaSquareFeet]) })) });
  delete D.nativeExploreMapping;
} else if (!(await exists(OUT + "/dataset-prepared.json"))) {
  // (1) label-anchor parity
  {
    const pub = JSON.parse(await readFile(PUBLISHED, "utf8"));
    const arr = new Map(pub.records.map((r: any) => [r.key, r.arrivalNodeId]));
    const pubNodes = new Map(pub.nodes.map((n: any) => [n.id, n.pointFeet]));
    const nodes = new Map(D.nodes.map((n: any) => [n.id, n]));
    const st = { restored: 0, samePoint: 0, movedPoint: 0, noNodeInCandidate: 0, notInPublished: 0, candidateHadArrival: 0 };
    for (const r of D.records) {
      if (r.arrivalNodeId) { st.candidateHadArrival++; continue; }
      const id: any = arr.get(r.key);
      if (!id) { st.notInPublished++; continue; }
      const n: any = nodes.get(id);
      if (!n) { st.noNodeInCandidate++; continue; }
      r.arrivalNodeId = id; st.restored++;
      if (JSON.stringify(pubNodes.get(id)) === JSON.stringify(n.pointFeet)) st.samePoint++; else st.movedPoint++;
    }
    receipt.labelAnchorParity = st;
    log("anchors", JSON.stringify(st));
  }
  // (2) re-bind applied partitions after the approved changes
  {
    const { rebindAfterApprovedChanges } = await import(RUN + "/candidate-floors-16/scripts/rebind-partitions.c14.ts");
    const r = await rebindAfterApprovedChanges(D, "73f7c95e0e066799c15071b890892ed2950768e47e7e6fbcdcb402817bdb3b01", MANIFEST);
    await put(RUN + "/candidate-floors-16/data/rebind-report.json", { dataset: receipt.dataset, manifest: MANIFEST, baseDatasetSha256: "73f7c95e0e066799c15071b890892ed2950768e47e7e6fbcdcb402817bdb3b01", ...r.report });
    D.reviewedAreaPartitions = r.reviewedAreaPartitions;
    receipt.rebind = r.report;
    log("rebind", JSON.stringify(r.report.outcomes.map((o: any) => [o.id, o.outcome])));
  }
  // (2b) owner-decided partitions whose evidence window changed outside the approved set only through compile-derived envelope
  //      supplements (envelopes are not approvable changes): bound afresh to this dataset with the same points and supports,
  //      checked and applied (candidate-floors-3/partitions/bind-partitions.mts; decisions 2026-10-10-round3#Q3.9, 2026-10-12-round6#q6.2).
  {
    // candidate-floors-16: + owner round 7 lines; owner-assumption lines snap only the ends that sit on native walls
    const FRESH: Record<string, number[]> = { "r3-q3.9:694:06-212-dwg-arc-wall": [1351472, 1327847], "r6-q6.2:694:09-310-open-entrance": [1522251, 1521857],
      "r7-q7.1:694:06-212-06-235-radial-wall": [1783529], "r7-q7.1:694:06-232-06-235-arc-wall": [1327847], "r7-q7.5:311:07-316-dish-washing-front": [784955, 768689],
      // candidate-floors-16: the Floor 3 envelope census changed (compile-derived), so the round-2 lab-suite lines are bound afresh too
      "r2-lab-suite:400176:04-333-04-334": [2093773, 2093767], "r2-lab-suite:400176:04-335-04-336": [2094084, 2094088], "r2-lab-suite:400176:04-336-04-337": [439560, 2096888] };
    const SNAP_ENDS: Record<string, number[]> = { "r7-q7.1:694:06-212-06-235-radial-wall": [1], "r7-q7.1:694:06-232-06-235-arc-wall": [1] };
    let proj: any = { rooms: { reviewedAreaPartitions: D.reviewedAreaPartitions }, dataset: D };
    const out: any[] = [];
    // candidate-floors-16: any applied partition whose evidence changed only in the compile-derived envelope collections is bound afresh
    // too (same points and supports; envelopes are not approvable changes but are derived by the compiler from approved inputs)
    for (const o of receipt.rebind.outcomes) {
      if (o.outcome !== "needs-review" || FRESH[o.id]) continue;
      const diffs = o.differences ?? [];
      if (!diffs.length || !diffs.every((d: any) => d.collection === "envelopes" || d.collection === "envelopes:census")) continue;
      const p0 = D.reviewedAreaPartitions.partitions.find((p: any) => p.id === o.id);
      if (p0?.evidence?.kind === "native-endpoints") FRESH[o.id] = [...p0.evidence.nativeElementIds];
    }
    for (const [id, supports] of Object.entries(FRESH)) {
      const o = receipt.rebind.outcomes.find((x: any) => x.id === id);
      if (o?.outcome !== "needs-review") { out.push({ id, skipped: o?.outcome ?? "absent" }); continue; }
      const p0 = proj.rooms.reviewedAreaPartitions.partitions.find((p: any) => p.id === id);
      const ends = P.snapReviewedAreaPartitionPoints(proj.dataset, p0.levelId, [p0.pointsFeet[0], p0.pointsFeet.at(-1)], 0.05);
      const se = SNAP_ENDS[id] ?? [0, 1];
      const sn = ends.details.map((d: any, k: number) => (se.includes(k) ? d.nativeElementId : null)).filter((x: any) => x !== null);
      if (sn.length !== se.length || sn.some((x: any) => !supports.includes(x))) { out.push({ id, error: `snapped to ${JSON.stringify(ends.details.map((d: any) => d.nativeElementId))}` }); continue; }
      const pick = (k: number) => (se.includes(k) ? ends.pointsFeet[k] : [p0.pointsFeet[0], p0.pointsFeet.at(-1)][k]);
      const pts = [pick(0), ...p0.pointsFeet.slice(1, -1), pick(1)];
      const { reboundFrom: _a, evidenceSnapshot: _b, evidenceBinding: _c, ...base } = p0;
      const bound = await P.bindReviewedAreaPartitionEvidence(proj.dataset, { ...base, pointsFeet: pts, evidence: { ...p0.evidence, nativeElementIds: p0.evidence.kind === "reviewed-assumption" ? [...new Set([...p0.evidence.nativeElementIds, ...sn])] : [...new Set(sn)] } });
      proj = P.saveReviewedAreaPartition(proj, bound);
      const c = P.checkReviewedAreaPartition(proj.dataset, bound, bound.geometrySha256);
      if (c.valid) proj = P.applyReviewedAreaPartitionGroup(proj, [id], { [id]: bound.geometrySha256 });
      out.push({ id, valid: c.valid, errors: c.errors, applied: c.valid, pointsUnchanged: JSON.stringify(pts) === JSON.stringify(p0.pointsFeet), geometrySha256: bound.geometrySha256 });
    }
    D = proj.dataset; D.reviewedAreaPartitions = proj.rooms.reviewedAreaPartitions;
    receipt.freshBound = out;
    log("fresh-bound", JSON.stringify(out));
  }
  // (3) bind + check + apply the assembled proposals
  {
    const br = JSON.parse(await readFile(RUN + "/combined-build/assembled/build-receipt.json", "utf8"));
    const want = new Set(br.toApplyAfterBinding.map((t: any) => t.id));
    let proj: any = { rooms: { reviewedAreaPartitions: D.reviewedAreaPartitions }, dataset: D };
    const out: any[] = [];
    for (const p of D.reviewedAreaPartitions.partitions.filter((p: any) => want.has(p.id) && p.status === "proposed")) {
      try { proj = P.saveReviewedAreaPartition(proj, await P.bindReviewedAreaPartitionEvidence(proj.dataset, p)); out.push({ id: p.id, levelId: p.levelId, bound: true }); }
      catch (e) { out.push({ id: p.id, levelId: p.levelId, bound: false, error: String((e as Error).message).slice(0, 400) }); }
    }
    const bound = out.filter((o) => o.bound);
    const digests = await P.reviewedAreaPartitionEvidenceHashes(proj.dataset, proj.rooms.reviewedAreaPartitions.partitions.filter((p: any) => bound.some((b) => b.id === p.id)));
    for (const o of bound) {
      const p = proj.rooms.reviewedAreaPartitions.partitions.find((x: any) => x.id === o.id);
      const c = P.checkReviewedAreaPartition(proj.dataset, p, digests[o.id]);
      o.valid = c.valid; o.errors = c.errors; o.provisional = c.provisional;
    }
    for (const lid of new Set(bound.filter((o) => o.valid).map((o) => o.levelId))) {
      const ids = bound.filter((o) => o.valid && o.levelId === lid).map((o) => o.id);
      try { proj = P.applyReviewedAreaPartitionGroup(proj, ids, digests); for (const o of bound) if (ids.includes(o.id)) o.applied = true; }
      catch (e) { for (const o of bound) if (ids.includes(o.id)) o.applyError = String((e as Error).message).slice(0, 400); }
    }
    D = proj.dataset;
    receipt.proposalsBound = out;
    log("proposals", JSON.stringify(out.map((o) => [o.id, o.bound, o.valid, o.applied ?? false])));
  }
  await writeFile(OUT + "/dataset-prepared.json.tmp", JSON.stringify(D));
  await rename(OUT + "/dataset-prepared.json.tmp", OUT + "/dataset-prepared.json");
  await put(receiptPath, receipt);
} else {
  D = JSON.parse(await readFile(OUT + "/dataset-prepared.json", "utf8"));
  log("resumed prepared dataset");
}
receipt.partitionsFinal = D.reviewedAreaPartitions.partitions.map((p: any) => ({ id: p.id, levelId: p.levelId, status: p.status, label: p.label }));
// slim records and walls for rendering
const ringArea = (r: number[][]) => Math.abs(r.reduce((n, p, j) => { const q = r[(j + 1) % r.length]!; return n + p[0]! * q[1]! - q[0]! * p[1]!; }, 0)) / 2;
const recArea = (r: any) => (r.ringsFeet?.length ? ringArea(r.ringsFeet[0]) - r.ringsFeet.slice(1).reduce((n: number, h: number[][]) => n + ringArea(h), 0) : 0);
const bboxOf = (r: any) => { const ps = (r.ringsFeet?.[0] ?? []) as number[][]; return ps.length ? [Math.min(...ps.map((p) => p[0]!)), Math.min(...ps.map((p) => p[1]!)), Math.max(...ps.map((p) => p[0]!)), Math.max(...ps.map((p) => p[1]!))].map((v) => Math.round(v * 100) / 100) : null; };
const records = D.records.map((r: any) => ({ area: Math.round(recArea(r) * 100) / 100, bbox: bboxOf(r), key: r.key, number: r.number, name: r.name, building: r.building, levelId: r.levelId, walkable: r.walkable, access: r.access, circulation: r.circulation, stair: r.stair, elevationFeet: r.elevationFeet, spaceUse: r.properties?.spaceUse ?? r.spaceUse }));
await put(OUT + "/records.json", records);
const rnd = (v: any): any => (Array.isArray(v) ? v.map(rnd) : typeof v === "number" ? Math.round(v * 1e5) / 1e5 : v);
for (const lv of D.nativeLevels) await put(`${OUT}/walls-${lv.id}.json`, D.walls.filter((w: any) => w.levelId === lv.id).map((w: any) => ({ id: w.nativeElementId, kind: w.kind, patch: w.reviewPatchId ?? null, rings: rnd(w.ringsFeet) })));
await put(OUT + "/record-outlines.json", D.records.map((r: any) => ({ key: r.key, levelId: r.levelId, outline: rnd(r.properties?.originalSourceRingsFeet ?? r.ringsFeet), native: r.properties?.originalSourceRingsFeet ? rnd(r.ringsFeet) : null })));
await put(OUT + "/doors.json", (D.doors ?? []).map((d: any) => ({ id: d.id, levelId: d.levelId, nativeElementId: d.nativeElementId, footprint: rnd(d.footprintFeet ?? null), point: rnd(d.pointFeet ?? null), roomKeys: d.roomKeys, state: d.state, drawn: d.drawingBackedPatchId ?? null })));
await put(OUT + "/envelopes.json", (D.nativeIndoorEnvelopes?.levels ?? []).map((l: any) => ({ levelId: l.levelId, cutElevationsFeet: l.cutElevationsFeet, parts: rnd(l.partsFeet), supplements: (l.supplements ?? []).length })));
await put(OUT + "/partitions.json", (D.reviewedAreaPartitions?.partitions ?? []).map((p: any) => ({ id: p.id, levelId: p.levelId, status: p.status, kind: p.kind, label: p.label, pointsFeet: p.pointsFeet, closed: p.closed })));
await put(OUT + "/exclusions.json", (D.indoorExclusions?.areas ?? []).map((a: any) => ({ id: a.id, levelId: a.levelId, kind: a.kind, reason: a.reason, label: a.label, rings: rnd(a.ringsFeet ?? a.polygonFeet ?? a.partsFeet ?? null) })));
await put(OUT + "/vertical.json", { connectors: (D.connectors ?? []).map((c: any) => ({ id: c.id, kind: c.kind, entrances: (c.entrances ?? []).map((e: any) => ({ nodeId: e.nodeId, levelId: e.levelId, roomKey: e.roomKey })), footprint: rnd(c.footprintFeet ?? c.shaftFeet ?? null) })), ramps: (D.rampDisplay?.ramps ?? []).map((r: any) => ({ id: r.edgeId, nativeElementId: r.nativeElementId, levelIds: r.levelIds, triangles: rnd(r.trianglesFeet) })), flights: (D.stairDisplay?.sourceFlights ?? []).map((f: any) => ({ id: f.stairElementId, levelIds: f.levelIds, buildings: f.buildings, treads: (f.treads ?? []).map((t: any) => rnd(t.ringFeet)) })) });
await put(OUT + "/levels.json", { nativeLevels: D.nativeLevels, floors: D.floors.map((f: any) => ({ id: f.id, name: f.name, levelIds: f.levelIds })), nativePhysicalLevels: D.nativePhysicalLevels });
await put(receiptPath, receipt);
for (const level of D.nativeLevels) {
  if (only.length && !only.includes(level.id)) continue;
  const file = `${OUT}/level-${level.id}.json`;
  if (await exists(file)) { log("level", level.id, "done earlier"); continue; }
  if (!D.walkingSupport?.floors.some((f: any) => Math.abs(f.elevationFeet - level.elevationFeet) < 0.15)) { receipt.levels[level.id] = { unavailable: true }; await put(receiptPath, receipt); continue; }
  const t = Date.now();
  log("level", level.id, "start");
  let r: any;
  for (let attempt = 0; ; attempt++) {
    try { r = await deriveNativeAreas(D, level.id, { mode: "connected", maxGapFeet: 0 }); break; }
    catch (e) {
      const msg = String((e as Error).message);
      // production encoder throws are recorded below (levelFailures) and the level is left without areas
      if (!/Native selection contact repair/.test(msg)) {
        (receipt.levelFailures ??= {})[level.id] = (receipt.levelFailures?.[level.id] ?? "") + " | " + msg.slice(0, 500);
        (receipt.levelFailureStacks ??= {})[level.id] = String((e as Error).stack ?? "").slice(0, 2000);
        const pub = mode === "before" ? (globalThis as any).__PUBLISHED?.get(level.id) : undefined;
        if (pub) {
          log("level", level.id, "HEAD derivation failed; using the mapping published with 73f7:", msg.slice(0, 200));
          r = { geometrySha256: "published-mapping", regions: pub.regions, warnings: [], logicalPartitionIds: (pub.boundaries ?? []).map((b: any) => b.id), omittedLogicalPartitions: [], usedPublishedMapping: true };
          receipt.levelFailures[level.id] += " -> used the nativeExploreMapping published with 73f7 (older code)";
          break;
        }
        log("level", level.id, "FAILED", msg.slice(0, 300));
        r = undefined; break;
      }
      if (attempt > 0 || !/Native selection contact repair/.test(msg)) throw e;
      // Fail-closed runtime contact guard: find the refused repairs of this level (bisection), report and leave them out.
      const G = await import(A + "native-selection-contact-guards.ts"), CR = await import(A + "native-selection-contact-repairs.ts");
      const lv = D.nativeSelectionContactRepairs.repairs.filter((x: any) => x.status === "applied" && x.levelId === level.id);
      const bad: any[] = [];
      const check = (b: any[]) => { try { G.assertNativeSelectionContactRepairsPhysicalGuards(D, b, CR.deriveNativeSelectionContactRepairs(D, b)); return undefined; } catch (x) { return String((x as Error).message); } };
      const bis = (b: any[]): void => { const er = check(b); if (!er) return; if (b.length === 1) { bad.push({ id: b[0].id, levelId: level.id, reason: er }); return; } const h = Math.ceil(b.length / 2); bis(b.slice(0, h)); bis(b.slice(h)); };
      bis(lv);
      const ids = new Set(bad.map((x) => x.id));
      D.nativeSelectionContactRepairs.repairs = D.nativeSelectionContactRepairs.repairs.filter((x: any) => !ids.has(x.id));
      (receipt.runtimeRefusedContacts ??= []).push(...bad);
      log("level", level.id, "runtime guard refused contacts", JSON.stringify([...ids]));
    }
  }
  if (!r) { await put(receiptPath, receipt); continue; }
  const seconds = Math.round((Date.now() - t) / 1000);
  const slim = {
    levelId: level.id, elevationFeet: level.elevationFeet, seconds, geometrySha256: r.geometrySha256,
    regions: r.regions.map((g: any) => ({ id: g.id, roomKeys: g.roomKeys, area: g.areaSquareFeet, exposed: g.exposedFloorEdgeFeet, nativeFloorIds: g.nativeFloorIds, nativeDoorIds: g.nativeDoorIds, rings: rnd(g.ringsFeet) })),
    logicalPartitionIds: r.logicalPartitionIds ?? [], omittedLogicalPartitions: r.omittedLogicalPartitions ?? [], logicalPartitionEvidenceTests: r.logicalPartitionEvidenceTests ?? {},
    contactClosureDuplicates: (r.contactClosureDuplicates ?? []).length, warnings: r.warnings, usedPublishedMapping: !!r.usedPublishedMapping, encodeTolerant: r.encodeTolerant ?? null,
  };
  await put(file, slim);
  receipt.levels[level.id] = { seconds, regions: slim.regions.length, warnings: r.warnings.length, logicalPartitionIds: slim.logicalPartitionIds, omitted: slim.omittedLogicalPartitions.map((o: any) => o.id), memo: S.drawingBackedRowMemoStats() };
  await put(receiptPath, receipt);
  log("level", level.id, "regions", slim.regions.length, "seconds", seconds, JSON.stringify(S.drawingBackedRowMemoStats()));
}
receipt.finishedAt = new Date().toISOString();
await put(receiptPath, receipt);
log("done");
