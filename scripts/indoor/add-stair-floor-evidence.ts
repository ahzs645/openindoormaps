import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { readIndoorProject } from "../../app/indoor-project/package";
import type { IndoorDataset } from "../../app/indoor-project/contract";

type Flight = NonNullable<IndoorDataset["stairDisplay"]>["flights"][number];
type Slab = NonNullable<Flight["floorOccluders"]>[number];
const [input, output, evidencePath] = process.argv.slice(2);
if (!input || !output || !evidencePath || input === output)
  throw new Error(
    "Usage: add-stair-floor-evidence.ts INPUT.zip NEW-OUTPUT.zip NATIVE-EVIDENCE.json",
  );
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const bytes = new Uint8Array(await readFile(input));
const p = await readIndoorProject(bytes);
const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as {
  format: string;
  version: number;
  sourceModelSha256: string;
  flights: { floorOccluders: Slab[] }[];
};
assert.equal(evidence.format, "openindoormaps-native-stair-occlusion");
assert.equal(evidence.version, 1);
assert.equal(evidence.sourceModelSha256, p.dataset.source.modelSha256);
assert.equal(
  p.dataset.stairDisplay?.sourceModelSha256,
  p.dataset.source.modelSha256,
);
const slabs = new Map<number, Slab>();
for (const slab of evidence.flights.flatMap((f) => f.floorOccluders)) {
  if (slabs.has(slab.nativeElementId))
    assert.deepEqual(slabs.get(slab.nativeElementId), slab);
  slabs.set(slab.nativeElementId, slab);
}
const bounds = (points: number[][]) => [
  Math.min(...points.map((p) => p[0])),
  Math.min(...points.map((p) => p[1])),
  Math.max(...points.map((p) => p[0])),
  Math.max(...points.map((p) => p[1])),
];
const measured = [...slabs.values()].map((s) => ({
  s,
  box: bounds(s.ringsFeet[0]),
}));
const before = structuredClone(p.dataset);
for (const f of p.dataset.stairDisplay!.flights) {
  const box = bounds(f.treads.flatMap((t) => t.ringFeet));
  f.floorOccluders = measured
    .filter(
      ({ s, box: b }) =>
        Math.abs(s.elevationFeet - f.floorElevationFeet) < 0.15 &&
        b[0] <= box[2] &&
        b[2] >= box[0] &&
        b[1] <= box[3] &&
        b[3] >= box[1],
    )
    .map(({ s }) => structuredClone(s));
  assert.ok(
    f.floorOccluders.length,
    `No measured same-floor slab for stair ${f.stairElementId} at ${f.levelId}`,
  );
}
const comparison = structuredClone(p.dataset);
for (const [i, f] of comparison.stairDisplay!.flights.entries()) {
  if (before.stairDisplay!.flights[i].floorOccluders === undefined)
    delete f.floorOccluders;
  else f.floorOccluders = before.stairDisplay!.flights[i].floorOccluders;
}
assert.deepEqual(
  comparison,
  before,
  "Only stair display slab evidence may change",
);
const files = unzipSync(bytes);
const manifest = JSON.parse(strFromU8(files["manifest.json"]));
const path = manifest.indoor.path;
files[path] = strToU8(JSON.stringify(p.dataset));
manifest.indoor = {
  ...manifest.indoor,
  bytes: files[path].length,
  sha256: hash(files[path]),
};
files["manifest.json"] = strToU8(JSON.stringify(manifest));
const packed = zipSync(files, { level: 6 });
const restored = await readIndoorProject(packed);
assert.deepEqual(restored.dataset, p.dataset);
assert.deepEqual(restored.rooms, p.rooms);
const roundTripFiles = unzipSync(packed);
const originalFiles = unzipSync(bytes);
for (const name of Object.keys(originalFiles))
  if (name !== path && name !== "manifest.json")
    assert.deepEqual(roundTripFiles[name], originalFiles[name]);
await writeFile(output, packed, { flag: "wx" });
const audit = {
  input,
  output,
  sourceModelSha256: p.dataset.source.modelSha256,
  inputSha256: hash(bytes),
  outputSha256: hash(packed),
  evidencePath,
  sourceSlabCount: slabs.size,
  stairBindings: p.dataset.stairDisplay!.flights.length,
  flightsWithSlabs: p.dataset.stairDisplay!.flights.filter(
    (f) => f.floorOccluders?.length,
  ).length,
  records: p.dataset.records.length,
  nodes: p.dataset.nodes.length,
  edges: p.dataset.edges.length,
  datasetApartFromSlabEvidenceUnchanged: true,
  metadataAndOtherAssetsByteIdentical: true,
};
await writeFile(
  `${output}.report.json`,
  JSON.stringify(audit, null, 2) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify(audit, null, 2));
