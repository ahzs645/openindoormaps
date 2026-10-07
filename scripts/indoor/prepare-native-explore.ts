import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import assert from "node:assert/strict";
import {
  readIndoorProject,
  exportIndoorProject,
} from "../../app/indoor-project/package";
import { validatePublishedNativeExploreMapping } from "../../app/indoor-project/native-explore-mapping";
const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output))
  throw new Error(
    "Usage: node --import tsx scripts/indoor/prepare-native-explore.ts input.master.zip output.master.zip (distinct paths)",
  );
const project = await readIndoorProject(await readFile(input));
const bytes = await exportIndoorProject(project);
const restored = await readIndoorProject(bytes);
await validatePublishedNativeExploreMapping(restored.dataset);
assert.deepEqual(restored.dataset.nodes, project.dataset.nodes);
assert.deepEqual(restored.dataset.edges, project.dataset.edges);
assert.deepEqual(restored.dataset.records, project.dataset.records);
assert.deepEqual(restored.dataset.doors, project.dataset.doors);
for (const [name, source] of Object.entries(project.files))
  if (/^(model|gis)\//.test(name))
    assert.deepEqual(restored.files[name], source);
await mkdir(dirname(resolve(output)), { recursive: true });
const staged = resolve(output) + `.${process.pid}.tmp`;
await writeFile(staged, bytes);
await rename(staged, resolve(output));
console.log(
  JSON.stringify(
    {
      output: resolve(output),
      nativeLevels: restored.dataset.nativeExploreMapping?.levels.map((l) => ({
        id: l.levelId,
        regions: l.regions.length,
        precomputed: l.regions.every((r) => !!r.displayPartsFeet),
      })),
      geometryAndRoutingUnchanged: true,
    },
    null,
    2,
  ),
);
