/** QA preparation of one existing display scope. This creates display data,
 * never a routing receipt or publication approval. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { deriveNativeExplore } from "../../app/indoor-project/native-explore";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
import { floorWorkerPreparationOptions } from "../../app/indoor-project/prepared-floor-cache";
import {
  encodePreparedDisplayAsset,
  preparedDisplayDatasetSha256,
} from "../../app/indoor-project/prepared-display-assets";
import { loadPreparedDisplayAsset } from "../../app/indoor-project/prepared-display-loader";
import { preparedDisplayOptions } from "../../app/indoor-project/prepared-display-registry";
import {
  preparedDisplayScopes,
  visitorDisplayDefaultOptions,
} from "../../app/indoor-project/prepared-display-preparation";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";

export function requireOneSupportedDisplayScope(
  data: IndoorDataset,
  levelIds: readonly number[],
): number[] {
  assert(levelIds.length && levelIds.every(Number.isSafeInteger));
  assert.equal(new Set(levelIds).size, levelIds.length, "Duplicate selected native levels");
  const key = JSON.stringify(levelIds),
    scope = preparedDisplayScopes(data).scopes.find((ids) => JSON.stringify(ids) === key);
  assert(scope, "Select exactly one existing prepared display scope; arbitrary level assemblies are forbidden");
  return [...scope];
}

/** Caller supplies a dataset from the original importer. The exact ordinary
 * generator, codec and source-aware decoder replay are unchanged. */
export async function prepareOneSelectedDisplayScope(
  data: IndoorDataset,
  selectedLevelIds: readonly number[],
  directory: string,
) {
  const levelIds = requireOneSupportedDisplayScope(data, selectedLevelIds),
    datasetSha256 = preparedDisplayDatasetSha256(data),
    before = process.memoryUsage(),
    started = performance.now();
  await fs.mkdir(directory, { recursive: false });
  await fs.mkdir(path.join(directory, "chunks"));
  const nativeFaces = await deriveNativeExplore(data, levelIds, "all"),
    preparedFloor = prepareFloor(data, levelIds, "all", {
      ...floorWorkerPreparationOptions(data, visitorDisplayDefaultOptions),
      nativeFaces,
    }),
    payload = { nativeFaces, preparedFloor },
    binding = {
      version: 1 as const,
      datasetSha256,
      enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      levelIds,
      building: "all",
      windowMode: data.windowDisplay?.mode ?? "none",
      options: preparedDisplayOptions(data, visitorDisplayDefaultOptions),
    },
    encoded = encodePreparedDisplayAsset(payload, binding),
    replay = await loadPreparedDisplayAsset(data, levelIds, "all", {
      descriptor: encoded.descriptor,
      blobs: Object.fromEntries(encoded.blobs),
    }, visitorDisplayDefaultOptions);
  assert(replay, "Selected floor failed ordinary source-aware decoder replay");
  assert.equal(preparedDisplayDatasetSha256(replay), preparedDisplayDatasetSha256(payload));
  assert.equal(preparedDisplayDatasetSha256(data), datasetSha256, "Selected display generation changed its source dataset");
  const writeJson = async (name: string, value: unknown) => {
    const bytes = JSON.stringify(value, null, 2) + "\n";
    await fs.writeFile(path.join(directory, name), bytes, { flag: "wx" });
    return createHash("sha256").update(bytes).digest("hex");
  };
  const descriptorSha256 = await writeJson("descriptor.json", encoded.descriptor),
    bindingSha256 = await writeJson("binding.json", binding);
  for (const [sha, bytes] of encoded.blobs) await fs.writeFile(
    path.join(directory, "chunks", sha + ".bin"), bytes, { flag: "wx" });
  const report = {
    format: "openindoormaps-selected-display-qa-preparation-v1",
    datasetSha256, enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    levelIds, scopesPrepared: 1, building: "all", exactOriginalDecoderReplayPassed: true,
    sourceDatasetUnchanged: true, routeApprovalGranted: false,
    descriptorPath: path.resolve(directory, "descriptor.json"), descriptorSha256,
    bindingPath: path.resolve(directory, "binding.json"), bindingSha256,
    chunksDirectory: path.resolve(directory, "chunks"),
    logicalBytes: encoded.descriptor.logicalJsonBytes,
    pooledBytes: encoded.descriptor.pooledJsonBytes,
    storedBytes: [...encoded.blobs.values()].reduce((n, b) => n + b.length, 0),
    elapsedMs: Math.round(performance.now() - started), before, after: process.memoryUsage(),
  };
  await writeJson("preparation-report.json", report);
  return report;
}
