/** Require every published floor to use its exact checked drawing carrier.
 * This verifies transport and current admission; it grants no route authority.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateProgressiveManifest,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";
import {
  loadPublishedVisitorPlan,
  publishedVisitorPlanReceipt,
} from "../../app/indoor-project/published-visitor-plan";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256 } from "../../app/indoor-project/published-visitor-plan-runtime-binding";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { publishedVisitorPlanRuntimeBinding } from "./published-visitor-plan-runtime-binding";

const [publicDirectory, output] = process.argv.slice(2);
assert(
  publicDirectory && output,
  "Usage: check-published-visitor-plans.ts PUBLIC_ROOT NEW_REPORT.json",
);
const started = performance.now(),
  sourceRoot = path.resolve(import.meta.dirname, "../.."),
  publicRoot = await realpath(publicDirectory),
  manifestPath = path.join(publicRoot, "data/unbc/manifest.json"),
  manifestBytes = await readFile(manifestPath),
  manifest = JSON.parse(manifestBytes.toString()) as ProgressiveManifest,
  hash = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
validateProgressiveManifest(manifest);
assert.equal(manifest.unavailableScopes.length, 0, "Publication is partial");
const checkBindings = () => {
  assert.equal(
    preparedDisplayEngineBinding(sourceRoot).sha256,
    PREPARED_DISPLAY_ENGINE_SHA256,
    "Prepared display engine differs from the final source tree",
  );
  assert.equal(
    publishedVisitorPlanRuntimeBinding(sourceRoot).sha256,
    PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256,
    "Plan consumer/projection differs from its generated binding",
  );
};
checkBindings();
const origin = "https://publication.invalid",
  manifestUrl = origin + "/data/unbc/manifest.json",
  carriers = new Map<string, { bytes: number; sha256: string }>(),
  fetchLocal: typeof fetch = async (input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    assert.equal(url.origin, origin);
    assert(url.pathname.startsWith("/data/"));
    assert(!url.search && !url.hash, "Carrier URL must be an exact asset path");
    const filename = await realpath(
      path.resolve(publicRoot, "." + decodeURIComponent(url.pathname)),
    );
    assert(
      filename.startsWith(publicRoot + path.sep),
      "Carrier escapes the publication root",
    );
    const bytes = await readFile(filename);
    carriers.set(url.pathname, { bytes: bytes.length, sha256: hash(bytes) });
    return new Response(new Uint8Array(bytes));
  };
const scopes = [];
for (const scope of manifest.scopes) {
  const receipt = publishedVisitorPlanReceipt(manifest, scope);
  assert(receipt, `No current compiled drawing receipt for ${scope.label}`);
  // A per-scope cache also exercises its real full-base dependency. Never seed
  // it with asserted decoded plans or reuse another scope's object as proof.
  const assets = new Map<string, Uint8Array>(),
    cache = {
      getAsset: async (key: string) => assets.get(key)?.slice(),
      putAsset: async (key: string, value: Uint8Array) => {
        assets.set(key, value.slice());
      },
    },
    online = await loadPublishedVisitorPlan(manifest, scope, {
      manifestUrl,
      cache,
      fetch: fetchLocal,
    });
  assert(online, `Checked drawing missing for ${scope.label}`);
  const offline = await loadPublishedVisitorPlan(manifest, scope, {
    manifestUrl,
    cache,
    offline: true,
    fetch: async () => {
      throw new Error("Offline verification attempted a network request");
    },
  });
  assert(offline, `Drawing cannot reopen offline for ${scope.label}`);
  assert.equal(
    hash(new TextEncoder().encode(JSON.stringify(offline))),
    receipt.logicalSha256,
  );
  scopes.push({
    scopeId: scope.id,
    label: scope.label,
    levelIds: scope.levelIds,
    logicalSha256: receipt.logicalSha256,
    logicalBytes: receipt.logicalBytes,
    deltaBaseScopeId: receipt.delta?.baseScopeId,
    onlineAndOfflinePassed: true,
    cachedCarrierCount: assets.size,
  });
}
assert(scopes.length > 0, "Publication has no floor scopes");
assert.equal(hash(await readFile(manifestPath)), hash(manifestBytes));
checkBindings();
const report = {
  format: "published-visitor-plan-source-asset-check-v1",
  manifestFileSha256: hash(manifestBytes),
  progressiveRevisionSha256: manifest.revisionSha256,
  datasetSha256: manifest.provenance.datasetSha256,
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  runtimeSha256: PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256,
  scopes,
  carriers: Object.fromEntries(carriers),
  storedCarrierBytes: [...carriers.values()].reduce(
    (n, row) => n + row.bytes,
    0,
  ),
  allPublishedScopesChecked: true,
  fallbackUsed: false,
  browserPaintAuthority: false,
  physicalPhoneAuthority: false,
  routeAuthorityChanged: false,
  releaseApproved: false,
  elapsedMs: performance.now() - started,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(report));
