import { nativeCirculationWalkBlockers } from "../../app/indoor-project/native-circulation";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { initializeNativeExactGeosOverlay as initializeSourceExactGeosOverlay } from "../../../reviter/lib/reviter/native-exact-geos-overlay.ts";
import { originalBlockedArrivalEvidence } from "./pathway-candidate-audit";
import {
  bindPrivateImportCheckpoint,
  readPrivateImportCheckpoint,
  writePrivateImportCheckpoint,
  type PrivateImportedData,
} from "./private-import-checkpoint";
import { roomsWithDrawingReferenceReview } from "./source-drawing-reference-review";
import { roomsWithCurrentDrawingFloorBindings } from "./rebind-drawing-floor-source-review";
import { roomsWithCheckedNativeBoundaryMemberReview } from "./source-native-boundary-member-review";
import { roomsWithCheckedNativeBoundaryReviewBundle } from "./source-native-boundary-review-bundle";
import { roomsWithCheckedSourceDoorBoundaryClosureReview } from "./source-door-boundary-closure-review";
import { initializeReviewedSourceSteppedStairV2Proofs } from "./source-stepped-stair-v2-review";
import { finalizeSourceSteppedStairV2Dataset } from "./finalize-source-stepped-stair-v2";
import { initializeOriginalDoorStandingReview } from "./source-door-standing-review";
import { initializeOriginalStairBaseStandingReview } from "./source-stair-base-standing-review";
import { serializeRoomsForArchive } from "../../../reviter/lib/reviter/review-bundle-wire";
/** Regenerate derived indoor data from an exact-model decoded cache.
 * Originals are read-only; output files must not already exist.
 * node --import tsx scripts/indoor/regenerate-from-native-cache.ts master.zip native-cache.json output-directory
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { serialize } from "node:v8";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const { join, resolve } = path;
import { readProjectPackage } from "../../../reviter/lib/reviter/project-package.ts";
import { prepareIndoorDataset } from "../../../reviter/lib/reviter/indoor-pipeline.ts";
import { prepareNativeCirculationGeometry } from "../../../reviter/lib/reviter/native-circulation-geometry.ts";
import { createSourceReviewedFlatLandingDriver } from "../../../reviter/lib/reviter/native-flat-landing-driver.ts";
import { createNativeParallelCompiler } from "../../../reviter/scripts/indoor/parallel-native-circulation.ts";
import { attachNativeCirculationResumable } from "../../../reviter/scripts/indoor/native-landing-approaches.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import { validatePublishedNativeExploreMapping } from "../../app/indoor-project/native-explore-mapping";
import {
  nativeRegenerationDatasetSha256,
  nativeRegenerationVisitorExpectedSha256,
} from "./native-regeneration-parity";
import {
  persistUnacceptedRegenerationArchive,
  copyCheckedRegenerationArchive,
  createFinalRegenerationPreservationChecks,
} from "./native-regeneration-phase-io";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";

const [input, nativeCache, destination, ...workerArgs] = process.argv.slice(2);
if (!input || !nativeCache || !destination)
  throw new Error(
    "Usage: regenerate-from-native-cache.ts master.zip native-cache.json output-directory [--native-workers 1|2] [--native-worker-heap-mib 256..8192] [--landing-workers N] [--landing-worker-heap-mib 256..8192] [--checkpoint-dir directory] [--drawing-reference-review review.json] [--refresh-drawing-floor-bindings checked] [--boundary-contact-review review.json] [--door-boundary-closure-review review.json] [--source-flat-landing-review checked] [--source-stepped-stair-review review.json] [--source-door-standing-review review.json] [--source-stair-base-standing-review review.json] [--validated-import-checkpoint-dir private-directory] [--prepared-diagnostic-dir NEW-directory]",
  );
const workerOptions = new Map<string, string>();
for (let i = 0; i < workerArgs.length; i += 2) {
  const flag = workerArgs[i]!,
    value = workerArgs[i + 1];
  if (
    ![
      "--native-workers",
      "--native-worker-heap-mib",
      "--landing-workers",
      "--landing-worker-heap-mib",
      "--checkpoint-dir",
      "--drawing-reference-review",
      "--validated-import-checkpoint-dir",
      "--refresh-drawing-floor-bindings",
      "--boundary-contact-review",
      "--door-boundary-closure-review",
      "--source-flat-landing-review",
      "--source-stepped-stair-review",
      "--source-door-standing-review",
      "--source-stair-base-standing-review",
      "--prepared-diagnostic-dir",
    ].includes(flag) ||
    workerOptions.has(flag) ||
    !value ||
    value.startsWith("--")
  )
    throw new Error(
      "Expected unique --native-workers 1|2, --landing-workers N, --checkpoint-dir directory and --drawing-reference-review review.json",
    );
  workerOptions.set(flag, value);
}
const workerCount = workerOptions.has("--native-workers")
  ? Number(workerOptions.get("--native-workers"))
  : undefined;
if (workerCount !== undefined && workerCount !== 1 && workerCount !== 2)
  throw new Error("--native-workers must be 1 or 2");
const landingWorkers = workerOptions.has("--landing-workers")
  ? Number(workerOptions.get("--landing-workers"))
  : undefined;
if (
  landingWorkers !== undefined &&
  (!Number.isSafeInteger(landingWorkers) ||
    landingWorkers < 1 ||
    landingWorkers > 8)
)
  throw new Error("--landing-workers must be an integer 1–8");
const workerHeap = (flag: string, workers: number | undefined) => {
  if (!workerOptions.has(flag)) return;
  if (!workers)
    throw new Error(`${flag} requires its corresponding worker option`);
  const heapMiB = Number(workerOptions.get(flag));
  if (!Number.isSafeInteger(heapMiB) || heapMiB < 256 || heapMiB > 8192)
    throw new Error(`${flag} must be an integer 256–8192`);
  return heapMiB;
};
const nativeWorkerHeapMiB = workerHeap("--native-worker-heap-mib", workerCount);
const landingWorkerHeapMiB = workerHeap(
  "--landing-worker-heap-mib",
  landingWorkers,
);
if (landingWorkerHeapMiB !== undefined && landingWorkers === 1)
  throw new Error(
    "--landing-worker-heap-mib requires at least two landing workers; one uses the parent isolate",
  );
if (workerOptions.has("--checkpoint-dir") && !workerCount && !landingWorkers)
  throw new Error(
    "--checkpoint-dir requires --native-workers or --landing-workers",
  );
const inputPath = resolve(input),
  cachePath = resolve(nativeCache),
  output = resolve(destination);
const preparedDiagnosticDirectory = workerOptions.get(
  "--prepared-diagnostic-dir",
);
// Diagnostic output is isolated and must be new. Refuse accidental replacement
// before any expensive import or compilation work begins.
if (preparedDiagnosticDirectory)
  await mkdir(resolve(preparedDiagnosticDirectory), { recursive: false });
const exportDiagnosticRoot = preparedDiagnosticDirectory
  ? resolve(preparedDiagnosticDirectory)
  : `${output}-unaccepted-export-diagnostic`;
if (!preparedDiagnosticDirectory)
  await mkdir(exportDiagnosticRoot, { recursive: false });
async function fileDigest(file: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function compileAndExportMaster() {
  const inputArchiveSha256 = await fileDigest(inputPath);
  const refreshDrawingFloors = workerOptions.get(
    "--refresh-drawing-floor-bindings",
  );
  if (refreshDrawingFloors !== undefined && refreshDrawingFloors !== "checked")
    throw new Error(
      "--refresh-drawing-floor-bindings requires the explicit value checked",
    );
  const sourceFlatLandingReview = workerOptions.get(
    "--source-flat-landing-review",
  );
  if (
    sourceFlatLandingReview !== undefined &&
    sourceFlatLandingReview !== "checked"
  )
    throw new Error(
      "--source-flat-landing-review requires the explicit value checked",
    );
  let sourceFlatLandingDriver:
    | ReturnType<typeof createSourceReviewedFlatLandingDriver>
    | undefined;
  const baseNativeCirculationCompiler = workerCount
    ? createNativeParallelCompiler({
        maxWorkers: workerCount as 1 | 2,
        workerHeapMiB: nativeWorkerHeapMiB,
        checkpointDir: resolve(
          workerOptions.get("--checkpoint-dir") ??
            join(output, "native-plane-checkpoints"),
        ),
        onProgress: (message) => console.log(message),
      })
    : undefined;
  const nativeCirculationCompiler =
    workerCount || sourceFlatLandingReview
      ? async (
          model: ConvertResult,
          data: Parameters<typeof prepareNativeCirculationGeometry>[1],
        ) => {
          if (data.nativeIndoorEnvelopes && sourceFlatLandingDriver)
            sourceFlatLandingDriver.beforeNativeCirculation(model, data);
          return baseNativeCirculationCompiler
            ? baseNativeCirculationCompiler(model, data)
            : prepareNativeCirculationGeometry(model, data);
        }
      : undefined;
  // Without --landing-workers the landing stage runs the unchanged in-process
  // path. With it, pure per-pair results are checkpointed (resumable) and, for
  // N>1, evaluated in worker threads; the ordered replay is identical.
  const nativeLandingApproaches = landingWorkers
    ? async (
        model: Parameters<typeof attachNativeCirculationResumable>[0],
        data: Parameters<typeof attachNativeCirculationResumable>[1],
        onProgress: (checked: number, total: number, edges: number) => void,
      ) => {
        const result = await attachNativeCirculationResumable(model, data, {
          checkpointDir: resolve(
            workerOptions.get("--checkpoint-dir") ??
              join(output, "native-plane-checkpoints"),
          ),
          workers: landingWorkers,
          workerHeapMiB: landingWorkerHeapMiB,
          onProgress,
          onEvent: (message) => console.log(message),
        });
        console.log(JSON.stringify({ landingApproachReceipt: result.receipt }));
        return { edges: result.edges, diagnostics: result.diagnostics };
      }
    : undefined;
  // Both importers own independent checked overlay contexts. Initialize those
  // contexts before validation can need its unchanged exact numerical fallback.
  await Promise.all([
    initializeSourceExactGeosOverlay(),
    initializeNativeExactGeosOverlay(),
  ]);
  const importCheckpointDirectory = workerOptions.get(
    "--validated-import-checkpoint-dir",
  );
  const importCheckpoint = importCheckpointDirectory
    ? await bindPrivateImportCheckpoint(importCheckpointDirectory, inputPath)
    : undefined;
  let imported: PrivateImportedData | undefined = importCheckpoint
    ? await readPrivateImportCheckpoint(importCheckpoint)
    : undefined;
  if (imported)
    console.log(
      JSON.stringify({
        stage: "private-original-import-data-reused",
        bindingSha256: importCheckpoint!.bindingSha256,
        moduleValidationAuthorityRestored: false,
      }),
    );
  else {
    console.log("Reading and validating original source package");
    const originalBytes = new Uint8Array(await readFile(inputPath));
    const original = await readProjectPackage(originalBytes);
    console.log("Reading and validating original authoring project");
    const before = await readIndoorProject(originalBytes, (progress) =>
      console.log(
        JSON.stringify({ stage: "original-authoring-import", progress }),
      ),
    );
    imported = { original, before };
    if (importCheckpoint)
      console.log(
        JSON.stringify({
          stage: "private-original-import-data-saved",
          ...(await writePrivateImportCheckpoint(importCheckpoint, imported)),
        }),
      );
  }
  const { original, before } = imported;
  console.log("Reading exact-model native conversion cache");
  let nativeCacheText: string | undefined = await readFile(cachePath, "utf8");
  const nativeCacheSha256 = createHash("sha256")
    .update(nativeCacheText)
    .digest("hex");
  let cache:
    | {
        sourceModelSha256: string;
        nativeModel: ConvertResult;
      }
    | undefined = JSON.parse(nativeCacheText);
  nativeCacheText = undefined;
  assert.ok(cache, "Decoded native cache is required");
  assert.equal(
    cache.sourceModelSha256,
    original.manifest.model.sha256,
    "Decoded cache belongs to a different Revit model",
  );
  const sourceModelSha256 = cache.sourceModelSha256;
  assert.deepEqual(
    before.rooms,
    original.rooms,
    "Source and authoring importers must agree on the complete hydrated reviews",
  );
  const drawingReviewPath = workerOptions.get("--drawing-reference-review");
  const sourceReview = drawingReviewPath
    ? JSON.parse(await readFile(resolve(drawingReviewPath), "utf8"))
    : undefined;
  const drawingReviewedRooms = sourceReview
    ? roomsWithDrawingReferenceReview(
        before.rooms,
        sourceReview,
        sourceModelSha256,
      )
    : before.rooms;
  assert.ok(
    original.indoor,
    "Regeneration requires the original prepared source context",
  );
  const drawingFloorReplay = refreshDrawingFloors
    ? await roomsWithCurrentDrawingFloorBindings(
        cache.nativeModel,
        drawingReviewedRooms,
        sourceModelSha256,
        original.indoor,
      )
    : undefined;
  const floorReviewedRooms = drawingFloorReplay?.rooms ?? drawingReviewedRooms;
  if (drawingFloorReplay) {
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, "drawing-floor-bindings-replay.json"),
      JSON.stringify(drawingFloorReplay.receipt, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        stage: "drawing-floor-bindings-rechecked",
        changedRows: drawingFloorReplay.receipt.changedRows.length,
        status: drawingFloorReplay.receipt.status,
      }),
    );
  }
  const boundaryReviewPath = workerOptions.get("--boundary-contact-review");
  const boundaryReviewBytes = boundaryReviewPath
    ? await readFile(resolve(boundaryReviewPath))
    : undefined;
  const boundaryReview = boundaryReviewBytes
    ? JSON.parse(boundaryReviewBytes.toString("utf8"))
    : undefined;
  const boundaryReviewIsBundle =
    boundaryReview?.format === "source-native-boundary-review-bundle-v1";
  const boundaryReviewAlgorithmPath = fileURLToPath(
    new URL(
      boundaryReviewIsBundle
        ? "./source-native-boundary-review-bundle.ts"
        : "./source-native-boundary-member-review.ts",
      import.meta.url,
    ),
  );
  const boundaryReviewAlgorithmSha256 = boundaryReviewBytes
    ? createHash("sha256")
        .update(await readFile(boundaryReviewAlgorithmPath))
        .digest("hex")
    : undefined;
  const boundaryReplay = boundaryReviewBytes
    ? boundaryReviewIsBundle
      ? await roomsWithCheckedNativeBoundaryReviewBundle(
          floorReviewedRooms,
          original.indoor,
          cache.nativeModel,
          {
            sourceRoomsSha256: original.manifest.floors.sha256,
            nativeCacheSha256,
            review: boundaryReview,
          },
        )
      : await roomsWithCheckedNativeBoundaryMemberReview(
          floorReviewedRooms,
          original.indoor,
          cache.nativeModel,
          {
            sourceRoomsSha256: original.manifest.floors.sha256,
            nativeCacheSha256,
            review: boundaryReview,
          },
        )
    : undefined;
  const boundaryReviewedRooms = boundaryReplay?.rooms ?? floorReviewedRooms;
  const boundaryReceiptPath = join(
    output,
    "native-boundary-member-review-replay.json",
  );
  const boundaryReceiptBytes = boundaryReplay
    ? JSON.stringify(boundaryReplay.receipt, null, 2) + "\n"
    : undefined;
  if (boundaryReceiptBytes) {
    await mkdir(output, { recursive: true });
    await writeFile(boundaryReceiptPath, boundaryReceiptBytes, { flag: "wx" });
    console.log(
      JSON.stringify({
        stage: "native-boundary-member-review-rechecked",
        receiptSha256: createHash("sha256")
          .update(boundaryReceiptBytes)
          .digest("hex"),
      }),
    );
  }
  const doorBoundaryReviewPath = workerOptions.get(
    "--door-boundary-closure-review",
  );
  const doorBoundaryReviewBytes = doorBoundaryReviewPath
    ? await readFile(resolve(doorBoundaryReviewPath))
    : undefined;
  const doorBoundaryReviewAlgorithmPath = fileURLToPath(
    new URL("source-door-boundary-closure-review.ts", import.meta.url),
  );
  const doorBoundaryReviewAlgorithmSha256 = doorBoundaryReviewBytes
    ? createHash("sha256")
        .update(await readFile(doorBoundaryReviewAlgorithmPath))
        .digest("hex")
    : undefined;
  const doorBoundaryReplay = doorBoundaryReviewBytes
    ? await roomsWithCheckedSourceDoorBoundaryClosureReview(
        boundaryReviewedRooms,
        original.indoor,
        cache.nativeModel,
        {
          sourceRoomsSha256: original.manifest.floors.sha256,
          nativeCacheSha256,
          review: JSON.parse(doorBoundaryReviewBytes.toString("utf8")),
        },
      )
    : undefined;
  const rooms = doorBoundaryReplay?.rooms ?? boundaryReviewedRooms;
  const doorBoundaryReceiptPath = join(
    output,
    "source-door-boundary-closure-replay.json",
  );
  const doorBoundaryPortableReviewPath = join(
    output,
    "source-door-boundary-closure-review.json",
  );
  const doorBoundaryReceiptBytes = doorBoundaryReplay
    ? JSON.stringify(doorBoundaryReplay.receipt, null, 2) + "\n"
    : undefined;
  if (doorBoundaryReceiptBytes) {
    await mkdir(output, { recursive: true });
    await writeFile(doorBoundaryReceiptPath, doorBoundaryReceiptBytes, {
      flag: "wx",
    });
    await writeFile(doorBoundaryPortableReviewPath, doorBoundaryReviewBytes!, {
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        stage: "source-door-boundary-closures-rechecked",
        receiptSha256: createHash("sha256")
          .update(doorBoundaryReceiptBytes)
          .digest("hex"),
      }),
    );
  }
  const sourceRooms = JSON.stringify(rooms);
  if (sourceFlatLandingReview) {
    const originalModelBytes = before.files[original.manifest.model.path];
    assert.ok(
      originalModelBytes,
      "Original source model bytes are required for flat landing review",
    );
    sourceFlatLandingDriver = createSourceReviewedFlatLandingDriver({
      originalModelBytes,
      expectedSourceModelSha256: sourceModelSha256,
      nativeModel: cache.nativeModel,
      rooms,
    });
    console.log(
      JSON.stringify({
        stage: "source-flat-landing-driver-initialized",
        receipt: sourceFlatLandingDriver.initializationReceipt,
      }),
    );
  }
  const sourceSteppedReviewPath = workerOptions.get(
    "--source-stepped-stair-review",
  );
  const sourceSteppedReviewBytes = sourceSteppedReviewPath
    ? await readFile(resolve(sourceSteppedReviewPath))
    : undefined;
  const sourceSteppedAlgorithms = sourceSteppedReviewBytes
    ? await Promise.all(
        [
          "./source-stepped-stair-v2-review.ts",
          "./source-stepped-stair-v2-producer.ts",
          "./finalize-source-stepped-stair-v2.ts",
        ].map(async (entry) => {
          const path = fileURLToPath(new URL(entry, import.meta.url));
          return {
            path,
            sha256: createHash("sha256")
              .update(await readFile(path))
              .digest("hex"),
          };
        }),
      )
    : undefined;
  if (sourceSteppedReviewBytes)
    assert.ok(
      original.manifest.indoor,
      "Original prepared graph bytes are required for source stair review",
    );
  const sourceSteppedProofs = sourceSteppedReviewBytes
    ? initializeReviewedSourceSteppedStairV2Proofs({
        originalRVTBytes: before.files[original.manifest.model.path]!,
        originalDatasetBytes: before.files[original.manifest.indoor!.path]!,
        originalSourceRoomsBytes: before.files[original.manifest.floors.path]!,
        sourceModelSha256,
        sourceRoomsSha256: original.manifest.floors.sha256,
        nativeCacheSha256,
        reviewedDrawingReferences: rooms.reviewedDrawingReferences,
        review: JSON.parse(sourceSteppedReviewBytes.toString("utf8")),
        log: (message) => console.log(JSON.stringify(message)),
      })
    : undefined;
  if (sourceSteppedProofs)
    console.log(
      JSON.stringify({
        stage: "source-stepped-stair-proof-initialized",
        receipt: sourceSteppedProofs.receipt,
      }),
    );
  const sourceDoorStandingReviewPath = workerOptions.get(
    "--source-door-standing-review",
  );
  const sourceDoorStandingReviewBytes = sourceDoorStandingReviewPath
    ? await readFile(resolve(sourceDoorStandingReviewPath))
    : undefined;
  const sourceDoorStandings = sourceDoorStandingReviewBytes
    ? initializeOriginalDoorStandingReview({
        originalRVTBytes: before.files[original.manifest.model.path]!,
        originalDatasetBytes: before.files[original.manifest.indoor!.path]!,
        sourceModelSha256,
        originalDatasetSha256: original.manifest.indoor!.sha256,
        reviewBytes: sourceDoorStandingReviewBytes,
      })
    : undefined;
  const sourceStairBaseStandingReviewPath = workerOptions.get(
    "--source-stair-base-standing-review",
  );
  const sourceStairBaseStandingReviewBytes = sourceStairBaseStandingReviewPath
    ? await readFile(resolve(sourceStairBaseStandingReviewPath))
    : undefined;
  const sourceStairBaseDrawingReviewInput =
    sourceStairBaseStandingReviewBytes && drawingReviewPath
      ? await readFile(resolve(drawingReviewPath))
      : undefined;
  const sourceStairBaseDrawingReviewFileSha256 =
    sourceStairBaseDrawingReviewInput
      ? createHash("sha256")
          .update(sourceStairBaseDrawingReviewInput)
          .digest("hex")
      : undefined;
  const sourceStairBaseStandings = sourceStairBaseStandingReviewBytes
    ? initializeOriginalStairBaseStandingReview({
        originalRVTBytes: before.files[original.manifest.model.path]!,
        originalDatasetBytes: before.files[original.manifest.indoor!.path]!,
        originalSourceRoomsBytes: before.files[original.manifest.floors.path]!,
        sourceModelSha256,
        originalDatasetSha256: original.manifest.indoor!.sha256,
        originalSourceRoomsSha256: original.manifest.floors.sha256,
        reviewedDrawingReferences: rooms.reviewedDrawingReferences,
        reviewBytes: sourceStairBaseStandingReviewBytes,
        log: (progress) =>
          console.log(
            JSON.stringify({
              stage: "source-stair-base-standing-reconstruction",
              progress,
            }),
          ),
      })
    : undefined;
  async function assertSourceStairBaseStandingUnchanged() {
    if (!sourceStairBaseStandings) return;
    sourceStairBaseStandings.assertUnchanged();
    if (sourceStairBaseDrawingReviewInput) {
      assert.equal(
        createHash("sha256")
          .update(
            JSON.stringify(
              JSON.parse(sourceStairBaseDrawingReviewInput.toString("utf8")),
            ),
          )
          .digest("hex"),
        sourceStairBaseStandings.receipt
          .reviewedDrawingReferencesCanonicalJsonSha256,
        "Source stair-base drawing input differs from the checked review",
      );
      assert.equal(
        await fileDigest(resolve(drawingReviewPath!)),
        sourceStairBaseDrawingReviewFileSha256,
        "Source stair-base drawing review file changed during regeneration",
      );
    }
    assert.equal(
      await fileDigest(inputPath),
      inputArchiveSha256,
      "Original stair-base source archive changed during regeneration",
    );
    assert.equal(
      await fileDigest(resolve(sourceStairBaseStandingReviewPath!)),
      createHash("sha256")
        .update(sourceStairBaseStandingReviewBytes!)
        .digest("hex"),
      "Original stair-base locator review changed during regeneration",
    );
  }
  await assertSourceStairBaseStandingUnchanged();
  let dataset = await prepareIndoorDataset(
    cache.nativeModel,
    rooms,
    cache.sourceModelSha256,
    (message) => {
      if (!message.includes("region") || /region (?:[0-9]*00)\//.test(message))
        console.log(message);
    },
    {
      physicalDoorSource: original.indoor,
      originalDoorDerivedStandings: sourceDoorStandings?.proofs,
      originalStairBaseDerivedStandings: sourceStairBaseStandings?.proofs,
      nativeCirculationCompiler,
      nativeLandingApproaches,
    },
  );
  sourceDoorStandings?.assertUnchanged();
  await assertSourceStairBaseStandingUnchanged();
  if (sourceStairBaseStandings) {
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, "source-stair-base-standing-replay.json"),
      JSON.stringify(sourceStairBaseStandings.receipt, null, 2) + "\n",
      { flag: "wx" },
    );
    await writeFile(
      join(output, "source-stair-base-standing-review.json"),
      sourceStairBaseStandingReviewBytes!,
      { flag: "wx" },
    );
  }
  if (sourceDoorStandings) {
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, "source-door-standing-replay.json"),
      JSON.stringify(sourceDoorStandings.receipt, null, 2) + "\n",
      { flag: "wx" },
    );
    await writeFile(
      join(output, "source-door-standing-review.json"),
      sourceDoorStandingReviewBytes!,
      { flag: "wx" },
    );
  }
  if (preparedDiagnosticDirectory) {
    assert.equal(
      await fileDigest(inputPath),
      inputArchiveSha256,
      "Original archive changed during preparation",
    );
    assert.equal(
      await fileDigest(cachePath),
      nativeCacheSha256,
      "Native cache changed during preparation",
    );
    const bytes = serialize(dataset),
      sha256 = createHash("sha256").update(bytes).digest("hex");
    const directory = resolve(preparedDiagnosticDirectory);
    await writeFile(
      join(directory, "prepared-before-stair-finalization.bin"),
      bytes,
      { flag: "wx" },
    );
    await writeFile(
      join(directory, "prepared-before-stair-finalization.json"),
      JSON.stringify(
        {
          format: "unbc-prepared-mathematical-diagnostic-v1",
          createdAt: new Date().toISOString(),
          bytes: bytes.length,
          sha256,
          node: process.version,
          inputArchiveSha256,
          nativeCacheSha256,
          sourceModelSha256,
          sourceRoomsSha256: dataset.source.roomsSha256,
          phase:
            "native-planes-and-landings-computed-before-stair-finalization-and-preservation-gates",
          validatedImportAuthorityRestored: false,
          physicalOrRoutingApprovalGranted: false,
          acceptedMasterProduced: false,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        stage: "prepared-mathematical-diagnostic-saved",
        directory,
        bytes: bytes.length,
        sha256,
        validationAuthorityRestored: false,
      }),
    );
  }
  const sourceSteppedApplications = [];
  for (const proof of sourceSteppedProofs?.proofs ?? []) {
    const result = await finalizeSourceSteppedStairV2Dataset(dataset, proof, {
      sourceRooms: rooms,
    });
    dataset = result.dataset;
    sourceSteppedApplications.push(result.receipt);
  }
  const sourceSteppedReceiptPath = join(
    output,
    "source-stepped-stair-v2-replay.json",
  );
  const sourceSteppedReviewArtifactPath = join(
    output,
    "source-stepped-stair-v2-review.json",
  );
  const sourceSteppedReceiptBytes = sourceSteppedProofs
    ? JSON.stringify(
        {
          initialization: sourceSteppedProofs.receipt,
          applications: sourceSteppedApplications,
        },
        null,
        2,
      ) + "\n"
    : undefined;
  if (sourceSteppedReceiptBytes) {
    await mkdir(output, { recursive: true });
    await writeFile(sourceSteppedReceiptPath, sourceSteppedReceiptBytes, {
      flag: "wx",
    });
    await writeFile(
      sourceSteppedReviewArtifactPath,
      sourceSteppedReviewBytes!,
      {
        flag: "wx",
      },
    );
    console.log(
      JSON.stringify({
        stage: "source-stepped-stair-finalization-replayed",
        receiptSha256: createHash("sha256")
          .update(sourceSteppedReceiptBytes)
          .digest("hex"),
      }),
    );
  }
  const sourceFlatLandingEvidence = sourceFlatLandingDriver
    ? {
        initialization: sourceFlatLandingDriver.initializationReceipt,
        applications: sourceFlatLandingDriver.receipts(),
      }
    : undefined;
  sourceFlatLandingDriver = undefined;
  const cacheHashAfterCompilation = createHash("sha256");
  for await (const chunk of createReadStream(cachePath))
    cacheHashAfterCompilation.update(chunk);
  assert.equal(
    cacheHashAfterCompilation.digest("hex"),
    nativeCacheSha256,
    "Native conversion cache changed during compilation",
  );
  if (boundaryReplay)
    assert.equal(
      createHash("sha256")
        .update(await readFile(boundaryReviewAlgorithmPath))
        .digest("hex"),
      boundaryReviewAlgorithmSha256,
      "Checked boundary source-review helper changed during compilation",
    );
  if (doorBoundaryReplay)
    assert.equal(
      createHash("sha256")
        .update(await readFile(doorBoundaryReviewAlgorithmPath))
        .digest("hex"),
      doorBoundaryReviewAlgorithmSha256,
      "Checked door-boundary source-review helper changed during compilation",
    );
  for (const algorithm of sourceSteppedAlgorithms ?? [])
    assert.equal(
      createHash("sha256")
        .update(await readFile(algorithm.path))
        .digest("hex"),
      algorithm.sha256,
      "Original-source stepped stair algorithm changed during compilation",
    );
  if (sourceFlatLandingEvidence) {
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, "source-flat-landing-replay.json"),
      JSON.stringify(sourceFlatLandingEvidence, null, 2) + "\n",
      { flag: "wx" },
    );
  }
  // The compiler hashes hydrated annotations. A portable package binds the exact
  // preserved source entry, whose review companions may use archive wire storage.
  dataset.source.roomsSha256 =
    sourceReview || drawingFloorReplay || boundaryReplay || doorBoundaryReplay
      ? createHash("sha256")
          .update((await serializeRoomsForArchive(rooms)).rooms)
          .digest("hex")
      : original.manifest.floors.sha256;
  cache = undefined; // Release the decoded native model before archive workers clone buffers.
  if (globalThis.gc) globalThis.gc();
  assert.equal(
    JSON.stringify(rooms),
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
  // A previously declared arrival may already have no physically admitted exit.
  // Only a nonempty original incident set consisting entirely of independently
  // refused native walks can justify withholding it; doors/connectors, missing
  // owners and any valid/unknown approach retain the normal strict loss guard.
  const nonRestrictedLosses = missing.filter((r) => !restricted.includes(r));
  const incidentIds = new Set(nonRestrictedLosses.map((r) => r.arrivalNodeId));
  const originalIncidentEdges = before.dataset.edges.filter(
    (e) => e.enabled && (incidentIds.has(e.from) || incidentIds.has(e.to)),
  );
  const originalPhysicalBlockers =
    nonRestrictedLosses.length > 0
      ? nativeCirculationWalkBlockers(before.dataset, originalIncidentEdges)
      : new Set<string>();
  const unsupportedPriorArrivals = nonRestrictedLosses
    .map((r) =>
      originalBlockedArrivalEvidence(
        before.dataset,
        r.key,
        originalPhysicalBlockers,
      ),
    )
    .filter((evidence) => evidence.allOriginalApproachesPhysicallyRefused);
  assert.deepEqual(
    nonRestrictedLosses
      .filter((r) => !unsupportedPriorArrivals.some((e) => e.roomKey === r.key))
      .map((r) => r.key),
    [],
    "Existing physically admitted arrival connections must survive regeneration",
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
  const rebuilt = { ...before, rooms, dataset };
  console.time("Export master");
  const masterBytes = await exportIndoorProject(rebuilt);
  console.timeEnd("Export master");
  const assets = Object.keys(before.files).filter(
    (path) =>
      !path.startsWith("viewer/") &&
      path !== "manifest.json" &&
      !(
        (sourceReview ||
          drawingFloorReplay ||
          boundaryReplay ||
          doorBoundaryReplay) &&
        path === "floors/rooms.json"
      ),
  );
  const sourceAssetHashes = assets.map((path) => ({
    path,
    sha256: sha(before.files[path]),
  }));
  const summaryFacts = {
    ...(sourceStairBaseStandings
      ? {
          sourceStairBaseStandingReview: {
            path: resolve(sourceStairBaseStandingReviewPath!),
            reviewSha256: sha(sourceStairBaseStandingReviewBytes!),
            portableReviewPath: join(
              output,
              "source-stair-base-standing-review.json",
            ),
            receiptPath: join(output, "source-stair-base-standing-replay.json"),
            sourceConsumerBinding:
              sourceStairBaseStandings.receipt.sourceConsumerBinding,
            originalSourceRoomsSha256: original.manifest.floors.sha256,
            reviewedDrawingReferencesCanonicalJsonSha256:
              sourceStairBaseStandings.receipt
                .reviewedDrawingReferencesCanonicalJsonSha256,
            drawingReferenceInput: sourceStairBaseDrawingReviewFileSha256
              ? {
                  path: resolve(drawingReviewPath!),
                  sha256: sourceStairBaseDrawingReviewFileSha256,
                }
              : undefined,
            physicalGuardsWaived: false,
            originalNodesMoved: false,
            cellOwnersChanged: false,
            publicAccessApproved: false,
          },
        }
      : {}),
    ...(sourceDoorStandings
      ? {
          sourceDoorStandingReview: {
            path: resolve(sourceDoorStandingReviewPath!),
            reviewSha256: sha(sourceDoorStandingReviewBytes!),
            portableReviewPath: join(
              output,
              "source-door-standing-review.json",
            ),
            receiptPath: join(output, "source-door-standing-replay.json"),
            sourceConsumerBinding:
              sourceDoorStandings.receipt.sourceConsumerBinding,
            physicalGuardsWaived: false,
            originalNodesMoved: false,
            publicAccessApproved: false,
          },
        }
      : {}),
    input: inputPath,
    nativeCache: cachePath,
    nativeCacheSha256,
    sourceModelSha256,
    ...(sourceFlatLandingEvidence ? { sourceFlatLandingEvidence } : {}),
    ...(sourceReview
      ? {
          drawingReferenceReview: {
            path: resolve(drawingReviewPath!),
            geometrySha256: sourceReview.geometrySha256,
            originalRoomsSha256: original.manifest.floors.sha256,
            regeneratedRoomsSha256: dataset.source.roomsSha256,
            onlyDrawingReferenceReviewChanged:
              !drawingFloorReplay?.receipt.changedRows.length &&
              !boundaryReplay &&
              !doorBoundaryReplay,
          },
        }
      : {}),
    ...(drawingFloorReplay
      ? {
          drawingFloorBindingReview: {
            algorithm: drawingFloorReplay.receipt.algorithm,
            status: drawingFloorReplay.receipt.status,
            changedRowIds: drawingFloorReplay.receipt.changedRows.map(
              (r) => r.id,
            ),
            descriptorBeforeSha256:
              drawingFloorReplay.receipt.descriptorBeforeSha256,
            descriptorAfterSha256:
              drawingFloorReplay.receipt.descriptorAfterSha256,
            receiptPath: join(output, "drawing-floor-bindings-replay.json"),
            physicalGuardsWaived: false,
          },
        }
      : {}),
    ...(boundaryReplay
      ? {
          nativeBoundaryMemberReview: {
            path: resolve(boundaryReviewPath!),
            reviewSha256: sha(boundaryReviewBytes!),
            receiptPath: boundaryReceiptPath,
            receiptSha256: createHash("sha256")
              .update(boundaryReceiptBytes!)
              .digest("hex"),
            algorithm: {
              path: boundaryReviewAlgorithmPath,
              sha256: boundaryReviewAlgorithmSha256,
            },
            physicalGuardsWaived: false,
          },
        }
      : {}),
    ...(doorBoundaryReplay
      ? {
          sourceDoorBoundaryClosureReview: {
            path: resolve(doorBoundaryReviewPath!),
            portableReviewPath: doorBoundaryPortableReviewPath,
            reviewSha256: sha(doorBoundaryReviewBytes!),
            receiptPath: doorBoundaryReceiptPath,
            receiptSha256: createHash("sha256")
              .update(doorBoundaryReceiptBytes!)
              .digest("hex"),
            algorithm: {
              path: doorBoundaryReviewAlgorithmPath,
              sha256: doorBoundaryReviewAlgorithmSha256,
            },
            physicalGuardsWaived: false,
          },
        }
      : {}),
    ...(sourceSteppedProofs
      ? {
          sourceSteppedStairV2Review: {
            path: resolve(sourceSteppedReviewPath!),
            portableReviewPath: sourceSteppedReviewArtifactPath,
            reviewSha256: sha(sourceSteppedReviewBytes!),
            receiptPath: sourceSteppedReceiptPath,
            receiptSha256: createHash("sha256")
              .update(sourceSteppedReceiptBytes!)
              .digest("hex"),
            algorithms: sourceSteppedAlgorithms,
            originalEdgeIds: sourceSteppedProofs.proofs.map(
              (proof) => proof.originalEdgeId,
            ),
            physicalGuardsWaived: false,
            sourceRoomsChanged: false,
            stepFreeApproved: false,
          },
        }
      : {}),
    sourceAssets: sourceAssetHashes,
    sourceAreas: original.rooms.annotations.filter(
      (r) => r.status !== "deleted",
    ).length,
    before: before.dataset.report,
    after: dataset.report,
    arrivals: dataset.records.filter((r) => r.arrivalNodeId).length,
    intentionallyRestrictedArrivals: restricted.map((r) => r.key),
    withheldAlreadyPhysicallyUnsupportedArrivals: unsupportedPriorArrivals,
    preparedRooms: dataset.presentation?.rooms.length ?? 0,
    ramps: dataset.rampDisplay?.ramps.length ?? 0,
    liftStops:
      dataset.connectors?.reduce((n, c) => n + c.entrances.length, 0) ?? 0,
  };
  const exportContext = {
    inputArchiveSha256,
    nativeCacheSha256,
    sourceModelSha256,
    sourceRoomsSha256: dataset.source.roomsSha256,
    compiledDatasetEntrySha256: await fileDigest(
      join(output, "compiled-dataset.json"),
    ),
    ...(original.manifest.indoor
      ? { originalIndoorEntrySha256: original.manifest.indoor.sha256 }
      : {}),
  };
  const masterArchive = await persistUnacceptedRegenerationArchive(
    exportDiagnosticRoot,
    "master",
    masterBytes,
    exportContext,
  );
  const lateChecks = createFinalRegenerationPreservationChecks({
    doorAssert: sourceDoorStandings?.assertUnchanged,
    stairBase: sourceStairBaseStandings
      ? {
          assertUnchanged: sourceStairBaseStandings.assertUnchanged,
          drawingCanonicalSha256:
            sourceStairBaseStandings.receipt
              .reviewedDrawingReferencesCanonicalJsonSha256,
          drawingInput: sourceStairBaseDrawingReviewInput,
          drawingPath: drawingReviewPath,
          drawingFileSha256: sourceStairBaseDrawingReviewFileSha256,
          inputPath,
          inputArchiveSha256,
          reviewPath: sourceStairBaseStandingReviewPath!,
          reviewBytes: sourceStairBaseStandingReviewBytes!,
        }
      : undefined,
    doorReview: sourceDoorStandingReviewBytes
      ? {
          path: sourceDoorStandingReviewPath!,
          bytes: sourceDoorStandingReviewBytes,
        }
      : undefined,
  });
  return {
    masterBytes,
    masterArchive,
    exportContext,
    expectedRooms: rooms,
    masterParitySha256: nativeRegenerationDatasetSha256(dataset),
    visitorParitySha256: nativeRegenerationVisitorExpectedSha256(
      dataset,
      rooms.mapEdits?.floorNames,
    ),
    requiresMapping:
      dataset.walkingSupport?.sourceModelSha256 ===
        dataset.source.modelSha256 && dataset.walkingSupport.floors.length > 0,
    sourceAssetHashes,
    expectedDrawingReview: sourceReview
      ? structuredClone(sourceReview)
      : undefined,
    priorDrawingReview: sourceReview
      ? structuredClone(before.rooms.reviewedDrawingReferences)
      : undefined,
    summaryFacts: structuredClone(summaryFacts),
    lateChecks,
  };
}

async function validateMasterAndExportViewer(
  phase: Awaited<ReturnType<typeof compileAndExportMaster>>,
) {
  assert.equal(phase.masterBytes.length, phase.masterArchive.bytes);
  assert.equal(
    sha(phase.masterBytes),
    phase.masterArchive.sha256,
    "Unaccepted master bytes changed before normal import",
  );
  console.time("Read master");
  const master = await readIndoorProject(phase.masterBytes, (progress) =>
    console.log(JSON.stringify({ stage: "rebuilt-master-import", progress })),
  );
  console.timeEnd("Read master");
  for (const { path, sha256: expectedSha256 } of phase.sourceAssetHashes)
    assert.equal(
      sha(master.files[path]),
      expectedSha256,
      `Source asset changed: ${path}`,
    );
  assert.deepEqual(master.rooms, phase.expectedRooms);
  if (phase.expectedDrawingReview) {
    const prior = phase.priorDrawingReview;
    const { reviewedDrawingReferences: expectedReview, ...expectedSource } =
      phase.expectedRooms;
    const { reviewedDrawingReferences: applied, ...regeneratedSource } =
      master.rooms;
    assert.deepEqual(
      regeneratedSource,
      expectedSource,
      "Master source must preserve the independently checked source metadata changes",
    );
    assert.deepEqual(applied, phase.expectedDrawingReview);
    assert.deepEqual(applied, expectedReview);
    if (prior) assert.deepEqual(prior, applied);
  }
  // Export publishes a checked native map cache on a cloned dataset. This is
  // derived display/selection data; every compiler geometry and graph field
  // must remain identical after removing that independently validated cache.
  await validatePublishedNativeExploreMapping(master.dataset);
  if (phase.requiresMapping)
    assert.ok(
      master.dataset.nativeExploreMapping,
      "Master native floor mapping is required for a native-supported rebuild",
    );
  assert.equal(
    nativeRegenerationDatasetSha256(master.dataset),
    phase.masterParitySha256,
    "Portable master geometry and graph must match compiler JSON",
  );
  console.time("Export viewer");
  const viewerBytes = await exportCampusViewer(master);
  console.timeEnd("Export viewer");
  const viewerArchive = await persistUnacceptedRegenerationArchive(
    exportDiagnosticRoot,
    "viewer",
    viewerBytes,
    {
      ...phase.exportContext,
      masterIndoorEntrySha256: master.manifest.indoor.sha256,
    },
  );
  assert.equal(phase.masterBytes.length, phase.masterArchive.bytes);
  assert.equal(
    sha(phase.masterBytes),
    phase.masterArchive.sha256,
    "Master export bytes changed during normal import or viewer export",
  );
  return {
    viewerBytes,
    viewerArchive,
    masterFacts: {
      bytes: phase.masterBytes.length,
      sha256: sha(phase.masterBytes),
    },
    masterRoomsSha256: master.manifest.floors.sha256,
  };
}

async function validateViewerAndFinalPreservation(
  viewerBytes: Uint8Array,
  expectedParitySha256: string,
  requiresMapping: boolean,
  lateChecks: () => Promise<void>,
) {
  const viewer = await readIndoorProject(viewerBytes, (progress) =>
    console.log(JSON.stringify({ stage: "rebuilt-visitor-import", progress })),
  );
  // Native mapping is derived flat selection/display data, not a graph mutation.
  // Check its source/current geometry and output binding independently, then
  // retain strict byte-equivalent dataset parity for every remaining field.
  await validatePublishedNativeExploreMapping(viewer.dataset);
  if (requiresMapping)
    assert.ok(
      viewer.dataset.nativeExploreMapping,
      "Visitor native floor mapping is required for a native-supported master",
    );
  assert.equal(
    nativeRegenerationDatasetSha256(viewer.dataset),
    expectedParitySha256,
    "2D/3D viewer geometry and routing must match the master",
  );
  assert.ok(
    !Object.keys(viewer.files).some((path) => path.startsWith("model/")),
    "Viewer excludes native model and scene assets",
  );
  await lateChecks();
}

// Only these narrow data handoffs cross heavy phases. The first handoff is
// explicitly dropped before viewer import; bare late callbacks do not retain
// complete Standing/proof objects or the compilation lexical environment.
let compilation:
  | Awaited<ReturnType<typeof compileAndExportMaster>>
  | undefined = await compileAndExportMaster();
const summaryFacts = compilation.summaryFacts;
const masterArchive = compilation.masterArchive;
const visitorParitySha256 = compilation.visitorParitySha256;
const requiresMapping = compilation.requiresMapping;
const lateChecks = compilation.lateChecks;
if (globalThis.gc) globalThis.gc();
const exported = await validateMasterAndExportViewer(compilation);
compilation = undefined;
if (globalThis.gc) globalThis.gc();
assert.equal(exported.viewerBytes.length, exported.viewerArchive.bytes);
assert.equal(
  sha(exported.viewerBytes),
  exported.viewerArchive.sha256,
  "Unaccepted viewer bytes changed before normal import",
);
await validateViewerAndFinalPreservation(
  exported.viewerBytes,
  visitorParitySha256,
  requiresMapping,
  lateChecks,
);
assert.equal(
  sha(exported.viewerBytes),
  exported.viewerArchive.sha256,
  "Validated viewer bytes differ from saved candidate",
);
if (summaryFacts.drawingReferenceReview)
  summaryFacts.drawingReferenceReview.regeneratedRoomsSha256 =
    exported.masterRoomsSha256;
const summary = {
  ...summaryFacts,
  master: exported.masterFacts,
  viewer: {
    bytes: exported.viewerBytes.length,
    sha256: sha(exported.viewerBytes),
  },
  losslessSourceAssets: true,
  masterViewerDataIdentical: true,
};
await copyCheckedRegenerationArchive(
  masterArchive,
  join(output, "UNBC.master.reviter.zip"),
);
await copyCheckedRegenerationArchive(
  exported.viewerArchive,
  join(output, "UNBC.campus-viewer.zip"),
);
await writeFile(
  join(output, "regeneration.json"),
  JSON.stringify(summary, null, 2) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify({ output, ...summary }, null, 2));
