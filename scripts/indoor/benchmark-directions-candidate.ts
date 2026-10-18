/** Production worker/client transport benchmark over a freshly checked cache.
 * Test an isolated candidate receipt or the compiled source receipt explicitly.
 * This is a Node isolate measurement, not a browser/mobile memory benchmark.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type {
  RouteRequest,
  RouteResponse,
  RouteCalculation,
} from "../../app/indoor-project/route-calculation";
import {
  RouteWorkerClient,
  type RouteWorker,
} from "../../app/indoor-project/route-worker-client";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  publishedRouteCellReceipt,
  type PublishedRouteCellReceipt,
} from "../../app/indoor-project/published-route-cells";
import { localRoutingImplementation } from "./lib/local-routing-implementation";
import { buildCandidateProductionRouteBundle } from "./candidate-route-worker-bundle";

const [input, preparationFile, casesFile, output, ...flags] =
  process.argv.slice(2);
if (flags.some((f) => !["--compiled-receipt", "--profile-first"].includes(f)))
  throw new Error("Unknown benchmark flag");
const useCompiledReceipt = flags.includes("--compiled-receipt"),
  profileFirstRequest = flags.includes("--profile-first");
if (!input || !preparationFile || !casesFile || !output)
  throw new Error(
    "Usage: benchmark-directions-candidate.ts COMPLETE-VISITOR.json FRESH-PREPARATION-REPORT.json CASES.json NEW-OUTPUT",
  );
if (
  process.execArgv.some((a) => /^--max[-_]old[-_]space[-_]size/.test(a)) ||
  /--max[-_]old[-_]space[-_]size/.test(process.env.NODE_OPTIONS ?? "")
)
  throw new Error(
    "No process heap override: benchmark enforces a bounded worker isolate",
  );
const sha = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");
const prep = JSON.parse(await fs.readFile(preparationFile, "utf8"));
assert.equal(prep.format, "fresh-directions-candidate-preparation-v1");
assert.equal(prep.completeRouteProjectionValidation, true);
assert.equal(prep.sourceUnchanged, true);
assert.equal(prep.compiledTrustRootChanged, false);
assert.equal(prep.cache.freshOriginalCalculation, true);
assert.equal(localRoutingImplementation().sha256, prep.implementation.sha256);
const raw = await fs.readFile(input);
assert.equal(sha(raw), prep.inputSha256);
const full = JSON.parse(raw.toString()) as IndoorDataset,
  data = routeWorkerDataset(full);
assert.equal(sha(JSON.stringify(data)), prep.routingDatasetSha256);
const receipt = prep.cache.receipt as PublishedRouteCellReceipt,
  cachePath = prep.cache.cachePath as string;
if (useCompiledReceipt)
  assert.deepEqual(
    publishedRouteCellReceipt(data),
    receipt,
    "Compiled receipt must match the fresh original calculation",
  );
const stored = await fs.readFile(cachePath);
assert.equal(sha(stored), receipt.compressedSha256);
assert.equal(stored.length, receipt.compressedBytes);
const cases = JSON.parse(await fs.readFile(casesFile, "utf8")) as {
  id: string;
  from: string;
  to: string;
  mode: RouteRequest["mode"];
  options?: RouteRequest["options"];
}[];
const original = JSON.parse(
  await fs.readFile(
    path.join(path.dirname(preparationFile), "actual-routes.json"),
    "utf8",
  ),
) as { id: string; result: RouteCalculation }[];
await fs.mkdir(output, { recursive: false });
const root = path.resolve(import.meta.dirname, "../.."),
  { bundle } = await buildCandidateProductionRouteBundle(
    root,
    output,
    receipt,
    { useCompiledReceipt, profileFirstRequest },
  );
const observations: unknown[] = [],
  fetches: unknown[] = [],
  results: unknown[] = [];
let starts = 0;
const client = new RouteWorkerClient(() => {
  starts++;
  const native = new Worker(pathToFileURL(bundle), {
    execArgv: [],
    resourceLimits: {
      maxOldGenerationSizeMb: 768,
      maxYoungGenerationSizeMb: 32,
    },
    workerData: { receipt, cachePath },
  });
  const adapter: RouteWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      native.postMessage(message);
    },
    terminate() {
      void native.terminate();
    },
  };
  native.on(
    "message",
    (message: {
      _qaFetch?: unknown;
      _qaResponse?: RouteResponse;
      memory?: { heapLimit: number; heapUsed: number };
    }) => {
      if (message.memory) {
        observations.push(message.memory);
        assert(
          message.memory.heapLimit < 850 * 1024 * 1024,
          "Worker must retain its measured heap cap",
        );
      }
      if (message._qaFetch) fetches.push(message._qaFetch);
      if (message._qaResponse)
        adapter.onmessage?.({
          data: message._qaResponse,
        } as MessageEvent<RouteResponse>);
    },
  );
  native.on("error", (error) =>
    adapter.onerror?.({
      message: error.message,
      preventDefault() {},
    } as ErrorEvent),
  );
  return adapter;
});
try {
  for (const item of cases) {
    const at = performance.now(),
      response = client.request(
        full,
        item.from,
        item.to,
        item.mode,
        item.options,
      );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const value = await Promise.race([
      response.promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          response.cancel();
          reject(new Error("Directions benchmark exceeded 120 seconds"));
        }, 120_000);
      }),
    ]).finally(() => clearTimeout(timeout));
    const expected = original.find((r) => r.id === item.id)!;
    assert(expected, "Missing freshly calculated reference");
    assert.equal(!!value.route, !!expected.result.route, item.id);
    assert.deepEqual(
      value.route?.edges.map((e) => e.id),
      expected.result.route?.edges.map((e) => e.id),
      item.id,
    );
    // Compare the saved JSON representation, including every finite coordinate
    // and support flag. Undefined optional properties are absent in that file.
    assert.equal(
      JSON.stringify(value.route?.paths ?? null),
      JSON.stringify(expected.result.route?.paths ?? null),
      item.id,
    );
    const row = {
      id: item.id,
      available: !!value.route,
      workerReplySeconds: (performance.now() - at) / 1000,
      originalRouteGeometryMatches: true,
      workerStarts: starts,
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
  client.dispose();
  const first = cases[0]!,
    at = performance.now(),
    startsBefore = starts;
  const retained = await client.request(
    full,
    first.from,
    first.to,
    first.mode,
    first.options,
  ).promise;
  assert.equal(
    starts,
    startsBefore,
    "Small completed result should survive worker release",
  );
  results.push({
    id: first.id + ":retained-result-after-release",
    available: !!retained.route,
    workerReplySeconds: (performance.now() - at) / 1000,
    newWorkerNeeded: false,
  });
} finally {
  client.dispose();
}
assert.equal(localRoutingImplementation().sha256, prep.implementation.sha256);
const report = {
  format: "fresh-directions-production-worker-benchmark-v1",
  sourceSha256: prep.inputSha256,
  routingDatasetSha256: prep.routingDatasetSha256,
  cacheSha256: receipt.compressedSha256,
  cacheBytes: receipt.compressedBytes,
  workerStarts: starts,
  results,
  fetches,
  observations,
  scope:
    "Actual production worker/client in a 768 MiB Node isolate. Receipt mode is explicit below; no browser, network latency or floor-worker co-residency measured.",
  compiledTrustRootChanged: false,
  usedCompiledReceipt: useCompiledReceipt,
  firstRequestCpuProfile: profileFirstRequest,
  published: false,
  geometryOrAccessChanged: false,
};
await fs.writeFile(
  path.join(output, "report.json"),
  JSON.stringify(report, null, 2),
);
