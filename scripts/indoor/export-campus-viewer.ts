import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
const { resolve, dirname } = path;
import { createHash } from "node:crypto";
import {
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output))
  throw new Error(
    "Usage: npm run indoor:export-viewer -- master.reviter.zip campus.campus-viewer.zip (distinct paths)",
  );
const original = new Uint8Array(await readFile(input));
const project = await readIndoorProject(original);
const bytes = await exportCampusViewer(project);
const restored = await readIndoorProject(bytes);
if (JSON.stringify(restored.dataset) !== JSON.stringify(project.dataset))
  throw new Error("Viewer round-trip changed geometry or navigation.");
await mkdir(dirname(resolve(output)), { recursive: true });
const temporary = resolve(output) + `.${process.pid}.tmp`;
await writeFile(temporary, bytes);
await rename(temporary, resolve(output));
const report = {
  input: resolve(input),
  output: resolve(output),
  masterBytes: original.length,
  viewerBytes: bytes.length,
  reductionPercent: Number(
    ((1 - bytes.length / original.length) * 100).toFixed(2),
  ),
  source: restored.dataset.source,
  viewerSha256: createHash("sha256").update(bytes).digest("hex"),
  views: ["2d", "3d"],
  records: restored.dataset.records.length,
  floors: restored.dataset.floors.length,
  nodes: restored.dataset.nodes.length,
  edges: restored.dataset.edges.length,
  geometryAndNavigationUnchanged: true,
  entries: Object.keys(restored.files),
};
await writeFile(
  resolve(output) + ".report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
