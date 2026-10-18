/** Refuse a publication that would silently repeat full map validation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { tryReadPublishedProject } from "../../app/indoor-project/published-project";
import { publishedScopeFor } from "../../app/indoor-project/published-project-scope";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import {
  validateProgressiveManifest,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { publishedDefaultScopeCoverage } from "./published-default-scope-coverage";
const [root, output] = process.argv.slice(2);
assert(
  root && output,
  "Usage: check-published-project.ts PUBLIC_ROOT NEW_REPORT.json",
);
const started = performance.now();
const hash = (b: Uint8Array | string) =>
  createHash("sha256").update(b).digest("hex");
assert.equal(
  preparedDisplayEngineBinding(
    fileURLToPath(new URL("../../", import.meta.url)),
  ).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
  "Rebuild stale preparation bindings before publication",
);
const hosted = JSON.parse(
  await readFile(path.join(root, "data/unbc-full/project.json"), "utf8"),
) as {
  sha256: string;
  bytes: number;
  parts: { path: string; sha256: string; bytes: number }[];
};
const buffers = [];
for (const part of hosted.parts) {
  assert.match(part.path, /^parts\/[a-f0-9]{64}\.bin$/);
  assert(part.bytes > 0 && part.bytes <= 25 * 1024 * 1024);
  const b = await readFile(path.join(root, "data/unbc-full", part.path));
  assert.equal(b.length, part.bytes);
  assert.equal(hash(b), part.sha256);
  buffers.push(b);
}
const bytes = new Uint8Array(Buffer.concat(buffers));
assert.equal(bytes.length, hosted.bytes);
assert.equal(hash(bytes), hosted.sha256);
const stages: string[] = [];
const admitted = await tryReadPublishedProject(bytes, (p) =>
  stages.push(p.stage),
);
assert(
  admitted?.receipt,
  "No current compiled map receipt: visitors would repeat full validation",
);
const manifest = JSON.parse(
  await readFile(path.join(root, "data/unbc/manifest.json"), "utf8"),
) as ProgressiveManifest;
validateProgressiveManifest(manifest);
assert.equal(
  admitted.receipt.progressiveRevisionSha256,
  manifest.revisionSha256,
);
assert.equal(admitted.receipt.packageSha256, manifest.provenance.packageSha256);
const data = editorVisitorDataset(admitted.project);
assert.equal(hash(JSON.stringify(data)), manifest.provenance.datasetSha256);
const scopes = manifest.scopes.map((scope) => {
  const selected = publishedScopeFor(manifest, {
    data,
    levelIds: scope.levelIds,
    building: "all",
    relativeHeights: false,
    showPillars: true,
    showPassThroughPlaces: false,
    showVestibuleDoors: false,
    showStructures: false,
    showDoorwayRecesses: false,
    review: false,
    simplifyGeometry: false,
  });
  assert.equal(
    selected?.id,
    scope.id,
    "Default full-viewer options would repeat native floor preparation",
  );
  return { label: scope.label, levelIds: scope.levelIds, ready: true };
});
const pageScopes = publishedDefaultScopeCoverage(data, manifest);
assert(pageScopes.length > 0, "No visitor floor choices were checked");
for (const request of pageScopes)
  assert(
    request.scopeId,
    `Actual visitor floor choice would repeat native preparation: ${request.label} [${request.levelIds.join(", ")}]`,
  );
assert(
  !stages.some((stage) =>
    ["geometry", "materials", "routes", "mapping"].includes(stage),
  ),
);
const report = {
  format: "published-project-startup-check-v1",
  packageSha256: hosted.sha256,
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  datasetSha256: manifest.provenance.datasetSha256,
  progressiveRevisionSha256: manifest.revisionSha256,
  compiledMapAdmissionPassed: true,
  fullNormalImportRepeated: false,
  allDefaultPreparedScopesMatched: true,
  scopes,
  pageScopes,
  stages,
  elapsedMs: performance.now() - started,
  routeAuthorityChanged: false,
  nodeMemory: process.memoryUsage(),
  nodePeakRssBytes: process.resourceUsage().maxRSS * 1024,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(report));
