import { validatePublishedNativeExploreMapping } from "../../app/indoor-project/native-explore-mapping";
import { floorDisplayName } from "../../app/indoor-project/floor-display-name";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
const { resolve, dirname } = path;
import { createHash } from "node:crypto";
import {
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";

const args = process.argv.slice(2),
  [input, output] = args;
const choice = args.indexOf("--windows"),
  windows = choice < 0 ? undefined : args[choice + 1];
if (choice >= 0 && !["native", "simplified"].includes(windows ?? ""))
  throw new Error("--windows must be native or simplified");
if (!input || !output || resolve(input) === resolve(output))
  throw new Error(
    "Usage: npm run indoor:export-viewer -- master.reviter.zip campus.campus-viewer.zip [--windows native|simplified] (distinct paths)",
  );
const original = new Uint8Array(await readFile(input));
const project = await readIndoorProject(original);
const bytes = await exportCampusViewer(project, {
  windows: windows as "native" | "simplified" | undefined,
});
const restored = await readIndoorProject(bytes);
await validatePublishedNativeExploreMapping(restored.dataset);
const normalize = (d: typeof project.dataset) => {
  const c = structuredClone(d);
  delete c.windowDisplay;
  delete c.nativeExploreMapping;
  delete c.nativeDoorBoundaryClosures;
  delete c.nativeWallPositionRepairs;
  delete c.selectionDoorThresholds;
  delete c.reviewedAreaPartitions;
  delete c.doorAperturePatchState;
  c.floors = c.floors.map((f) => ({
    ...f,
    name:
      project.rooms.mapEdits?.floorNames?.[f.id] ?? floorDisplayName(f.name),
  }));
  for (const area of c.indoorExclusions?.areas ?? []) delete area.notes;
  return c;
};
if (
  JSON.stringify(normalize(restored.dataset)) !==
  JSON.stringify(normalize(project.dataset))
)
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
  windowDetail: windows ?? project.dataset.windowDisplay?.mode ?? "simplified",
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
