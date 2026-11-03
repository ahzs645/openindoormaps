// Prepare a regeneration input: apply a reviewed native-boundary patch file to
// a full authoring master with the project's own functions, then export it.
// Import keeps the file's rows as proposals (importNativeBoundaryPatchFile);
// each level's guards (floor support, protected openings, doors, columns,
// fixtures, both wall contacts) are replayed with the existing exact-patch
// preview, and each row is then applied by saveNativeBoundaryPatches, which
// adds the tagged wall faces and sets boundaryPatchState.regenerated=false.
// Optional SUPERSESSIONS.json ({supersessions: {patchId: [contactRepairId]}})
// restores the applied selection-only contact repairs that each physical
// joint patch replaces, in both the room review and the dataset, with a note.
// usage: node --import tsx apply-gap-patches.ts master.zip patch-file.json out.zip [supersessions.json]
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { initializeNativeExactGeosOverlay } from "../../../../../app/indoor-project/native-exact-geos-overlay";
import { readIndoorProject, exportIndoorProject } from "../../../../../app/indoor-project/package";
import { importNativeBoundaryPatchFile } from "../../../../../app/indoor-project/native-boundary-patch-file";
import { deriveExactBoundaryPatchGroupPreview } from "../../../../../app/indoor-project/enclosure-proposals";
import { nativeAreaGeometrySha256, saveNativeBoundaryPatches, type NativeAreaResult } from "../../../../../app/indoor-project/native-area-review";

const [input, patchPath, output, supersessionsPath] = process.argv.slice(2);
if (!input || !patchPath || !output) throw new Error("usage: apply-gap-patches.ts master.zip patch-file.json out.zip");
await initializeNativeExactGeosOverlay();
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = new Uint8Array(await readFile(input));
const file = JSON.parse(await readFile(patchPath, "utf8"));
console.log(JSON.stringify({ stage: "read", input, inputSha256: sha(bytes), patchFileSha256: sha(new Uint8Array(await readFile(patchPath))) }));
let project = await readIndoorProject(bytes);
console.log(JSON.stringify({ stage: "imported" }));
project = importNativeBoundaryPatchFile(project, file);
if (supersessionsPath) {
  const supersessions: Record<string, string[]> = JSON.parse(await readFile(supersessionsPath, "utf8")).supersessions;
  const by = new Map<string, string>();
  for (const [pid, rids] of Object.entries(supersessions)) for (const r of rids) by.set(r, pid);
  const restore = <T extends { repairs: { id: string; status: string; notes: string }[] } | undefined>(c: T): T => c && ({
    ...c, repairs: c.repairs.map((r) => by.has(r.id) && r.status === "applied"
      ? { ...r, status: "restored", notes: `${r.notes} Restored 2026-11-03: superseded by physical joint patch ${by.get(r.id)} (project owner requested: patch accidental modelling gaps); this selection-only contact did not change walking routes.` }
      : r) }) as T;
  const before = (project.rooms.nativeSelectionContactRepairs?.repairs ?? []).filter((r) => by.has(r.id) && r.status === "applied").length;
  if (before !== by.size) throw new Error(`expected ${by.size} applied contact repairs to supersede, found ${before}`);
  project = { ...project, rooms: { ...project.rooms, nativeSelectionContactRepairs: restore(project.rooms.nativeSelectionContactRepairs) },
    dataset: { ...project.dataset, nativeSelectionContactRepairs: restore(project.dataset.nativeSelectionContactRepairs) } };
  console.log(JSON.stringify({ stage: "superseded-contact-repairs", count: by.size }));
}
const ids: string[] = file.nativeBoundaryPatches.patches.map((p: { id: string }) => p.id);
const rows = () => project.rooms.nativeBoundaryPatches!.patches.filter((p) => ids.includes(p.id));
for (const levelId of [...new Set(rows().map((p) => p.levelId))]) {
  const patches = rows().filter((p) => p.levelId === levelId && p.status === "proposed");
  // Guards only: the malformed selection-contact sentinel stops the trace
  // that follows a fully passing guard pass, so no level is retraced here.
  try {
    await deriveExactBoundaryPatchGroupPreview({ ...project.dataset, nativeSelectionContactRepairs: { version: 0 } } as never, levelId, patches,
      { mode: "connected", previewGapIds: patches.map((p) => p.id) });
    throw new Error("sentinel did not stop the trace");
  } catch (e) {
    if (!String((e as Error).message).includes("source identity or collection")) throw new Error(`level ${levelId} guard refusal: ${(e as Error).message}`);
  }
  for (const p of patches) {
    const options = { mode: "connected" as const, previewGapIds: [p.id] };
    const { status: _s, notes: _n, ...candidate } = p;
    const result = {
      levelId, sourceModelSha256: project.dataset.source.modelSha256,
      geometrySha256: await nativeAreaGeometrySha256(project.dataset, levelId, options),
      options, gapCandidates: [candidate], regions: [], warnings: [], doorChecks: [],
    } as unknown as NativeAreaResult;
    project = await saveNativeBoundaryPatches(project, result, [p.id], p.notes, true);
  }
  console.log(JSON.stringify({ stage: "applied", levelId, patches: patches.length }));
}
const state = project.dataset.boundaryPatchState;
console.log(JSON.stringify({ stage: "state", regenerated: state?.regenerated, appliedPatchIds: state?.patchIds.length }));
const out = await exportIndoorProject(project);
await writeFile(output, out, { flag: "wx" });
console.log(JSON.stringify({ stage: "exported", output, bytes: out.length, sha256: sha(out) }));
