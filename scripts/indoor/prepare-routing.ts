import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
const { resolve, dirname } = path;
import { performance } from "node:perf_hooks";
import {
  readIndoorProject,
  exportPreparedRoutingProject,
} from "../../app/indoor-project/package";
import { prepareRouting } from "../../app/indoor-project/prepare-routing";
const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output))
  throw new Error(
    "Usage: tsx scripts/indoor/prepare-routing.ts input.zip output.zip (distinct paths)",
  );
const project = await readIndoorProject(await readFile(input));
const original = JSON.stringify(project.dataset),
  started = performance.now();
let notified = 0;
const prepared = await prepareRouting(project.dataset, {
  progress: (completed, total, compiled) => {
    const now = performance.now();
    if (now - notified > 10_000 || completed === total) {
      console.log(
        `Prepared ${completed}/${total} walking edges (${compiled} compiled).`,
      );
      notified = now;
    }
  },
});
if (JSON.stringify(project.dataset) !== original)
  throw new Error("Routing preparation modified source geometry or reviews.");
const bytes = await exportPreparedRoutingProject(project, prepared.dataset);
const restored = await readIndoorProject(bytes);
if (JSON.stringify(restored.dataset) !== JSON.stringify(prepared.dataset))
  throw new Error("Prepared routing changed during ZIP round-trip.");
for (const [name, originalBytes] of Object.entries(project.files)) {
  if (["manifest.json", "viewer/indoor.json"].includes(name)) continue;
  const saved = restored.files[name];
  if (
    !saved ||
    saved.length !== originalBytes.length ||
    saved.some((v, i) => v !== originalBytes[i])
  )
    throw new Error(`Source asset changed: ${name}`);
}
await mkdir(dirname(resolve(output)), { recursive: true });
const temporary = resolve(output) + `.${process.pid}.tmp`;
await writeFile(temporary, bytes);
await rename(temporary, resolve(output));
const report = {
  ...prepared.report,
  input: resolve(input),
  output: resolve(output),
  preparationSeconds: (performance.now() - started) / 1000,
  archiveBytes: bytes.length,
  sourceAssetsUnchanged: true,
  source: restored.dataset.source,
};
await writeFile(
  resolve(output) + ".routing-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
