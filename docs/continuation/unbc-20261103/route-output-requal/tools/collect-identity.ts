/** Identity of one final-proof browser run: app and Reviter commits, the
 * published inputs as served from the public root, the admitted receipts that
 * bind them, and the build output. Fails if any of them disagree.
 *
 *   node --import tsx collect-identity.ts REPO PUBLIC-ROOT VISITOR.json VISITOR-SHA256 \
 *     CARRIER.json.gz REVITER-CHECKOUT OUT.json
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PUBLISHED_PROJECT_RECEIPTS } from "../../../../../app/indoor-project/published-project-receipts";
import { PUBLISHED_ROUTE_CELL_RECEIPTS } from "../../../../../app/indoor-project/published-route-cell-receipts";
import { PUBLISHED_VISITOR_PLAN_RECEIPTS } from "../../../../../app/indoor-project/published-visitor-plan-receipts";
import { PUBLISHED_ROUTE_RUNTIME_SHA256 } from "../../../../../app/indoor-project/published-route-runtime-binding";
import { PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256 } from "../../../../../app/indoor-project/published-visitor-plan-runtime-binding";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../../../../app/indoor-project/prepared-display-engine-binding";

const [repo, root, visitor, visitorSha, carrier, reviter, out] =
  process.argv.slice(2);
assert(repo && root && visitor && visitorSha && carrier && reviter && out);
const sha = (b: Uint8Array | string) =>
  createHash("sha256").update(b).digest("hex");
const fileSha = (f: string) => sha(fs.readFileSync(f));
const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
const tree = (dir: string) => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  const lines = files
    .map((f) => `${fileSha(f)}  ${path.relative(dir, f)}`)
    .sort();
  return { files: lines.length, sha256: sha(lines.join("\n") + "\n") };
};

// Application: the commit and whether the app sources differ from it.
const appCommit = git(repo, "rev-parse", "HEAD");
const appPaths = [
  "app",
  "public",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "react-router.config.ts",
  "tsconfig.json",
];
const appDirty = git(repo, "status", "--porcelain", "--", ...appPaths);
assert.equal(appDirty, "", `App sources differ from ${appCommit}:\n${appDirty}`);
const appLastChangedCommit = git(repo, "log", "-1", "--format=%H", "--", ...appPaths);

// Reviter: the checkout and the pin in CI.
const reviterCommit = git(reviter, "rev-parse", "HEAD");
const workflow = fs.readFileSync(
  path.join(repo, ".github/workflows/indoor-checks.yml"),
  "utf8",
);
const reviterPinned = /ref:\s*([a-f0-9]{40})/.exec(workflow)?.[1];
assert.equal(reviterCommit, reviterPinned, "Reviter checkout != CI pin");

// Published inputs as served.
assert.equal(fileSha(visitor), visitorSha, "visitor JSON hash");
const manifestPath = path.join(root, "data/unbc/manifest.json");
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString());
assert.equal(manifest.provenance.datasetSha256, visitorSha);
const candidateSha256 = manifest.provenance.packageSha256;
const routeAsset = manifest.assets[manifest.routeAssetId];
const routeReceipt = PUBLISHED_ROUTE_CELL_RECEIPTS.find(
  (r) => r.datasetSha256 === routeAsset.logicalSha256,
);
assert(routeReceipt, "no compiled route-cell receipt for this routing asset");
const carrierSha256 = fileSha(carrier);
assert.equal(carrierSha256, routeReceipt.compressedSha256);
const servedCarrier = path.join(root, routeReceipt.url);
assert.equal(fileSha(servedCarrier), carrierSha256, "served carrier hash");
const planReceipts = PUBLISHED_VISITOR_PLAN_RECEIPTS.filter(
  (r) => r.revisionSha256 === manifest.revisionSha256,
).map((r) => {
  const served = fileSha(path.join(root, r.url));
  assert.equal(served, r.compressedSha256, `served plan carrier ${r.url}`);
  assert.equal(r.datasetSha256, visitorSha);
  return {
    id: r.id,
    scopeId: r.scopeId,
    compressedSha256: r.compressedSha256,
    compressedBytes: r.compressedBytes,
    url: r.url,
  };
});
assert(planReceipts.length > 0, "no plan receipt for this revision");
const projectReceipt = PUBLISHED_PROJECT_RECEIPTS.find((r) =>
  JSON.stringify(r).includes(manifest.revisionSha256),
);
assert(projectReceipt, "no progressive-floors project receipt");

const build = path.join(root, "build");
const assets = tree(path.join(build, "assets"));
const identity = {
  format: "final-proof-identity-v1",
  collectedAt: new Date().toISOString(),
  appCommit,
  appLastChangedCommit,
  appSourcesMatchCommit: true,
  reviterCommit,
  reviterPinnedInCi: reviterPinned,
  candidateSha256,
  visitorSha256: visitorSha,
  manifestRevisionSha256: manifest.revisionSha256,
  manifestFileSha256: sha(manifestBytes),
  routingDatasetSha256: routeAsset.logicalSha256,
  directionsCarrier: {
    receiptId: routeReceipt.id,
    sha256: carrierSha256,
    bytes: fs.statSync(carrier).size,
    url: routeReceipt.url,
  },
  planReceipts,
  projectReceiptId: projectReceipt.id,
  bindings: {
    preparedDisplayEngineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    publishedRouteRuntimeSha256: PUBLISHED_ROUTE_RUNTIME_SHA256,
    publishedVisitorPlanRuntimeSha256: PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256,
  },
  build: {
    indexHtmlSha256: fileSha(path.join(build, "index.html")),
    assetsFiles: assets.files,
    assetsListSha256: assets.sha256,
    assetsListRule:
      "sha256 of the sorted lines '<sha256>  <path relative to build/assets>' plus a final newline",
    buildTree: tree(build),
  },
  host: {
    cpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    loadAverageAtCollection: fs.readFileSync("/proc/loadavg", "utf8").trim(),
    kernel: os.release(),
    node: process.version,
  },
};
fs.writeFileSync(out, JSON.stringify(identity, null, 2) + "\n");
console.log(JSON.stringify(identity, null, 2));
