/** Bind review scope to actual exported archives. It grants no physical approval;
 * audit-pathway-candidate.ts must independently replay every admission guard. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { unzipSync } from "fflate";
import { readProjectPackage } from "../../../reviter/lib/reviter/project-package";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { verifyDerivedMappingRebuild } from "./source-rebuild-input-proof";
import {
  verifyDrawingFloorSourceReviewDelta,
  type DrawingFloorRebindReceipt,
} from "./drawing-floor-rebind-scope-proof";
import { verifyBoundaryMemberSourceReviewDelta } from "./boundary-member-source-review-scope-proof";
import type {
  NativeBoundaryMemberReview,
  NativeBoundaryMemberReviewReceipt,
} from "./source-native-boundary-member-review";
import {
  verifyBoundaryReviewBundleSourceDelta,
  type BoundaryReviewBundle,
} from "./boundary-review-bundle-scope-proof";
import type { NativeBoundaryReviewBundleReceipt } from "./source-native-boundary-review-bundle";
import {
  reverseSourceDoorBoundaryClosureReview,
  verifySourceDoorBoundaryClosureReviewDelta,
  type SourceDoorBoundaryClosureReview,
  type SourceDoorBoundaryClosureReviewReceipt,
} from "./source-door-boundary-closure-review";
import {
  preservedSourceEntryInventory,
  assertPreservedSourceEntryInventories,
} from "./source-archive-asset-proof";
import {
  verifySourceSteppedStairCandidateScope,
  type SteppedStairSourceSummary,
} from "./stepped-stair-v2-candidate-scope";
import { verifyExactSteppedWorkerProjectionAmendment } from "./stepped-stair-worker-projection-review";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import {
  verifyPostcompileSteppedCandidateScope,
  type PostcompileSteppedSummary,
} from "./postcompile-stepped-stair-candidate-scope";
import type { ProjectRooms } from "../../app/indoor-project/package";
import {
  safetySnapshot,
  compareSafety,
  jsonSha256,
  sha256,
  masterVisitorPhysicalAuthoritySha256,
} from "./pathway-candidate-audit";

const args = process.argv.slice(2),
  option = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  },
  required = (name: string) => {
    const value = option(name);
    if (!value || value.startsWith("--")) throw Error(`Missing ${name}`);
    return path.resolve(value);
  };
const usage =
  "node --max-old-space-size=8192 --expose-gc --import tsx scripts/indoor/build-pathway-candidate-scope.ts --baseline OLD-VISITOR.zip --candidate NEW-VISITOR.zip --source-baseline ORIGINAL-MASTER.zip --source-candidate NEW-MASTER.zip --regeneration-report regeneration.json --stationary-evidence stationary-alias-evidence.json --out NEW-EMPTY-DIRECTORY [--source-rebuild-receipt EXACT-DERIVED-MAPPING-DISCARD.json] [--drawing-floor-rebind-algorithm-binding exact-source-review-algorithms.json] [--boundary-member-review-algorithm-binding reviewed-single-boundary-algorithms.json | --boundary-review-bundle-algorithm-binding reviewed-batch-boundary-algorithms.json] [--door-boundary-closure-review-algorithm-binding exact-source-door-closure-algorithms.json] [--stepped-stair-source-algorithm-binding exact-regeneration-source-freeze.json] [--stepped-stair-postcompile-projection-review exact-projection-and-generated-engine-amendment.json | --postcompile-stepped-stair-review POSTCOMPILE-REVIEW.json] [--evidence-index additional-evidence.json]";
if (args.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
const baseline = required("--baseline"),
  candidate = required("--candidate"),
  sourceBaseline = required("--source-baseline"),
  sourceCandidate = required("--source-candidate"),
  regenerationPath = required("--regeneration-report"),
  stationaryPath = required("--stationary-evidence"),
  out = required("--out");
await fs.mkdir(out, { recursive: true });
if ((await fs.readdir(out)).length)
  throw Error("Choose a new empty scope directory");
const evidence: { id: string; path: string; sha256: string }[] = [];
const addEvidence = async (id: string, file: string) => {
  if (evidence.some((e) => e.id === id))
    throw Error(`Duplicate evidence identity ${id}`);
  const bytes = new Uint8Array(await fs.readFile(file));
  evidence.push({ id, path: path.resolve(file), sha256: sha256(bytes) });
  return bytes;
};
const oldBytes = await addEvidence("original-visitor", baseline),
  newBytes = await addEvidence("candidate-visitor", candidate),
  regeneration = JSON.parse(
    new TextDecoder().decode(
      await addEvidence("regeneration", regenerationPath),
    ),
  ),
  stationary = JSON.parse(
    new TextDecoder().decode(
      await addEvidence("stationary-source", stationaryPath),
    ),
  );
assert.equal(
  sha256(newBytes),
  regeneration.viewer.sha256,
  "Candidate visitor differs from the completed regeneration report",
);
assert.equal(regeneration.losslessSourceAssets, true);
assert.equal(regeneration.masterViewerDataIdentical, true);
let sourceRebuildProof:
  | Awaited<ReturnType<typeof verifyDerivedMappingRebuild>>
  | undefined;
if (path.resolve(regeneration.input) !== sourceBaseline) {
  const receipt = required("--source-rebuild-receipt");
  sourceRebuildProof = await verifyDerivedMappingRebuild(
    sourceBaseline,
    path.resolve(regeneration.input),
    receipt,
  );
  await addEvidence("source-rebuild-receipt", receipt);
  await addEvidence("source-rebuild-input", path.resolve(regeneration.input));
  const proofPath = path.join(out, "source-rebuild-input-proof.json");
  await fs.writeFile(proofPath, JSON.stringify(sourceRebuildProof, null, 2), {
    flag: "wx",
  });
  await addEvidence("source-rebuild-input-proof", proofPath);
  globalThis.gc?.();
} else if (option("--source-rebuild-receipt"))
  throw Error(
    "A source rebuild receipt is only valid for an explicitly different compiler input",
  );
function dataset(bytes: Uint8Array) {
  const entries = unzipSync(bytes, {
    filter: (e) =>
      e.name === "manifest.json" || e.name === "viewer/indoor.json",
  });
  const manifest = JSON.parse(
    new TextDecoder().decode(entries["manifest.json"]),
  );
  assert.equal(
    manifest.format,
    "openindoormaps-viewer",
    "Scope comparisons require actual visitor exports",
  );
  const raw = entries["viewer/indoor.json"];
  assert.equal(raw.length, manifest.indoor.bytes);
  assert.equal(sha256(raw), manifest.indoor.sha256);
  return {
    manifest,
    data: routeWorkerDataset(
      JSON.parse(new TextDecoder().decode(raw)) as IndoorDataset,
    ),
  };
}
const old = dataset(oldBytes),
  next = dataset(newBytes),
  oldRoutingSha = jsonSha256(old.data),
  newRoutingSha = jsonSha256(next.data);
assert.equal(
  stationary.sourceRoutingProjectionSha256,
  oldRoutingSha,
  "Stationary source evidence does not bind this exact baseline projection",
);
assert.equal(old.data.source.modelSha256, next.data.source.modelSha256);
assert.equal(regeneration.sourceModelSha256, next.data.source.modelSha256);
assert.equal(
  old.manifest.georeference.sha256,
  next.manifest.georeference.sha256,
);

// Check packed review companions and all other source assets as actual entry
// bytes, independently of the driver summary and JSON/source-review delta.
async function sourceEntries(file: string) {
  const bytes = new Uint8Array(await fs.readFile(file));
  return {
    archiveSha256: sha256(bytes),
    entries: preservedSourceEntryInventory(bytes),
  };
}
const originalSourceAssets = await sourceEntries(sourceBaseline);
globalThis.gc?.();
const candidateSourceAssets = await sourceEntries(sourceCandidate);
assert.equal(candidateSourceAssets.archiveSha256, regeneration.master.sha256);
const sourceAssetProof = {
    originalArchiveSha256: originalSourceAssets.archiveSha256,
    candidateArchiveSha256: candidateSourceAssets.archiveSha256,
    ...assertPreservedSourceEntryInventories(
      originalSourceAssets.entries,
      candidateSourceAssets.entries,
    ),
  },
  sourceAssetProofPath = path.join(out, "preserved-source-entry-proof.json");
await fs.writeFile(
  sourceAssetProofPath,
  JSON.stringify(sourceAssetProof, null, 2) + "\n",
  { flag: "wx" },
);
await addEvidence("independent-preserved-source-entries", sourceAssetProofPath);
globalThis.gc?.();

// Source packaging is checked separately from visitor-only wrappers. No geometry
// importer/cache is skipped in final QA; this step verifies original source bytes.
let beforeSource = await readProjectPackage(
    await addEvidence("original-master", sourceBaseline),
  ),
  afterSource = await readProjectPackage(
    await addEvidence("candidate-master", sourceCandidate),
  );
assert.equal(
  evidence.find((e) => e.id === "original-master")!.sha256,
  originalSourceAssets.archiveSha256,
  "Original source archive changed during scope construction",
);
assert.equal(
  evidence.find((e) => e.id === "candidate-master")!.sha256,
  candidateSourceAssets.archiveSha256,
  "Candidate source archive changed during scope construction",
);
assert(afterSource.indoor, "Source candidate must be a prepared master");
assert.equal(
  next.manifest.sourceRoomsSha256,
  afterSource.manifest.floors.sha256,
  "Visitor must bind the source candidate's actual authoring room bytes",
);
assert.equal(
  masterVisitorPhysicalAuthoritySha256(
    routeWorkerDataset(afterSource.indoor as unknown as IndoorDataset),
  ),
  masterVisitorPhysicalAuthoritySha256(next.data),
  "Candidate master and visitor disagree on exact routing/source authority",
);
assert.equal(
  evidence.find((e) => e.id === "candidate-master")!.sha256,
  regeneration.master.sha256,
);
for (const key of ["model", "georeference", "scene"] as const) {
  const a = beforeSource.manifest[key],
    b = afterSource.manifest[key];
  assert.equal(a?.sha256, b?.sha256, `Original ${key} bytes changed`);
  if (a && b && key === "model") {
    assert.equal(
      sha256(new Uint8Array(await beforeSource.model.arrayBuffer())),
      a.sha256,
    );
    assert.equal(
      sha256(new Uint8Array(await afterSource.model.arrayBuffer())),
      a.sha256,
    );
  }
  if (a && b && key === "scene") {
    assert(beforeSource.scene && afterSource.scene);
    assert.equal(sha256(beforeSource.scene), a.sha256);
    assert.equal(sha256(afterSource.scene), a.sha256);
  }
}
// Reverse the LAST source-review family before checking earlier floor/boundary
// proofs. Their hashes bind their own exact outputs, before this new append.
let sourceRoomsBeforeDoorReview = afterSource.rooms;
if (regeneration.sourceDoorBoundaryClosureReview) {
  const summary = regeneration.sourceDoorBoundaryClosureReview;
  assert.equal(summary.physicalGuardsWaived, false);
  const reviewBytes = await addEvidence(
      "source-door-boundary-closure-review",
      path.resolve(summary.path),
    ),
    portableBytes = await addEvidence(
      "portable-source-door-boundary-closure-review",
      path.resolve(summary.portableReviewPath),
    ),
    receiptBytes = await addEvidence(
      "source-door-boundary-closure-fresh-replay",
      path.resolve(summary.receiptPath),
    );
  assert.equal(
    sha256(reviewBytes),
    summary.reviewSha256,
    "Raw review file differs from the compiler report",
  );
  assert.equal(sha256(receiptBytes), summary.receiptSha256);
  const review = JSON.parse(
      new TextDecoder().decode(reviewBytes),
    ) as SourceDoorBoundaryClosureReview,
    portable = JSON.parse(
      new TextDecoder().decode(portableBytes),
    ) as SourceDoorBoundaryClosureReview,
    receipt = JSON.parse(
      new TextDecoder().decode(receiptBytes),
    ) as SourceDoorBoundaryClosureReviewReceipt;
  assert.deepEqual(
    portable,
    review,
    "Portable source review differs from the applied input",
  );
  const bindingBytes = await addEvidence(
      "source-door-boundary-closure-algorithms",
      required("--door-boundary-closure-review-algorithm-binding"),
    ),
    algorithm = JSON.parse(new TextDecoder().decode(bindingBytes)) as {
      format: string;
      helperPath: string;
      helperSha256: string;
      sourceModelSha256: string;
      sourceCacheSha256: string;
      algorithmFiles: { path: string; bytes: number; sha256: string }[];
    },
    helperPath = fileURLToPath(
      new URL("source-door-boundary-closure-review.ts", import.meta.url),
    ),
    projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  assert.equal(
    algorithm.format,
    "openindoormaps-reviewed-source-door-boundary-closure-algorithms-v1",
  );
  assert.equal(path.resolve(algorithm.helperPath), helperPath);
  assert.equal(path.resolve(summary.algorithm.path), helperPath);
  assert.equal(summary.algorithm.sha256, algorithm.helperSha256);
  assert.equal(algorithm.sourceModelSha256, beforeSource.manifest.model.sha256);
  assert.equal(
    new Set(algorithm.algorithmFiles.map((e) => path.resolve(e.path))).size,
    algorithm.algorithmFiles.length,
  );
  const helperEntries = algorithm.algorithmFiles.filter(
    (e) => path.resolve(e.path) === helperPath,
  );
  assert.equal(helperEntries.length, 1);
  assert.equal(helperEntries[0]!.sha256, algorithm.helperSha256);
  const graph = await build({
    entryPoints: [helperPath],
    absWorkingDir: projectRoot,
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const expected = new Set([
    ...Object.keys(graph.metafile!.inputs).map((file) =>
      path.resolve(projectRoot, file),
    ),
    ...[projectRoot, path.resolve(projectRoot, "../reviter")].flatMap(
      (root) => [
        path.join(root, "package.json"),
        path.join(root, "package-lock.json"),
        path.join(
          root,
          root === projectRoot
            ? "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm"
            : "lib/reviter/vendor/native-exact-geos/native-exact-geos.wasm",
        ),
      ],
    ),
  ]);
  assert.deepEqual(
    algorithm.algorithmFiles.map((e) => path.resolve(e.path)).sort(),
    [...expected].sort(),
    "Closure source review must bind its complete actual helper/kernel dependency closure",
  );
  for (const [i, entry] of algorithm.algorithmFiles.entries()) {
    const bytes = await addEvidence(
      `source-door-boundary-closure-algorithm:${i}`,
      path.resolve(entry.path),
    );
    assert.equal(bytes.length, entry.bytes);
    assert.equal(
      sha256(bytes),
      entry.sha256,
      "Source-door closure review algorithm changed",
    );
  }
  const cachePath = path.resolve(regeneration.nativeCache),
    cacheHash = createHash("sha256");
  for await (const chunk of createReadStream(cachePath))
    cacheHash.update(chunk);
  const cacheSha256 = cacheHash.digest("hex");
  assert.equal(cacheSha256, regeneration.nativeCacheSha256);
  assert.equal(cacheSha256, algorithm.sourceCacheSha256);
  evidence.push({
    id: "source-door-boundary-closure-current-native-cache",
    path: cachePath,
    sha256: cacheSha256,
  });
  const prior = reverseSourceDoorBoundaryClosureReview(
      afterSource.rooms,
      review,
      receipt,
    ),
    delta = verifySourceDoorBoundaryClosureReviewDelta(
      prior,
      afterSource.rooms,
      {
        sourceModelSha256: beforeSource.manifest.model.sha256,
        originalSourceRoomsSha256: beforeSource.manifest.floors.sha256,
        nativeCacheSha256: cacheSha256,
      },
      review,
      receipt,
    ),
    proofPath = path.join(
      out,
      "source-door-boundary-closure-independent-delta.json",
    );
  await fs.writeFile(proofPath, JSON.stringify(delta, null, 2) + "\n", {
    flag: "wx",
  });
  await addEvidence(
    "source-door-boundary-closure-independent-delta",
    proofPath,
  );
  sourceRoomsBeforeDoorReview = prior;
} else
  assert.equal(
    option("--door-boundary-closure-review-algorithm-binding"),
    undefined,
    "Door-closure algorithm evidence only applies to an explicitly regenerated source family",
  );
const { reviewedDrawingReferences: oldDrawing, ...oldRooms } =
    beforeSource.rooms,
  { reviewedDrawingReferences: newDrawing, ...newRooms } =
    sourceRoomsBeforeDoorReview;
const beforeBoundaryReview = regeneration.nativeBoundaryMemberReview
  ? {
      ...sourceRoomsBeforeDoorReview,
      nativeBoundaryPatches: beforeSource.rooms.nativeBoundaryPatches,
    }
  : sourceRoomsBeforeDoorReview;
let verifiedNativeCacheSha256: string | undefined;
if (newDrawing) {
  assert(
    regeneration.drawingReferenceReview?.onlyDrawingReferenceReviewChanged ||
      regeneration.drawingFloorBindingReview,
  );
  const drawing = JSON.parse(
    new TextDecoder().decode(
      await addEvidence(
        "drawing-review",
        regeneration.drawingReferenceReview.path,
      ),
    ),
  );
  assert.deepEqual(newDrawing, drawing);
  assert.equal(newDrawing.sourceModelSha256, next.data.source.modelSha256);
  if (oldDrawing) assert.deepEqual(oldDrawing, newDrawing);
} else assert.equal(oldDrawing, undefined);
if (regeneration.drawingFloorBindingReview) {
  const summary = regeneration.drawingFloorBindingReview;
  assert.equal(summary.physicalGuardsWaived, false);
  const receipt = JSON.parse(
    new TextDecoder().decode(
      await addEvidence(
        "drawing-floor-rebind-fresh-replay",
        path.resolve(summary.receiptPath),
      ),
    ),
  ) as DrawingFloorRebindReceipt;
  const algorithmBinding = JSON.parse(
    new TextDecoder().decode(
      await addEvidence(
        "drawing-floor-rebind-algorithms",
        required("--drawing-floor-rebind-algorithm-binding"),
      ),
    ),
  ) as {
    sourceCacheSha256: string;
    originalArchiveRoomsSha256: string;
    algorithmFiles: { path: string; sha256: string }[];
  };
  assert.equal(
    algorithmBinding.originalArchiveRoomsSha256,
    beforeSource.manifest.floors.sha256,
  );
  assert.equal(summary.algorithm, receipt.algorithm);
  assert.equal(summary.status, receipt.status);
  assert.deepEqual(
    summary.changedRowIds,
    receipt.changedRows.map((row) => row.id),
  );
  assert.equal(summary.descriptorBeforeSha256, receipt.descriptorBeforeSha256);
  assert.equal(summary.descriptorAfterSha256, receipt.descriptorAfterSha256);
  const expectedHelper = fileURLToPath(
      new URL("./rebind-drawing-floor-source-review.ts", import.meta.url),
    ),
    helperBindings = algorithmBinding.algorithmFiles.filter(
      (entry) => path.resolve(entry.path) === expectedHelper,
    );
  assert.equal(
    helperBindings.length,
    1,
    "Floor review must bind its actual source helper",
  );
  assert.equal(
    new Set(
      algorithmBinding.algorithmFiles.map((entry) => path.resolve(entry.path)),
    ).size,
    algorithmBinding.algorithmFiles.length,
  );
  for (const [index, entry] of algorithmBinding.algorithmFiles.entries()) {
    const bytes = await addEvidence(
      `drawing-floor-rebind-algorithm:${index}`,
      path.resolve(entry.path),
    );
    assert.equal(
      sha256(bytes),
      entry.sha256,
      "Floor source-review algorithm changed",
    );
  }
  const cachePath = path.resolve(regeneration.nativeCache),
    cacheHash = createHash("sha256");
  for await (const chunk of createReadStream(cachePath))
    cacheHash.update(chunk);
  const cacheSha256 = cacheHash.digest("hex");
  verifiedNativeCacheSha256 = cacheSha256;
  assert.equal(
    cacheSha256,
    algorithmBinding.sourceCacheSha256,
    "Floor review uses another source conversion cache",
  );
  assert.equal(
    cacheSha256,
    regeneration.nativeCacheSha256,
    "Regeneration must bind the exact parsed conversion cache",
  );
  evidence.push({
    id: "drawing-floor-rebind-source-cache",
    path: cachePath,
    sha256: cacheSha256,
  });
  assert(beforeSource.indoor && afterSource.indoor);
  const reviewedBefore = newDrawing
    ? { ...beforeSource.rooms, reviewedDrawingReferences: newDrawing }
    : beforeSource.rooms;
  const delta = await verifyDrawingFloorSourceReviewDelta(
    reviewedBefore,
    beforeBoundaryReview,
    beforeSource.indoor as unknown as IndoorDataset,
    afterSource.indoor as unknown as IndoorDataset,
    receipt,
  );
  const proofPath = path.join(out, "drawing-floor-source-review-delta.json");
  await fs.writeFile(proofPath, JSON.stringify(delta, null, 2), { flag: "wx" });
  await addEvidence("drawing-floor-rebind-independent-delta", proofPath);
} else {
  assert.equal(
    option("--drawing-floor-rebind-algorithm-binding"),
    undefined,
    "A floor-rebind binding only applies to an explicit regenerated source review",
  );
  assert.deepEqual(
    oldRooms,
    regeneration.nativeBoundaryMemberReview
      ? {
          ...newRooms,
          nativeBoundaryPatches: beforeSource.rooms.nativeBoundaryPatches,
        }
      : newRooms,
    "Only explicitly checked drawing-reference review and floor-source rebind may change original annotations",
  );
}
if (regeneration.nativeBoundaryMemberReview) {
  const summary = regeneration.nativeBoundaryMemberReview;
  assert.equal(summary.physicalGuardsWaived, false);
  const reviewBytes = await addEvidence(
      "boundary-member-source-review",
      path.resolve(summary.path),
    ),
    receiptBytes = await addEvidence(
      "boundary-member-fresh-replay",
      path.resolve(summary.receiptPath),
    );
  assert.equal(sha256(reviewBytes), summary.reviewSha256);
  assert.equal(sha256(receiptBytes), summary.receiptSha256);
  const review = JSON.parse(new TextDecoder().decode(reviewBytes)) as
      | NativeBoundaryMemberReview
      | BoundaryReviewBundle,
    receipt = JSON.parse(new TextDecoder().decode(receiptBytes)) as
      | NativeBoundaryMemberReviewReceipt
      | NativeBoundaryReviewBundleReceipt,
    isBundle = review.format === "source-native-boundary-review-bundle-v1",
    bindingOption = isBundle
      ? "--boundary-review-bundle-algorithm-binding"
      : "--boundary-member-review-algorithm-binding";
  assert(
    isBundle ||
      review.format === "source-native-boundary-member-supersession-v1",
    "Unsupported boundary source-review format",
  );
  assert.equal(
    option(
      isBundle
        ? "--boundary-member-review-algorithm-binding"
        : "--boundary-review-bundle-algorithm-binding",
    ),
    undefined,
    "A singular and batch source review require their own exact reviewed algorithm closure",
  );
  const binding = JSON.parse(
      new TextDecoder().decode(
        await addEvidence(
          "boundary-member-reviewed-algorithms",
          required(bindingOption),
        ),
      ),
    ) as {
      format: string;
      helperPath: string;
      helperSha256: string;
      sourceModelSha256: string;
      sourceCacheSha256: string;
      algorithmFiles: { path: string; bytes: number; sha256: string }[];
    },
    helperPath = fileURLToPath(
      new URL(
        isBundle
          ? "./source-native-boundary-review-bundle.ts"
          : "./source-native-boundary-member-review.ts",
        import.meta.url,
      ),
    );
  assert.equal(
    binding.format,
    isBundle
      ? "openindoormaps-reviewed-native-boundary-review-bundle-algorithms-v1"
      : "openindoormaps-reviewed-native-boundary-member-algorithms-v1",
  );
  assert.equal(path.resolve(binding.helperPath), helperPath);
  assert.equal(path.resolve(summary.algorithm.path), helperPath);
  assert.equal(summary.algorithm.sha256, binding.helperSha256);
  assert.equal(binding.sourceModelSha256, beforeSource.manifest.model.sha256);
  assert.equal(
    new Set(binding.algorithmFiles.map((e) => path.resolve(e.path))).size,
    binding.algorithmFiles.length,
  );
  const helpers = binding.algorithmFiles.filter(
    (e) => path.resolve(e.path) === helperPath,
  );
  assert.equal(helpers.length, 1);
  assert.equal(helpers[0]!.sha256, binding.helperSha256);
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url)),
    graph = await build({
      entryPoints: [helperPath],
      absWorkingDir: projectRoot,
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
    }),
    expectedAlgorithmPaths = new Set([
      ...Object.keys(graph.metafile!.inputs).map((file) =>
        path.resolve(projectRoot, file),
      ),
      ...[projectRoot, path.resolve(projectRoot, "../reviter")].flatMap(
        (root) => [
          path.join(root, "package.json"),
          path.join(root, "package-lock.json"),
          path.join(
            root,
            root === projectRoot
              ? "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm"
              : "lib/reviter/vendor/native-exact-geos/native-exact-geos.wasm",
          ),
        ],
      ),
    ]);
  assert.deepEqual(
    binding.algorithmFiles.map((e) => path.resolve(e.path)).sort(),
    [...expectedAlgorithmPaths].sort(),
    "Boundary source-review binding must cover the complete resolved helper graph and checked kernels/locks",
  );
  for (const [i, entry] of binding.algorithmFiles.entries()) {
    const bytes = await addEvidence(
      `boundary-member-algorithm:${i}`,
      path.resolve(entry.path),
    );
    assert.equal(bytes.length, entry.bytes);
    assert.equal(
      sha256(bytes),
      entry.sha256,
      "Boundary source-review algorithm changed",
    );
  }
  if (!verifiedNativeCacheSha256) {
    const cachePath = path.resolve(regeneration.nativeCache),
      cacheHash = createHash("sha256");
    for await (const chunk of createReadStream(cachePath))
      cacheHash.update(chunk);
    verifiedNativeCacheSha256 = cacheHash.digest("hex");
    evidence.push({
      id: "boundary-member-source-cache",
      path: cachePath,
      sha256: verifiedNativeCacheSha256,
    });
  }
  assert.equal(verifiedNativeCacheSha256, regeneration.nativeCacheSha256);
  assert.equal(verifiedNativeCacheSha256, binding.sourceCacheSha256);
  const sourceBinding = {
      sourceModelSha256: beforeSource.manifest.model.sha256,
      originalSourceRoomsSha256: beforeSource.manifest.floors.sha256,
      nativeCacheSha256: verifiedNativeCacheSha256,
    },
    delta = isBundle
      ? verifyBoundaryReviewBundleSourceDelta(
          beforeBoundaryReview,
          sourceRoomsBeforeDoorReview,
          sourceBinding,
          review as BoundaryReviewBundle,
          receipt as NativeBoundaryReviewBundleReceipt,
        )
      : verifyBoundaryMemberSourceReviewDelta(
          beforeBoundaryReview,
          sourceRoomsBeforeDoorReview,
          sourceBinding,
          review as NativeBoundaryMemberReview,
          receipt as NativeBoundaryMemberReviewReceipt,
        ),
    proofPath = path.join(
      out,
      isBundle
        ? "boundary-review-bundle-source-delta.json"
        : "boundary-member-source-review-delta.json",
    );
  await fs.writeFile(proofPath, JSON.stringify(delta, null, 2) + "\n", {
    flag: "wx",
  });
  await addEvidence("boundary-member-independent-source-delta", proofPath);
} else
  for (const flag of [
    "--boundary-member-review-algorithm-binding",
    "--boundary-review-bundle-algorithm-binding",
  ])
    assert.equal(
      option(flag),
      undefined,
      "Boundary algorithm evidence only applies to an explicit source review",
    );
let steppedStairScope:
  | Awaited<ReturnType<typeof verifySourceSteppedStairCandidateScope>>
  | Awaited<ReturnType<typeof verifyPostcompileSteppedCandidateScope>>
  | undefined;
if (regeneration.postcompileSteppedStairReview) {
  const summary =
      regeneration.postcompileSteppedStairReview as PostcompileSteppedSummary,
    requestedReview = required("--postcompile-stepped-stair-review");
  assert.equal(path.resolve(summary.path), requestedReview);
  assert.equal(
    option("--stepped-stair-postcompile-projection-review"),
    undefined,
    "The complete strengthening review includes its exact projection/engine amendment; do not reuse the old two-file receipt",
  );
  assert.equal(
    option("--stepped-stair-source-algorithm-binding"),
    undefined,
    "The complete strengthening review binds its historical compiler manifest; do not mix the legacy successful-finalization branch",
  );
  assert.equal(regeneration.sourceSteppedStairV2ReviewHistoricalOnly, true);
  const bytes = await addEvidence(
    "postcompile-stepped-current-review",
    requestedReview,
  );
  assert.equal(sha256(bytes), summary.sha256);
  assert(afterSource.indoor);
  steppedStairScope = await verifyPostcompileSteppedCandidateScope({
    summary,
    candidateMasterPath: sourceCandidate,
    candidateVisitorPath: candidate,
    candidateMaster: afterSource.indoor as unknown as IndoorDataset,
    candidateVisitor: next.data,
    currentSourceRooms: afterSource.rooms as unknown as ProjectRooms,
    currentRegeneration: regeneration,
    log: (message) => console.log(JSON.stringify(message)),
  });
  const proofPath = path.join(
    out,
    "postcompile-stepped-independent-current-replay.json",
  );
  await fs.writeFile(proofPath, JSON.stringify(steppedStairScope, null, 2), {
    flag: "wx",
  });
  await addEvidence(
    "postcompile-stepped-independent-current-replay",
    proofPath,
  );
} else if (regeneration.sourceSteppedStairV2Review) {
  assert.equal(option("--postcompile-stepped-stair-review"), undefined);
  const summary =
      regeneration.sourceSteppedStairV2Review as SteppedStairSourceSummary,
    algorithmBindingPath = required("--stepped-stair-source-algorithm-binding"),
    binding = JSON.parse(
      new TextDecoder().decode(
        await addEvidence(
          "stepped-stair-complete-source-algorithms",
          algorithmBindingPath,
        ),
      ),
    ) as {
      createdAt: string;
      runtime: string;
      entryPoints: string[];
      files: Record<string, string>;
    },
    projectRoot = fileURLToPath(new URL("../../", import.meta.url)),
    expectedEntries = [
      "scripts/indoor/regenerate-from-native-cache.ts",
      "../reviter/scripts/indoor/native-circulation-plane-worker.ts",
      "../reviter/scripts/indoor/native-landing-approach-worker.ts",
    ].map((file) => path.resolve(projectRoot, file)),
    expectedAlgorithms = [
      "source-stepped-stair-v2-review.ts",
      "source-stepped-stair-v2-producer.ts",
      "finalize-source-stepped-stair-v2.ts",
    ].map((file) => fileURLToPath(new URL(file, import.meta.url)));
  assert.equal(
    binding.runtime,
    process.version,
    "Source reissuance must use the checked original Node runtime",
  );
  assert.deepEqual(binding.entryPoints, expectedEntries);
  assert(Number.isFinite(Date.parse(binding.createdAt)));
  assert.deepEqual(
    summary.algorithms.map((row) => path.resolve(row.path)).sort(),
    [...expectedAlgorithms].sort(),
    "The source stair summary must bind exactly its actual review, producer and finalizer",
  );
  const graph = await build({
      entryPoints: expectedEntries,
      absWorkingDir: projectRoot,
      outdir: path.join(out, "unused-source-closure"),
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
      loader: { ".wasm": "file" },
    }),
    expectedPaths = new Set([
      ...Object.keys(graph.metafile!.inputs).map((file) =>
        path.resolve(projectRoot, file),
      ),
      ...[projectRoot, path.resolve(projectRoot, "../reviter")].flatMap(
        (root) => [
          path.join(root, "package.json"),
          path.join(root, "package-lock.json"),
          path.join(
            root,
            root === projectRoot
              ? "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm"
              : "lib/reviter/vendor/native-exact-geos/native-exact-geos.wasm",
          ),
        ],
      ),
    ]);
  assert.deepEqual(
    Object.keys(binding.files).sort(),
    [...expectedPaths].sort(),
    "Source review requires the complete resolved driver/worker/source-producer graph and exact kernels/locks",
  );
  const downstreamChanges = new Map<string, string>(),
    projectionReviewPath = option(
      "--stepped-stair-postcompile-projection-review",
    );
  if (projectionReviewPath) {
    // The source compiler ran the historical complete closure. Only this exact
    // downstream transport patch and the official derived engine literal may
    // differ at independent QA; all source mathematics remain byte-identical.
    const amendment = JSON.parse(
        new TextDecoder().decode(
          await addEvidence(
            "stepped-stair-postcompile-projection-review",
            path.resolve(projectionReviewPath),
          ),
        ),
      ) as {
        format: string;
        compilerSourceClosureSha256: string;
        originalProjection: { path: string; sha256: string };
        currentProjectionSha256: string;
        originalEngineLiteral: { path: string; sha256: string };
        currentEngineLiteralSha256: string;
        transformationAlgorithm: { path: string; sha256: string };
        engineBindingAlgorithm: { path: string; sha256: string };
      },
      projectionPath = path.join(
        projectRoot,
        "app/indoor-project/route-worker-dataset.ts",
      ),
      enginePath = path.join(
        projectRoot,
        "app/indoor-project/prepared-display-engine-binding.ts",
      ),
      transformationPath = fileURLToPath(
        new URL("./stepped-stair-worker-projection-review.ts", import.meta.url),
      ),
      engineAlgorithmPath = fileURLToPath(
        new URL("./prepared-display-engine-binding.ts", import.meta.url),
      );
    assert.equal(
      amendment.format,
      "openindoormaps-stepped-worker-postcompile-amendment-v1",
    );
    assert.equal(
      amendment.compilerSourceClosureSha256,
      evidence.find(
        (row) => row.id === "stepped-stair-complete-source-algorithms",
      )!.sha256,
    );
    assert.equal(
      path.resolve(amendment.transformationAlgorithm.path),
      transformationPath,
    );
    assert.equal(
      path.resolve(amendment.engineBindingAlgorithm.path),
      engineAlgorithmPath,
    );
    for (const [id, record] of [
      ["projection-transform", amendment.transformationAlgorithm],
      ["engine-transform", amendment.engineBindingAlgorithm],
    ] as const)
      assert.equal(
        sha256(
          await addEvidence(
            `stepped-stair-${id}-algorithm`,
            path.resolve(record.path),
          ),
        ),
        record.sha256,
      );
    const historicalProjection = await addEvidence(
        "stepped-stair-historical-projection",
        path.resolve(amendment.originalProjection.path),
      ),
      currentProjection = await addEvidence(
        "stepped-stair-downstream-projection",
        projectionPath,
      ),
      projectionProof = verifyExactSteppedWorkerProjectionAmendment({
        original: historicalProjection,
        current: currentProjection,
        expectedOriginalSha256: binding.files[projectionPath]!,
        expectedCurrentSha256: amendment.currentProjectionSha256,
      });
    assert.equal(
      amendment.originalProjection.sha256,
      binding.files[projectionPath],
    );
    const historicalEngine = await addEvidence(
        "stepped-stair-historical-engine-literal",
        path.resolve(amendment.originalEngineLiteral.path),
      ),
      currentEngine = await addEvidence(
        "stepped-stair-downstream-engine-literal",
        enginePath,
      ),
      engine = preparedDisplayEngineBinding(projectRoot),
      expectedEngineSource = `// Generated from the complete local preparation module graph and dependency lock.\n// Refresh through Vite or scripts/indoor/prepared-display-engine-binding.ts.\nexport const PREPARED_DISPLAY_ENGINE_SHA256 =\n  ${JSON.stringify(engine.sha256)};\n`;
    assert.equal(
      amendment.originalEngineLiteral.sha256,
      binding.files[enginePath],
    );
    assert.equal(sha256(historicalEngine), binding.files[enginePath]);
    assert.equal(sha256(currentEngine), amendment.currentEngineLiteralSha256);
    assert.equal(
      new TextDecoder().decode(currentEngine),
      expectedEngineSource,
      "Downstream engine literal must exactly equal the official current complete-graph computation",
    );
    downstreamChanges.set(projectionPath, amendment.currentProjectionSha256);
    downstreamChanges.set(enginePath, amendment.currentEngineLiteralSha256);
    const proofPath = path.join(
      out,
      "stepped-stair-exact-downstream-projection-review.json",
    );
    await fs.writeFile(
      proofPath,
      JSON.stringify(
        {
          format: amendment.format,
          compilerSourceClosureSha256: amendment.compilerSourceClosureSha256,
          projectionProof,
          currentEngineSha256: engine.sha256,
          checkedEngineModules: engine.modules.length,
          originalSourceProofAndGeometryAlgorithmsUnchanged: true,
          freshOriginalCandidateAndWorkerValidationRequired: true,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    await addEvidence(
      "stepped-stair-independent-downstream-projection-review",
      proofPath,
    );
  }
  for (const [index, [file, expectedHash]] of Object.entries(
    binding.files,
  ).entries()) {
    assert.match(expectedHash, /^[a-f0-9]{64}$/);
    const bytes = await addEvidence(
      `stepped-stair-source-algorithm:${index}`,
      file,
    );
    assert.equal(
      sha256(bytes),
      downstreamChanges.get(file) ?? expectedHash,
      `Frozen source/worker algorithm changed outside an exact downstream transport amendment: ${file}`,
    );
  }
  for (const algorithm of summary.algorithms)
    assert.equal(
      algorithm.sha256,
      binding.files[path.resolve(algorithm.path)],
      "Finalization summary differs from the independently checked frozen source closure",
    );
  if (!verifiedNativeCacheSha256) {
    const cachePath = path.resolve(regeneration.nativeCache),
      cacheHash = createHash("sha256");
    for await (const chunk of createReadStream(cachePath))
      cacheHash.update(chunk);
    verifiedNativeCacheSha256 = cacheHash.digest("hex");
    evidence.push({
      id: "stepped-stair-original-native-cache",
      path: cachePath,
      sha256: verifiedNativeCacheSha256,
    });
  }
  assert.equal(verifiedNativeCacheSha256, regeneration.nativeCacheSha256);
  const reviewBytes = await addEvidence(
      "stepped-stair-external-source-review",
      path.resolve(summary.path),
    ),
    portableReviewBytes = await addEvidence(
      "stepped-stair-portable-source-review",
      path.resolve(summary.portableReviewPath),
    ),
    replayBytes = await addEvidence(
      "stepped-stair-recorded-source-finalization",
      path.resolve(summary.receiptPath),
    ),
    inputBytes = new Uint8Array(
      await fs.readFile(path.resolve(regeneration.input)),
    ),
    input = unzipSync(inputBytes, {
      filter: (entry) =>
        entry.name === "manifest.json" || entry.name === "viewer/indoor.json",
    }),
    inputManifest = JSON.parse(
      new TextDecoder().decode(input["manifest.json"]),
    ),
    originalDatasetBytes = input[inputManifest.indoor?.path];
  assert(
    originalDatasetBytes,
    "A source stair review requires the actual prepared original graph entry",
  );
  assert.equal(inputManifest.indoor.bytes, originalDatasetBytes.length);
  assert.equal(inputManifest.indoor.sha256, sha256(originalDatasetBytes));
  assert.equal(inputManifest.model.sha256, beforeSource.manifest.model.sha256);
  assert.equal(
    inputManifest.floors.sha256,
    beforeSource.manifest.floors.sha256,
  );
  assert.equal(
    sha256(inputBytes),
    sourceRebuildProof?.outputSha256 ?? originalSourceAssets.archiveSha256,
    "Stair source graph must come from the exact canonical or independently proved display-cache-only rebuild input",
  );
  assert(beforeSource.indoor && afterSource.indoor);
  steppedStairScope = await verifySourceSteppedStairCandidateScope({
    summary,
    reviewBytes,
    portableReviewBytes,
    replayBytes,
    originalRVTBytes: new Uint8Array(await beforeSource.model.arrayBuffer()),
    originalDatasetBytes,
    originalSourceRoomsBytes: new Uint8Array(
      await beforeSource.sourceRoomFile.arrayBuffer(),
    ),
    sourceModelSha256: beforeSource.manifest.model.sha256,
    sourceRoomsSha256: beforeSource.manifest.floors.sha256,
    nativeCacheSha256: verifiedNativeCacheSha256,
    originalCanonicalDataset: beforeSource.indoor as unknown as IndoorDataset,
    candidateMaster: afterSource.indoor as unknown as IndoorDataset,
    candidateVisitor: next.data,
    currentSourceRooms: afterSource.rooms as unknown as {
      indoorReviews?: unknown;
    },
    reviewedDrawingReferences: newDrawing,
    log: (message) => console.log(JSON.stringify(message)),
  });
  const proofPath = path.join(
    out,
    "stepped-stair-independent-original-source-replay.json",
  );
  await fs.writeFile(
    proofPath,
    JSON.stringify(steppedStairScope, null, 2) + "\n",
    { flag: "wx" },
  );
  await addEvidence(
    "stepped-stair-independent-original-source-replay",
    proofPath,
  );
} else {
  assert.equal(
    option("--postcompile-stepped-stair-review"),
    undefined,
    "A postcompile review requires an explicit preserved historical source finalization",
  );
  assert.equal(
    option("--stepped-stair-source-algorithm-binding"),
    undefined,
    "A stair source binding only applies to an explicitly source-finalized candidate",
  );
  assert.equal(
    option("--stepped-stair-postcompile-projection-review"),
    undefined,
    "A downstream projection amendment only applies alongside its independently reissued stair source review",
  );
  assert.deepEqual(
    next.data.nativeSteppedStairV2SourceIndices,
    old.data.nativeSteppedStairV2SourceIndices,
    "An unreviewed shared stair source inventory changed",
  );
  assert.equal(
    next.data.edges.filter((edge) => edge.nativeSteppedStairV2).length,
    old.data.edges.filter((edge) => edge.nativeSteppedStairV2).length,
    "A new stepped variant requires independently reissued original source authority",
  );
}
beforeSource = undefined as unknown as typeof beforeSource;
afterSource = undefined as unknown as typeof afterSource;
globalThis.gc?.();
const extra = option("--evidence-index");
if (extra) {
  const index = JSON.parse(await fs.readFile(extra, "utf8")) as {
    id: string;
    path: string;
    sha256: string;
  }[];
  for (const item of index) {
    const bytes = await addEvidence(
      item.id,
      path.resolve(path.dirname(extra), item.path),
    );
    assert.equal(
      sha256(bytes),
      item.sha256,
      `Additional source evidence changed: ${item.id}`,
    );
  }
}

const before = safetySnapshot(old.data),
  after = safetySnapshot(next.data),
  safety = compareSafety(before, after),
  recordScope: {
    key: string;
    fields: string[];
    evidenceIds: string[];
    reason?: string;
  }[] = [],
  edgeScope: {
    id: string;
    fields: string[];
    evidenceIds: string[];
    reason?: string;
  }[] = [],
  needsReview: string[] = [],
  certifiedBaselineIds = new Set<string>(
    (stationary.aliases ?? [])
      .filter(
        (row: { certified?: boolean; sourceAccessible?: string }) =>
          row.certified === true && row.sourceAccessible === "unknown",
      )
      .map((row: { id: string }) => row.id),
  );
const withheld = new Set<string>(
    (regeneration.withheldAlreadyPhysicallyUnsupportedArrivals ?? [])
      .filter(
        (row: { allOriginalApproachesPhysicallyRefused?: boolean }) =>
          row.allOriginalApproachesPhysicallyRefused === true,
      )
      .map((row: { roomKey: string }) => row.roomKey),
  ),
  restricted = new Set<string>(
    regeneration.intentionallyRestrictedArrivals ?? [],
  );
for (const change of safety.changes) {
  if (change.target === "record") {
    if (change.field !== "arrivalNodeId") {
      needsReview.push(`Unsupported record field ${change.id}:${change.field}`);
      continue;
    }
    const current = next.data.records.find((r) => r.key === change.id)!;
    if (
      change.before &&
      !change.after &&
      !withheld.has(change.id) &&
      !(restricted.has(change.id) && current.access === "staff")
    ) {
      needsReview.push(`Unexplained original arrival loss: ${change.id}`);
      continue;
    }
    recordScope.push({
      key: change.id,
      fields: [change.field],
      evidenceIds: ["regeneration", "candidate-master"],
      ...(withheld.has(change.id)
        ? { reason: "withhold-unsupported-original-arrival" }
        : {}),
    });
  } else if (
    change.field === "accessible" &&
    change.before === "unknown" &&
    change.after === "yes"
  ) {
    if (
      !certifiedBaselineIds.has(change.id) ||
      !before.stationaryAliases[change.id] ||
      JSON.stringify(before.stationaryAliases[change.id]) !==
        JSON.stringify(after.stationaryAliases[change.id])
    ) {
      needsReview.push(
        `Accessibility change lacks unchanged original stationary source identity: ${change.id}`,
      );
      continue;
    }
    edgeScope.push({
      id: change.id,
      fields: [change.field],
      evidenceIds: ["stationary-source", "regeneration", "candidate-master"],
      reason: "certify-stationary-native-alias",
    });
  } else if (
    change.field === "enabled" &&
    change.before === false &&
    change.after === true &&
    steppedStairScope?.originalEdgeIds.includes(change.id)
  ) {
    edgeScope.push({
      id: change.id,
      fields: [change.field],
      evidenceIds: regeneration.postcompileSteppedStairReview
        ? [
            "postcompile-stepped-current-review",
            "postcompile-stepped-independent-current-replay",
            "regeneration",
            "candidate-master",
          ]
        : [
            "stepped-stair-external-source-review",
            "stepped-stair-portable-source-review",
            "stepped-stair-recorded-source-finalization",
            "stepped-stair-complete-source-algorithms",
            "stepped-stair-independent-original-source-replay",
            "regeneration",
            "candidate-master",
          ],
      reason: "original-source-stepped-stair-v2-finalization",
    });
  } else if (
    change.field === "enabled" &&
    change.before === true &&
    change.after === false
  ) {
    edgeScope.push({
      id: change.id,
      fields: [change.field],
      evidenceIds: ["regeneration", "candidate-master"],
    });
  } else if (
    change.field === "direction" &&
    (change.before ?? "both") === (change.after ?? "both")
  )
    continue;
  else
    needsReview.push(
      `Unsupported original edge change: ${change.id}:${change.field}`,
    );
}
const graphFields = [
    "records",
    "nodes",
    "edges",
    "walls",
    "walkingSupport",
    "circulationGeometry",
    "nativeMaterialSections",
    "nativeSourceStairMaterials",
    "nativeSteppedStairV2SourceIndices",
    "stairDisplay",
    "rampDisplay",
    "nativeIndoorEnvelopes",
    "nativePhysicalLevels",
    "reviewedDrawingReferences",
    "indoorExclusions",
    "nativeDoorFloorOpeningOwnership",
    "nativeWallPositionRepairs",
    "nativeDerivedFrameReturns",
    "nativeProvisionalCornerSeals",
  ] as const,
  fieldDeltas = graphFields
    .map((key) => ({
      field: key,
      beforeSha256: jsonSha256(
        (old.data as unknown as Record<string, unknown>)[key],
      ),
      afterSha256: jsonSha256(
        (next.data as unknown as Record<string, unknown>)[key],
      ),
    }))
    .filter((row) => row.beforeSha256 !== row.afterSha256),
  oldRecords = new Map(old.data.records.map((record) => [record.key, record])),
  changedRoomGeometry = next.data.records.flatMap((record) => {
    const original = oldRecords.get(record.key);
    return original &&
      jsonSha256(original.ringsFeet) !== jsonSha256(record.ringsFeet)
      ? [
          {
            key: record.key,
            number: record.number,
            levelId: record.levelId,
            beforeSha256: jsonSha256(original.ringsFeet),
            afterSha256: jsonSha256(record.ringsFeet),
          },
        ]
      : [];
  });
const geometryDelta = {
  sourceModelSha256: next.data.source.modelSha256,
  baselinePackageSha256: sha256(oldBytes),
  candidatePackageSha256: sha256(newBytes),
  baselineRoutingSha256: oldRoutingSha,
  candidateRoutingSha256: newRoutingSha,
  sourceAnnotationsOnlyDrawingReferenceReviewChanged: true,
  originalModelGisSceneBytesPreserved: true,
  candidateMasterVisitorPhysicalAuthorityMatched: true,
  independentlyReissuedSteppedStairSourceScope: steppedStairScope,
  sourceRebuildInput: sourceRebuildProof && {
    inputSha256: sourceRebuildProof.inputSha256,
    outputSha256: sourceRebuildProof.outputSha256,
    removedDerivedField: sourceRebuildProof.removedDerivedField,
    canonicalSourceBaselineRetained: true,
  },
  fieldDeltas,
  changedRoomGeometry,
  sourceFloorDeltas: {
    missing: safety.missingSourceFloorIds,
    changed: safety.changedSourceFloorIds,
    added: safety.addedSourceFloorIds,
  },
  sourceBoundScopeDoesNotApproveGeometry: true,
  needsReview,
};
const deltaPath = path.join(out, "geometry-delta.json");
await fs.writeFile(deltaPath, JSON.stringify(geometryDelta, null, 2), {
  flag: "wx",
});
await addEvidence("geometry-delta", deltaPath);
for (const item of [...recordScope, ...edgeScope]) {
  item.evidenceIds.push("geometry-delta");
  if (sourceRebuildProof) item.evidenceIds.push("source-rebuild-input-proof");
}
const scope = {
  format: "openindoormaps-pathway-candidate-review",
  version: 1,
  sourceModelSha256: next.data.source.modelSha256,
  baselinePackageSha256: sha256(oldBytes),
  candidatePackageSha256: sha256(newBytes),
  evidence,
  records: recordScope,
  edges: edgeScope,
  ...(regeneration.postcompileSteppedStairReview &&
  steppedStairScope &&
  "declinedEdgeIds" in steppedStairScope
    ? {
        postcompileSteppedOutcomes: {
          requestedEdgeIds: steppedStairScope.requestedEdgeIds,
          qualifiedEdgeIds: steppedStairScope.qualifiedEdgeIds,
          declinedEdgeIds: steppedStairScope.declinedEdgeIds,
          evidenceIds: [
            "postcompile-stepped-current-review",
            "postcompile-stepped-independent-current-replay",
          ],
        },
      }
    : {}),
};
await fs.writeFile(
  path.join(out, "review-scope.json"),
  JSON.stringify(scope, null, 2),
  { flag: "wx" },
);
const cases = recordScope
  .filter(
    (item) =>
      !item.reason &&
      next.data.records.some((r) => r.key === item.key && r.arrivalNodeId),
  )
  .flatMap((item) => {
    const r = next.data.records.find((r) => r.key === item.key)!;
    const native = next.data.edges.find(
        (edge) =>
          edge.enabled &&
          edge.kind === "walk" &&
          (edge.from === r.arrivalNodeId || edge.to === r.arrivalNodeId),
      ),
      other = native?.roomKeys
        .map((key) => next.data.records.find((record) => record.key === key))
        .find(
          (record) =>
            record?.arrivalNodeId &&
            record.key !== r.key &&
            record.access !== "staff",
        );
    return other
      ? [
          {
            name: `Recovered arrival ${r.number}: outward`,
            start: r.key,
            end: other.key,
            mode: "public",
          },
          {
            name: `Recovered arrival ${r.number}: return`,
            start: other.key,
            end: r.key,
            mode: "public",
          },
        ]
      : [];
  });
await fs.writeFile(
  path.join(out, "affected-route-cases.json"),
  JSON.stringify(cases, null, 2),
  { flag: "wx" },
);
// Recheck every bound artifact after reading/producing the complete scope.
for (const item of evidence)
  assert.equal(
    sha256(new Uint8Array(await fs.readFile(item.path))),
    item.sha256,
    `Evidence changed during scope build: ${item.id}`,
  );
console.log(
  JSON.stringify({
    out,
    records: recordScope.length,
    edges: edgeScope.length,
    stationaryIdentityChanges: edgeScope.filter(
      (item) => item.reason === "certify-stationary-native-alias",
    ).length,
    changedRoomGeometry: changedRoomGeometry.length,
    needsReview,
    scopeDoesNotApproveGeometry: true,
  }),
);
if (needsReview.length) process.exitCode = 1;
