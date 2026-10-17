import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { prepareSharedCorridorRouting } from "../../app/indoor-project/prepare-corridor-routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";

const [input, output, ...args] = process.argv.slice(2);
if (
  !input ||
  !output ||
  args.some((s, i) => i % 2 === 0 && s !== "--cell") ||
  args.length % 2
)
  throw new Error(
    "Usage: compile-corridor-candidates.ts visitor.zip empty-output-directory [--cell cell-id]...",
  );
const existing = await readdir(output).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== "ENOENT") throw error;
  return [];
});
if (existing.length > 0)
  throw new Error("Use an empty candidate output directory");
await mkdir(path.join(output, "cells"), { recursive: true });
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const root = path.resolve(import.meta.dirname, "../..");
const codeFiles = (
  await readdir(path.join(root, "app/indoor-project"), { recursive: true })
)
  .filter((p) => p.endsWith(".ts"))
  .sort();
const codeEntries = await Promise.all(
  codeFiles.map(async (p) => [
    p,
    sha(await readFile(path.join(root, "app/indoor-project", p))),
  ]),
);
const compilerBinding = sha(
  JSON.stringify([
    codeEntries,
    sha(await readFile(path.join(root, "package-lock.json"))),
    process.version,
  ]),
);
const bytes = await readFile(input),
  files = unzipSync(bytes);
const manifest = JSON.parse(strFromU8(files["manifest.json"]));
for (const descriptor of [
  manifest.indoor,
  manifest.floors,
  manifest.georeference,
]) {
  const b = files[descriptor?.path];
  if (!b || b.length !== descriptor.bytes || sha(b) !== descriptor.sha256)
    throw new Error("Package member does not match its manifest");
}
const data = JSON.parse(
  strFromU8(files[manifest.indoor.path]),
) as IndoorDataset;
if (data.source.modelSha256 !== manifest.model.sha256)
  throw new Error("Model identities disagree");
const sourceSnapshot = sha(JSON.stringify(data));
const binding = {
  inputZipSha256: sha(bytes),
  inputJsonSha256: sha(files[manifest.indoor.path]),
  sourceModelSha256: data.source.modelSha256,
  compilerBinding,
  nodeVersion: process.version,
};
await writeFile(
  path.join(output, "binding.json"),
  JSON.stringify(
    {
      ...binding,
      status: "candidate-guides-only",
      fullPackageImportPerformed: false,
      sourceCodeFiles: codeEntries,
    },
    null,
    2,
  ),
);
await initializeNativeExactGeosOverlay();
const started = performance.now();
const checkpointWrites: Promise<void>[] = [];
const result = await prepareSharedCorridorRouting(data, {
  cellIds:
    args.length > 0 ? new Set(args.filter((_s, i) => i % 2 === 1)) : undefined,
  cellCompleted: (cell, guides) => {
    const destination = path.join(
      output,
      "cells",
      sha(cell.cellId).slice(0, 16) + ".json",
    );
    // Per-cell candidates are durable diagnostics, not restored validation
    // authority. This command never resumes them under a different binding.
    checkpointWrites.push(
      writeFile(destination, JSON.stringify({ binding, cell, guides })),
    );
    console.log(
      JSON.stringify({
        cell: cell.cellId,
        elevationFeet: cell.elevationFeet,
        compiled: cell.compiledEdges,
        total: cell.eligibleEdges,
        seconds: cell.seconds,
      }),
    );
  },
});
await Promise.all(checkpointWrites);
if (sha(JSON.stringify(data)) !== sourceSnapshot)
  throw new Error("Compiler modified the original dataset");
await writeFile(
  path.join(output, "prepared-routing.json"),
  JSON.stringify(result.prepared),
);
await writeFile(
  path.join(output, "report.json"),
  JSON.stringify(
    {
      ...result.report,
      binding,
      seconds: (performance.now() - started) / 1000,
      sourceGraphAndGeometryUnchanged: true,
      fullPackageImportPerformed: false,
      actualNavigationAcceptancePerformed: false,
    },
    null,
    2,
  ),
);
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const cellIds = new Set(result.report.cells.map((c) => c.cellId));
await writeFile(
  path.join(output, "preview.json"),
  JSON.stringify({
    status: "source-geometry-preview-only",
    floors: data.floors,
    records: data.records.map(
      ({
        key,
        number,
        name,
        levelId,
        ringsFeet,
        circulation,
        access,
        walkable,
      }) => ({
        key,
        number,
        name,
        levelId,
        ringsFeet,
        circulation,
        access,
        walkable,
      }),
    ),
    cells: data.circulationGeometry?.cells
      .filter((c) => cellIds.has(c.id))
      .map(({ id, levelIds, elevationFeet, ringsFeet }) => ({
        id,
        levelIds,
        elevationFeet,
        ringsFeet,
      })),
    guides: result.prepared.guides.map((g) => ({
      ...g,
      levelId: nodes.get(data.edges.find((e) => e.id === g.edgeId)!.from)!
        .levelId,
    })),
  }),
);
console.log(
  JSON.stringify({
    complete: true,
    compiled: result.prepared.guides.length,
    seconds: (performance.now() - started) / 1000,
    floors: result.report.floors,
  }),
);
