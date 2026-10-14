// Door-focused extract of the candidate prepared dataset (HEAVY parse; run under the shared lock).
import { readFileSync, writeFileSync, renameSync } from "node:fs";
const RUN = "/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009";
const src = process.argv[2] ?? RUN + "/candidate-floors-9/data/candidate/dataset-prepared.json";
const out = process.argv[3] ?? RUN + "/candidate-floors-9/data/extract/candidate-doors.json";
const D = JSON.parse(readFileSync(src, "utf8"));
const top = Object.fromEntries(Object.entries(D).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : typeof v]));
const doorIds = new Set((D.doors ?? []).map((d) => d.id));
const x = {
  src, top, source: D.source, nativeLevels: D.nativeLevels,
  doors: D.doors, edges: D.edges.filter((e) => e.kind === "door" || doorIds.has(e.id)),
  selectionDoorThresholds: D.selectionDoorThresholds ?? null,
  nativeDoorBoundaryClosures: D.nativeDoorBoundaryClosures ?? null,
  reviewedDrawnDoors: D.reviewedDrawnDoors ?? null,
  doorAperturePatchState: D.doorAperturePatchState ?? null,
  walls: D.walls.map((w) => ({ levelId: w.levelId, nativeElementId: w.nativeElementId, kind: w.kind, reviewPatchId: w.reviewPatchId, approximate: w.approximate, ringsFeet: w.ringsFeet })),
  walkingSupport: D.walkingSupport,
  circulationGeometry: D.circulationGeometry ? { sourceModelSha256: D.circulationGeometry.sourceModelSha256, fixtures: D.circulationGeometry.fixtures } : null,
  records: D.records.map((r) => ({ key: r.key, number: r.number, name: r.name, levelId: r.levelId, ringsFeet: r.ringsFeet, floorOpeningsFeet: r.properties?.floorOpeningsFeet ?? null })),
  hasEnvelopes: !!D.nativeIndoorEnvelopes,
};
writeFileSync(out + ".tmp", JSON.stringify(x)); renameSync(out + ".tmp", out);
console.log(JSON.stringify(top));
