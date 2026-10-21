/** Actual production worker benchmark against either its compiled legacy cache
 * or a separately fresh-validated inert candidate. No geometry substitute. */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { buildCandidateProductionRouteBundle } from "./candidate-route-worker-bundle";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  RouteWorkerClient,
  type RouteWorker,
} from "../../app/indoor-project/route-worker-client";
import type { RouteResponse } from "../../app/indoor-project/route-calculation";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { PublishedRouteCellReceipt } from "../../app/indoor-project/published-route-cells";
import { PUBLISHED_ROUTE_CELL_RECEIPTS } from "../../app/indoor-project/published-route-cell-receipts";
const [input, expected, cacheDirectory, output, mode] = process.argv.slice(2);
if (
  !input ||
  !expected ||
  !cacheDirectory ||
  !output ||
  !["legacy", "candidate"].includes(mode)
)
  throw new Error(
    "Usage: benchmark-published-route-hydration.ts COMPLETE.json SHA256 CACHE-DIRECTORY EMPTY-OUTPUT-DIRECTORY legacy|candidate",
  );
if (
  process.execArgv.some((arg) => /^--max[-_]old[-_]space[-_]size/.test(arg)) ||
  /--max[-_]old[-_]space[-_]size/.test(process.env.NODE_OPTIONS ?? "")
)
  throw new Error(
    "No parent heap override: the worker must retain its768MiB cap",
  );
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.resolve(output),
  sha = (v: Uint8Array | string) =>
    createHash("sha256").update(v).digest("hex");
await fs.mkdir(out, { recursive: true });
assert.equal((await fs.readdir(out)).length, 0);
const raw = await fs.readFile(input);
assert.equal(sha(raw), expected);
const data = routeWorkerDataset(JSON.parse(raw.toString()) as IndoorDataset);
let receipt: PublishedRouteCellReceipt, proofSha256: string | undefined;
let freshNormalRouteCaseCount: number | undefined;
if (mode === "candidate") {
  const bytes = await fs.readFile(path.join(cacheDirectory, "proof.json")),
    proof = JSON.parse(bytes.toString());
  assert.equal(proof.passed, true);
  assert.equal(proof.normalPhysicalValidationRepeated, true);
  assert.equal(proof.sourceDatasetUnchanged, true);
  assert(
    Number.isSafeInteger(proof.freshNormalRouteCases) &&
      proof.freshNormalRouteCases >= 10 &&
      proof.freshNormalRouteCases <= 138,
    "Fresh normal proof must retain the base ten and at most128 explicit cases",
  );
  freshNormalRouteCaseCount = proof.freshNormalRouteCases;
  assert.equal(proof.actualRouteParityCases, 0);
  // Older immutable experiments predate these output hashes. A new proof that
  // declares them must bind the exact normal cases and results we compare.
  for (const [name, expectedHash] of [
    ["route-cases.json", proof.routeCasesSha256],
    ["normal-route-results.json", proof.normalRouteResultsSha256],
  ])
    if (expectedHash !== undefined)
      assert.equal(
        sha(await fs.readFile(path.join(cacheDirectory, name))),
        expectedHash,
      );
  assert.equal(proof.datasetSha256, sha(JSON.stringify(data)));
  receipt = proof.receipt;
  proofSha256 = sha(bytes);
} else {
  receipt = PUBLISHED_ROUTE_CELL_RECEIPTS.find(
    (r) => r.datasetSha256 === sha(JSON.stringify(data)),
  )!;
  assert(receipt);
  assert.equal(receipt.runtimeSha256, undefined);
}
const cachePath = path.resolve(cacheDirectory, path.basename(receipt.url));
assert.equal(sha(await fs.readFile(cachePath)), receipt.compressedSha256);
const { bundle } = await buildCandidateProductionRouteBundle(
  root,
  out,
  receipt,
  { useCompiledReceipt: mode === "legacy", profileFirstRequest: true },
);
let worker: Worker | undefined,
  starts = 0;
