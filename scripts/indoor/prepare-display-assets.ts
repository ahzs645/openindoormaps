import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  readIndoorProject,
  attachPreparedDisplayArchiveToPackage,
} from "../../app/indoor-project/package";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { preparedDisplayDatasetSha256 } from "../../app/indoor-project/prepared-display-assets";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { prepareDatasetDisplayAssets } from "../../app/indoor-project/prepared-display-preparation";
export {
  preparedDisplayScopes,
  visitorDisplayDefaultOptions,
} from "../../app/indoor-project/prepared-display-preparation";
export async function preparePackageDisplayAssets(
  input: Uint8Array,
  includeNativeLevels = false,
) {
  const project = await readIndoorProject(input),
    data = editorVisitorDataset(project);
  const { archive, datasetSha256, unavailableScopes, timings, defaultOptions } =
    await prepareDatasetDisplayAssets(data, {
      includeNativeLevels,
      onScope: (scope) =>
        console.log(
          JSON.stringify({ preparedDisplayScope: scope.levelIds, ...scope }),
        ),
    });
  const output = await attachPreparedDisplayArchiveToPackage(input, archive),
    restored = await readIndoorProject(output);
  for (const [name, bytes] of Object.entries(project.files)) {
    if (name === "manifest.json" || name.startsWith("viewer/display/"))
      continue;
    assert.deepEqual(
      restored.files[name],
      bytes,
      `Display assets changed source entry ${name}`,
    );
  }
  assert.equal(
    preparedDisplayDatasetSha256(restored.dataset),
    preparedDisplayDatasetSha256(project.dataset),
  );
  return {
    bytes: output,
    report: {
      enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      datasetSha256,
      defaultOptions,
      unavailableScopes,
      timings,
      compressedBytes: Object.values(archive.blobs).reduce(
        (n, b) => n + b.length,
        0,
      ),
      packageSha256: createHash("sha256").update(output).digest("hex"),
      sourceEntriesUnchanged: true,
      canonicalPromoted: false,
      routesRebuilt: false,
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [input, output, ...flags] = process.argv.slice(2);
  if (
    !input ||
    !output ||
    resolve(input) === resolve(output) ||
    flags.some((flag) => flag !== "--native-levels")
  )
    throw new Error(
      "Usage: node --expose-gc --import tsx scripts/indoor/prepare-display-assets.ts input.zip candidate.zip [--native-levels] (distinct, new paths)",
    );
  const result = await preparePackageDisplayAssets(
    new Uint8Array(await readFile(input)),
    flags.includes("--native-levels"),
  );
  await writeFile(output, result.bytes, { flag: "wx" });
  await writeFile(
    output + ".display-report.json",
    JSON.stringify(result.report, null, 2) + "\n",
    { flag: "wx" },
  );
}
