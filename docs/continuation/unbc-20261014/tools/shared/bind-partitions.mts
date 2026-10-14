/** Fresh bind / check / apply of owner-decided reviewed area partitions on a compiled-and-re-bound prepared dataset,
 * with the production functions of OIM app/indoor-project/reviewed-area-partitions.ts (the same sequence as
 * candidate-floors/integration/scripts/partitions.mts). Each spec names its decision and its two native supports:
 *  - an existing partition (e.g. Q3.9, left at needs-review by the approved-change re-bind because envelopes are not
 *    approvable changes) keeps its points and is bound afresh to this dataset;
 *  - a new partition (spec.proposal) is proposed, snapped to the two supports (0.05 ft), bound, checked and applied.
 * Endpoints must snap to exactly the declared supports, otherwise the partition is refused.
 * usage: node --import tsx bind-partitions.mts <dataset-prepared.json> <specs.json> <out-dir> [--write-dataset]
 * Writes <out-dir>/partitions-result.json and, with --write-dataset, <out-dir>/dataset-prepared.partitions.json. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
const [inPath, specPath, outDir] = process.argv.slice(2, 5);
const writeDataset = process.argv.includes("--write-dataset");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
await mkdir(outDir, { recursive: true });
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const P = await import(A + "reviewed-area-partitions.ts");
const raw = await readFile(inPath, "utf8");
const specText = await readFile(specPath, "utf8");
const specs = JSON.parse(specText).specs;
const D: any = JSON.parse(raw);
log("loaded", sha(raw).slice(0, 12), "specs", specs.length);
let project: any = { rooms: { reviewedAreaPartitions: structuredClone(D.reviewedAreaPartitions) }, dataset: D };
const results: any[] = [];
for (const s of specs) {
  const r: any = { id: s.id, decisionIds: s.decisionIds, supports: s.supports };
  try {
    let p0 = project.rooms.reviewedAreaPartitions.partitions.find((p: any) => p.id === s.id);
    r.existing = !!p0;
    if (p0) {
      r.statusBefore = p0.status;
      r.geometrySha256Before = p0.geometrySha256;
    } else {
      if (!s.proposal) throw Error("partition absent and no proposal given");
      const level = D.nativeLevels.find((l: any) => l.id === s.proposal.levelId);
      p0 = { geometrySha256: "0".repeat(64), closed: false, status: "proposed", selection: "closed", navigation: "unchanged", elevationFeet: level.elevationFeet, ...s.proposal, id: s.id };
      project = P.saveReviewedAreaPartition(project, p0);
    }
    const ends = P.snapReviewedAreaPartitionPoints(project.dataset, p0.levelId, [p0.pointsFeet[0], p0.pointsFeet.at(-1)], 0.05);
    r.snap = ends.details.map((d: any) => ({ original: d.originalPointFeet, snapped: d.pointFeet, nativeElementId: d.nativeElementId ?? null, distanceFeet: d.distanceFeet ?? null }));
    // owner-assumption lines (evidence kind reviewed-assumption) snap only the ends listed in snapEnds; the others stay as drawn
    const snapEnds: number[] = p0.evidence.kind === "reviewed-assumption" ? (s.snapEnds ?? []) : [0, 1];
    const snappedIds = ends.details.map((d: any, k: number) => (snapEnds.includes(k) ? d.nativeElementId : null)).filter((x: any) => x !== null);
    if (snappedIds.length !== snapEnds.length || snappedIds.some((x: any) => x === undefined || !s.supports.includes(x))) throw Error(`endpoint snapped to ${JSON.stringify(ends.details.map((d: any) => d.nativeElementId))}, declared supports ${s.supports}, snapped ends ${snapEnds}`);
    const pick = (k: number) => (snapEnds.includes(k) ? ends.pointsFeet[k] : [p0.pointsFeet[0], p0.pointsFeet.at(-1)][k]);
    const pts = [pick(0), ...p0.pointsFeet.slice(1, -1), pick(1)];
    r.pointsUnchanged = JSON.stringify(pts) === JSON.stringify(p0.pointsFeet);
    const { reboundFrom: _drop, evidenceSnapshot: _snap, evidenceBinding: _bind, ...base } = p0;
    const bound = await P.bindReviewedAreaPartitionEvidence(project.dataset, { ...base, pointsFeet: pts, evidence: { ...p0.evidence, nativeElementIds: p0.evidence.kind === "reviewed-assumption" ? [...new Set([...p0.evidence.nativeElementIds, ...snappedIds])] : [...new Set(snappedIds)] } });
    project = P.saveReviewedAreaPartition(project, bound);
    const check = P.checkReviewedAreaPartition(project.dataset, bound, bound.geometrySha256);
    r.check = { valid: check.valid, errors: check.errors, nativeFloorIds: check.nativeFloorIds, footprints: check.footprintsFeet.length };
    r.geometrySha256 = bound.geometrySha256;
    if (!check.valid) r.status = "proposed (refused by checkReviewedAreaPartition)";
    else { project = P.applyReviewedAreaPartitionGroup(project, [s.id], { [s.id]: bound.geometrySha256 }); r.status = "applied"; }
    r.partition = project.rooms.reviewedAreaPartitions.partitions.find((p: any) => p.id === s.id);
  } catch (e: any) { r.status = "refused (error)"; r.error = String(e.message).slice(0, 600); }
  results.push(r);
  log(s.id, r.status, JSON.stringify(r.check ?? r.error), "points unchanged", r.pointsUnchanged);
}
const out = { format: "candidate3-partitions-bind", input: { path: inPath, sha256: sha(raw) }, specs: { path: specPath, sha256: sha(specText) }, results, reviewedAreaPartitions: project.rooms.reviewedAreaPartitions };
await writeFile(outDir + "/partitions-result.json", JSON.stringify(out, null, 1));
if (writeDataset && results.every((r) => r.status === "applied")) {
  project.dataset.reviewedAreaPartitions = structuredClone(project.rooms.reviewedAreaPartitions);
  const text = JSON.stringify(project.dataset);
  await writeFile(outDir + "/dataset-prepared.partitions.json", text);
  log("wrote dataset", sha(text).slice(0, 12));
}