const observations: unknown[] = [],
  fetches: unknown[] = [];
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
  worker = native;
  const adapter: RouteWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (r) => native.postMessage(r),
    terminate: () => {
      void native.terminate();
    },
  };
  native.on("message", (m) => {
    if (m.memory) observations.push(m.memory);
    if (m._qaFetch) {
      fetches.push(m._qaFetch);
      console.log(
        JSON.stringify({ stage: "actual-worker-fetch", ...m._qaFetch }),
      );
    }
    if (m._qaResponse)
      adapter.onmessage?.({
        data: m._qaResponse as RouteResponse,
      } as MessageEvent<RouteResponse>);
  });
  native.on("error", (e) =>
    adapter.onerror?.({
      message: e.message,
      preventDefault() {},
    } as ErrorEvent),
  );
  return adapter;
});
let cases = JSON.parse(
  await fs.readFile(
    path.join(
      root,
      "docs/continuation/unbc-20261018/directions-and-threshold-blockers/cases.json",
    ),
    "utf8",
  ),
);
const originals = JSON.parse(
  await fs.readFile(
    path.join(
      root,
      "docs/continuation/unbc-20261018/directions-and-threshold-blockers/actual-routes.json",
    ),
    "utf8",
  ),
);
if (mode === "candidate") {
  const freshCases = JSON.parse(
    await fs.readFile(path.join(cacheDirectory, "route-cases.json"), "utf8"),
  );
  const freshResults = JSON.parse(
    await fs.readFile(
      path.join(cacheDirectory, "normal-route-results.json"),
      "utf8",
    ),
  );
  assert.equal(freshCases.length, freshNormalRouteCaseCount);
  assert.equal(
    freshResults.length,
    freshCases.length,
    "Every case needs its exact normal result",
  );
  assert.equal(
    new Set(freshCases.map((c: { name: string }) => c.name)).size,
    freshCases.length,
  );
  const baseCases = [
    ["main-forward", "05-136", "05-173", "public"],
    ["main-reverse", "05-173", "05-136", "public"],
    ["floor1", "09-218", "09-260", "public"],
    ["floor3", "10-3564", "10-3588", "public"],
    ["unavailable", "08-264", "10-2006", "public"],
    ["lift-up", "05-143", "05-242", "public"],
    ["lift-down", "05-242", "05-143", "public"],
    ["ramp-forward", "07-180", "08-S101", "public"],
    ["ramp-reverse", "08-S101", "07-180", "public"],
    ["stepfree-refusal", "07-180", "08-S101", "accessible"],
  ] as const;
  assert.deepEqual(
    freshCases
      .slice(0, 10)
      .map((c: { name: string; mode: string }) => [c.name, c.mode]),
    baseCases.map((entry) => [entry[0], entry[3]]),
    "Fresh normal cases must retain the exact ordered base ten names/profiles",
  );
  const resolveNumber = (number: string) => {
    const matches = data.records.filter((record) => record.number === number);
    assert.equal(
      matches.length,
      1,
      `Missing or duplicate base-case room number: ${number}`,
    );
    return matches[0]!.key;
  };
  assert.deepEqual(
    freshCases
      .slice(0, 10)
      .map((c: { name: string; start: string; end: string; mode: string }) => [
        c.name,
        c.start,
        c.end,
        c.mode,
      ]),
    baseCases.map(([name, start, end, mode]) => [
      name,
      resolveNumber(start),
      resolveNumber(end),
      mode,
    ]),
    "Fresh normal base ten endpoints must match the actual loaded source places",
  );
  for (const [i, c] of freshCases.entries()) {
    cases.push({
      id: "fresh:" + c.name,
      from: c.start,
      to: c.end,
      mode: c.mode,
    });
    originals.push({ id: "fresh:" + c.name, result: freshResults[i] });
  }
}
if (process.env.ROUTE_PROFILE_CASE === "main") {
  const i = cases.findIndex(
    (c: { id: string }) => c.id === "fresh:main-forward",
  );
  assert(i !== -1);
  cases.unshift(...cases.splice(i, 1));
}
const insideOnly = process.env.ROUTE_SELECTED_INSIDE === "1";
const appendHistorical = process.env.ROUTE_APPEND_HISTORICAL === "1";
if (insideOnly)
  cases = [
    ...cases.filter((c: { id: string }) => c.id.startsWith("fresh:")),
    ...(appendHistorical
      ? cases.filter((c: { id: string }) => !c.id.startsWith("fresh:"))
      : []),
  ];
const routeTimeoutMs = Number(
  process.env.ROUTE_BENCHMARK_TIMEOUT_MS ?? 120_000,
);
assert(
  Number.isSafeInteger(routeTimeoutMs) &&
    routeTimeoutMs >= 1000 &&
    routeTimeoutMs <= 300_000,
);
const rows = [];
try {
  for (const c of cases) {
    const selectedInside = insideOnly && c.id.startsWith("fresh:");
    const began = performance.now();
    const request = client.request(
      data,
      c.from,
      c.to,
      c.mode,
      selectedInside ? { endpointMode: "inside" } : c.options,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      request.promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`Actual production worker exceeded${routeTimeoutMs}ms`),
          );
          request.cancel();
        }, routeTimeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
    const original = originals.find((r: { id: string }) => r.id === c.id);
    assert(observations.length > 0);
    assert(
      observations.every(
        (memory) => (memory as { heapLimit: number }).heapLimit <= 900_000_000,
      ),
      "Actual V8 worker heap limit exceeds the intended cap",
    );
    assert(original);
    const json = (v: unknown) =>
      JSON.stringify(v, (_, item) => (item instanceof Set ? [...item] : item));
    if (selectedInside && original.result.arrivals) {
      const { hallway: _hallway, ...selected } = original.result.arrivals;
      original.result.arrivals = selected;
    }
    assert.equal(
      json(result),
      json(original.result),
      `Exact old normal route geometry/policy parity ${c.id}`,
    );
    const row = {
      id: c.id,
      available: !!result.route,
      seconds: (performance.now() - began) / 1000,
      exactPreviousNormalRouteMatches: true,
      unknownAccessAreas: result.route?.unknownAccessAreas,
      sourceEdgeIds: result.route?.edges.map((e) => e.id),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
    await fs.writeFile(
      path.join(out, "results.json"),
      JSON.stringify(rows, null, 2),
    );
  }
} catch (error) {
  await fs.writeFile(
    path.join(out, "failure.json"),
    JSON.stringify(
      {
        passed: false,
        mode,
        receipt,
        proofSha256,
        routeTimeoutMs,
        error: String(error),
        results: rows,
        fetches,
        observations,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  client.dispose();
  if (worker) await worker.terminate();
}
assert.equal(starts, 1);
assert.equal(fetches.length, 1);
await fs.writeFile(
  path.join(out, "report.json"),
  JSON.stringify(
    {
      format: "published-routing-hydration-production-worker-benchmark-v1",
      passed: true,
      mode,
      insideOnly,
      appendHistorical,
      inputSha256: expected,
      receipt,
      proofSha256,
      starts,
      results: rows,
      fetches,
      observations,
      bundleSha256: sha(await fs.readFile(bundle)),
      physicalDevice: false,
      browser: false,
      published: false,
    },
    null,
    2,
  ),
);
