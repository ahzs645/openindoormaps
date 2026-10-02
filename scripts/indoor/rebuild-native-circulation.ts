import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import {
  prepareNativeCirculationGeometry,
  attachNativeCirculationCellRoutes,
} from "../../../reviter/lib/reviter/native-circulation-geometry.ts";
import {
  routingFloorPlateRecords,
  nativeFloorPolygons,
} from "../../../reviter/lib/reviter/routing-floor-support.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
const [input, cacheFile, output] = process.argv.slice(2);
assert.ok(
  input && cacheFile && output,
  "Usage: rebuild-native-circulation.ts master.zip exact-native-cache.json output-directory",
);
const before = await readIndoorProject(await readFile(input));
const cache = JSON.parse(await readFile(cacheFile, "utf8")) as {
  sourceModelSha256: string;
  nativeModel: ConvertResult;
};
assert.equal(cache.sourceModelSha256, before.dataset.source.modelSha256);
const dataset = structuredClone(before.dataset);
if (dataset.walkingSupport)
  dataset.walkingSupport.floors = [
    ...new Map(
      [...new Set(dataset.records.map((r) => r.elevationFeet))]
        .flatMap((z) => routingFloorPlateRecords(cache.nativeModel, z))
        .map((f) => [f.elementId, f]),
    ).values(),
  ]
    .sort((a, b) => a.elementId - b.elementId)
    .map((f) => ({
      nativeElementId: f.elementId,
      elevationFeet: f.boundsFeet.max.z,
      ringsFeet: nativeFloorPolygons(f)[0]!,
      partsFeet: nativeFloorPolygons(f),
    }));
// Ramp presentation is outside the physical-floor query's narrower wire type.
const nativeDataset = { ...dataset, rampDisplay: undefined };
console.time("Native circulation cells");
const result = prepareNativeCirculationGeometry(
  cache.nativeModel,
  nativeDataset,
);
dataset.circulationGeometry = result.geometry;
console.timeEnd("Native circulation cells");
console.time("Native circulation graph");
const branches = attachNativeCirculationCellRoutes({
  ...dataset,
  rampDisplay: undefined,
});
console.timeEnd("Native circulation graph");
assert.deepEqual(
  dataset.records,
  before.dataset.records,
  "Source records and all arrival identities must remain intact",
);
assert.deepEqual(
  dataset.nodes,
  before.dataset.nodes,
  "Fixed native doorway, stair and elevator node coordinates must remain intact",
);
assert.deepEqual(
  dataset.edges.filter((edge) => !edge.nativeCellId),
  before.dataset.edges.filter((edge) => !edge.nativeCellId),
  "Existing door rules and vertical connectors must remain intact",
);
await mkdir(output, { recursive: true });
await writeFile(
  `${output}/report.json`,
  JSON.stringify({ ...result.report, branches }, null, 2),
);
await writeFile(`${output}/compiled-dataset.json`, JSON.stringify(dataset), {
  flag: "wx",
});
const masterBytes = await exportIndoorProject({ ...before, dataset });
const master = await readIndoorProject(masterBytes);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
for (const [path, bytes] of Object.entries(before.files))
  if (path !== "manifest.json" && !path.startsWith("viewer/"))
    assert.equal(
      sha(master.files[path]),
      sha(bytes),
      `Source asset changed: ${path}`,
    );
assert.deepEqual(master.rooms, before.rooms);
const viewerBytes = await exportCampusViewer(master),
  viewer = await readIndoorProject(viewerBytes);
assert.deepEqual(viewer.dataset, master.dataset);
await writeFile(`${output}/UNBC.master.reviter.zip`, masterBytes, {
  flag: "wx",
});
await writeFile(`${output}/UNBC.campus-viewer.zip`, viewerBytes, {
  flag: "wx",
});
await writeFile(
  `${output}/report.json`,
  JSON.stringify(
    {
      ...result.report,
      branches,
      originalRecordsPreserved: true,
      fixedNodesPreserved: true,
      sourceAssetsPreserved: true,
      masterViewerIdentical: true,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ...result.report, branches }, null, 2));
