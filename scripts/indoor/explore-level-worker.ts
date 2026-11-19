import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deserialize, serialize } from "node:v8";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { compileNativeExploreLevel } from "../../app/indoor-project/native-explore-mapping";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";

const directory = process.argv[2]!;
await initializeNativeExactGeosOverlay();
const dataset: IndoorDataset = deserialize(
  await readFile(join(directory, "dataset")),
);
for (let index = 0; index < dataset.nativeLevels.length; index++) {
  // The first available worker takes the next level. A failed worker causes
  // the whole export to fail, so its claim is never mistaken for a result.
  try {
    await mkdir(join(directory, `claim-${index}`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
    throw error;
  }
  process.send?.(index);
  const level = await compileNativeExploreLevel(
    dataset,
    dataset.nativeLevels[index]!,
  );
  await writeFile(join(directory, String(index)), serialize(level), {
    flag: "wx",
  });
}
