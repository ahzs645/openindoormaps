/** Prepare one real 2D display scope without preparing every floor. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readIndoorProject } from "../../app/indoor-project/package";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { prepareOneSelectedDisplayScope } from "./selected-display-scope";

const [input, directory, levels, ...extra] = process.argv.slice(2);
assert(input && directory && /^\d+(?:,\d+)*$/.test(levels ?? "") && !extra.length,
  "Usage: node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/prepare-selected-display.ts VISITOR.zip NEW_DIRECTORY LEVEL_ID,...");
const root = fileURLToPath(new URL("../../", import.meta.url));
assert.equal(preparedDisplayEngineBinding(root).sha256, PREPARED_DISPLAY_ENGINE_SHA256,
  "Freeze source and refresh engine binding before fresh display preparation");
await initializeNativeExactGeosOverlay();
const bytes = new Uint8Array(await fs.readFile(input)),
  sha256 = createHash("sha256").update(bytes).digest("hex"),
  project = await readIndoorProject(bytes, (progress) => console.log(JSON.stringify({ stage: "original-import", progress })));
assert.equal(project.manifest.format, "openindoormaps-viewer", "Use the independent visitor candidate");
const report = await prepareOneSelectedDisplayScope(editorVisitorDataset(project), levels!.split(",").map(Number), directory!);
assert.equal(createHash("sha256").update(await fs.readFile(input!)).digest("hex"), sha256,
  "Candidate archive changed during display preparation");
await fs.writeFile(path.join(directory!, "source-import.json"), JSON.stringify({
  candidatePath: path.resolve(input!), candidatePackageSha256: sha256,
  originalImporterCompleted: true, ...report,
}, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(report));
