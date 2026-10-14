/** Receipt-bound re-binding step of the combined build (generic; production rule
 * decideReviewedAreaPartitionApprovedChangeRebind in app/indoor-project/reviewed-area-partitions.ts).
 *
 * The approved change set is derived from the build manifest: every drawing-backed row, drawn door, contact repair,
 * boundary patch, exclusion and placeholder record it lists with a decision id, found in the dataset byte-for-byte
 * as listed (a record that differs from its manifest entry is NOT approved). Each change names the local-evidence
 * elements it introduces in the dataset (rows -> provisionalCornerSeals:<id>; a drawn door -> doors:<dataset door id>,
 * doorApertures:<record id> and walls:<host id>; contacts -> contactRepairs:<id>; patches -> walls:<owner>:<patch id>;
 * exclusions -> exclusions:<id>; placeholder entries may list their elements explicitly).
 * An applied, locally bound partition whose evidence changed is re-bound only if every differing element belongs to
 * that set; the receipt (reboundFrom.approvedChanges + a rebind history entry) names those elements with their change
 * and decision ids. Anything else keeps the partition stale and is reported.
 *
 * CLI (heavy when the dataset is a full compile): node --import tsx rebind-partitions.ts <dataset.json> <out.json>
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const OIM = "/Users/ahmadjalil/github/openindoormaps", A = OIM + "/app/indoor-project/";
const RUN = OIM + "/work/floor1-followup-20261009";
const P = await import(A + "reviewed-area-partitions.ts");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const abs = (p: string) => (p.startsWith("/") ? p : RUN + "/" + p);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const omit = (o: any, ...ks: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k)));

export async function approvedChangeSet(dataset: any, manifestPath = RUN + "/combined-build/manifest.json") {
  const text = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(text);
  const changes: any[] = [], refused: any[] = [];
  const read = async (e: any) => JSON.parse(await readFile(abs(e.path), "utf8"));
  const seals = new Map((dataset.nativeProvisionalCornerSeals?.rows ?? []).map((r: any) => [r.id, r]));
  const contacts = new Map((dataset.nativeSelectionContactRepairs?.repairs ?? []).map((r: any) => [r.id, r]));
  const exclusions = new Map((dataset.indoorExclusions?.areas ?? []).map((a: any) => [a.id, a]));
  let apertures: any[] = [];
  try { apertures = JSON.parse(dataset.doorAperturePatchState?.sourceGeometryKey ?? "[]"); } catch { apertures = []; }
  // candidate-floors patch: the same row listed byte-identically by two manifest inputs is one approved change
  // (6 rows db:*:r4-b10-stacked:* are in both rows.final-v2 and rows.b10-final; the build receipt counts them as duplicatesIdentical).
  const add = (c: any) => { const o = changes.find((x) => x.id === c.id); if (o && o.sha256 === c.sha256 && JSON.stringify(o.elements) === JSON.stringify(c.elements)) return; return c.elements.length ? changes.push(c) : refused.push({ id: c.id, reason: "no element of it is in this dataset" }); };
  for (const e of manifest.inputs) {
    if (e.role === "drawing-backed-rows")
      for (const r of (await read(e)).rows) {
        const d = seals.get(r.id);
        if (!d) continue;
        if (!same(d, r)) { refused.push({ id: r.id, input: e.id, reason: "dataset row differs from the manifest entry" }); continue; }
        add({ id: r.id, kind: "drawing-backed-row", decisionId: r.drawingBacked.decisionId, sha256: sha(JSON.stringify(r)), elements: [{ collection: "provisionalCornerSeals", key: r.id }] });
      }
    // candidate-floors-5: checked door-to-jamb closure records (owner round 7 Q7.3/Q7.4) are approvable changes of the
    // level's doorBoundaryClosures evidence collection, one change per record.
    if (e.role === "door-boundary-closures")
      for (const r of (await read(e)).records) {
        const d = dataset.nativeDoorBoundaryClosures?.doors.find((x: any) => x.id === r.id);
        if (!d) continue;
        if (!same(d, r)) { refused.push({ id: r.id, input: e.id, reason: "dataset door closure differs from the manifest entry" }); continue; }
        add({ id: r.id, kind: "door-boundary-closure", decisionId: e.decisionIds[0], sha256: sha(JSON.stringify(r)), elements: [{ collection: "doorBoundaryClosures", key: r.id }] });
      }
    if (e.role === "drawn-door") {
      const r = await read(e);
      const ap = apertures.find((a: any) => a.id === r.id);
      if (!ap) continue;
      if (!same(omit(ap, "notes"), omit(r, "notes"))) { refused.push({ id: r.id, input: e.id, reason: "dataset aperture differs from the manifest record" }); continue; }
      const doors = (dataset.doors ?? []).filter((d: any) => d.drawingBackedPatchId === r.id).map((d: any) => ({ collection: "doors", key: String(d.id ?? d.nativeElementId) }));
      const host = (dataset.walls ?? []).some((w: any) => w.levelId === r.levelId && w.nativeElementId === r.hostWallNativeElementId && !w.reviewPatchId);
      add({ id: r.id, kind: "drawn-door", decisionId: e.decisionIds[0], sha256: e.sha256, elements: [...doors, { collection: "doorApertures", key: r.id }, ...(host ? [{ collection: "walls", key: String(r.hostWallNativeElementId) }] : [])] });
    }
    if (e.role === "contact-repairs") {
      const f = await read(e);
      for (const r of f.repairs ?? f.collection?.repairs ?? []) {
        const d: any = contacts.get(r.id);
        if (!d) continue;
        if (!same(omit(d, "status"), omit(r, "status")) || d.status !== "applied") { refused.push({ id: r.id, input: e.id, reason: "dataset contact repair differs from the manifest entry" }); continue; }
        add({ id: r.id, kind: "contact-repair", decisionId: e.decisionIds[0], sha256: sha(JSON.stringify(r)), elements: [{ collection: "contactRepairs", key: r.id }] });
      }
    }
    if (e.role === "boundary-continuations" || e.role === "boundary-patch-application") {
      const f = await read(e);
      const list = f.patch ? [f.patch] : (f.patches ?? []).map((x: any) => x.patch ?? x).concat(f.collection?.patches ?? []);
      for (const p of list) {
        const walls = (dataset.walls ?? []).filter((w: any) => w.reviewPatchId === p.id).map((w: any) => ({ collection: "walls", key: `${w.nativeElementId}:${p.id}` }));
        if (walls.length) add({ id: p.id, kind: "boundary-patch", decisionId: e.decisionIds[0], sha256: sha(JSON.stringify(p)), elements: walls });
      }
    }
    // candidate-floors patch: the compile-derived material census repair is an approved manifest input (role derived-check,
    // field nativeMaterialSectionSupplement); when the compile reproduced it exactly, its sections are approved changes.
    if (e.role === "derived-check" && e.field === "nativeMaterialSectionSupplement") {
      const f = (await read(e)).supplement;
      if (dataset.nativeMaterialSectionSupplement?.geometrySha256 !== f.geometrySha256) refused.push({ id: e.id, reason: "the compiled material supplement does not reproduce the manifest's geometrySha256" });
      else add({ id: e.id, kind: "derived-check", decisionId: e.decisionIds[0], sha256: e.sha256, elements: f.levels.flatMap((l: any) => l.sections.map((x: any) => ({ collection: `materialSectionSupplement:${l.levelId}@${l.elevationFeet}/${l.cutElevationFeet}`, key: String(x.nativeElementId) }))) });
    }
    if (e.role === "indoor-exclusions")
      for (const a of (await read(e)).areas ?? []) {
        const d: any = exclusions.get(a.id);
        if (!d) continue;
        if (!same(omit(d, "notes", "evidence"), omit(a, "notes", "evidence"))) { refused.push({ id: a.id, input: e.id, reason: "dataset exclusion differs from the manifest entry" }); continue; }
        add({ id: a.id, kind: "indoor-exclusion", decisionId: e.decisionIds[0], sha256: sha(JSON.stringify(a)), elements: [{ collection: "exclusions", key: a.id }] });
      }
  }
  // Placeholder outputs (agents A and B) list their own elements once written.
  for (const p of Object.values<any>(manifest.placeholders ?? {})) {
    let text: string;
    try { text = await readFile(abs(p.listFile), "utf8"); } catch { continue; }
    // The input list is the first fenced json block holding an array of {id, path, sha256, decisionIds}.
    let list: any[] = [];
    for (const m of text.matchAll(/```json\s*([\s\S]*?)```/g)) {
      try { const v = JSON.parse(m[1]!); if (Array.isArray(v) && v.every((e) => e && e.path && e.sha256)) { list = v; break; } } catch { /* not the list */ }
    }
    for (const e of list) if (Array.isArray(e.elements) && e.elements.length) add({ id: e.id, kind: e.role ?? "record", decisionId: e.decisionIds?.[0], sha256: e.sha256, elements: e.elements });
  }
  const set = { manifestSha256: sha(text), changes };
  P.validateReviewedAreaPartitionApprovedChangeSet(set);
  return { set, refused };
}

