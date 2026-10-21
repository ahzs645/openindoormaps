/** Actual visitor worker, genuine manifest/carrier delivery and full normal
 * route/instruction parity. An isolated candidate receipt is never published. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { buildCandidateProductionRouteBundle } from "./candidate-route-worker-bundle";
import {
  validateProgressiveManifest,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";
import {
  ProgressiveRouteClient,
  type ProgressiveRouteWorker,
  type ProgressiveRouteResponse,
} from "../../app/indoor-project/progressive-route-client";
import { publishedRouteRuntimeBinding } from "./published-route-runtime-binding";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
const [publicationDirectory, cacheDirectory, output] = process.argv.slice(2);
if (!publicationDirectory || !cacheDirectory || !output)
  throw new Error(
    "Usage: benchmark-progressive-route-hydration.ts MANIFEST-DIRECTORY FRESH-CACHE-DIRECTORY EMPTY-OUTPUT-DIRECTORY",
  );
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.resolve(output),
  sha = (value: Uint8Array | string) =>
    createHash("sha256").update(value).digest("hex"),
  proofBytes = await fs.readFile(path.join(cacheDirectory, "proof.json")),
  proof = JSON.parse(proofBytes.toString()),
  receipt = proof.receipt,
  runtime = publishedRouteRuntimeBinding(root),
  engine = preparedDisplayEngineBinding(root);
assert.equal(proof.passed, true);
assert.equal(proof.normalPhysicalValidationRepeated, true);
assert.equal(proof.sourceDatasetUnchanged, true);
assert.equal(proof.compiledTrustRootChanged, false);
assert.equal(proof.published, false);
assert(
  Number.isSafeInteger(proof.freshNormalRouteCases) &&
    proof.freshNormalRouteCases >= 10 &&
    proof.freshNormalRouteCases <= 138,
  "Fresh normal proof must retain the base ten and at most128 explicit cases",
);
for (const [name, expected] of [
  ["route-cases.json", proof.routeCasesSha256],
  ["normal-route-results.json", proof.normalRouteResultsSha256],
  [
    "normal-progressive-route-results.json",
    proof.normalProgressiveRouteResultsSha256,
  ],
]) {
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.equal(
    sha(await fs.readFile(path.join(cacheDirectory, name))),
    expected,
  );
}
assert.equal(receipt.runtimeSha256, runtime.sha256);
assert.equal(receipt.engineSha256, engine.sha256);
const manifestBytes = await fs.readFile(
    path.join(publicationDirectory, "manifest.json"),
  ),
  manifest = JSON.parse(manifestBytes.toString()) as ProgressiveManifest;
validateProgressiveManifest(manifest);
const asset = manifest.assets[manifest.routeAssetId];
assert.equal(asset.logicalSha256, proof.datasetSha256);
assert.deepEqual(
  asset.representations.map((representation) => representation.encoding),
  ["gzip"],
  "This bounded delivery benchmark requires the complete gzip-only export",
);
assert.deepEqual(manifest.provenance.source, receipt.source);
const base = "https://candidate.test/data/unbc/manifest.json",
  downloads: Record<string, string> = {},
  inventory = [];
for (const representation of asset.representations) {
  // The real client reads bounded parts when declared; the redundant whole
  // stream need not exist on a publication whose inventory serves only parts.
  for (const value of representation.parts ?? [representation]) {
    const file = path.resolve(publicationDirectory, value.path);
    assert(file.startsWith(path.resolve(publicationDirectory) + path.sep));
    const bytes = await fs.readFile(file);
    assert.equal(bytes.length, value.bytes);
    assert.equal(sha(bytes), value.sha256);
    downloads[new URL(value.path, base).href] = file;
    inventory.push({
      path: value.path,
      bytes: bytes.length,
      sha256: sha(bytes),
    });
  }
}
const cachePath = path.resolve(cacheDirectory, path.basename(receipt.url));
assert.equal(sha(await fs.readFile(cachePath)), receipt.compressedSha256);
await fs.mkdir(out, { recursive: true });
assert.equal((await fs.readdir(out)).length, 0);
const { bundle } = await buildCandidateProductionRouteBundle(
  root,
  out,
  receipt,
  { workerKind: "progressive", profileFirstRequest: true },
);
let starts = 0;
const observations: { heapLimit: number; heapUsed: number }[] = [],
  fetches: unknown[] = [];
const client = new ProgressiveRouteClient(() => {
  starts++;
  const native = new Worker(pathToFileURL(bundle), {
      execArgv: [],
      resourceLimits: {
        maxOldGenerationSizeMb: 768,
        maxYoungGenerationSizeMb: 32,
      },
      workerData: { receipt, cachePath, downloads },
    }),
    adapter: ProgressiveRouteWorker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: (request) => native.postMessage(request),
      terminate: () => {
        void native.terminate();
      },
    };
  native.on("message", (message) => {
    if (message.memory) observations.push(message.memory);
    if (message._qaFetch) fetches.push(message._qaFetch);
    if (message._qaResponse)
      adapter.onmessage?.({
        data: message._qaResponse as ProgressiveRouteResponse,
      } as MessageEvent<ProgressiveRouteResponse>);
  });
  native.on("error", (error) =>
    adapter.onerror?.({
      message: error.message,
      preventDefault() {},
    } as ErrorEvent),
  );
  return adapter;
});
const cases = JSON.parse(
    await fs.readFile(path.join(cacheDirectory, "route-cases.json"), "utf8"),
  ),
  originals = JSON.parse(
    await fs.readFile(
      path.join(cacheDirectory, "normal-route-results.json"),
      "utf8",
    ),
  ),
  presentation = JSON.parse(
    await fs.readFile(
      path.join(cacheDirectory, "normal-progressive-route-results.json"),
      "utf8",
    ),
  ),
  json = (value: unknown) =>
    JSON.stringify(value, (_, item) =>
      item instanceof Set ? [...item] : item,
    ),
  rows: unknown[] = [];
assert.equal(cases.length, proof.freshNormalRouteCases);
assert.equal(
  originals.length,
  cases.length,
  "Every case needs its exact normal result",
);
assert.equal(
  presentation.length,
  cases.length,
  "Every case needs its exact normal summary/instructions",
);
assert.equal(
  new Set(cases.map((c: { name: string }) => c.name)).size,
  cases.length,
);
assert.deepEqual(
  cases
    .slice(0, 10)
    .map((c: { name: string; mode: string }) => [c.name, c.mode]),
  [
    ["main-forward", "public"],
    ["main-reverse", "public"],
    ["floor1", "public"],
    ["floor3", "public"],
    ["unavailable", "public"],
    ["lift-up", "public"],
    ["lift-down", "public"],
    ["ramp-forward", "public"],
    ["ramp-reverse", "public"],
    ["stepfree-refusal", "accessible"],
  ],
  "Fresh normal cases must retain the exact ordered base ten names/profiles",
);
assert.equal(cases[0].name, "main-forward", "Cold Main must be first");
try {
  for (const [i, c] of cases.entries()) {
    const began = performance.now(),
      request = client.request(base, manifest, c.start, c.end, c.mode);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      request.promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Actual visitor worker exceeded180000ms"));
          request.cancel();
        }, 180_000);
      }),
    ]).finally(() => clearTimeout(timer));
    const expected = originals[i];
    if (expected.arrivals) {
      const { hallway: _hallway, ...inside } = expected.arrivals;
      expected.arrivals = inside;
    }
    assert.equal(json(result.value), json(expected), c.name);
    assert.equal(json(result.summary), json(presentation[i].summary), c.name);
    assert.equal(json(result.steps), json(presentation[i].steps), c.name);
    assert(observations.length > 0);
    assert(observations.every((o) => o.heapLimit <= 900_000_000));
    const row = {
      name: c.name,
      seconds: (performance.now() - began) / 1000,
      routeAvailable: !!result.value.route,
      exactNormalRouteSummaryInstructions: true,
      unknownAccessAreas: result.value.route?.unknownAccessAreas,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
    await fs.writeFile(path.join(out, "results.json"), JSON.stringify(rows));
  }
  assert.equal(starts, 1);
  const requests = fetches as { url: string; bytes: number }[],
    cacheUrl = new URL(receipt.url, base).href;
  assert.equal(
    requests.filter((request) => request.url === cacheUrl).length,
    1,
    "The real visitor must download its fresh admitted directions carrier once",
  );
  for (const item of inventory) {
    const url = new URL(item.path, base).href;
    assert.deepEqual(
      requests
        .filter((request) => request.url === url)
        .map((request) => request.bytes),
      [item.bytes],
      "The real visitor must read every declared routing part exactly once",
    );
  }
  assert.equal(publishedRouteRuntimeBinding(root).sha256, runtime.sha256);
  assert.equal(preparedDisplayEngineBinding(root).sha256, engine.sha256);
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify({
      passed: true,
      kind: "actual-progressive-worker-checked-delivery-v1",
      proofSha256: sha(proofBytes),
      manifestSha256: sha(manifestBytes),
      manifestRevisionSha256: manifest.revisionSha256,
      receipt,
      bundleSha256: sha(await fs.readFile(bundle)),
      routingCarrierInventory: inventory,
      starts,
      results: rows,
      fetches,
      observations,
      published: false,
      browserOrPhysicalDeviceAcceptance: false,
    }),
  );
} catch (error) {
  await fs.writeFile(
    path.join(out, "failure.json"),
    JSON.stringify({
      passed: false,
      error: String(error),
      rows,
      fetches,
      observations,
    }),
  );
  throw error;
} finally {
  client.dispose();
}
