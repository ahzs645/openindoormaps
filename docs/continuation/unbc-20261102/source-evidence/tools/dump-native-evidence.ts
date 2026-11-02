// Dump native-model records (ConvertResult.elementBounds, persisted host
// relations, the compiler's architectural plan cut) inside fixed case windows.
// Read-only source diagnostic: it converts the original RVT exactly as the
// Reviter compiler does (convertRvtBytes with default options) and writes JSON.
//
// Run from the sibling Reviter checkout (it supplies the TypeScript loader):
//   cd ../reviter && node --max-old-space-size=8192 --experimental-strip-types \
//     --import ./scripts/register-test-typescript.mjs \
//     PATH/dump-native-evidence.ts ORIGINAL.rvt OUT.json
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

const REVITER = resolve(process.env.REVITER ?? process.cwd());
const { convertRvtBytes } = await import(REVITER + "/lib/reviter/convert.ts");
const { architecturalPlanGeometry } = await import(REVITER + "/lib/reviter/architectural-plan.ts");
const { withReviewedDoorApertures, applyReviewedDoorWallCuts } = await import(REVITER + "/lib/reviter/reviewed-door-apertures.ts");
const pc = (await import(REVITER + "/node_modules/polygon-clipping/dist/polygon-clipping.esm.js")).default;

const [rvtPath, outPath] = process.argv.slice(2);
if (!rvtPath || !outPath) throw new Error("usage: dump-native-evidence.ts ORIGINAL.rvt OUT.json");
const EXPECTED = "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178";
const bytes = new Uint8Array(readFileSync(rvtPath));
const sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== EXPECTED) throw new Error("RVT sha256 mismatch: " + sha);
// The compiler passes the archived model's file name; only an .rfa/.rft
// extension changes the conversion, so the archived name is used here too.
const fileName = process.env.RVT_NAME ?? "UNBC Model - 2026-06-30 - FINAL (Fixed Library) (1).rvt";
const t0 = performance.now();
const result = convertRvtBytes(bytes, fileName, {});
if (!result.ok) throw new Error(result.error);
const convertSeconds = (performance.now() - t0) / 1000;

type Box = { x0: number; x1: number; y0: number; y1: number };
const CASES: { id: string; levels: number[]; box: Box; ids: number[] }[] = [
  { id: "case1-2471813", levels: [1487816], box: { x0: 160, x1: 195, y0: 750, y1: 775 }, ids: [2471813, 2471836, 2471837, 2472128, 2471383] },
  { id: "case2-2315416", levels: [400176, 1487353, 694], box: { x0: 15, x1: 80, y0: 505, y1: 560 }, ids: [2315416, 2315413, 2315423, 2311764, 2311758] },
  { id: "case3-03-1052", levels: [694], box: { x0: -5, x1: 25, y0: -170, y1: -125 }, ids: [1425507, 1425511, 1425135, 481695] },
];
const hit = (b: any, box: Box) => b && b.max.x >= box.x0 && b.min.x <= box.x1 && b.max.y >= box.y0 && b.min.y <= box.y1;
const ptsHit = (pts: number[][], box: Box) => {
  const xs = pts.map(p => p[0]!), ys = pts.map(p => p[1]!);
  return Math.max(...xs) >= box.x0 && Math.min(...xs) <= box.x1 && Math.max(...ys) >= box.y0 && Math.min(...ys) <= box.y1;
};
const hosts = new Map<number, any>();
for (const r of result.nativeHostRelations ?? []) hosts.set(r.elementId, r);
const assocLevel = new Map<number, any>();
for (const r of result.nativeAssociatedLevelRelations ?? []) assocLevel.set((r as any).elementId, r);

const compact = (r: any) => ({
  elementId: r.elementId,
  categoryId: r.categoryId, categoryName: r.categoryName, categorySource: r.categorySource,
  typeId: r.typeId, typeName: r.typeName, familySymbolId: r.familySymbolId, familyId: r.familyId, familyName: r.familyName,
  wallKind: r.wallKind, renderGeometryProvenance: r.renderGeometryProvenance, doorLeafSource: r.doorLeafSource,
  stream: r.stream, chunkIndex: r.chunkIndex, recordOffset: r.recordOffset, recordCode: r.recordCode, recordCount: r.recordCount,
  boundsFeet: r.boundsFeet, orientedBox: r.orientedBox, solid: r.solid, solids: r.solids, arcs: r.arcs,
  loops: r.loops, quadCount: r.quads?.length,
  parameters: r.parameters,
  host: hosts.get(r.elementId) ?? null,
  hostedChildren: [...hosts.values()].filter(h => h.hostId === r.elementId).map(h => h.elementId),
  associatedLevel: assocLevel.get(r.elementId) ?? null,
});

