// Resumable per-level wrapper around the existing narrow-connection scanner.
// Loads the master once; writes one compact report per (level, max width).
// Usage: node --import tsx scan-all-levels.ts master.zip out-dir 3,1 [min-area=40]
import { writeFile, mkdir, access } from "node:fs/promises";
import { loadProject } from "./load-project";
import { scanNativeGaps, compactGapScan } from "../../../../../app/indoor-project/native-gap-scan";
const [input, out, widths = "3", minArea = "40"] = process.argv.slice(2);
const { project, masterSha256: sha } = await loadProject(input, `${out}/../cache/project.v8`);
await mkdir(out, { recursive: true });
// Plain geometry tables for the independent walk/clearance inventory.
{
  const file = `${out}/../cache/geometry.json`;
  try { await access(file); } catch {
    const d = project.dataset as any;
    await writeFile(file, JSON.stringify({
      masterSha256: sha, sourceModelSha256: d.source.modelSha256,
      nativeLevels: d.nativeLevels.map((l: any) => ({ id: l.id, name: l.name, elevationFeet: l.elevationFeet })),
      walls: d.walls.map((w: any) => [w.levelId, w.nativeElementId, w.kind ?? null, !!w.approximate, w.reviewPatchId ?? null, w.ringsFeet]),
      doors: (d.doors ?? []).map((x: any) => [x.levelId, x.nativeElementId, x.id, x.state, x.roomKeys, x.footprintFeet ?? null, x.normalFeet ?? null, x.hostWallNativeElementId ?? null]),
      fixtures: (d.circulationGeometry?.fixtures ?? []).map((f: any) => [f.levelIds, f.nativeElementId, f.ringsFeet]),
      floors: (d.walkingSupport?.floors ?? []).map((f: any) => [f.nativeElementId, f.elevationFeet, f.partsFeet ?? [f.ringsFeet]]),
      records: d.records.map((r: any) => [r.key, r.levelId, r.number ?? r.properties?.number ?? null, r.name ?? null, !!r.circulation, r.properties?.floorOpeningsFeet ?? null]),
    }));
    console.log("geometry tables written");
  }
}
for (const w of widths.split(",").map(Number)) for (const native of project.dataset.nativeLevels) {
  const file = `${out}/level-${native.id}-w${w}.json`;
  try { await access(file); console.log(`skip ${file}`); continue; } catch {}
  const t = Date.now();
  try {
    const r = await scanNativeGaps(project.dataset, native.id, { minWidthFeet: 0.02, maxWidthFeet: w, minAreaSquareFeet: Number(minArea) });
    await writeFile(file, JSON.stringify({ format: "openindoormaps-campus-gap-scan", version: 1, masterSha256: sha, levelName: native.name, elevationFeet: (native as any).elevationFeet, seconds: (Date.now() - t) / 1000, results: [compactGapScan(r)] }));
    console.log(`${native.name} #${native.id} w${w}: ${r.findings.length} findings, ${r.testedCuts} cuts, ${r.complete ? "complete" : "PARTIAL"}, ${((Date.now() - t) / 1000).toFixed(1)} s`);
  } catch (e) {
    await writeFile(file, JSON.stringify({ masterSha256: sha, levelId: native.id, error: String(e) }));
    console.log(`${native.id} w${w}: error ${e}`);
  }
}
console.log("SCAN_DONE");
