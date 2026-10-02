import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  readIndoorProject,
  exportIndoorProject,
} from "../../app/indoor-project/package";
import { combineProjectFloors } from "../../app/indoor-project/campus-floors";

const [input, output, name, ...floorIds] = process.argv.slice(2);
if (!input || !output || !name || floorIds.length < 2)
  throw new Error(
    'Usage: node --import tsx scripts/indoor/combine-floors.ts input.zip output.zip "Campus Floor 3" storey:400176 storey:1487353',
  );
const source = await readIndoorProject(new Uint8Array(await readFile(input)));
const next = combineProjectFloors(source, floorIds, name);
const bytes = await exportIndoorProject(next);
const restored = await readIndoorProject(bytes);
for (const key of Object.keys(source.dataset))
  if (key !== "floors" && key !== "source")
    assert.deepEqual(
      restored.dataset[key as keyof typeof source.dataset],
      source.dataset[key as keyof typeof source.dataset],
      key,
    );
for (const [path, content] of Object.entries(source.files))
  if (
    !["manifest.json", "floors/rooms.json", "viewer/indoor.json"].includes(path)
  )
    assert.deepEqual(restored.files[path], content, path);
assert.deepEqual(restored.rooms.campusStoreys, next.rooms.campusStoreys);
await writeFile(output, bytes);
console.log(
  JSON.stringify(
    {
      output,
      floors: restored.dataset.floors,
      nativeLevelsPreserved: true,
      geometryAndGraphPreserved: true,
    },
    null,
    2,
  ),
);
