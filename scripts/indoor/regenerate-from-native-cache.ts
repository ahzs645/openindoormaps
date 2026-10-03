/** Regenerate derived indoor data from an exact-model decoded cache.
 * Originals are read-only; output files must not already exist.
 * node --import tsx scripts/indoor/regenerate-from-native-cache.ts master.zip native-cache.json output-directory
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const { join, resolve } = path;
import { readProjectPackage } from "../../../reviter/lib/reviter/project-package.ts";
import { prepareIndoorDataset } from "../../../reviter/lib/reviter/indoor-pipeline.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";

const [input, nativeCache, destination] = process.argv.slice(2);
if (!input || !nativeCache || !destination)
  throw new Error(
    "Usage: regenerate-from-native-cache.ts master.zip native-cache.json output-directory",
  );
const inputPath = resolve(input),
  cachePath = resolve(nativeCache),
  output = resolve(destination);
const originalBytes = new Uint8Array(await readFile(inputPath));
const original = await readProjectPackage(originalBytes);
const before = await readIndoorProject(originalBytes);
let cache:
  | {
      sourceModelSha256: string;
      nativeModel: ConvertResult;
    }
  | undefined = JSON.parse(await readFile(cachePath, "utf8"));
assert.ok(cache, "Decoded native cache is required");
assert.equal(
  cache.sourceModelSha256,
  original.manifest.model.sha256,
  "Decoded cache belongs to a different Revit model",
);
const sourceModelSha256 = cache.sourceModelSha256;
const sourceRooms = JSON.stringify(original.rooms);
const dataset = await prepareIndoorDataset(
  cache.nativeModel,
  original.rooms,
  cache.sourceModelSha256,
  (message) => {
    if (!message.includes("region") || /region (?:[0-9]*00)\//.test(message))
      console.log(message);
  },
);
cache = undefined; // Release the decoded native model before archive workers clone buffers.
if (globalThis.gc) globalThis.gc();
assert.equal(
  JSON.stringify(original.rooms),
  sourceRooms,
  "Preparation must preserve source annotations, reviews and connector recipes",
);
const missing = before.dataset.records.filter(
  (r) =>
    r.arrivalNodeId &&
    !dataset.records.find((n) => n.key === r.key)?.arrivalNodeId,
);
// A reviewed source access change intentionally removes a public arrival.
// Keep the loss guard for every other destination, including unknown access.
const restricted = missing.filter((record) => {
  const annotation = original.rooms.annotations.find(
    (r) => r.key === record.key,
  );
  const regenerated = dataset.records.find((r) => r.key === record.key);
  return (
    annotation?.access?.kind === "staff" &&
    regenerated?.access === "staff" &&
    !dataset.edges.some(
      (edge) => edge.enabled && edge.roomKeys.includes(record.key),
    )
  );
});
assert.deepEqual(
  missing.filter((r) => !restricted.includes(r)).map((r) => r.key),
  [],
  "Existing arrival connections must survive regeneration",
);
for (const connector of before.dataset.connectors ?? []) {
  const regenerated = dataset.connectors?.find((c) => c.id === connector.id);
  assert.ok(regenerated, `Lost lift recipe ${connector.id}`);
  assert.equal(
    regenerated.entrances.length,
    connector.entrances.length,
    `Lost lift stops ${connector.id}`,
  );
}
for (const ramp of before.dataset.rampDisplay?.ramps ?? [])
  assert.ok(
    dataset.rampDisplay?.ramps.some(
      (r) => r.nativeElementId === ramp.nativeElementId,
    ),
    `Lost native ramp ${ramp.nativeElementId}`,
  );
await mkdir(output, { recursive: true });
await writeFile(
  join(output, "compiled-dataset.json"),
  JSON.stringify(dataset),
  { flag: "wx" },
);
const rebuilt = { ...before, dataset };
console.time("Export master");
const masterBytes = await exportIndoorProject(rebuilt);
console.timeEnd("Export master");
console.time("Read master");
const master = await readIndoorProject(masterBytes);
console.timeEnd("Read master");
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const assets = Object.keys(before.files).filter(
  (path) => !path.startsWith("viewer/") && path !== "manifest.json",
);
for (const path of assets)
  assert.equal(
    sha(master.files[path]),
    sha(before.files[path]),
    `Source asset changed: ${path}`,
  );
assert.deepEqual(master.rooms, before.rooms);
assert.equal(
  sha(new TextEncoder().encode(JSON.stringify(master.dataset))),
  sha(new TextEncoder().encode(JSON.stringify(dataset))),
  "Portable master data must match compiler JSON",
);
console.time("Export viewer");
const viewerBytes = await exportCampusViewer(master);
console.timeEnd("Export viewer");
const viewer = await readIndoorProject(viewerBytes);
assert.equal(
  sha(new TextEncoder().encode(JSON.stringify(viewer.dataset))),
  sha(new TextEncoder().encode(JSON.stringify(dataset))),
  "2D/3D viewer geometry and routing must match the master",
);
assert.ok(
  !Object.keys(viewer.files).some((path) => path.startsWith("model/")),
  "Viewer excludes native model and scene assets",
);
const summary = {
  input: inputPath,
  nativeCache: cachePath,
  sourceModelSha256,
  sourceAssets: assets.map((path) => ({
    path,
    sha256: sha(master.files[path]),
  })),
  sourceAreas: original.rooms.annotations.filter((r) => r.status !== "deleted")
    .length,
  before: before.dataset.report,
  after: dataset.report,
  arrivals: dataset.records.filter((r) => r.arrivalNodeId).length,
  intentionallyRestrictedArrivals: restricted.map((r) => r.key),
  preparedRooms: dataset.presentation?.rooms.length ?? 0,
  ramps: dataset.rampDisplay?.ramps.length ?? 0,
  liftStops:
    dataset.connectors?.reduce((n, c) => n + c.entrances.length, 0) ?? 0,
  master: { bytes: masterBytes.length, sha256: sha(masterBytes) },
  viewer: { bytes: viewerBytes.length, sha256: sha(viewerBytes) },
  losslessSourceAssets: true,
  masterViewerDataIdentical: true,
};
await mkdir(output, { recursive: true });
await writeFile(join(output, "UNBC.master.reviter.zip"), masterBytes, {
  flag: "wx",
});
await writeFile(join(output, "UNBC.campus-viewer.zip"), viewerBytes, {
  flag: "wx",
});
await writeFile(
  join(output, "regeneration.json"),
  JSON.stringify(summary, null, 2) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify({ output, ...summary }, null, 2));
