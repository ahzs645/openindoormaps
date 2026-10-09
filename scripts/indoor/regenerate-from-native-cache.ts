/** Regenerate derived indoor data from an exact-model decoded cache.
 * Originals are read-only; output files must not already exist.
 * node --import tsx scripts/indoor/regenerate-from-native-cache.ts master.zip native-cache.json output-directory
 */
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const { join, resolve } = path;
import { readProjectPackage } from "../../../reviter/lib/reviter/project-package.ts";
import { prepareIndoorDataset } from "../../../reviter/lib/reviter/indoor-pipeline.ts";
import { createNativeParallelCompiler } from "../../../reviter/scripts/indoor/parallel-native-circulation.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import { validatePublishedNativeExploreMapping } from "../../app/indoor-project/native-explore-mapping";
import { nativeSourceStairPhysicalEvidence } from "../../app/indoor-project/native-source-stair-material";
import { floorDisplayName } from "../../app/indoor-project/floor-display-name";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";

const [input, nativeCache, destination, ...workerArgs] = process.argv.slice(2);
if (!input || !nativeCache || !destination)
  throw new Error(
    "Usage: regenerate-from-native-cache.ts master.zip native-cache.json output-directory [--native-workers 1|2] [--checkpoint-dir directory]",
  );
const workerOptions = new Map<string, string>();
for (let i = 0; i < workerArgs.length; i += 2) {
  const flag = workerArgs[i]!,
    value = workerArgs[i + 1];
  if (
    !["--native-workers", "--checkpoint-dir"].includes(flag) ||
    workerOptions.has(flag) ||
    !value ||
    value.startsWith("--")
  )
    throw new Error(
      "Expected unique --native-workers 1|2 and optional --checkpoint-dir directory",
    );
  workerOptions.set(flag, value);
}
const workerCount = workerOptions.has("--native-workers")
  ? Number(workerOptions.get("--native-workers"))
  : undefined;
if (workerCount !== undefined && workerCount !== 1 && workerCount !== 2)
  throw new Error("--native-workers must be 1 or 2");
if (workerOptions.has("--checkpoint-dir") && !workerCount)
  throw new Error("--checkpoint-dir requires --native-workers");
const inputPath = resolve(input),
  cachePath = resolve(nativeCache),
  output = resolve(destination);
const nativeCirculationCompiler = workerCount
  ? createNativeParallelCompiler({
      maxWorkers: workerCount as 1 | 2,
      checkpointDir: resolve(
        workerOptions.get("--checkpoint-dir") ??
          join(output, "native-plane-checkpoints"),
      ),
      onProgress: (message) => console.log(message),
    })
  : undefined;
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
  { physicalDoorSource: original.indoor, nativeCirculationCompiler },
);
// The compiler hashes hydrated annotations. A portable package binds the exact
// preserved source entry, whose review companions may use archive wire storage.
dataset.source.roomsSha256 = original.manifest.floors.sha256;
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
// Export publishes a checked native map cache on a cloned dataset. This is
// derived display/selection data; every compiler geometry and graph field
// must remain identical after removing that independently validated cache.
await validatePublishedNativeExploreMapping(master.dataset);
if (
  dataset.walkingSupport?.sourceModelSha256 === dataset.source.modelSha256 &&
  dataset.walkingSupport.floors.length > 0
)
  assert.ok(
    master.dataset.nativeExploreMapping,
    "Master native floor mapping is required for a native-supported rebuild",
  );
const masterComparable = structuredClone(master.dataset);
const compilerComparable = structuredClone(dataset);
delete masterComparable.nativeExploreMapping;
delete compilerComparable.nativeExploreMapping;
assert.equal(
  sha(new TextEncoder().encode(JSON.stringify(masterComparable))),
  sha(new TextEncoder().encode(JSON.stringify(compilerComparable))),
  "Portable master geometry and graph must match compiler JSON",
);
console.time("Export viewer");
const viewerBytes = await exportCampusViewer(master);
console.timeEnd("Export viewer");
const viewer = await readIndoorProject(viewerBytes);
const visitorExpected: IndoorDataset = structuredClone(dataset);
visitorExpected.floors = visitorExpected.floors.map((floor) => ({
  ...floor,
  name:
    master.rooms.mapEdits?.floorNames?.[floor.id] ??
    floorDisplayName(floor.name),
}));
visitorExpected.nativeSourceStairMaterials = nativeSourceStairPhysicalEvidence(
  dataset.nativeSourceStairMaterials,
);
for (const flight of visitorExpected.stairDisplay?.sourceFlights ?? [])
  delete flight.historicalPreparedTreads;
for (const flight of visitorExpected.stairDisplay?.flights ?? [])
  delete flight.historicalPreparedTreads;
delete visitorExpected.selectionDoorThresholds;
if (!visitorExpected.nativeIndoorEnvelopes)
  delete visitorExpected.doorAperturePatchState;
delete visitorExpected.nativeDoorBoundaryClosures;
if (
  visitorExpected.nativeIndoorEnvelopes &&
  visitorExpected.nativeWallPositionRepairs
)
  visitorExpected.nativeWallPositionRepairs.walls =
    visitorExpected.nativeWallPositionRepairs.walls.map((wall) => ({
      ...wall,
      notes: "Source-bound physical wall placement.",
    }));
else delete visitorExpected.nativeWallPositionRepairs;
// Logical partition descriptors and their history are authoring selections.
// Visitor exports retain physical rooms and portals. The exact read-only native
// floor outline is a separately validated derived publication, not this history.
delete visitorExpected.reviewedAreaPartitions;
// Exclusion footprints/reasons are visitor geometry; authoring notes stay in
// the reviewed master alongside the source evidence and recommendation files.
for (const area of visitorExpected.indoorExclusions?.areas ?? [])
  delete area.notes;
if (visitorExpected.nativeSelectionContactRepairs)
  visitorExpected.nativeSelectionContactRepairs.repairs =
    visitorExpected.nativeSelectionContactRepairs.repairs
      .filter((repair) => repair.status === "applied")
      .map((repair) => ({
        ...repair,
        notes:
          "Provisional source-bound native selection contact; physical geometry and access unchanged. Revisit required.",
      }));
// Native mapping is derived flat selection/display data, not a graph mutation.
// Check its source/current geometry and output binding independently, then
// retain strict byte-equivalent dataset parity for every remaining field.
await validatePublishedNativeExploreMapping(viewer.dataset);
if (
  dataset.walkingSupport?.sourceModelSha256 === dataset.source.modelSha256 &&
  dataset.walkingSupport.floors.length > 0
)
  assert.ok(
    viewer.dataset.nativeExploreMapping,
    "Visitor native floor mapping is required for a native-supported master",
  );
const visitorComparable = structuredClone(viewer.dataset);
delete visitorComparable.nativeExploreMapping;
delete visitorExpected.nativeExploreMapping;
assert.equal(
  sha(new TextEncoder().encode(JSON.stringify(visitorComparable))),
  sha(new TextEncoder().encode(JSON.stringify(visitorExpected))),
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