const out: any = {
  format: "native-source-evidence-dump-v1",
  rvt: { path: basename(rvtPath), sha256: sha, bytes: bytes.length, fileNameUsed: fileName },
  convert: { function: "convertRvtBytes(bytes, fileName, {})", seconds: convertSeconds, method: result.method, elementBounds: result.elementBounds.length, nativeHostRelations: result.nativeHostRelations?.length ?? 0 },
  levels: result.levels,
  cases: {},
};
for (const c of CASES) {
  const recs = result.elementBounds.filter(r => hit(r.boundsFeet, c.box) || c.ids.includes(r.elementId));
  const plans: any = {};
  for (const level of c.levels) {
    const g = architecturalPlanGeometry(result, level);
    plans[level] = {
      cutElevation: g.cutElevation,
      walls: g.walls.filter(w => ptsHit(w.polygon, c.box)),
      doors: g.doors.filter(w => ptsHit(w.polygon, c.box)),
      columns: g.columns.filter(w => ptsHit(w.polygon, c.box)),
      floorsTouching: g.floors.map((rings, i) => ({ index: i, rings })).filter(f => f.rings.some(r => ptsHit(r, c.box))).map(f => ({ index: f.index, ringCount: f.rings.length, outerPointCount: f.rings[0]!.length, rings: f.rings.map(r => r.length <= 600 ? r : { pointCount: r.length, truncated: true }) })),
    };
  }
  out.cases[c.id] = { window: c.box, requestedIds: c.ids, missingIds: c.ids.filter(id => !result.elementBounds.some(r => r.elementId === id)), records: recs.map(compact), plans };
}
// Room, area and separation-line records anywhere in the converted model.
const ROOMISH = /room|area|separation|space/i;
out.roomAreaCensus = {
  note: "Records whose decoded category is Rooms (-2000160), RoomSeparationLines (-2000066), Areas (-2003200), AreaSchemeLines (-2000079) or whose category name matches /room|area|separation|space/i, across all elementBounds.",
  elementBounds: result.elementBounds.filter(r => [-2000160, -2000066, -2003200, -2000079].includes(r.categoryId!) || ROOMISH.test(r.categoryName ?? "")).map(r => ({ elementId: r.elementId, categoryId: r.categoryId, categoryName: r.categoryName, boundsFeet: r.boundsFeet })),
  nativeCategories: (result.nativeCategories?.categories ?? []).filter((c: any) => [-2000160, -2000066, -2003200, -2000079].includes(c.categoryId) || ROOMISH.test(c.name ?? "")),
  schemaClassesMatching: [...((result.schema as any)?.taggedClasses ?? []), ...((result.schema as any)?.referencedClasses ?? [])].map((c: any) => c.name).filter((n: any) => typeof n === "string" && /^(Room|Area|Space|RoomSeparation|SpatialElement)/i.test(n)).slice(0, 200),
};

// Native mesh triangles for selected obstructions/frames (world feet = position + origin when the
// mesh positions are origin-relative; both the origin and raw positions are reported).
const MESH_IDS = new Set([2472128, 2471383, 2471832, 2471834, 2471836, 2471837, 2471813, 2315423, 2315416, 2315413]);
const meshes: any = {};
for (const m of result.meshes) {
  if (!m.elementIds) continue;
  for (let t = 0; t < m.elementIds.length; t++) {
    const id = m.elementIds[t]!;
    if (!MESH_IDS.has(id)) continue;
    const tri = [0, 1, 2].map(k => { const v = m.indices[t * 3 + k]!; return [m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!]; });
    (meshes[id] ??= { batches: new Set(), triangles: [] }).triangles.push(tri);
    meshes[id].batches.add(JSON.stringify({ name: m.name, source: m.source, material: result.materials[m.materialIndex]?.name }));
  }
}
out.meshes = { origin: result.origin, axisNote: "positions as stored in ConvertResult.meshes", byElement: Object.fromEntries(Object.entries(meshes).map(([k, v]: any) => [k, { batches: [...v.batches].map((b: string) => JSON.parse(b)), triangleCount: v.triangles.length, triangles: v.triangles }])) };

