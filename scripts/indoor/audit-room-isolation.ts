import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { readIndoorProject } from "../../app/indoor-project/package";
import { deriveNativeAreas } from "../../app/indoor-project/native-area-review";
import { auditRoomIsolation } from "../../app/indoor-project/room-isolation-audit";

const [input, destination] = process.argv.slice(2);
if (!input || !destination)
  throw new Error(
    "Usage: node --import tsx scripts/indoor/audit-room-isolation.ts master.zip output-directory",
  );
const bytes = await readFile(resolve(input));
const hash = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const project = await readIndoorProject(bytes);
await mkdir(resolve(destination), { recursive: true });
const traces = [];
const traceBindings = [];
const unavailableLevels = [];
for (const level of project.dataset.nativeLevels) {
  console.log("Trace native level", level.id, level.name);
  if (
    project.dataset.walkingSupport?.sourceModelSha256 !==
      project.dataset.source.modelSha256 ||
    !project.dataset.walkingSupport.floors.some(
      (f) => Math.abs(f.elevationFeet - level.elevationFeet) < 0.15,
    )
  ) {
    unavailableLevels.push({
      levelId: level.id,
      reason:
        "No model-bound native slab support; no enclosure or repair certified.",
    });
    continue;
  }
  const trace = await deriveNativeAreas(project.dataset, level.id, {
    mode: "connected",
    maxGapFeet: 0,
  });
  const raw = Buffer.from(JSON.stringify(trace));
  await writeFile(join(resolve(destination), `native-${level.id}.json`), raw);
  traces.push(trace);
  traceBindings.push({
    levelId: level.id,
    geometrySha256: trace.geometrySha256,
    sha256: hash(raw),
    warnings: trace.warnings,
  });
}
const rooms = await auditRoomIsolation(project.dataset, traces);
const summary = rooms.reduce<Record<string, Record<string, number>>>(
  (out, r) => {
    out[r.building] ??= {};
    out[r.building][r.state] = (out[r.building][r.state] ?? 0) + 1;
    return out;
  },
  {},
);
const ledger = {
  format: "openindoormaps-room-isolation-audit",
  version: 1,
  masterSha256: hash(bytes),
  datasetSha256: project.manifest.indoor.sha256,
  source: project.dataset.source,
  certification:
    "Measurements for review only. No geometry, access or routing changes are applied.",
  traceBindings,
  unavailableLevels,
  summary,
  rooms,
};
await writeFile(
  join(resolve(destination), "room-isolation.json"),
  JSON.stringify(ledger, null, 2) + "\n",
);
console.log(JSON.stringify({ roomCount: rooms.length, summary }, null, 2));
