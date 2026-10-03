import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pc from "polygon-clipping";
import { readIndoorProject } from "../../app/indoor-project/package";
import { generalizeRooms } from "../../app/indoor-project/generalized-room-geometry";
const [input, output] = process.argv.slice(2);
if (!input || !output || path.resolve(input) === path.resolve(output))
  throw new Error(
    "Usage: tsx scripts/indoor/audit-room-generalization.ts project.zip report.json (different paths)",
  );
const project = await readIndoorProject(await readFile(input)),
  data = project.dataset,
  before = JSON.stringify(data),
  start = performance.now();
const results = generalizeRooms(data),
  milliseconds = performance.now() - start;
const visual = new Map(
  data.presentation?.sourceModelSha256 === data.source.modelSha256
    ? data.presentation.rooms.map((r) => [r.roomKey, r])
    : [],
);
const rings = (key: string) => {
  const record = data.records.find((r) => r.key === key)!;
  const p = visual.get(key);
  return p?.sourceGeometryKey ===
    JSON.stringify([record.levelId, record.ringsFeet])
    ? p.interiorRingsFeet
    : record.ringsFeet;
};
const area = (parts: pc.MultiPolygon) =>
  parts.reduce(
    (s, rs) =>
      s +
      rs.reduce(
        (s, r, i) =>
          s +
          ((i ? -1 : 1) *
            Math.abs(
              r.reduce((s, p, j) => {
                const q = r[(j + 1) % r.length],
                  o = r[0];
                return (
                  s +
                  (p[0] - o[0]) * (q[1] - o[1]) -
                  (q[0] - o[0]) * (p[1] - o[1])
                );
              }, 0),
            )) /
            2,
        0,
      ),
    0,
  );
const reasons: Record<string, number> = {},
  byBuilding: Record<string, { total: number; rectangles: number }> = {};
let sourceVertices = 0,
  displayVertices = 0,
  neighbourChecks = 0;
const changes = [...results.values()].filter((r) => r.status === "rectangle");
for (const a of changes) {
  const room = data.records.find((r) => r.key === a.key)!;
  sourceVertices += a.sourceVertices;
  displayVertices += a.displayVertices;
  for (const other of data.records) {
    if (
      other.key === a.key ||
      other.levelId !== room.levelId ||
      Math.abs(room.elevationFeet - other.elevationFeet) > 0.5
    )
      continue;
    const b = results.get(other.key)!;
    const originalOverlap = pc.intersection([rings(a.key)], [rings(other.key)]);
    const displayedOverlap = pc.intersection(a.partsFeet, b.partsFeet);
    assert.ok(
      area(pc.difference(displayedOverlap, originalOverlap)) < 0.001,
      `New overlap: ${room.number} / ${other.number}`,
    );
    neighbourChecks++;
  }
  for (const hole of data.records
    .find((r) => r.key === a.key)!
    .ringsFeet.slice(1))
    assert.ok(
      area(pc.intersection(a.partsFeet, [hole])) < 0.001,
      `Source opening filled: ${room.number}`,
    );
}
for (const record of data.records) {
  const result = results.get(record.key)!;
  reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
  const building = (byBuilding[record.building] ??= {
    total: 0,
    rectangles: 0,
  });
  building.total++;
  if (result.status === "rectangle") building.rectangles++;
}
assert.equal(
  JSON.stringify(data),
  before,
  "Generalization must not change routing, native walls, floor geometry, doors or review metadata",
);
const report = {
  format: "openindoormaps-room-generalization-audit",
  version: 1,
  sourceModelSha256: data.source.modelSha256,
  datasetSha256: createHash("sha256").update(before).digest("hex"),
  total: data.records.length,
  rectangles: changes.length,
  retained: data.records.length - changes.length,
  sourceVerticesInChangedRooms: sourceVertices,
  displayVerticesInChangedRooms: displayVertices,
  preparationMilliseconds: milliseconds,
  neighbourChecks,
  inputUnchanged: true,
  nodes: data.nodes.length,
  edges: data.edges.length,
  doors: data.doors?.length ?? 0,
  reasons,
  byBuilding,
  parameters: {
    maxAreaDifferenceRatio: 0.12,
    maxCornerDisplacementFeet: 3,
    maxRecessDisplacementFeet: 6,
    longWallMinimumFeet: 3,
    orthogonalWallSupportRatio: 0.85,
  },
  research: [
    {
      title: "CGAL contour regularization",
      url: "https://doc.cgal.org/latest/Shape_regularization/index.html",
    },
    {
      title: "PostGIS coverage simplification",
      url: "https://www.postgis.net/docs/manual-3.5/en/ST_CoverageSimplify.html",
    },
  ],
  rooms: data.records.map((r) => {
    const g = results.get(r.key)!;
    return {
      key: r.key,
      number: r.number,
      name: r.name,
      building: r.building,
      levelId: r.levelId,
      status: g.status,
      reason: g.reason,
      sourceVertices: g.sourceVertices,
      displayVertices: g.displayVertices,
      doorIds: (data.doors ?? [])
        .filter((d) => d.roomKeys.includes(r.key))
        .map((d) => d.id),
    };
  }),
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log({
  total: report.total,
  rectangles: report.rectangles,
  sourceVertices,
  displayVertices,
  neighbourChecks,
  milliseconds,
  inputUnchanged: true,
});
