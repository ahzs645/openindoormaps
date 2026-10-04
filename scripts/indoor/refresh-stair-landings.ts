/** Refresh display surfaces from an exact-model native cache without regenerating routes.
 * Usage: node --import tsx scripts/indoor/refresh-stair-landings.ts master.zip cache.json output-directory
 * The input archive is read-only; existing output files are never overwritten. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import {
  nativeStairRunTreads,
  nativeStairRunEndpoints,
} from "../../../reviter/lib/reviter/indoor-stair-run-surfaces.ts";
import { nativeStairLandings } from "../../../reviter/lib/reviter/indoor-stair-landings.ts";
import { stairFloorOccluders } from "../../../reviter/lib/reviter/indoor-stair-display.ts";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";

const [input, cacheFile, destination] = process.argv.slice(2);
if (!input || !cacheFile || !destination)
  throw new Error(
    "Usage: refresh-stair-landings.ts master.zip cache.json output-directory",
  );
const project = await readIndoorProject(await readFile(input));
const cache = JSON.parse(await readFile(cacheFile, "utf8")) as {
  sourceModelSha256: string;
  nativeModel: ConvertResult;
};
assert.equal(
  cache.sourceModelSha256,
  project.dataset.source.modelSha256,
  "Native cache belongs to another model",
);
assert.equal(
  project.dataset.stairDisplay?.sourceModelSha256,
  cache.sourceModelSha256,
);
const before = JSON.stringify({ ...project.dataset, stairDisplay: undefined });
const inventory = nativeStairLandings(cache.nativeModel);
const display = project.dataset.stairDisplay!;
const nativeTreads = nativeStairRunTreads(cache.nativeModel);
assert.ok(display.sourceFlights, "A native stair inventory is required");
for (const flight of [...display.sourceFlights, ...display.flights]) {
  flight.landings = inventory.get(flight.stairElementId) ?? [];
  flight.treads = [
    ...new Set(flight.treads.map((t) => t.runElementId)),
  ].flatMap(
    (id) =>
      nativeTreads.get(id) ??
      flight.treads.filter((t) => t.runElementId === id),
  );
  flight.runs = nativeStairRunEndpoints(cache.nativeModel, flight.treads);
  if (
    "sourceGeometry" in flight &&
    flight.treads.some((t) => nativeTreads.has(t.runElementId))
  )
    flight.sourceGeometry = "native-brep";
}
for (const flight of display.flights)
  flight.floorOccluders = stairFloorOccluders(cache.nativeModel, flight);
assert.equal(
  JSON.stringify({ ...project.dataset, stairDisplay: undefined }),
  before,
  "Routes, access and boundaries must remain unchanged",
);
const report = {
  sourceModelSha256: cache.sourceModelSha256,
  nativeRunsRefreshed: nativeTreads.size,
  unassignedLandingIds: cache.nativeModel.elementBounds
    .filter(
      (e) =>
        e.categoryId === -2_000_920 &&
        ![...inventory.values()]
          .flat()
          .some((l) => l.nativeElementId === e.elementId),
    )
    .map((e) => e.elementId),
  stairsWithLandings: display.sourceFlights.filter((f) => f.landings!.length)
    .length,
  landingSurfaces: display.sourceFlights.reduce(
    (n, f) => n + f.landings!.length,
    0,
  ),
  stairs: display.sourceFlights
    .filter((f) => f.landings!.length)
    .map((f) => ({ stairElementId: f.stairElementId, landings: f.landings })),
};
await mkdir(destination, { recursive: true });
const master = path.resolve(destination, "UNBC.landings.reviter.zip"),
  viewer = path.resolve(destination, "UNBC.landings.campus-viewer.zip");
await writeFile(master, await exportIndoorProject(project), { flag: "wx" });
await writeFile(viewer, await exportCampusViewer(project), { flag: "wx" });
await writeFile(
  path.resolve(destination, "landing-report.json"),
  JSON.stringify(report, null, 2),
  { flag: "wx" },
);
const reopened = await readIndoorProject(await readFile(master));
assert.deepEqual(reopened.dataset.stairDisplay, display);
const reopenedViewer = await readIndoorProject(await readFile(viewer));
assert.deepEqual(reopenedViewer.dataset.stairDisplay, display);
for (const [name, bytes] of Object.entries(project.files)) {
  if (
    name === "manifest.json" ||
    name === "floors/rooms.json" ||
    name === "viewer/indoor.json"
  )
    continue;
  assert.deepEqual(
    reopened.files[name],
    bytes,
    `Source asset changed: ${name}`,
  );
}
console.log(
  JSON.stringify({
    master,
    viewer,
    stairsWithLandings: report.stairsWithLandings,
    landingSurfaces: report.landingSurfaces,
  }),
);