export async function rebindAfterApprovedChanges(dataset: any, baseDatasetSha256: string, manifestPath?: string) {
  const { set, refused } = await approvedChangeSet(dataset, manifestPath);
  const value = dataset.reviewedAreaPartitions;
  const outcomes: any[] = [];
  for (const p of value?.partitions ?? []) {
    if (p.status !== "applied") continue;
    const current = await P.reviewedAreaPartitionLocalEvidence(dataset, p);
    outcomes.push(await P.decideReviewedAreaPartitionApprovedChangeRebind(p, current, set, baseDatasetSha256));
  }
  const next = P.rebindReviewedAreaPartitions(value, outcomes);
  return {
    reviewedAreaPartitions: next,
    report: {
      manifestSha256: set.manifestSha256, approvedChanges: set.changes.length, refusedChanges: refused,
      outcomes: outcomes.map((o) => ({ id: o.id, outcome: o.outcome, ...(o.outcome === "rebound" ? { approvedChanges: o.partition.reboundFrom.approvedChanges.elements } : {}), ...(o.outcome === "needs-review" ? { reason: o.reason, differences: o.differences } : {}), ...(o.outcome === "evidence-holds" ? { evidenceTest: o.evidenceTest } : {}) })),
      stale: outcomes.filter((o) => o.outcome === "needs-review").map((o) => o.id),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // candidate-floors-2: optional 3rd arg = manifest path, 4th = base dataset sha (default: the input's sha)
  const [input, output, manifestArg, baseArg] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: rebind-partitions.ts <dataset.json> <out.json> [manifest.json] [baseSha]");
  await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
  const raw = await readFile(input, "utf8");
  const r = await rebindAfterApprovedChanges(JSON.parse(raw), baseArg ?? sha(raw), manifestArg);
  await writeFile(output, JSON.stringify(r, null, 1));
  console.log(JSON.stringify(r.report.outcomes.map((o: any) => [o.id, o.outcome]), null, 1));
}
