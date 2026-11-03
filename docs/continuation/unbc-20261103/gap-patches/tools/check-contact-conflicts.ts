// Find gap patches whose new wall face would intersect the positive gap mask
// of an already applied native selection-contact repair. That replay guard
// runs inside every native trace and again at the end of Reviter
// regeneration, so such a patch would make both throw.
// usage: node --import tsx check-contact-conflicts.ts master.zip candidates.json ids.txt out.json
import { readFile, writeFile } from "node:fs/promises";
import { loadProject } from "./load-project";
import { reviewedBoundaryWalls, type NativeBoundaryPatch } from "../../../../../app/indoor-project/native-boundary-patches";
import { nativeMaterialPlanWalls } from "../../../../../app/indoor-project/native-material-plan";
import { preparedReviewedDoorApertures } from "../../../../../app/indoor-project/reviewed-door-apertures";
import { deriveNativeSelectionContactRepairs } from "../../../../../app/indoor-project/native-selection-contact-repairs";
import { nativeRationalScalarToIEEE } from "../../../../../app/indoor-project/native-rational-overlay";
import { assertNativeSelectionContactRepairsPhysicalGuards } from "../../../../../app/indoor-project/native-selection-contact-guards";

const [master, candidatesPath, idsPath, out] = process.argv.slice(2);
const { project } = await loadProject(master, "/home/user/unbc-work/gap-patches/cache/project.v8");
const data = project.dataset;
const ids = new Set((await readFile(idsPath, "utf8")).split(/\s+/).filter(Boolean));
const patches: NativeBoundaryPatch[] = JSON.parse(await readFile(candidatesPath, "utf8")).candidates.map((c: any) => c.patch).filter((p: NativeBoundaryPatch) => ids.has(p.id));
const repairs = (data.nativeSelectionContactRepairs?.repairs ?? []).filter((r) => r.status === "applied");
const result: Record<string, { conflict: boolean; message?: string; nearRepairs: string[] }> = {};
const box = (pts: number[][]) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
const near = (a: number[], b: number[]) => a[0] <= b[2] + 0.5 && b[0] <= a[2] + 0.5 && a[1] <= b[3] + 0.5 && b[1] <= a[3] + 0.5;
for (const p of patches) {
  const level = repairs.filter((r) => r.levelId === p.levelId);
  const masks = deriveNativeSelectionContactRepairs(data, level);
  const pb = box(p.ringsFeet[0]);
  const idx = level.map((r, i) => i).filter((i) => masks[i].some((part) => part.some((ring) => near(pb, box(ring.map((q) => [nativeRationalScalarToIEEE(q[0] as never), nativeRationalScalarToIEEE(q[1] as never)]))))));
  if (!idx.length) { result[p.id] = { conflict: false, nearRepairs: [] }; continue; }
  const tagged = reviewedBoundaryWalls(data.walls, { version: 1, patches: [{ ...p, status: "applied" }] }, data.source.modelSha256, undefined,
    preparedReviewedDoorApertures(data), data.nativeMaterialSections, data.nativeMaterialSections ? (id) => nativeMaterialPlanWalls(data, id) : undefined)
    .filter((w) => w.reviewPatchId === p.id);
  try {
    assertNativeSelectionContactRepairsPhysicalGuards({ ...data, walls: [...data.walls, ...tagged] } as never, idx.map((i) => level[i]), idx.map((i) => masks[i]));
    result[p.id] = { conflict: false, nearRepairs: idx.map((i) => level[i].id) };
  } catch (e) {
    result[p.id] = { conflict: true, message: String((e as Error).message), nearRepairs: idx.map((i) => level[i].id) };
    console.log(`conflict ${p.id}: ${(e as Error).message} (${idx.map((i) => level[i].id).join(", ")})`);
  }
}
await writeFile(out, JSON.stringify(result, null, 1));
console.log(`checked ${patches.length}; conflicts ${Object.values(result).filter((r) => r.conflict).length}; CONFLICTS_DONE`);
