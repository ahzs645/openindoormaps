import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { unzipSync } from "fflate";
import { readProgressiveRoutingParts } from "../../app/indoor-project/progressive-routing-parts";
import ts from "typescript";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { PreparedFloor } from "../../app/indoor-project/prepared-floor";
import {
  decodeProgressiveFloor,
  progressiveManifestRevision,
  progressiveSha256,
  validateProgressiveManifest,
  verifyProgressiveAssetBytes,
  type ProgressiveAsset,
  type ProgressiveManifest,
  type ProgressiveOverview,
} from "../../app/indoor-project/progressive-delivery";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import {
  progressiveRepresentations,
  verifyProgressiveDeliveryDirectory,
  writeProgressiveOfflineArchive,
} from "./export-progressive-viewer";

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const sha = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
const algorithmId = "prepared-exact-native-exclusion-overview-v1";
export type DisplayProjectionProvenance = {
  version: 1;
  algorithmId: string;
  algorithmSha256: string;
  fromRevisionSha256: string;
  proofSha256: string;
  scopeInputs: Record<string, string>;
};
export type ProjectedProgressiveManifest = ProgressiveManifest & {
  displayProjection: DisplayProjectionProvenance;
};

/** This auxiliary stage changes overview roots only. Prepared source/engine
 * descriptors, routing, contexts and search are copied verbatim. */
export function revisedOverviewManifest(
  base: ProgressiveManifest,
  replacements: Record<string, ProgressiveAsset>,
  projection: DisplayProjectionProvenance,
): ProjectedProgressiveManifest {
  validateProgressiveManifest(base);
  if (
    Object.hasOwn(base, "displayProjection") ||
    projection.version !== 1 ||
    !/^[a-z0-9-]{1,120}$/.test(projection.algorithmId) ||
    !hashPattern.test(projection.algorithmSha256) ||
    !hashPattern.test(projection.proofSha256) ||
    projection.fromRevisionSha256 !== base.revisionSha256 ||
    Object.keys(replacements).length !== base.scopes.length ||
    Object.keys(projection.scopeInputs).length !== base.scopes.length
  )
    throw new Error("Invalid auxiliary display projection provenance.");
  const result = structuredClone(base) as ProjectedProgressiveManifest;
  result.assets = Object.fromEntries(
    Object.entries(result.assets).filter(
      ([, asset]) => asset.kind !== "overview",
    ),
  );
  for (const scope of result.scopes) {
    const asset = replacements[scope.id];
    if (
      !asset ||
      asset.kind !== "overview" ||
      asset.id === scope.overviewAssetId ||
      projection.scopeInputs[scope.id] !==
        base.assets[scope.overviewAssetId].logicalSha256
    )
      throw new Error("Auxiliary projection scope/input mismatch.");
    result.assets[asset.id] = structuredClone(asset);
    scope.overviewAssetId = asset.id;
  }
  result.displayProjection = structuredClone(projection);
  result.revisionSha256 = progressiveManifestRevision(result);
  validateProgressiveManifest(result);
  return result;
}

export function projectionCodeReceipt(projectRoot: string, helper: string) {
  const engine = preparedDisplayEngineBinding(projectRoot);
  const modules = new Map(engine.modules);
  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    const relative = path.relative(projectRoot, file).replaceAll("\\", "/");
    if (relative.startsWith("../") || path.isAbsolute(relative))
      throw new Error("Projection helper must be inside the project root.");
    const content = readFileSync(file);
    modules.set(relative, sha(content));
    for (const reference of ts.preProcessFile(content.toString(), true, true)
      .importedFiles) {
      if (!reference.fileName.startsWith(".")) continue;
      const base = path.resolve(path.dirname(file), reference.fileName);
      const target = [
        base,
        ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"].map(
          (extension) => base + extension,
        ),
      ].find(
        (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
      );
      if (!target) throw new Error(`Missing projection dependency ${base}`);
      visit(target);
    }
  };
  visit(helper);
  const body = {
    version: 1,
    entry: path.relative(projectRoot, helper).replaceAll("\\", "/"),
    frozenPreparationEngineSha256: engine.sha256,
    modules: [...modules].sort(([a], [b]) => a.localeCompare(b)),
  };
  return {
    ...body,
    sha256: progressiveSha256(
      bytes([algorithmId, body.modules, engine.sha256]),
    ),
  };
}

