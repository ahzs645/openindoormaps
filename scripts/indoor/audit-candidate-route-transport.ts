/** Actual RouteWorkerClient + unmodified production worker under a bounded V8
 * isolate. Only the generated publisher receipt is replaced in an isolated
 * candidate bundle, and only after fresh original candidate QA has passed. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { unzipSync, gunzipSync } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  RouteWorkerClient,
  type RouteWorker,
} from "../../app/indoor-project/route-worker-client";
import type {
  RouteRequest,
  RouteResponse,
} from "../../app/indoor-project/route-calculation";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import {
  createPublishedRouteCalculator,
  decodePublishedRouteCells,
  type PublishedRouteCellReceipt,
} from "../../app/indoor-project/published-route-cells";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import {
  decodePreparedDisplayAsset,
  preparedDisplayDatasetSha256,
  type PreparedDisplayAssetBinding,
  type PreparedDisplayAssetDescriptor,
  type PreparedDisplayPayload,
} from "../../app/indoor-project/prepared-display-assets";
import { checkRouteResult, type RouteCase } from "./pathway-candidate-audit";
import { buildCandidateProductionRouteBundle } from "./candidate-route-worker-bundle";
import { requireOneSupportedDisplayScope } from "./selected-display-scope";

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
  "node --expose-gc --import tsx scripts/indoor/audit-candidate-route-transport.ts --candidate NEW-VISITOR.zip --qa-report PASSED-FRESH-QA.json --out NEW-EMPTY-DIRECTORY [--timeout-ms 300000] [--resident-descriptor FLOOR.json --resident-binding EXPECTED-BINDING.json --resident-chunks DIRECTORY]";
if (args.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
// Node's process-wide heap flag overrides Worker.resourceLimits even when
// execArgv:[] and resourceLimits report the requested smaller value. Refuse it;
// the measured in-worker heap limit is checked independently on every reply.
if (
  process.execArgv.some((arg) =>
    /^--max[-_]old[-_]space[-_]size(?:=|$)/.test(arg),
  ) ||
  /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s)/.test(
    process.env.NODE_OPTIONS ?? "",
  )
)
  throw Error(
    "Run transport QA without a process-wide --max-old-space-size flag or NODE_OPTIONS equivalent; it overrides the worker heap cap",
  );
const candidatePath = required("--candidate"),
  qaPath = required("--qa-report"),
  out = required("--out"),
  root = fileURLToPath(new URL("../../", import.meta.url));
const timeoutMs = Number(option("--timeout-ms") ?? 300000);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000)
  throw Error("Invalid route timeout");
await fs.mkdir(out, { recursive: true });
if ((await fs.readdir(out)).length)
  throw Error("Choose a new empty transport audit directory");
const digest = (bytes: Uint8Array | string) =>
    createHash("sha256").update(bytes).digest("hex"),
  jsonDigest = (value: unknown) => digest(JSON.stringify(value));
const qaBytes = new Uint8Array(await fs.readFile(qaPath)),
  qa = JSON.parse(new TextDecoder().decode(qaBytes));
assert.equal(
  qa.passed,
  true,
  "Transport tests require a passed fresh original candidate audit",
);
assert.equal(qa.sourceDatasetUnchanged, true);
assert.equal(
  qa.freshRoutingCache?.freshOriginalCalculation,
  true,
  "No historical published cache is accepted",
);
assert.equal(qa.freshRoutingCache?.compiledTrustRootChanged, false);
assert.equal(
  preparedDisplayEngineBinding(root).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
  "Generated engine binding is stale",
);
let candidateBytes: Uint8Array | undefined = new Uint8Array(
  await fs.readFile(candidatePath),
);
assert.equal(
  digest(candidateBytes),
  qa.candidatePackageSha256,
  "Candidate differs from fresh original QA",
);
const manifestBytes = unzipSync(candidateBytes, {
  filter: (entry) => entry.name === "manifest.json",
})["manifest.json"];
const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
assert.equal(manifest.format, "openindoormaps-viewer");
const indoorBytes = unzipSync(candidateBytes, {
  filter: (entry) => entry.name === manifest.indoor.path,
})[manifest.indoor.path];
assert.equal(indoorBytes.length, manifest.indoor.bytes);
assert.equal(digest(indoorBytes), manifest.indoor.sha256);
const fullData = JSON.parse(
    new TextDecoder().decode(indoorBytes),
  ) as IndoorDataset,
  data = routeWorkerDataset(fullData);
candidateBytes = undefined;
assert.equal(jsonDigest(data), qa.candidateRoutingProjectionSha256);
const receipt = qa.freshRoutingCache.receipt as PublishedRouteCellReceipt,
  cachePath = path.resolve(qa.freshRoutingCache.cachePath),
  cache = new Uint8Array(await fs.readFile(cachePath));
assert.equal(receipt.datasetSha256, qa.candidateRoutingProjectionSha256);
assert.equal(receipt.engineSha256, PREPARED_DISPLAY_ENGINE_SHA256);
assert.deepEqual(receipt.source, data.source);
assert.equal(cache.length, receipt.compressedBytes);
assert.equal(digest(cache), receipt.compressedSha256);
const expanded = gunzipSync(cache);
assert.equal(expanded.length, receipt.logicalBytes);
assert.equal(digest(expanded), receipt.logicalSha256);
const entries = decodePublishedRouteCells(data, receipt, cache),
  run = createImmutableRoutingSession(data);
// Prime only this fresh cache in an independent parent session. All admission
// results were freshly computed by the prerequisite original audit.
run(() => createPublishedRouteCalculator(data, entries));
const casesBytes = new Uint8Array(
    await fs.readFile(
      path.join(path.dirname(qaPath), "actual-route-cases.json"),
    ),
  ),
  resultBytes = new Uint8Array(
    await fs.readFile(
      path.join(path.dirname(qaPath), "actual-route-results.json"),
    ),
  );
assert.equal(
  digest(casesBytes),
  qa.actualRouteCasesFileSha256,
  "Original route cases changed after fresh QA",
);
assert.equal(
  digest(resultBytes),
  qa.actualRouteResultsFileSha256,
  "Original route results changed after fresh QA",
);
const casesDocument = JSON.parse(new TextDecoder().decode(casesBytes)) as {
    cases: RouteCase[];
  },
  originalResults = JSON.parse(new TextDecoder().decode(resultBytes)) as Array<
    RouteCase & { available: boolean; errors: string[] }
  >;
assert.equal(casesDocument.cases.length, qa.actualRouteCalculations);
assert.equal(originalResults.length, casesDocument.cases.length);
for (let i = 0; i < casesDocument.cases.length; i++) {
  const test = casesDocument.cases[i],
    old = originalResults[i];
  assert.equal(
    JSON.stringify([
      test.name,
      test.start,
      test.end,
      test.mode,
      test.intendedEdgeId,
    ]),
    JSON.stringify([
      old.name,
      old.start,
      old.end,
      old.mode,
      old.intendedEdgeId,
    ]),
  );
  assert.deepEqual(old.errors, []);
}
let residentFloor: PreparedDisplayPayload | undefined, residentProof: unknown;
if (
  option("--resident-descriptor") ||
  option("--resident-binding") ||
  option("--resident-chunks")
) {
  const descriptorPath = required("--resident-descriptor"),
    bindingPath = required("--resident-binding"),
    chunkRoot = required("--resident-chunks");
  const descriptorBytes = new Uint8Array(await fs.readFile(descriptorPath)),
    bindingBytes = new Uint8Array(await fs.readFile(bindingPath)),
    descriptor = JSON.parse(
      new TextDecoder().decode(descriptorBytes),
    ) as PreparedDisplayAssetDescriptor,
    binding = JSON.parse(
      new TextDecoder().decode(bindingBytes),
    ) as PreparedDisplayAssetBinding;
  assert.equal(
    binding.datasetSha256,
    preparedDisplayDatasetSha256(fullData),
    "Resident floor must bind the actual fresh full viewer dataset",
  );
  assert.equal(binding.enginePreparationSha256, PREPARED_DISPLAY_ENGINE_SHA256);
  requireOneSupportedDisplayScope(fullData, binding.levelIds);
  assert(data.records.some((record) => binding.levelIds.includes(record.levelId)));
  const prepared = qa.selectedDisplayPreparation;
  assert(prepared, "Resident scope must come from the passed original candidate QA's selected-scope preparation");
  assert.equal(prepared.scopesPrepared, 1);
  assert.equal(prepared.exactOriginalDecoderReplayPassed, true);
  assert.equal(prepared.sourceDatasetUnchanged, true);
  assert.equal(prepared.datasetSha256, binding.datasetSha256);
  assert.equal(prepared.enginePreparationSha256, binding.enginePreparationSha256);
  assert.deepEqual(prepared.levelIds, binding.levelIds);
  assert.equal(prepared.descriptorSha256, digest(descriptorBytes));
  assert.equal(prepared.bindingSha256, digest(bindingBytes));
  const before = process.memoryUsage();
  residentFloor = await decodePreparedDisplayAsset(descriptor, binding, (sha) =>
    fs.readFile(path.join(chunkRoot, sha + ".bin")),
  );
  residentProof = {
    descriptorPath,
    descriptorSha256: digest(descriptorBytes),
    bindingPath,
    bindingSha256: digest(bindingBytes),
    selectedLevelIds: binding.levelIds,
    logicalJsonBytes: descriptor.logicalJsonBytes,
    before,
    after: process.memoryUsage(),
    payloadRetained: true,
  };
}
globalThis.gc?.();
await initializeNativeExactGeosOverlay();
const { workerEntry, workerSource, bundle } =
  await buildCandidateProductionRouteBundle(root, out, receipt);
type Memory = {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  heapLimit: number;
};
const observations: Array<{ stage: string; memory: Memory }> = [],
  fetches: unknown[] = [],
  failures: string[] = [],
  results: unknown[] = [];
let worker: Worker | undefined,
  workerStarts = 0,
  workerFailed = false;
const client = new RouteWorkerClient(() => {
  workerStarts++;
  const native = new Worker(pathToFileURL(bundle), {
    execArgv: [],
    resourceLimits: {
      maxOldGenerationSizeMb: 768,
      maxYoungGenerationSizeMb: 32,
    },
    workerData: { receipt, cachePath },
  });
  worker = native;
  const adapter: RouteWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(request: RouteRequest) {
      native.postMessage(request);
    },
    terminate() {
      void native.terminate();
    },
  };
  native.on(
    "message",
    (message: {
      _qaReady?: boolean;
      _qaFetch?: unknown;
      _qaResponse?: RouteResponse;
      memory?: Memory;
    }) => {
      if (message.memory) {
        observations.push({
          stage: message._qaReady ? "ready" : "response",
          memory: message.memory,
        });
        if (message.memory.heapLimit > 960 * 1024 * 1024) {
          failures.push("Worker V8 heap limit exceeded 960 MiB");
          void native.terminate();
          workerFailed = true;
          adapter.onerror?.({
            message: "Heap limit was not enforced",
            preventDefault() {},
          } as ErrorEvent);
        }
      }
      if (message._qaFetch) fetches.push(message._qaFetch);
      if (message._qaResponse)
        adapter.onmessage?.({
          data: message._qaResponse,
        } as MessageEvent<RouteResponse>);
    },
  );
  native.on("error", (error) => {
    workerFailed = true;
    adapter.onerror?.({
      message: error.message,
      preventDefault() {},
    } as ErrorEvent);
  });
  native.on("messageerror", () => {
    workerFailed = true;
    adapter.onmessageerror?.({} as MessageEvent);
  });
  native.on("exit", (code) => {
    if (code !== 0 && !workerFailed) {
      workerFailed = true;
      adapter.onerror?.({
        message: `Production route worker exited ${code}`,
        preventDefault() {},
      } as ErrorEvent);
    }
  });
  return adapter;
});
const started = performance.now();
for (let i = 0; i < casesDocument.cases.length; i++) {
  const test = casesDocument.cases[i],
    before = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = client.request(data, test.start, test.end, test.mode),
      value = await Promise.race([
        request.promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            request.cancel();
            reject(Error(`Route timed out after ${timeoutMs} ms`));
          }, timeoutMs);
        }),
      ]);
    const checked = run(() => checkRouteResult(data, test, value));
    if (checked.available !== originalResults[i].available)
      checked.errors.push("fresh-original-calculator-availability-mismatch");
    failures.push(...checked.errors.map((error) => `${test.name}: ${error}`));
    results.push({
      ...test,
      ...checked,
      elapsedMs: Math.round(performance.now() - before),
      workerMemory: observations.at(-1)?.memory,
      parentMemory: process.memoryUsage(),
    });
  } catch (error) {
    failures.push(
      `${test.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    results.push({
      ...test,
      error: String(error),
      elapsedMs: Math.round(performance.now() - before),
    });
    workerFailed = true;
  } finally {
    if (timer) clearTimeout(timer);
  }
  await fs.writeFile(
    path.join(out, "transport-route-results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify({
      stage: "production-worker-route",
      index: i + 1,
      total: casesDocument.cases.length,
      name: test.name,
      elapsedMs: Math.round(performance.now() - before),
      failed: workerFailed,
    }),
  );
  if (workerFailed) break;
}
client.dispose();
if (worker) await worker.terminate();
if (results.length !== casesDocument.cases.length)
  failures.push(
    `${casesDocument.cases.length - results.length} transport cases were not completed`,
  );
if (fetches.length !== 1)
  failures.push(
    `Expected exactly one fresh candidate cache fetch, observed ${fetches.length}`,
  );
assert.equal(
  digest(new Uint8Array(await fs.readFile(workerEntry))),
  digest(workerSource),
  "Production worker changed during audit",
);
assert.equal(
  digest(new Uint8Array(await fs.readFile(candidatePath))),
  qa.candidatePackageSha256,
);
assert.equal(
  digest(new Uint8Array(await fs.readFile(qaPath))),
  digest(qaBytes),
);
assert.equal(
  digest(new Uint8Array(await fs.readFile(cachePath))),
  receipt.compressedSha256,
);
const report = {
  passed: !failures.length,
  failures,
  candidatePackageSha256: qa.candidatePackageSha256,
  candidateRoutingProjectionSha256: receipt.datasetSha256,
  freshOriginalQa: { path: qaPath, sha256: digest(qaBytes) },
  receipt,
  cachePath,
  productionWorker: {
    path: workerEntry,
    sha256: digest(workerSource),
    unmodified: true,
    isolatedGeneratedReceiptReplacement: true,
    bundleSha256: digest(new Uint8Array(await fs.readFile(bundle))),
  },
  resourceLimits: {
    maxOldGenerationSizeMb: 768,
    maxYoungGenerationSizeMb: 32,
    maximumPermittedMeasuredV8HeapBytes: 960 * 1024 * 1024,
    workerStarts,
    observations,
  },
  fetches,
  residentFloor: residentProof,
  completedCases: results.length,
  requestedCases: casesDocument.cases.length,
  elapsedMs: Math.round(performance.now() - started),
  residentFloorStillRetained: !!residentFloor,
  limits:
    "Actual production RouteWorkerClient, structured cloning and production worker calculator in a Node worker with a hard V8 isolate limit. Fetch serves exact fresh checked candidate bytes locally; IndexedDB is unavailable. No browser/WebGL, mobile, real network or GPU memory claim. RSS includes the parent and all threads; heap/external/arrayBuffers are worker-local. The selected display payload, when provided, remains resident in the parent realm.",
};
await fs.writeFile(
  path.join(out, "route-transport-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    stage: "complete",
    passed: report.passed,
    cases: results.length,
    failures: failures.length,
  }),
);
if (failures.length) process.exitCode = 1;
