import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import pc from "polygon-clipping";
import { readIndoorProject } from "../../app/indoor-project/package";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";

type Rings = [number, number][][];
const [input, reference, output] = process.argv.slice(2);
if (!input || !reference || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-presentation.ts prepared.zip reference.zip report.json",
  );
const bytes = new Uint8Array(await readFile(input)),
  original = new Uint8Array(await readFile(reference));
const project = await readIndoorProject(bytes),
  previous = await readIndoorProject(original),
  data = project.dataset;
const zip = unzipSync(bytes),
  oldZip = unzipSync(original);
const digest = async (b: Uint8Array) =>
  createHash("sha256").update(b).digest("hex");
const assets = await Promise.all(
  Object.keys(oldZip)
    .filter(
      (path) =>
        path.startsWith("model/") ||
        path.startsWith("gis/") ||
        path.startsWith("floors/") ||
        path.startsWith("scene/"),
    )
    .map(async (path) => ({
      path,
      unchanged:
        !!zip[path] &&
        (await digest(zip[path])) === (await digest(oldZip[path])),
    })),
);
const unchanged = Object.fromEntries(
  (["records", "nodes", "edges", "walls", "doors"] as const).map((key) => [
    key,
    JSON.stringify(data[key]) === JSON.stringify(previous.dataset[key]),
  ]),
);
const area = (parts: Rings[]) => {
  let total = 0;
  for (const rings of parts)
    for (const [index, ring] of rings.entries()) {
      let signedArea = 0;
      for (const [i, point] of ring.entries()) {
        const next = ring[(i + 1) % ring.length];
        signedArea += point[0] * next[1] - next[0] * point[1];
      }
      total += ((index ? -1 : 1) * Math.abs(signedArea)) / 2;
    }
  return total;
};
const box = (rings: Rings) => {
  const p = rings.flat();
  return [
    Math.min(...p.map((q) => q[0])),
    Math.min(...p.map((q) => q[1])),
    Math.max(...p.map((q) => q[0])),
    Math.max(...p.map((q) => q[1])),
  ];
};
const near = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
// Use the compiler's 0.0001-foot precision in a local frame so coincident
// campus coordinates do not fail a floating-point sweep during the audit.
const overlapArea = (a: Rings[], b: Rings[]) => {
  const origin = box(a.flat());
  const normalize = (parts: Rings[]) =>
    parts.map((rings) =>
      rings.map((ring) =>
        ring.map(
          ([x, y]) =>
            [
              Math.round((x - origin[0]) * 10_000) / 10_000,
              Math.round((y - origin[1]) * 10_000) / 10_000,
            ] as [number, number],
        ),
      ),
    );
  return area(pc.intersection(normalize(a), normalize(b)));
};
const protectedAreas = data.records.filter(
  (r) =>
    r.circulation ||
    (!r.walkable &&
      /open drop|open to (?:below|lower)/i.test(
        String(r.properties.notes ?? ""),
      )),
);
const prepared = data.presentation!.rooms;
const violations: { roomKey: string; kind: string; areaFeet2: number }[] = [];
for (const room of prepared) {
  const b = box(room.blockPartsFeet.flat());
  const check = (kind: string, rings: Rings) => {
    if (!near(b, box(rings))) return;
    const overlap = overlapArea(room.blockPartsFeet, [rings]);
    if (overlap > 0.01)
      violations.push({ roomKey: room.roomKey, kind, areaFeet2: overlap });
  };
  for (const mask of protectedAreas.filter((r) => r.levelId === room.levelId))
    check(`protected:${mask.key}`, mask.ringsFeet);
  for (const door of (data.doors ?? []).filter(
    (d) => d.levelId === room.levelId && d.footprintFeet,
  ))
    check(`door:${door.id}`, [door.footprintFeet!]);
  const source = data.records.find((r) => r.key === room.roomKey)!;
  for (const hole of source.ringsFeet.slice(1)) check("source-hole", [hole]);
}
for (let i = 0; i < prepared.length; i++) {
  const a = prepared[i];
  for (let j = i + 1; j < prepared.length; j++) {
    const b = prepared[j];
    if (
      a.levelId !== b.levelId ||
      !near(box(a.blockPartsFeet.flat()), box(b.blockPartsFeet.flat()))
    )
      continue;
    const overlap = overlapArea(a.blockPartsFeet, b.blockPartsFeet);
    if (overlap > 0.01)
      violations.push({
        roomKey: a.roomKey,
        kind: `other-block:${b.roomKey}`,
        areaFeet2: overlap,
      });
  }
}
const byLevel: Record<
  string,
  { eligible: number; prepared: number; fallback: number }
> = {};
for (const r of data.records.filter((r) => r.walkable && !r.circulation)) {
  const entry = (byLevel[r.levelId] ??= {
    eligible: 0,
    prepared: 0,
    fallback: 0,
  });
  entry.eligible++;
  if (prepared.some((p) => p.roomKey === r.key)) entry.prepared++;
  else entry.fallback++;
}
const display = projectDisplayGeometry(data, [311], "05");
const boundaryKinds = Object.fromEntries(
  ["prepared-native-walls", "native-walls", "source-footprint"].map((kind) => [
    kind,
    display.roomBlocks.features.filter(
      (f) => f.properties?.boundarySource === kind,
    ).length,
  ]),
);
const report = {
  input,
  reference,
  preparedRooms: prepared.length,
  eligibleRooms: data.records.filter((r) => r.walkable && !r.circulation)
    .length,
  byLevel,
  sourceAssets: assets,
  unchanged,
  violations,
  building05Level311Display: boundaryKinds,
  diagnosticCodes: Object.fromEntries(
    [...new Set(data.presentation!.diagnostics.map((d) => d.code))].map(
      (code) => [
        code,
        data.presentation!.diagnostics.filter((d) => d.code === code).length,
      ],
    ),
  ),
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    { ...report, sourceAssets: assets, violations: violations.slice(0, 5) },
    null,
    2,
  ),
);
if (
  assets.some((a) => !a.unchanged) ||
  Object.values(unchanged).some((v) => !v) ||
  violations.length > 0
)
  process.exitCode = 1;
