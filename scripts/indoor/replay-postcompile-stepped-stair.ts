/** Runs AFTER native compilation and deliberate adoption of the reviewed app
 * guard/projection plus official engine. No native compiler is rerun here. */
/* eslint-disable unicorn/no-process-exit -- This file is the command-line entry point. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { nativeSteppedStairV2Digest } from "../../app/indoor-project/native-stepped-stair-v2";
import { masterVisitorPhysicalAuthoritySha256 } from "./pathway-candidate-audit";
import {
  checkedSteppedStairReviewArtifacts,
  type SteppedStairSavedReplay,
  type SteppedStairSourceSummary,
} from "./stepped-stair-v2-candidate-scope";
import type { SourceSteppedStairV2Review } from "./source-stepped-stair-v2-review";
import {
  checkedPostcompileArchive,
  prepareHeldPostcompileArchive,
  postcompileHash,
  postcompileJsonHash,
} from "./postcompile-stepped-stair-artifacts";
import { replayPostcompileSteppedStairs } from "./postcompile-stepped-stair-replay";
import {
  capturePostcompileHistoricalFiles,
  writePostcompileStrengtheningReview,
  verifyPostcompileStrengtheningReview,
  assertHistoricalSteppedAlgorithmBindings,
  type PostcompileStrengtheningReview,
} from "./postcompile-stepped-stair-source-review";
import {
  createPostcompileRegenerationReport,
  type PostcompileSteppedCandidateReview,
} from "./postcompile-stepped-stair-candidate-scope";

const args = process.argv.slice(2),
  mode = args[0],
  option = (name: string) => {
    const i = args.indexOf(name);
    if (i === -1) return;
    assert(args[i + 1] && !args[i + 1]!.startsWith("--"), `Missing ${name}`);
    return args[i + 1]!;
  },
  required = (name: string) => {
    const value = option(name);
    assert(value, `Missing ${name}`);
    return path.resolve(value);
  };
const usage = [
  "node --max-old-space-size=6144 --expose-gc --import tsx scripts/indoor/replay-postcompile-stepped-stair.ts capture-historical --compiler-closure HISTORICAL.json --out EMPTY_BEFORE_IMAGE_DIRECTORY",
  "node --import tsx scripts/indoor/replay-postcompile-stepped-stair.ts write-review --compiler-closure HISTORICAL.json --before-images snapshot.json --out NEW_REVIEW.json",
  "node --max-old-space-size=6144 --expose-gc --import tsx scripts/indoor/replay-postcompile-stepped-stair.ts replay --historical-regeneration regeneration.json --historical-master COMPILED_MASTER.zip --strengthening-review REVIEW.json --out EMPTY_DIRECTORY",
].join("\n");
if (args.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
if (mode === "capture-historical") {
  console.log(
    JSON.stringify(
      await capturePostcompileHistoricalFiles(
        required("--compiler-closure"),
        required("--out"),
      ),
    ),
  );
  process.exit(0);
}
if (mode === "write-review") {
  const result = await writePostcompileStrengtheningReview(
    required("--compiler-closure"),
    required("--before-images"),
    required("--out"),
  );
  console.log(
    JSON.stringify({
      currentEngine: result.currentEngineSha256,
      historicalCompilerRerunClaimed: false,
    }),
  );
  process.exit(0);
}
assert.equal(mode, "replay", usage);
const regenerationPath = required("--historical-regeneration"),
  historicalMasterPath = required("--historical-master"),
  reviewPath = required("--strengthening-review"),
  out = required("--out");
assert.notEqual(out, path.dirname(historicalMasterPath));
await fs.mkdir(out, { recursive: true });
assert.equal(
  (await fs.readdir(out)).length,
  0,
  "Choose a new empty postcompile output directory",
);
const originalReportBytes = await fs.readFile(regenerationPath),
  regeneration = JSON.parse(originalReportBytes.toString()),
  reviewBytes = await fs.readFile(reviewPath),
  review = JSON.parse(reviewBytes.toString()) as PostcompileStrengtheningReview;
await verifyPostcompileStrengtheningReview(review);
assert.equal(
  regeneration.postcompileSteppedStairReview,
  undefined,
  "Do not recursively relabel an already postcompiled candidate",
);
const sourceSummary =
  regeneration.sourceSteppedStairV2Review as SteppedStairSourceSummary;
assert(
  sourceSummary,
  "Historical compiler did not record original stepped-source finalization",
);
const savedBytes = await fs.readFile(sourceSummary.receiptPath),
  saved = JSON.parse(savedBytes.toString()) as SteppedStairSavedReplay,
  sourceReviewBytes = await fs.readFile(sourceSummary.path),
  sourceReview = JSON.parse(
    sourceReviewBytes.toString(),
  ) as SourceSteppedStairV2Review,
  portableSourceReview = await fs.readFile(sourceSummary.portableReviewPath);
assert.equal(postcompileHash(savedBytes), sourceSummary.receiptSha256);
assert.equal(postcompileHash(sourceReviewBytes), sourceSummary.reviewSha256);
assert.deepEqual(portableSourceReview, sourceReviewBytes);
checkedSteppedStairReviewArtifacts({
  summary: sourceSummary,
  reviewBytes: sourceReviewBytes,
  portableReviewBytes: portableSourceReview,
  replayBytes: savedBytes,
  sourceModelSha256: sourceReview.sourceModelSha256,
  sourceRoomsSha256: sourceReview.sourceRoomsSha256,
  nativeCacheSha256: sourceReview.nativeCacheSha256,
  originalDatasetSha256: sourceReview.originalDatasetSha256,
});
const historicalFreeze = JSON.parse(
  await fs.readFile(review.historicalCompilerClosure.path, "utf8"),
);
assertHistoricalSteppedAlgorithmBindings(
  sourceSummary.algorithms,
  historicalFreeze.files,
);
const nativeCacheHash = (await import("node:crypto")).createHash("sha256");
for await (const chunk of createReadStream(regeneration.nativeCache))
  nativeCacheHash.update(chunk);
assert.equal(nativeCacheHash.digest("hex"), regeneration.nativeCacheSha256);
assert.equal(sourceReview.nativeCacheSha256, regeneration.nativeCacheSha256);
let historicalBytes: Uint8Array | undefined = new Uint8Array(
  await fs.readFile(historicalMasterPath),
);
assert.equal(postcompileHash(historicalBytes), regeneration.master.sha256);
const historicalArchive = checkedPostcompileArchive(
  historicalBytes,
  regeneration.master.sha256,
);
assert.equal(
  historicalArchive.manifest.preparedDisplay,
  undefined,
  "Embedded prepared display needs a separate exact transformation review",
);
const historicalDataset = JSON.parse(
  new TextDecoder().decode(
    historicalArchive.files[historicalArchive.manifest.indoor.path]!,
  ),
);
const held = prepareHeldPostcompileArchive(
  historicalBytes,
  regeneration.master.sha256,
  saved,
);
await fs.writeFile(
  path.join(out, "held-current-import-input.reviter.zip"),
  held.bytes,
  { flag: "wx" },
);
await fs.writeFile(
  path.join(out, "held-current-import-transform.json"),
  JSON.stringify(held.receipt, null, 2),
  { flag: "wx" },
);
historicalBytes = undefined;
await initializeNativeExactGeosOverlay();
const project = await readIndoorProject(held.bytes, (progress) =>
  console.log(
    JSON.stringify({ stage: "strict-held-current-import", progress }),
  ),
);
const originalInputBytes = new Uint8Array(
    await fs.readFile(regeneration.input),
  ),
  originalInput = checkedPostcompileArchive(
    originalInputBytes,
    postcompileHash(originalInputBytes),
  );
assert.equal(
  originalInput.manifest.model.sha256,
  sourceReview.sourceModelSha256,
);
assert.equal(
  originalInput.manifest.floors.sha256,
  sourceReview.sourceRoomsSha256,
);
const originalDatasetBytes =
  originalInput.files[originalInput.manifest.indoor.path]!;
assert.equal(
  postcompileHash(originalDatasetBytes),
  sourceReview.originalDatasetSha256,
);
const replay = await replayPostcompileSteppedStairs({
  historicalDataset,
  strictHeldDataset: project.dataset,
  saved,
  sourceReview,
  originalRVTBytes: originalInput.files[originalInput.manifest.model.path]!,
  originalDatasetBytes,
  originalSourceRoomsBytes:
    originalInput.files[originalInput.manifest.floors.path]!,
  currentSourceRooms: project.rooms,
  nativeCacheSha256: regeneration.nativeCacheSha256,
  log: (message) => console.log(JSON.stringify(message)),
});
project.dataset = replay.dataset;
const replayPath = path.join(out, "postcompile-stepped-replay.json");
await fs.writeFile(replayPath, JSON.stringify(replay.receipt, null, 2), {
  flag: "wx",
});
const masterBytes = await exportIndoorProject(project),
  master = await readIndoorProject(masterBytes, (progress) =>
    console.log(
      JSON.stringify({ stage: "strict-postcompile-master-import", progress }),
    ),
  );
const masterComparable = {
  ...master.dataset,
  source: {
    ...master.dataset.source,
    roomsSha256: replay.dataset.source.roomsSha256,
  },
};
delete masterComparable.nativeExploreMapping;
for (const [key, value] of Object.entries(replay.dataset))
  if (value === undefined && !Object.hasOwn(masterComparable, key))
    (masterComparable as unknown as Record<string, unknown>)[key] = undefined;
assert.equal(
  postcompileJsonHash(masterComparable),
  postcompileJsonHash(replay.dataset),
  "Postcompile master exporter changed native compiler geometry/graph",
);
const newMasterArchive = checkedPostcompileArchive(
    masterBytes,
    postcompileHash(masterBytes),
  ),
  sourcePreservation = [];
for (const [name, bytes] of Object.entries(historicalArchive.files))
  if (
    name !== "manifest.json" &&
    name !== historicalArchive.manifest.indoor.path
  ) {
    assert.equal(
      postcompileHash(newMasterArchive.files[name]!),
      postcompileHash(bytes),
      `Source entry changed on postcompile export: ${name}`,
    );
    sourcePreservation.push({
      path: name,
      bytes: bytes.length,
      sha256: postcompileHash(bytes),
    });
  }
assert.deepEqual(
  Object.keys(newMasterArchive.files)
    .filter(
      (n) =>
        n !== "manifest.json" && n !== newMasterArchive.manifest.indoor.path,
    )
    .sort(),
  sourcePreservation.map((r) => r.path).sort(),
);
const viewerBytes = await exportCampusViewer(master),
  viewer = await readIndoorProject(viewerBytes, (progress) =>
    console.log(
      JSON.stringify({ stage: "strict-postcompile-visitor-import", progress }),
    ),
  );
assert.equal(
  masterVisitorPhysicalAuthoritySha256(master.dataset),
  masterVisitorPhysicalAuthoritySha256(viewer.dataset),
);
await verifyPostcompileStrengtheningReview(review);
assert.equal(
  postcompileHash(await fs.readFile(regenerationPath)),
  postcompileHash(originalReportBytes),
);
assert.equal(
  postcompileHash(await fs.readFile(historicalMasterPath)),
  regeneration.master.sha256,
);
const masterPath = path.join(out, "UNBC.master.reviter.zip"),
  viewerPath = path.join(out, "UNBC.campus-viewer.zip");
await fs.writeFile(masterPath, masterBytes, { flag: "wx" });
await fs.writeFile(viewerPath, viewerBytes, { flag: "wx" });
const audit: PostcompileSteppedCandidateReview = {
  format: "openindoormaps-postcompile-stepped-candidate-v1",
  historicalRegeneration: {
    path: regenerationPath,
    sha256: postcompileHash(originalReportBytes),
  },
  historicalMaster: {
    path: historicalMasterPath,
    sha256: regeneration.master.sha256,
  },
  historicalFinalizer: {
    path: path.resolve(sourceSummary.receiptPath),
    sha256: postcompileHash(savedBytes),
  },
  strengtheningReview: {
    path: reviewPath,
    sha256: postcompileHash(reviewBytes),
  },
  heldImportTransform: {
    path: path.join(out, "held-current-import-transform.json"),
    sha256: postcompileHash(
      await fs.readFile(path.join(out, "held-current-import-transform.json")),
    ),
  },
  replay: {
    path: replayPath,
    sha256: postcompileHash(await fs.readFile(replayPath)),
  },
  requestedEdgeIds: replay.receipt.requestedEdgeIds,
  qualifiedEdgeIds: replay.receipt.qualifiedEdgeIds,
  declinedEdgeIds: replay.receipt.declinedEdgeIds,
  master: {
    path: masterPath,
    bytes: masterBytes.length,
    sha256: postcompileHash(masterBytes),
    indoorSha256: newMasterArchive.manifest.indoor.sha256,
  },
  viewer: {
    path: viewerPath,
    bytes: viewerBytes.length,
    sha256: postcompileHash(viewerBytes),
    routingProjectionSha256: postcompileJsonHash(
      routeWorkerDataset(viewer.dataset),
    ),
  },
  currentEngineSha256: review.currentEngineSha256,
  sourcePreservation,
  originalCompilerRerunClaimed: false,
  strictHeldMasterAndFinalMasterVisitorImportsPassed: true,
  originalSourceReissued: true,
  actualCalculatorRoutesPassed: false,
  publisherReceiptChanged: false,
};
const auditPath = path.join(out, "postcompile-review.json");
await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), { flag: "wx" });
const report = createPostcompileRegenerationReport(
  regeneration,
  audit,
  auditPath,
  postcompileHash(await fs.readFile(auditPath)),
  replay.receipt,
);
await fs.writeFile(
  path.join(out, "regeneration.json"),
  JSON.stringify(report, null, 2),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    out,
    master: audit.master,
    viewer: audit.viewer,
    qualified: audit.qualifiedEdgeIds,
    declined: audit.declinedEdgeIds,
    actualCalculatorRoutesPassed: false,
    publisherReceiptChanged: false,
    physicalIndexDigest: nativeSteppedStairV2Digest(
      replay.dataset.nativeSteppedStairV2SourceIndices,
    ),
  }),
);
