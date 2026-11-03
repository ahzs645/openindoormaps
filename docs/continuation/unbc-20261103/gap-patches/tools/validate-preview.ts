// Validate proposed gap patches with the project's own validators and preview
// the retraced native regions, level by level. Read-only: nothing is applied.
// usage: node --import tsx validate-preview.ts master.zip candidates.json out-dir [levelId,...]
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { loadProject } from "./load-project";
import {
  validateNativeBoundaryPatches,
  reviewedBoundaryWalls,
  type NativeBoundaryPatch,
} from "../../../../../app/indoor-project/native-boundary-patches";
import { nativeMaterialPlanWalls } from "../../../../../app/indoor-project/native-material-plan";
import { preparedReviewedDoorApertures } from "../../../../../app/indoor-project/reviewed-door-apertures";
import { deriveExactBoundaryPatchGroupPreview } from "../../../../../app/indoor-project/enclosure-proposals";
import { deriveNativeAreas, type NativeAreaResult } from "../../../../../app/indoor-project/native-area-review";

const [master, candidatesPath, out, only, supersessionsPath] = process.argv.slice(2);
const { project, masterSha256 } = await loadProject(master, `${out}/../cache/project.v8`);
// A physical joint patch supersedes an applied selection-only contact repair
// on the same joint: that repair is replayed as "restored" (see README).
const supersessions: Record<string, string[]> = supersessionsPath ? JSON.parse(await readFile(supersessionsPath, "utf8")).supersessions : {};
const restoredIds = new Set(Object.values(supersessions).flat());
const data = restoredIds.size && project.dataset.nativeSelectionContactRepairs
  ? { ...project.dataset, nativeSelectionContactRepairs: { ...project.dataset.nativeSelectionContactRepairs,
      repairs: project.dataset.nativeSelectionContactRepairs.repairs.map((r) => restoredIds.has(r.id) ? { ...r, status: "restored" as const } : r) } }
  : project.dataset;
if (restoredIds.size) console.log(`superseding ${restoredIds.size} applied selection-contact repairs`);
const modelSha = data.source.modelSha256;
const all: NativeBoundaryPatch[] = JSON.parse(await readFile(candidatesPath, "utf8")).candidates.map((c: any) => c.patch);
await mkdir(out, { recursive: true });
validateNativeBoundaryPatches({ version: 1, patches: all }, modelSha);
console.log(`schema: ${all.length} patches pass validateNativeBoundaryPatches`);
const regions = (r: NativeAreaResult) => r.regions.map((g) => ({ id: g.id, roomKeys: g.roomKeys, nativeDoorIds: g.nativeDoorIds, areaSquareFeet: g.areaSquareFeet }));
const levels = [...new Set(all.map((p) => p.levelId))].filter((l) => !only || only === "all" || only.split(",").map(Number).includes(l));
const checks: Record<number, { evidence: Record<string, string>; guard: Record<string, string>; accepted: NativeBoundaryPatch[] }> = {};
for (const levelId of levels) {
  const patches = all.filter((p) => p.levelId === levelId);
  const evidence: Record<string, string> = {};
  for (const p of patches) {
    try {
      reviewedBoundaryWalls(data.walls, { version: 1, patches: [{ ...p, status: "applied" }] }, modelSha, undefined,
        preparedReviewedDoorApertures(data), data.nativeMaterialSections,
        data.nativeMaterialSections ? (id) => nativeMaterialPlanWalls(data, id) : undefined);
      evidence[p.id] = "ok";
    } catch (e) { evidence[p.id] = String((e as Error).message); }
  }
  // Guards only first: a malformed selection-contact collection makes the
  // final trace stop at its first validation, after every patch guard ran.
  const SENTINEL = "source identity or collection";
  const guardsOnly = async (set: NativeBoundaryPatch[]) => {
    try {
      await deriveExactBoundaryPatchGroupPreview({ ...data, nativeSelectionContactRepairs: { version: 0 } } as never, levelId, set, { mode: "connected", previewGapIds: set.map((p) => p.id) });
      throw new Error("sentinel did not stop the trace");
    } catch (err) {
      const m = String((err as Error).message);
      return m.includes(SENTINEL) ? undefined : m;
    }
  };
  let accepted: NativeBoundaryPatch[] = patches.filter((p) => evidence[p.id] === "ok");
  const guard: Record<string, string> = {};
  for (let message = await guardsOnly(accepted); message && accepted.length; message = await guardsOnly(accepted)) {
    // Guards run patch by patch in order: bisect the shortest failing prefix.
    let lo = 0, hi = accepted.length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (await guardsOnly(accepted.slice(0, mid))) hi = mid; else lo = mid;
    }
    const bad = accepted[hi - 1];
    guard[bad.id] = (await guardsOnly([bad])) ?? message;
    console.log(`level ${levelId}: refused ${bad.id}: ${guard[bad.id]}`);
    accepted = accepted.filter((p) => p !== bad);
  }
  checks[levelId] = { evidence, guard, accepted };
  console.log(`level ${levelId}: evidence ok ${Object.values(evidence).filter((v) => v === "ok").length}/${patches.length}; guards pass ${accepted.length}`);
}
await writeFile(`${out}/guards.json`, JSON.stringify(Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { evidence: v.evidence, guard: v.guard, accepted: v.accepted.map((p) => p.id) }]))));
console.log("GUARDS_DONE");
for (const levelId of levels) {
  const file = `${out}/level-${levelId}.json`;
  try { await access(file); console.log(`skip ${file}`); continue; } catch {}
  const patches = all.filter((p) => p.levelId === levelId);
  const { evidence, guard, accepted } = checks[levelId];
  const baselineFile = `${out}/baseline-${levelId}.json`;
  let before: ReturnType<typeof regions>, beforeSeconds = 0;
  try { before = JSON.parse(await readFile(baselineFile, "utf8")); } catch {
    const t0 = Date.now();
    before = regions(await deriveNativeAreas(data, levelId));
    beforeSeconds = (Date.now() - t0) / 1000;
    await writeFile(baselineFile, JSON.stringify(before));
  }
  console.log(`level ${levelId}: baseline ${before.length} regions (${beforeSeconds.toFixed(0)} s)`);
  const t = Date.now();
  const after = accepted.length ? await deriveExactBoundaryPatchGroupPreview(data, levelId, accepted, { mode: "connected", previewGapIds: accepted.map((p) => p.id) }) : undefined;
  console.log(`level ${levelId}: group preview with ${accepted.length} patches in ${((Date.now() - t) / 1000).toFixed(0)} s`);
  await writeFile(file, JSON.stringify({ masterSha256, levelId, patches: patches.map((p) => p.id), evidence, guard,
    accepted: accepted.map((p) => p.id), beforeSeconds, before, after: after ? regions(after) : null }));
}
console.log("VALIDATE_DONE");
