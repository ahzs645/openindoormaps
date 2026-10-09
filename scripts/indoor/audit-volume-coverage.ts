import { deriveNativeExplore } from "../../app/indoor-project/native-explore";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { enclosureEvidenceText } from "../../app/indoor-project/enclosure-review";
import { readIndoorProject } from "../../app/indoor-project/package";
import {
  volumeScopes,
  auditVolumeScope,
} from "../../app/indoor-project/volume-coverage";

const [input, output, markdown] = process.argv.slice(2);
if (!input || !output || path.resolve(input) === path.resolve(output))
  throw new Error(
    "Usage: node --max-old-space-size=4096 --import tsx scripts/indoor/audit-volume-coverage.ts input.zip report.json [report.md]",
  );
if (
  markdown &&
  [input, output].some((p) => path.resolve(p) === path.resolve(markdown))
)
  throw new Error(
    "The Markdown report must be distinct from the input and JSON report.",
  );
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const archive = await readFile(input);
const { dataset: data } = await readIndoorProject(archive);
const archiveHash = hash(archive),
  datasetHash = hash(JSON.stringify(data));
const views = [];
for (const scope of volumeScopes(data)) {
  const view = auditVolumeScope(
    data,
    scope,
    data.nativeIndoorEnvelopes
      ? await deriveNativeExplore(data, scope.levelIds, "all")
      : undefined,
  );
  process.stderr.write(
    `${scope.scope} ${scope.name}: ${view.records.length} records audited\n`,
  );
  views.push(view);
}
assert.equal(
  hash(JSON.stringify(data)),
  datasetHash,
  "Preparation mutated the dataset",
);
assert.equal(
  hash(await readFile(input)),
  archiveHash,
  "The input archive changed during the audit",
);
const report = {
  format: "openindoormaps-volume-coverage-audit",
  version: 1,
  input: path.resolve(input),
  archiveSha256: archiveHash,
  datasetSha256: datasetHash,
  reviewEvidenceSha256: hash(enclosureEvidenceText(data)),
  source: data.source,
  assumptions: [
    "Visitor 3D rooms use complete enclosure evidence; missing blocks are not automatically an elevation error.",
    "Staff areas, circulation, passages, stairs and nonwalkable areas are intentionally not room blocks.",
    "Campus-floor views and native-level views are separate; do not sum their counts as unique rooms.",
    "No boundary, routing, access or source-model corrections are made by this detector.",
  ],
  unchanged: { dataset: true, archive: true },
  views,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
if (markdown) {
  const table = views.flatMap((v) =>
    v.buildings.map(
      (b) =>
        `| ${v.scope} | ${v.name} | ${b.building} | ${b.records} | ${b.blocks} | ${b.intentionalFlat} | ${b.unsupported} | ${b.modeDiscrepancies} |`,
    ),
  );
  await writeFile(
    markdown,
    `# Room volume coverage\n\nInput: \`${path.resolve(input)}\`\n\nArchive SHA-256: \`${archiveHash}\`\n\nBoth the archive and dataset stayed unchanged. Flat/native height modes were compared.\n\n| Scope | Floor | Building | Records | Blocks | Intentionally flat | Unsupported enclosure | Mode discrepancies |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |\n${table.join("\n")}\n\nMissing blocks require enclosure evidence review. This report does not authorize raising raw outlines or expanding routing.\n`,
  );
}
console.log(`Volume coverage audit saved to ${path.resolve(output)}`);
