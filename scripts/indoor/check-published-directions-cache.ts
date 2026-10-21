/** Fast publication gate: current actual routing projection, compiled receipt
 * and served asset must agree. Does not rerun physical admission or mint it.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  publishedRouteCellReceipt,
  decodePublishedRouteCells,
} from "../../app/indoor-project/published-route-cells";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { publishedRouteRuntimeBinding } from "./published-route-runtime-binding";
import { PUBLISHED_ROUTE_RUNTIME_SHA256 } from "../../app/indoor-project/published-route-runtime-binding";
import { createImmutableRoutingWorkerDataset } from "../../app/indoor-project/verified-routing-dataset";

const [input, expectedSha, publicRoot, output] = process.argv.slice(2);
if (
  !input ||
  !expectedSha ||
  !publicRoot ||
  !output ||
  !/^[a-f0-9]{64}$/.test(expectedSha)
)
  throw new Error(
    "Usage: check-published-directions-cache.ts COMPLETE-VISITOR.json EXPECTED-SHA256 PUBLIC-ROOT NEW-OUTPUT.json",
  );
const sha = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const started = performance.now(),
  bytes = await fs.readFile(input);
assert.equal(
  sha(bytes),
  expectedSha,
  "Publication visitor differs from reviewed original bytes",
);
assert.equal(
  preparedDisplayEngineBinding(path.resolve(import.meta.dirname, "../.."))
    .sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
  "Generated engine must match the final source tree",
);
const data = createImmutableRoutingWorkerDataset(
  routeWorkerDataset(JSON.parse(bytes.toString()) as IndoorDataset),
);
const receipt = publishedRouteCellReceipt(data);
assert(
  receipt,
  "No matching compiled directions receipt: publication would repeat expensive physical preparation",
);
if (receipt.runtimeSha256)
  assert.equal(
    publishedRouteRuntimeBinding(path.resolve(import.meta.dirname, "../.."))
      .sha256,
    PUBLISHED_ROUTE_RUNTIME_SHA256,
    "Generated route runtime must match the final actual consumer closure",
  );
const base = path.resolve(publicRoot),
  asset = path.resolve(base, "." + receipt.url);
assert(
  asset.startsWith(base + path.sep) && receipt.url.startsWith("/data/"),
  "Directions asset must be under the declared publication root",
);
const stored = await fs.readFile(asset);
await initializeNativeExactGeosOverlay();
const entries = decodePublishedRouteCells(data, receipt, stored);
assert.equal(
  sha(await fs.readFile(input)),
  expectedSha,
  "Original visitor changed during the publication check",
);
const report = {
  format: "published-directions-source-asset-check-v1",
  inputSha256: expectedSha,
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  runtimeSha256: receipt.runtimeSha256,
  routingDatasetSha256: receipt.datasetSha256,
  assetUrl: receipt.url,
  assetSha256: sha(stored),
  assetBytes: stored.length,
  decodedSupportedCells: entries.size,
  elapsedSeconds: (performance.now() - started) / 1000,
  currentCompiledReceiptMatches: true,
  exactCarrierInventoryAndPolicyDecodePassed: true,
  fullPhysicalValidationRepeated: false,
  published: false,
};
await fs.writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify(report));