type FloorProjector = (
  data: IndoorDataset,
  prepared: Pick<PreparedFloor, "stairCutAreas">,
  expectedModelSha256: string,
  onProgress?: (floorId: number) => void,
) => {
  floor: FeatureCollection<MultiPolygon>;
  receipt: unknown;
};

export async function reprojectProgressiveOverviews(
  inputManifest: string,
  directory: string,
  sourcePackage: string,
  helper = fileURLToPath(
    new URL("strict-overview-floor-projection.ts", import.meta.url),
  ),
) {
  const started = performance.now();
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const sourceDirectory = path.dirname(path.resolve(inputManifest));
  try {
    await stat(directory);
    throw new Error("Projection requires a new candidate directory.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const originalManifestBytes = new Uint8Array(await readFile(inputManifest));
  const base: ProgressiveManifest = JSON.parse(
    new TextDecoder().decode(originalManifestBytes),
  );
  validateProgressiveManifest(base);
  if (base.provenance.publication !== "visitor")
    throw new Error(
      "Auxiliary projection requires a verified visitor inventory.",
    );
  const code = projectionCodeReceipt(projectRoot, path.resolve(helper));
  if (
    code.frozenPreparationEngineSha256 !==
    base.provenance.enginePreparationSha256
  )
    throw new Error("Frozen prepared engine changed before projection.");
  await verifyProgressiveDeliveryDirectory(sourceDirectory, base);
  let archive: Uint8Array | undefined = new Uint8Array(
    await readFile(sourcePackage),
  );
  if (progressiveSha256(archive) !== base.provenance.packageSha256)
    throw new Error("Projection source package checksum mismatch.");
  let indoor: Uint8Array | undefined = unzipSync(archive, {
    filter: (entry) => entry.name === "viewer/indoor.json",
  })["viewer/indoor.json"];
  archive = undefined;
  if (!indoor || progressiveSha256(indoor) !== base.provenance.datasetSha256)
    throw new Error(
      "Projection needs the exact normally validated dataset bytes.",
    );
  const data: IndoorDataset = JSON.parse(new TextDecoder().decode(indoor));
  indoor = undefined;
  if (!same(data.source, base.provenance.source))
    throw new Error("Projection source model/rooms mismatch.");
  const module = await import(pathToFileURL(path.resolve(helper)).href);
  const projectFloor = module.projectStrictOverviewFloor as FloorProjector;
  if (
    typeof projectFloor !== "function" ||
    module.STRICT_OVERVIEW_FLOOR_PROJECTION_VERSION !== algorithmId
  )
    throw new Error("Unknown auxiliary floor projection helper.");
  await mkdir(directory, { recursive: false });
  await mkdir(path.join(directory, "assets"));
  const proofDirectory = directory + ".projection-proof";
  await mkdir(proofDirectory, { recursive: false });
  const readLogical = async (id: string) => {
    const asset = base.assets[id];
    const representation = asset.representations.find(
      (r) => r.encoding === "gzip",
    )!;
    const stored = representation.parts
      ? await readProgressiveRoutingParts(
          representation,
          async (part) =>
            new Uint8Array(
              await readFile(path.join(sourceDirectory, part.path)),
            ),
        )
      : new Uint8Array(
          await readFile(path.join(sourceDirectory, representation.path)),
        );
    if (
      stored.length !== representation.bytes ||
      progressiveSha256(stored) !== representation.sha256
    )
      throw new Error("Original projection asset changed.");
    const logical = new Uint8Array(
      gunzipSync(stored, { maxOutputLength: asset.logicalBytes }),
    );
    verifyProgressiveAssetBytes(asset, logical);
    return logical;
  };
  for (const asset of Object.values(base.assets).filter(
    (a) => a.kind !== "overview",
  ))
    for (const representation of asset.representations)
      for (const file of representation.parts ?? [representation])
        await copyFile(
          path.join(sourceDirectory, file.path),
          path.join(directory, file.path),
        );
  const replacements: Record<string, ProgressiveAsset> = {};
  const scopeInputs: Record<string, string> = {};
  const receipts: unknown[] = [];
  for (const [index, scope] of base.scopes.entries()) {
    console.log(
      JSON.stringify({
        stage: "projection-scope-start",
        levelIds: scope.levelIds,
      }),
    );
    let payload = await decodeProgressiveFloor(base, scope, readLogical);
    const original: ProgressiveOverview = JSON.parse(
      new TextDecoder().decode(await readLogical(scope.overviewAssetId)),
    );
    if (
      original.version !== 1 ||
      original.format !== "openindoormaps-visitor-overview-v1" ||
      !same(original.binding, scope.display.descriptor.binding)
    )
      throw new Error("Original overview scope binding mismatch.");
    const result = projectFloor(
      data,
      { stairCutAreas: payload.preparedFloor.stairCutAreas },
      data.source.modelSha256,
      (floorId) =>
        console.log(JSON.stringify({ stage: "projection-floor", floorId })),
    );
    const inputOverviewSha256 =
      base.assets[scope.overviewAssetId].logicalSha256;
    scopeInputs[scope.id] = inputOverviewSha256;
    const next = {
      ...original,
      floor: result.floor,
      displayProjection: {
        version: 1,
        algorithmId,
        algorithmSha256: code.sha256,
        fromRevisionSha256: base.revisionSha256,
        inputOverviewSha256,
      },
    };
    const raw = bytes(next);
    const logicalSha256 = progressiveSha256(raw);
    const representations: ProgressiveAsset["representations"] = [];
    for (const representation of progressiveRepresentations(
      raw,
      "application/json",
      base.assets[scope.overviewAssetId].representations.some(
        (r) => r.encoding === "identity",
      ),
      base.assets[scope.overviewAssetId].representations.some(
        (r) => r.encoding === "br",
      ),
    )) {
      const hash = progressiveSha256(representation.bytes);
      const file = `assets/${hash}.${representation.extension}`;
      await writeFile(path.join(directory, file), representation.bytes, {
        flag: "wx",
      });
      representations.push({
        encoding: representation.encoding,
        path: file,
        sha256: hash,
        bytes: representation.bytes.length,
      });
    }
    replacements[scope.id] = {
      id: `overview:${logicalSha256}`,
      kind: "overview",
      logicalSha256,
      logicalBytes: raw.length,
      mediaType: "application/json",
      dependencies: [],
      representations,
    };
    const receiptBytes = bytes(result.receipt);
    const receiptFile = `scope-${index + 1}.json`;
    await writeFile(path.join(proofDirectory, receiptFile), receiptBytes, {
      flag: "wx",
    });
    receipts.push({
      scopeId: scope.id,
      levelIds: scope.levelIds,
      inputOverviewSha256,
      outputOverviewSha256: logicalSha256,
      receiptFile,
      receiptSha256: progressiveSha256(receiptBytes),
      receiptBytes: receiptBytes.length,
    });
    payload = undefined!;
    (globalThis as { gc?: () => void }).gc?.();
    console.log(
      JSON.stringify({
        stage: "projection-scope-complete",
        levelIds: scope.levelIds,
      }),
    );
  }
  if (
    preparedDisplayDatasetSha256(data) !== base.provenance.datasetSha256 ||
    projectionCodeReceipt(projectRoot, path.resolve(helper)).sha256 !==
      code.sha256 ||
    !same(
      new Uint8Array(await readFile(inputManifest)),
      originalManifestBytes,
    ) ||
    progressiveSha256(new Uint8Array(await readFile(sourcePackage))) !==
      base.provenance.packageSha256
  )
    throw new Error("Projection mutated or changed its source/code snapshot.");
  const proof = {
    version: 1,
    algorithmId,
    code,
    inputManifestRevisionSha256: base.revisionSha256,
    sourcePackageSha256: base.provenance.packageSha256,
    sourceDatasetSha256: base.provenance.datasetSha256,
    sourceUnchanged: true,
    preparedDescriptorsAndChunksUnchanged: true,
    routingAndContextAndSearchUnchanged: true,
    scopes: receipts,
  };
  const proofBytes = bytes(proof);
  await writeFile(path.join(proofDirectory, "receipt.json"), proofBytes, {
    flag: "wx",
  });
  const manifest = revisedOverviewManifest(base, replacements, {
    version: 1,
    algorithmId,
    algorithmSha256: code.sha256,
    fromRevisionSha256: base.revisionSha256,
    proofSha256: progressiveSha256(proofBytes),
    scopeInputs,
  });
  const verification = await verifyProgressiveDeliveryDirectory(
    directory,
    manifest,
  );
  const manifestBytes = new TextEncoder().encode(
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await writeFile(path.join(directory, "manifest.json"), manifestBytes, {
    flag: "wx",
  });
  if (manifest.unavailableScopes.length === 0)
    await writeProgressiveOfflineArchive(directory, manifest);
  const total = (
    encoding: "gzip" | "br",
    ids = Object.keys(manifest.assets),
  ) => {
    const representations = [...new Set(ids)].map((id) =>
      manifest.assets[id].representations.find((r) => r.encoding === encoding),
    );
    return representations.some((r) => !r)
      ? null
      : representations.reduce((sum, r) => sum + r!.bytes, 0);
  };
  const withManifest = (value: number | null) =>
    value === null ? null : manifestBytes.length + value;
  const initial = [
    manifest.shellAssetId,
    manifest.assets[manifest.scopes[0].overviewAssetId].id,
  ];
  const report = {
    complete: manifest.unavailableScopes.length === 0,
    scopes: manifest.scopes.length,
    unavailableScopes: manifest.unavailableScopes,
    auxiliaryProjectionOnly: true,
    originalManifestRevisionSha256: base.revisionSha256,
    manifestRevisionSha256: manifest.revisionSha256,
    enginePreparationSha256: base.provenance.enginePreparationSha256,
    sourceDatasetSha256: base.provenance.datasetSha256,
    sourcePackageSha256: base.provenance.packageSha256,
    proofDirectory,
    projection: manifest.displayProjection,
    verification,
    manifestBytes: manifestBytes.length,
    firstViewGzipBytes: withManifest(total("gzip", initial)),
    firstViewBrotliBytes: withManifest(total("br", initial)),
    totalGzipBytes: withManifest(total("gzip")),
    totalBrotliBytes: withManifest(total("br")),
    allRepresentationsStorageBytes:
      manifestBytes.length + verification.storedBytes,
    elapsedMs: performance.now() - started,
    exporterPeakRssBytes: process.resourceUsage().maxRSS * 1024,
  };
  await writeFile(
    path.join(directory, "projection-report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify({ stage: "projection-complete", ...report }));
  return { manifest, report };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [inputManifest, directory, sourcePackage, helper] =
    process.argv.slice(2);
  if (!inputManifest || !directory || !sourcePackage)
    throw new Error(
      "Usage: node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/reproject-progressive-overviews.ts INPUT_MANIFEST NEW_DIRECTORY SOURCE_VIEWER_ZIP [PROJECTION_HELPER]",
    );
  await reprojectProgressiveOverviews(
    inputManifest,
    directory,
    sourcePackage,
    helper,
  );
}
