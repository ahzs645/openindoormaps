/** Compile a progressive-floor admission receipt for one exact publication.
 *
 * Gate 4 producer. A receipt is written ONLY after, in this process and under
 * the unchanged prepared-display engine:
 *  1. the exact source package passes the ordinary full normal importer
 *     (`readIndoorProject`: checksums, geometry, materials, routes, mapping,
 *     reviews, patches and identity stages);
 *  2. for an authoring (reviter-project) package, its visitor projection is
 *     exported exactly as `export-progressive-viewer.ts --visitor` does and
 *     passes the same full normal importer;
 *  3. that visitor dataset, its source identity and its routing projection
 *     reproduce the progressive manifest's provenance and routing asset;
 *  4. every stored progressive representation passes the exporter's own
 *     delivery verification;
 *  5. every floor scope decodes through the established decoder
 *     (`decodeStoredProgressiveFloor`, all chunk/pooled/logical checks), and the
 *     admitted in-place decoder (`decodePublishedProgressiveFloor`) reproduces
 *     the same logical checksum for every scope.
 * The receipt binds the package bytes and ZIP entries, dataset, source,
 * engine, manifest revision and the SHA-256 of the report written here.
 * It carries `admission: "progressive-floors"`: it admits that revision's
 * floors only, never a package fast import (`tryReadPublishedProject`).
 *
 *   node --max-old-space-size=8192 --expose-gc --import tsx \
 *     scripts/indoor/admit-published-project.ts SOURCE.zip PROGRESSIVE-DIR \
 *     EXPECTED-MANIFEST-FILE-SHA256 NEW-REPORT.json [--write]
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import {
  exportCampusViewer,
  readIndoorProject,
  type IndoorProject,
} from "../../app/indoor-project/package";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import {
  validateProgressiveManifest,
  type ProgressiveAsset,
  type ProgressiveManifest,
} from "../../app/indoor-project/progressive-delivery";
import { decodeStoredProgressiveFloor } from "../../app/indoor-project/progressive-stored-floor";
import { decodePublishedProgressiveFloor } from "../../app/indoor-project/published-floor-decoder";
import { PUBLISHED_PROJECT_RECEIPTS } from "../../app/indoor-project/published-project-receipts";
import type { PublishedProjectReceipt } from "../../app/indoor-project/published-project";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { verifyProgressiveDeliveryDirectory } from "./export-progressive-viewer";

const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const gc = () => (globalThis as { gc?: () => void }).gc?.();
/** Stages the ordinary importer reports only when it ran full validation. */
export const FULL_NORMAL_IMPORT_STAGES = [
  "checksums",
  "decode",
  "geometry",
  "materials",
  "routes",
  "mapping",
  "identity",
  "transfer",
] as const;

export function assertFullNormalImport(stages: readonly string[]) {
  for (const stage of FULL_NORMAL_IMPORT_STAGES)
    assert(
      stages.includes(stage),
      `Normal import did not report its ${stage} stage`,
    );
}

/** Render the compiled trust root. Existing receipts are kept byte-for-byte;
 * only a receipt with the same id is replaced. */
export function publishedProjectReceiptsSource(
  current: string,
  receipt: PublishedProjectReceipt,
) {
  assert.equal(receipt.admission, "progressive-floors");
  const literal = JSON.stringify(receipt, null, 2)
    .split("\n")
    .map((line) => "    " + line)
    .join("\n");
  // Before or after prettier: keys may be quoted or bare.
  assert.match(receipt.id, /^[a-z\d-]+$/);
  const marker = new RegExp(String.raw`\n {6}"?id"?: "${receipt.id}",\n`);
  let source = current;
  const at = source.search(marker);
  if (at !== -1) {
    // Replace the earlier generated literal for this id (between its "{" and
    // the next "    }," that closes a top-level receipt).
    const begin = source.lastIndexOf("    {\n", at);
    const end = source.indexOf("\n    },\n", at);
    assert(begin !== -1 && end > at, "Cannot locate the earlier receipt");
    source = source.slice(0, begin) + source.slice(end + "\n    },\n".length);
  }
  const close = source.lastIndexOf("  ]);");
  assert(close > 0, "Unexpected published-project-receipts.ts layout");
  return source.slice(0, close) + literal + ",\n" + source.slice(close);
}

async function normalImport(
  bytes: Uint8Array,
  phase: string,
): Promise<{
  project: IndoorProject;
  record: {
    phase: string;
    packageSha256: string;
    packageBytes: number;
    stages: { stage: string; elapsedMs: number }[];
    elapsedMs: number;
  };
}> {
  const started = performance.now();
  const stages: { stage: string; elapsedMs: number }[] = [];
  const packageSha256 = sha(bytes),
    packageBytes = bytes.length;
  const project = await readIndoorProject(bytes, (event) => {
    stages.push({ stage: event.stage, elapsedMs: event.elapsedMs });
    console.log(JSON.stringify({ phase, ...event }));
  });
  assertFullNormalImport(stages.map((s) => s.stage));
  return {
    project,
    record: {
      phase,
      packageSha256,
      packageBytes,
      stages,
      elapsedMs: performance.now() - started,
    },
  };
}

