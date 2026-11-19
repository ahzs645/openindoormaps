/** Apply reviewed same-floor links to an existing authoring master using the
 * normal source and geometry checks. Rebuild guide and visitor outputs afterward. */
import { readFile, writeFile, link, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  readIndoorProject,
  exportIndoorProject,
  isViewerProject,
} from "../../app/indoor-project/package";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { serializeRoomsForArchive } from "../../../reviter/lib/reviter/review-bundle-wire";
import { datasetWithReviewedLinks } from "./apply-regeneration-links";
import { applyOfficePermission } from "./apply-office-permission";
import { compileExploreLevelsInParallel } from "./parallel-explore-levels";

const [source, reviewPath, output, permissionPath] = process.argv.slice(2);
if (!source || !reviewPath || !output)
  throw new Error(
    "Usage: update-reviewed-links.ts MASTER.zip REVIEW.json NEW-MASTER.zip [OFFICE-PERMISSION.json]",
  );
await initializeNativeExactGeosOverlay();
const project = await readIndoorProject(await readFile(source));
if (isViewerProject(project))
  throw new Error("A reviewed link update needs the authoring master.");
const review = JSON.parse(await readFile(reviewPath, "utf8"));
const dataset = datasetWithReviewedLinks(
  project.dataset,
  review,
  project.rooms.boundaryReference,
);
project.rooms = {
  ...project.rooms,
  reviewedCirculationLinks: structuredClone(dataset.reviewedCirculationLinks),
};
if (permissionPath) {
  const permission = JSON.parse(await readFile(permissionPath, "utf8"));
  applyOfficePermission(dataset, project.rooms, permission);
  console.log("Recorded permission-required office traversal on", permission.edgeId);
}
dataset.source = {
  ...dataset.source,
  roomsSha256: createHash("sha256")
    .update((await serializeRoomsForArchive(project.rooms)).rooms)
    .digest("hex"),
};
delete (dataset as typeof dataset & { preparedRouting?: unknown })
  .preparedRouting;
project.dataset = dataset;
console.log(
  "Verified reviewed walking links against the registered drawing and native floor.",
);
const bytes = await exportIndoorProject(
  project,
  console.log,
  compileExploreLevelsInParallel,
);
// A retry or failed write must never overwrite an existing export or expose a partial ZIP.
const tmp = await mkdtemp(
  path.join(path.dirname(path.resolve(output)), ".review-export-"),
);
try {
  const file = path.join(tmp, "master.zip");
  await writeFile(file, bytes);
  await link(file, output);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
console.log(
  "Wrote",
  output,
  "with",
  dataset.reviewedCirculationLinks?.links.length,
  "reviewed links.",
);
