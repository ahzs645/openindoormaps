/** Export native source inspection through the same network composition as
 * the production floor worker. This does not certify or publish directions. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import {
  installPreviewGuides,
  pathwayPreviewInventory,
  pathwayPreviewLevel,
} from "./lib/pathway-preview";

const [input, output, ...args] = process.argv.slice(2);
assert(
  input &&
    output &&
    (args.length === 0 ||
      (args.length === 2 && args[0] === "--guides" && args[1])),
  "Usage: export-pathway-preview.ts COMPLETE-SOURCE.json|MASTER.zip NEW-OUTPUT [--guides PREPARED-ROUTING.json]",
);
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.resolve(output),
  started = performance.now();
await mkdir(out, { recursive: false });
await mkdir(path.join(out, "data"));
const sha = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fileSha(filename: string) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest("hex");
}
const implementation = () =>
  preparedDisplayEngineBinding(
    root,
    ["scripts/indoor/export-pathway-preview.ts"],
    { namespace: "native-pathway-preview-v1" },
  );
const implementationBinding = implementation(),
  sourceFileSha256 = await fileSha(input);
let source: IndoorDataset;
const normalImport = path.extname(input).toLowerCase() === ".zip";
if (normalImport) {
  const [{ readIndoorProject }, { initializeNativeExactGeosOverlay }] =
    await Promise.all([
      import("../../app/indoor-project/package"),
      import("../../app/indoor-project/native-exact-geos-overlay"),
    ]);
  await initializeNativeExactGeosOverlay();
  const project = await readIndoorProject(await readFile(input), (progress) =>
    console.log(JSON.stringify({ phase: "normal-source-import", ...progress })),
  );
  assert.equal(
    project.manifest.format,
    "reviter-project",
    "Use the authoring master, not a visitor archive",
  );
  source = project.dataset;
} else source = JSON.parse(await readFile(input, "utf8")) as IndoorDataset;
assert.equal(source.format, "reviter-indoor");
assert.equal(source.version, 1);
for (const key of [
  "nativeLevels",
  "floors",
  "records",
  "nodes",
  "edges",
  "walls",
] as const)
  assert(Array.isArray(source[key]), `Complete source is missing ${key}`);
assert.equal(
  new Set(source.nativeLevels.map((level) => level.id)).size,
  source.nativeLevels.length,
  "Native levels must have unique identities",
);
const originalValueSha256 = sha(JSON.stringify(source));
let guideFileSha256: string | null = null;
let guides: PreparedRouting | undefined;
if (args[1]) {
  const bytes = await readFile(args[1]);
  guideFileSha256 = sha(bytes);
  guides = JSON.parse(bytes.toString()) as PreparedRouting;
}
const data = installPreviewGuides(source, guides);
const run = createImmutableRoutingSession(data);
const inventory = pathwayPreviewInventory(data);
const levels = [];
for (const level of data.nativeLevels) {
  const value = run(() => pathwayPreviewLevel(data, level.id));
  const file = `level-${level.id}.json`;
  const bytes = JSON.stringify(value);
  await writeFile(path.join(out, "data", file), bytes);
  levels.push({
    ...level,
    campusFloors: value.campusFloors,
    url: file,
    sha256: sha(bytes),
    bytes: Buffer.byteLength(bytes),
    ...value.summary,
  });
  console.log(
    JSON.stringify({
      phase: "level-export",
      levelId: level.id,
      summary: value.summary,
    }),
  );
}
const assets = [];
for (const filename of ["index.html", "preview.css", "preview.js"]) {
  const sourcePath = path.join(
    root,
    "scripts/indoor/pathway-preview",
    filename,
  );
  await copyFile(sourcePath, path.join(out, filename));
  const bytes = await readFile(sourcePath);
  assets.push({ file: filename, sha256: sha(bytes), bytes: bytes.length });
}
assert.equal(
  sha(JSON.stringify(source)),
  originalValueSha256,
  "Source mutated during preview export",
);
assert.equal(
  await fileSha(input),
  sourceFileSha256,
  "Source file changed during preview export",
);
if (args[1])
  assert.equal(
    await fileSha(args[1]),
    guideFileSha256,
    "Guide file changed during preview export",
  );
assert.equal(
  implementation().sha256,
  implementationBinding.sha256,
  "Implementation changed during preview export",
);
const manifest = {
  format: "indoor-pathway-preview-v1",
  createdAt: new Date().toISOString(),
  source: data.source,
  sourceInputSha256: sourceFileSha256,
  sourceDatasetSha256: originalValueSha256,
  sourceModelSha256: data.source.modelSha256,
  sourceInputKind: normalImport
    ? "normally-imported-authoring-master"
    : "complete-saved-dataset-json",
  normalImportPerformed: normalImport,
  guideFileSha256,
  resolverVersion: data.preparedRouting?.resolverVersion ?? null,
  guideSourceGeometryKey: data.preparedRouting?.sourceGeometryKey ?? null,
  guideScope:
    inventory.installedGuides > 0
      ? `${inventory.installedGuides} guides in ${inventory.guideNativeCellIds.length} native cells; other areas retain saved paths`
      : "Original saved paths; no separate guide catalog installed",
  inventory,
  guideExperiment: guides
    ? {
        inputSha256: guideFileSha256,
        sourceGeometryKey: guides.sourceGeometryKey,
        resolverVersion: guides.resolverVersion,
        boundGuideCount: guides.guides.length,
        nativeCellIds: inventory.guideNativeCellIds,
        routeQualification: "not-performed-by-this-export",
      }
    : null,
  levels,
  assets,
  implementation: implementationBinding,
  sourceUnchanged: true,
  displayOnly: true,
  routeAcceptancePerformed: false,
  published: false,
  elapsedSeconds: (performance.now() - started) / 1000,
  limitations: [
    "The original floor worker already combined walking paths and connection edges. This preview reuses that composition.",
    "Native cell and room rings are retained, including inner rings. These are representation counts, not distinct physical opening counts.",
    "Doorway markers with missing ownership do not create source owners, portals or graph edges.",
    "Saved connections, ramp/lift stops and held stairs are display evidence; complete public and step-free journeys need separate current route checks.",
    "Guide-only mode intentionally hides the original connection and saved-walk layers for comparison.",
  ],
};
await writeFile(
  path.join(out, "data/index.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  path.join(out, "README.txt"),
  "UNBC/native pathway inspection\n\nServe this directory locally:\n  python3 -m http.server 8767 --bind 127.0.0.1\nOpen http://127.0.0.1:8767/\n\nChoose a native level, compare Complete network and Guides only, and search a source edge or native door ID. Native geometry and route permissions are unchanged. This preview does not qualify directions or accessibility. See data/index.json for exact source, implementation and guide scope.\n",
);
console.log(
  JSON.stringify(
    {
      output: out,
      ...inventory,
      sourceUnchanged: true,
      elapsedSeconds: manifest.elapsedSeconds,
    },
    null,
    2,
  ),
);
