// Read-only: for each leaking walk at a joint, the smallest wall contact-noding
// tolerance that makes the walk leave the exact local free region.
// usage: node --experimental-strip-types walk-closure.ts REVITER EXTRACT-DIR JOINTS.json OUT.json
import { readFileSync, writeFileSync } from "node:fs";
const [REVITER, DIR, JOINTS, OUT] = process.argv.slice(2);
const { initializeNativeExactGeosOverlay } = await import(REVITER + "/lib/reviter/native-exact-geos-overlay.ts");
await initializeNativeExactGeosOverlay();
const { createNativeRoutingMaterialQuery } = await import(REVITER + "/lib/reviter/native-routing-material.ts");
const { nativeRationalOverlay } = await import(REVITER + "/lib/reviter/native-rational-overlay.ts");
const { nativeRationalPathSupported } = await import(REVITER + "/lib/reviter/native-exact-planar-topology.ts");
const { nativeRoutingContactNoding } = await import(new URL("./noding-unbounded.diagnostic.ts", import.meta.url).href);
const load = (k: string) => JSON.parse(readFileSync(`${DIR}/${k}.json`, "utf8"));
const data: any = {
  source: load("source"), nativeLevels: load("nativeLevels"),
  nativeMaterialSections: load("nativeMaterialSections"),
  nativeMaterialSectionSupplement: load("nativeMaterialSectionSupplement"),
  nativeDerivedFrameReturns: load("nativeDerivedFrameReturns"),
  nativeProvisionalCornerSeals: load("nativeProvisionalCornerSeals"),
  nativeWallPositionRepairs: load("nativeWallPositionRepairs"),
  nativeIndoorEnvelopes: load("nativeIndoorEnvelopes"),
  doors: load("doors"), edges: load("edges"), walkingSupport: load("walkingSupport"),
};
const walls: any[] = load("walls");
const edges = new Map<string, any>(data.edges.map((e: any) => [e.id, e]));
const query = createNativeRoutingMaterialQuery(data);
const supplementIds = new Map<string, Set<number>>();
for (const l of data.nativeMaterialSectionSupplement?.levels ?? [])
  supplementIds.set(`${l.levelId}:${l.cutElevationFeet}`, new Set(l.sections.map((s: any) => s.nativeElementId)));
type P = [number, number];
const LADDER = [1e-12, 1e-9, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 0.02, 0.1];
const H = 3, h = 2.9;
// Liang-Barsky clip of a polyline to the inner box; returns runs inside.
function clip(path: P[], x0: number, y0: number, x1: number, y1: number): P[][] {
  const runs: P[][] = []; let run: P[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
      if (p === 0) { if (q < 0) ok = false; continue; }
      const r = q / p; if (p < 0) { if (r > t1) ok = false; else if (r > t0) t0 = r; } else { if (r < t0) ok = false; else if (r < t1) t1 = r; }
    }
    if (!ok) { if (run.length) runs.push(run); run = []; continue; }
    const s: P = t0 === 0 ? a : [a[0] + t0 * dx, a[1] + t0 * dy], e: P = t1 === 1 ? b : [a[0] + t1 * dx, a[1] + t1 * dy];
    if (!run.length) run.push(s); run.push(e);
    if (t1 < 1) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs.filter(r => r.length > 1);
}
const joints = JSON.parse(readFileSync(JOINTS, "utf8"));
const out: any[] = [];
for (const j of joints) {
  const level = data.nativeLevels.find((l: any) => l.id === j.levelId), z = level.elevationFeet;
  const levelIds = new Set(data.nativeLevels.filter((l: any) => Math.abs(l.elevationFeet - z) < 0.05).map((l: any) => l.id));
  const m = query(z);
  const supp = supplementIds.get(`${j.levelId}:${z + 0.1}`) ?? new Set<number>();
  const [x, y] = j.pointFeet;
  const box: P[] = [[x - H, y - H], [x + H, y - H], [x + H, y + H], [x - H, y + H]];
  const inBox = (rings: P[][]) => { const xs = rings[0].map(p => p[0]), ys = rings[0].map(p => p[1]);
    return Math.max(...xs) >= x - H && Math.min(...xs) <= x + H && Math.max(...ys) >= y - H && Math.min(...ys) <= y + H; };
  const wallParts: P[][][] = [], owner: string[] = [], fixed: P[][][] = [];
  for (const part of m.parts) if (inBox(part.rings)) {
    if (part.column) fixed.push(part.rings);
    else { wallParts.push(part.rings); owner.push(`${part.nativeElementId}${part.positiveSubsetOnly ? ":positive-band" : supp.has(part.nativeElementId) ? ":mesh-supplement" : ""}`); }
  }
  for (const d of m.derivedParts ?? []) if (inBox(d)) { wallParts.push(d); owner.push("derived"); }
  for (const w of walls) if (w.reviewPatchId && levelIds.has(w.levelId) && inBox(w.ringsFeet)) fixed.push(w.ringsFeet);
  const free = (ws: P[][][]) => nativeRationalOverlay("difference", [[box]], ...ws, ...fixed);
  const walks = (j.walks ?? []).map((id: string) => edges.get(id)).filter(Boolean);
  const rows: any[] = [];
  const before = free(wallParts);
  for (const e of walks) {
    const runs = clip(e.pointsFeet.map((p: number[]) => [p[0], p[1]] as P), x - h, y - h, x + h, y + h);
    const supported = (parts: any) => runs.every(r => nativeRationalPathSupported(r, parts));
    const row: any = { walk: e.id, runs: runs.length, reproduced: runs.length > 0 && supported(before) };
    if (row.reproduced) for (const tol of LADDER) {
      const noded = nativeRoutingContactNoding(wallParts, tol);
      if (!supported(free(noded))) {
        row.closingToleranceFeet = tol;
        row.nodedOwners = [...new Set(noded.flatMap((p: any, i: number) => p !== wallParts[i] ? [owner[i]] : []))];
        break;
      }
    }
    rows.push(row);
  }
  out.push({ ...j, z, walksTested: rows });
  if (out.length % 10 === 0) console.error(out.length, new Date().toISOString());
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("joints", out.length);