export async function admitPublishedProject(
  sourcePackage: string,
  progressiveDirectory: string,
  expectedManifestSha256: string,
) {
  const began = performance.now();
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const engine = preparedDisplayEngineBinding(root);
  assert.equal(
    engine.sha256,
    PREPARED_DISPLAY_ENGINE_SHA256,
    "Preparation engine binding is stale; the engine must be unchanged",
  );
  const directory = path.resolve(progressiveDirectory);
  const manifestBytes = await readFile(path.join(directory, "manifest.json"));
  assert.equal(sha(manifestBytes), expectedManifestSha256);
  const manifest = JSON.parse(manifestBytes.toString()) as ProgressiveManifest;
  validateProgressiveManifest(manifest);
  assert.equal(
    manifest.provenance.enginePreparationSha256,
    PREPARED_DISPLAY_ENGINE_SHA256,
  );
  assert.equal(
    manifest.unavailableScopes.length,
    0,
    "Every complete floor scope must be present",
  );

  // 1. Exact package and its ZIP inventory.
  let packageBytes: Uint8Array | undefined = new Uint8Array(
    await readFile(sourcePackage),
  );
  const packageSha256 = sha(packageBytes),
    packageLength = packageBytes.length;
  assert.equal(
    packageSha256,
    manifest.provenance.packageSha256,
    "The progressive revision was not exported from this package",
  );
  const entries: PublishedProjectReceipt["entries"] = {};
  for (const [name, value] of Object.entries(unzipSync(packageBytes)))
    entries[name] = { bytes: value.length, sha256: sha(value) };
  gc();

  // 2. Full normal import(s), exactly as the progressive exporter performed.
  await initializeNativeExactGeosOverlay();
  const imports = [];
  let imported = await normalImport(packageBytes, "source-import");
  packageBytes = undefined;
  imports.push(imported.record);
  const sourceFormat = imported.project.manifest.format;
  let visitorPackage: { sha256: string; bytes: number } | undefined;
  if (imported.project.manifest.format === "reviter-project") {
    let visitor: Uint8Array | undefined = await exportCampusViewer(
      imported.project,
      { preparedDisplay: false },
    );
    visitorPackage = { sha256: sha(visitor), bytes: visitor.length };
    imported = undefined!;
    gc();
    imported = await normalImport(visitor, "visitor-import");
    visitor = undefined;
    imports.push(imported.record);
    assert.equal(imported.project.manifest.format, "openindoormaps-viewer");
  } else
    assert.equal(
      sourceFormat,
      "openindoormaps-viewer",
      "Unsupported source package format",
    );
  let data: ReturnType<typeof editorVisitorDataset> | undefined =
    editorVisitorDataset(imported.project);
  imported = undefined!;
  const datasetSha256 = preparedDisplayDatasetSha256(data);
  assert.equal(
    datasetSha256,
    manifest.provenance.datasetSha256,
    "The imported visitor dataset differs from the progressive provenance",
  );
  assert.equal(
    JSON.stringify(data.source),
    JSON.stringify(manifest.provenance.source),
  );
  const source = data.source;
  const routingProjectionSha256 = preparedDisplayDatasetSha256(
    routeWorkerDataset(data),
  );
  assert.equal(
    routingProjectionSha256,
    manifest.assets[manifest.routeAssetId]?.logicalSha256,
    "The routing projection differs from the published routing asset",
  );
  data = undefined;
  gc();

  // 3. Every stored representation (exporter's own verification).
  const delivery = await verifyProgressiveDeliveryDirectory(
    directory,
    manifest,
  );
  gc();

  // 4. Every scope through the established decoder, then the admitted decoder.
  const candidate: PublishedProjectReceipt = {
    id: `unbc-progressive-floors-${packageSha256}`,
    packageSha256,
    packageBytes: packageLength,
    validatorSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    datasetSha256,
    source,
    entries,
    progressiveRevisionSha256: manifest.revisionSha256,
    validationReportSha256: "0".repeat(64),
    validationElapsedMs: Math.round(
      imports.reduce((n, r) => n + r.elapsedMs, 0),
    ),
    admission: "progressive-floors",
  };
  const read = async (
    _asset: ProgressiveAsset,
    representation: ProgressiveAsset["representations"][number],
  ) => {
    const target = path.resolve(directory, representation.path);
    assert(target.startsWith(directory + path.sep));
    return new Uint8Array(await readFile(target));
  };
  const scopes = [];
  for (const scope of manifest.scopes) {
    const descriptor = scope.display.descriptor;
    assert.equal(descriptor.binding.datasetSha256, datasetSha256);
    assert.equal(
      descriptor.binding.enginePreparationSha256,
      PREPARED_DISPLAY_ENGINE_SHA256,
    );
    let started = performance.now();
    let ordinary: unknown = await decodeStoredProgressiveFloor(
      manifest,
      scope,
      read,
    );
    const ordinaryLogicalSha256 = preparedDisplayDatasetSha256(ordinary);
    const ordinaryMs = performance.now() - started;
    ordinary = undefined;
    gc();
    assert.equal(ordinaryLogicalSha256, descriptor.logicalJsonSha256);
    started = performance.now();
    let admitted: unknown = await decodePublishedProgressiveFloor(
      manifest,
      scope,
      read,
      [candidate],
    );
    const admittedMs = performance.now() - started;
    assert(admitted, "The admitted decoder refused its own candidate");
    const admittedLogicalSha256 = preparedDisplayDatasetSha256(admitted);
    admitted = undefined;
    gc();
    assert.equal(
      admittedLogicalSha256,
      ordinaryLogicalSha256,
      "The admitted in-place decoder must reproduce the established decoder",
    );
    const row = {
      scopeId: scope.id,
      label: scope.label,
      levelIds: scope.levelIds,
      bindingSha256: descriptor.bindingSha256,
      pooledJsonSha256: descriptor.pooledJsonSha256,
      logicalJsonSha256: descriptor.logicalJsonSha256,
      logicalJsonBytes: descriptor.logicalJsonBytes,
      establishedDecoderMs: Math.round(ordinaryMs),
      admittedDecoderMs: Math.round(admittedMs),
      establishedAndAdmittedLogicalEqual: true,
    };
    scopes.push(row);
    console.log(JSON.stringify({ stage: "scope-verified", ...row }));
  }

  // 5. Nothing changed underneath.
  assert.equal(preparedDisplayEngineBinding(root).sha256, engine.sha256);
  assert.equal(
    sha(await readFile(path.join(directory, "manifest.json"))),
    expectedManifestSha256,
  );
  assert.equal(
    sha(new Uint8Array(await readFile(sourcePackage))),
    packageSha256,
  );
  const report = {
    format: "published-project-floor-admission-v1",
    passed: true,
    admission: "progressive-floors",
    packageSha256,
    packageBytes: packageLength,
    sourceFormat,
    entries,
    visitorPackage,
    datasetSha256,
    source,
    engineSha256: engine.sha256,
    engineModules: engine.modules.length,
    engineSourceUnchanged: true,
    progressiveManifestFileSha256: expectedManifestSha256,
    progressiveRevisionSha256: manifest.revisionSha256,
    routingProjectionSha256,
    normalImports: imports,
    delivery,
    scopes,
    elapsedMs: Math.round(performance.now() - began),
    nodePeakRssBytes: process.resourceUsage().maxRSS * 1024,
  };
  return { report, candidate };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [input, directory, expected, output, ...flags] = process.argv.slice(2);
  if (
    !input ||
    !directory ||
    !/^[a-f0-9]{64}$/.test(expected ?? "") ||
    !output ||
    flags.some((f) => f !== "--write")
  )
    throw new Error(
      "Usage: admit-published-project.ts SOURCE.zip PROGRESSIVE-DIRECTORY EXPECTED-MANIFEST-FILE-SHA256 NEW-REPORT.json [--write]",
    );
  const { report, candidate } = await admitPublishedProject(
    input,
    directory,
    expected,
  );
  const reportBytes = JSON.stringify(report, null, 2) + "\n";
  await writeFile(output, reportBytes, { flag: "wx" });
  const receipt: PublishedProjectReceipt = {
    ...candidate,
    validationReportSha256: sha(reportBytes),
  };
  await writeFile(
    output.replace(/\.json$/, "") + ".receipt.json",
    JSON.stringify(receipt, null, 2) + "\n",
    { flag: "wx" },
  );
  if (flags.includes("--write")) {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const target = path.join(
      root,
      "app/indoor-project/published-project-receipts.ts",
    );
    const current = await readFile(target, "utf8");
    // Refuse to append to a trust root that changed since this run started.
    assert(
      PUBLISHED_PROJECT_RECEIPTS.every((r) => current.includes(r.id)),
      "published-project-receipts.ts changed during admission",
    );
    const prettier = await import("prettier");
    await writeFile(
      target,
      await prettier.format(publishedProjectReceiptsSource(current, receipt), {
        parser: "typescript",
      }),
    );
  }
  console.log(
    JSON.stringify({
      passed: true,
      receiptId: receipt.id,
      validationReportSha256: receipt.validationReportSha256,
      written: flags.includes("--write"),
    }),
  );
}
