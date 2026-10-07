import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { readIndoorProject } from "../../app/indoor-project/package";
import { scanNativeGaps, compactGapScan } from "../../app/indoor-project/native-gap-scan";
const [input, output, max = "6", minArea = "40", level] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Usage: scan-native-connections master.zip report.json [maximum-width-feet=6] [minimum-side-area-sqft=40] [native-level-id]");
const bytes = await readFile(input), digest = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const project = await readIndoorProject(bytes);
const results = [];
for (const native of project.dataset.nativeLevels.filter(l => !level || l.id === Number(level))) {
  try {
    const result = await scanNativeGaps(project.dataset, native.id, { minWidthFeet: 0.02, maxWidthFeet: Number(max), minAreaSquareFeet: Number(minArea) });
    results.push(compactGapScan(result));
    process.stdout.write(`${native.name} #${native.id}: ${result.findings.length} connections (${result.testedCuts} tested; ${result.complete ? "finished" : "partial"})\n`);
  } catch (error) { results.push({ levelId: native.id, error: String(error) }); }
}
if (!results.length) throw new Error("No matching native level.");
if (digest(await readFile(input)) !== digest(bytes)) throw new Error("Input master changed during the scan. Rerun against the new version.");
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ format: "openindoormaps-campus-gap-scan", version: 1, masterSha256: digest(bytes), results }, null, 2));