// Dry-run validator replay (no master is read or written): the compiler's own
// withReviewedDoorApertures on a one-patch review built from the exact records.
const box = (id: number) => result.elementBounds.find(r => r.elementId === id)!.orientedBox;
const plan1 = architecturalPlanGeometry(result, 1487816);
const hostParts = plan1.walls.filter(w => w.elementId === 2471383).map(w => w.polygon);
const patch = {
  id: "dry-run:1487816:2471813", levelId: 1487816, nativeDoorId: 2471813, normalFeet: [0, 1],
  apertureFeet: [[179.64661948387752, 760.9991134306913], [179.64661948387752, 764.2799533257046], [174.0363832634051, 764.2799533257046], [174.0363832634051, 760.9991134306913]],
  wallEvidence: [{ nativeElementId: 2471383, partsFeet: hostParts }],
  frameEvidence: [2471836, 2471837, 2471832, 2471834].map(id => ({ nativeElementId: id, orientedBox: box(id) })),
  notes: "dry-run validation only",
};
// After a validated dry run, also report which compiled plan walls (with the reviewed cut
// applied exactly as the compiler applies it) still overlap the aperture.
const ringArea = (r: number[][]) => Math.abs(r.reduce((a, q, i) => a + q[0]! * r[(i + 1) % r.length]![1]! - r[(i + 1) % r.length]![0]! * q[1]!, 0) / 2);
const mpArea = (mp: number[][][][]) => mp.reduce((a, poly) => a + ringArea(poly[0]!) - poly.slice(1).reduce((b, h) => b + ringArea(h), 0), 0);
const replay = (label: string, p: any) => { try { const m = withReviewedDoorApertures(result, { version: 1, sourceModelSha256: sha, patches: [p] }, sha, architecturalPlanGeometry); const walls = applyReviewedDoorWallCuts(m, p.levelId, architecturalPlanGeometry(result, p.levelId).walls as any); const remaining = walls.map((w: any) => ({ elementId: w.elementId, approximate: w.approximate, overlapSqFt: mpArea(pc.intersection([p.apertureFeet], [w.polygon]) as any) })).filter((w: any) => w.overlapSqFt > 0.001); return { label, accepted: true, wallsStillOverlappingApertureAfterCut: remaining }; } catch (e: any) { return { label, accepted: false, error: String(e?.message ?? e) }; } };
out.case1ValidatorReplay = {
  patch,
  proposalWallEvidenceEqualsCurrentPlan: JSON.stringify(hostParts) === JSON.stringify([[[171.37343488161943, 760.9991134306913], [182.265823333063, 760.9991134306913], [182.265823333063, 764.2799533257046], [171.37343488161943, 764.2799533257046], [171.37343488161943, 760.9991134306913]]]),
  results: [
    replay("four frame members 2471836/2471837 (jambs) + 2471832 (sill) + 2471834 (head)", patch),
    replay("control: head replaced by top mullion 2471831", { ...patch, frameEvidence: [2471836, 2471837, 2471832, 2471831].map(id => ({ nativeElementId: id, orientedBox: box(id) })) }),
    replay("option: wallEvidence also lists embedding basic wall 2472128 (its exact current plan parts)", { ...patch, wallEvidence: [...patch.wallEvidence, { nativeElementId: 2472128, partsFeet: plan1.walls.filter(w => w.elementId === 2472128).map(w => w.polygon) }] }),
  ],
  foreignWallsIntersectingAperture: plan1.walls.filter(w => w.elementId !== 2471383 && ![2471836, 2471837].includes(w.elementId)).filter(w => { const xs = w.polygon.map(q => q[0]!), ys = w.polygon.map(q => q[1]!); return Math.max(...xs) > 174.0363832634051 && Math.min(...xs) < 179.64661948387752 && Math.max(...ys) > 760.9991134306913 && Math.min(...ys) < 764.2799533257046; }),
};
// Case 3: the same dry-run predicate for curtain apertures at 1425507 / 1425511
// (host 1425500), as an evidence check for an alternative to outline review.
const plan3 = architecturalPlanGeometry(result, 694);
const host3 = plan3.walls.filter(w => w.elementId === 1425500).map(w => w.polygon);
const hx = host3.flat().map(q => q[0]!), x0 = Math.min(...hx), x1 = Math.max(...hx);
const door3 = (id: number, frames: number[]) => {
  const ob = box(id)!, ys = ob.map(q => q[1]!), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { id: "dry-run:694:" + id, levelId: 694, nativeDoorId: id, normalFeet: [1, 0], apertureFeet: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], wallEvidence: [{ nativeElementId: 1425500, partsFeet: host3 }], frameEvidence: frames.map(f => ({ nativeElementId: f, orientedBox: box(f) })), notes: "dry-run validation only" };
};
const p3a = door3(1425507, [1425541, 1425542, 1425528, 1532179]), p3b = door3(1425511, [1425543, 1425544, 1425530, 1532181]);
out.case3ValidatorReplay = { hostPlanParts: host3, patches: [p3a, p3b], results: [replay("1425507 jambs 1425541/1425542 sill 1425528 head 1532179", p3a), replay("1425511 jambs 1425543/1425544 sill 1425530 head 1532181", p3b)] };
writeFileSync(outPath, JSON.stringify(out));
console.log("done", convertSeconds.toFixed(1), "s", Object.fromEntries(Object.entries(out.cases).map(([k, v]: any) => [k, v.records.length])));
