// Export the compiled UNBC routing dataset as hospital-style GeoJSON layers at
// several simplification tolerances, measure sizes, and write compact viewer data.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import pc from "polygon-clipping";

const [input, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const d = JSON.parse(readFileSync(input, "utf8"));
const a = d.alignment;
const c = Math.cos(a.rotationRadians), s = Math.sin(a.rotationRadians), k = a.horizontalMetresPerFoot;
/** feet -> local east/north metres */
const en = (p) => {
  const x = p[0] - a.originFeet[0], y = p[1] - a.originFeet[1];
  return [(x * c - y * s) * k, (x * s + y * c) * k];
};
const lonlat = ([e, n], digits) => {
  const lon = a.originGeographic[0] + ((e / (6378137 * Math.cos((a.projectionLatitude * Math.PI) / 180))) * 180) / Math.PI;
  const lat = a.originGeographic[1] + ((n / 6378137) * 180) / Math.PI;
  const f = 10 ** digits;
  return [Math.round(lon * f) / f, Math.round(lat * f) / f];
};
// Douglas-Peucker on an open polyline (metres)
function dp(pts, tol) {
  if (tol <= 0 || pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop(); const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let best = -1, bi = -1;
    for (let m = i + 1; m < j; m++) {
      const [px, py] = pts[m];
      const dist = L === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / L;
      if (dist > best) { best = dist; bi = m; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([i, bi], [bi, j]); }
  }
  return pts.filter((_, m) => keep[m]);
}
const dedupe = (pts, eps = 1e-6) => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > eps);
let simplifyRing = function (ring, tol) {
  let r = dedupe(ring.map(en));
  if (r.length > 1 && Math.hypot(r[0][0] - r.at(-1)[0], r[0][1] - r.at(-1)[1]) < 1e-6) r = r.slice(0, -1);
  if (r.length < 3) return null;
  // split closed ring at farthest pair so DP keeps the extremes
  let far = 0, fd = -1; for (let i = 1; i < r.length; i++) { const dd = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (dd > fd) { fd = dd; far = i; } }
  const A = dp(r.slice(0, far + 1), tol), B = dp([...r.slice(far), r[0]], tol);
  const out = [...A, ...B.slice(1, -1)];
  return out.length >= 3 ? out : null;
};
const area = (r) => { let t = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; t += p[0] * q[1] - q[0] * p[1]; } return t / 2; };

const levels = new Map(d.nativeLevels.map((l) => [l.id, l]));
const floorOf = new Map(); d.floors.forEach((f, i) => f.levelIds.forEach((id) => floorOf.set(id, i)));
const nodeById = new Map(d.nodes.map((n) => [n.id, n]));
const edgeLevel = (e) => nodeById.get(e.from)?.levelId ?? nodeById.get(e.to)?.levelId;
const guides = new Map(d.preparedRouting.guides.map((g) => [g.edgeId, g]));
const coverage = [];
const roomKind = (r) => (r.stair ? "vertical_connection" : r.circulation ? "corridor" : "unit");

function buildLayers(tol, digits) {
  const map = [], routes = [], pois = [];
  let dropped = 0;
  // Corridors come from the gap-fixed native walkable cells that circulation
  // records own; a circulation record without any cell keeps its own outline.
  const recByKeyAll = new Map(d.records.map((r) => [r.key, r]));
  const covered = new Set();
  for (const cell of d.circulationGeometry.cells) {
    const owners = cell.roomKeys.map((key) => recByKeyAll.get(key)).filter((r) => r?.circulation && !r.stair);
    if (!owners.length) continue;
    owners.forEach((r) => covered.add(r.key));
    const rings = cell.ringsFeet.map((ring) => simplifyRing(ring, tol)).filter(Boolean);
    if (!rings.length || Math.abs(area(rings[0])) < 0.05) { dropped++; continue; }
    const lv = cell.levelIds[0], o = owners[0];
    map.push({ type: "Feature", properties: { feature_type: "corridor", source: "native-walkable-cell", level_id: lv, floor: floorOf.get(lv), building: o.building, number: o.number || undefined, name: owners.map((r) => r.name).filter((n, i, all) => all.indexOf(n) === i).join(" / "), access: owners.some((r) => r.access === "staff") ? "staff" : owners.some((r) => r.access === "public") ? "public" : "unknown", space_id: cell.id },
      geometry: { type: "Polygon", coordinates: rings.map((ring) => [...ring, ring[0]].map((p) => lonlat(p, digits))) } });
  }
  coverage.push([covered.size, d.records.filter((r) => r.circulation && !r.stair).length]);
  for (const r of d.records) {
    if (r.circulation && !r.stair && covered.has(r.key)) continue;
    const rings = r.ringsFeet.map((ring) => simplifyRing(ring, tol)).filter(Boolean);
    if (!rings.length || Math.abs(area(rings[0])) < 0.05) { dropped++; continue; }
    map.push({ type: "Feature", properties: { feature_type: roomKind(r), level_id: r.levelId, floor: floorOf.get(r.levelId), building: r.building, number: r.number || undefined, name: r.name, access: r.access, space_id: r.key },
      geometry: { type: "Polygon", coordinates: rings.map((ring) => [...ring, ring[0]].map((p) => lonlat(p, digits))) } });
  }
  for (const e of d.edges) {
    if (!e.enabled) continue;
    const lv = edgeLevel(e);
    // Prefer the prepared shared-corridor guide: it follows the hallway spine.
    const guide = guides.get(e.id);
    let pts = dedupe(dp(dedupe((guide?.pointsFeet ?? e.pointsFeet).map(en)), tol));
    // A lift or stair link can sit at one plan position on two floors; keep it.
    if (pts.length === 1 && e.kind !== "walk") pts = [pts[0], pts[0]];
    if (pts.length < 2) continue;
    const toLv = nodeById.get(e.to)?.levelId;
    routes.push({ type: "Feature", properties: { network_type: e.kind, guide: guide ? guide.kind : undefined, level_id: lv, floor: floorOf.get(lv), to_floor: floorOf.get(toLv) }, geometry: { type: "LineString", coordinates: pts.map((p) => lonlat(p, digits)) } });
  }
  const recByKey = new Map(d.records.map((r) => [r.key, r]));
  for (const n of d.nodes) {
    if (n.kind !== "arrival") continue;
    const r = recByKey.get(n.roomKey); if (!r || r.circulation) continue;
    pois.push({ type: "Feature", properties: { id: r.key, name: r.name, number: r.number || undefined, building: r.building, level_id: r.levelId, floor: floorOf.get(r.levelId), type: r.stair ? "stair" : "room" }, geometry: { type: "Point", coordinates: lonlat(en(n.pointFeet), digits) } });
  }
  return { map, routes, pois, dropped };
}

function wallsLayer(tol, digits) {
  // Union wall bodies per level, then simplify the merged outlines.
  const byLevel = new Map();
  for (const w of d.walls) { if (!byLevel.has(w.levelId)) byLevel.set(w.levelId, []); byLevel.get(w.levelId).push(w); }
  const feats = []; const t0 = Date.now();
  for (const [lv, walls] of byLevel) {
    const polys = walls.map((w) => w.ringsFeet.map((ring) => { const r = dedupe(ring.map(en)); return [...r, r[0]]; })).filter((p) => p[0].length >= 4);
    let merged = [];
    for (let i = 0; i < polys.length; i += 400) {
      try { merged = pc.union(merged, ...polys.slice(i, i + 400)); } catch { merged = [...merged, ...polys.slice(i, i + 400)]; }
    }
    for (const poly of merged) {
      const rings = poly.map((ring) => simplifyRing(ring.slice(0, -1).map(([x, y]) => [x, y]), tol, true)).filter(Boolean);
      if (!rings.length || Math.abs(area(rings[0])) < 0.02) continue;
      feats.push({ type: "Feature", properties: { feature_type: "wall", level_id: lv, floor: floorOf.get(lv) }, geometry: { type: "Polygon", coordinates: rings.map((ring) => [...ring, ring[0]].map((p) => lonlat(p, digits))) } });
    }
  }
  return { feats, ms: Date.now() - t0 };
}

const measure = (obj) => { const raw = Buffer.from(JSON.stringify(obj)); return { raw: raw.length, gzip: gzipSync(raw, { level: 9 }).length, brotli: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length }; };
const fc = (features) => ({ type: "FeatureCollection", features });
const sumVerts = (fs) => fs.reduce((t, f) => t + JSON.stringify(f.geometry.coordinates).split("],[").length, 0);

// simplifyRing receives already-converted metres for walls; patch: detect metre input
const _simplifyRing = simplifyRing;
// eslint-disable-next-line no-func-assign
simplifyRing = function (ring, tol, metres) { if (!metres) return _simplifyRing(ring, tol); let r = dedupe(ring); if (r.length < 3) return null; let far = 0, fd = -1; for (let i = 1; i < r.length; i++) { const dd = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (dd > fd) { fd = dd; far = i; } } const A = dp(r.slice(0, far + 1), tol), B = dp([...r.slice(far), r[0]], tol); const out = [...A, ...B.slice(1, -1)]; return out.length >= 3 ? out : null; };

const results = [];
const variants = [
  { id: "exact", tol: 0, digits: 9, label: "Exact source geometry, 9-decimal coordinates" },
  { id: "5cm", tol: 0.05, digits: 7, label: "5 cm simplification, 7 decimals (~1 cm)" },
  { id: "15cm", tol: 0.15, digits: 7, label: "15 cm simplification, 7 decimals" },
  { id: "30cm", tol: 0.3, digits: 6, label: "30 cm simplification, 6 decimals (~10 cm)" },
];
for (const v of variants) {
  const L = buildLayers(v.tol, v.digits);
  const W = wallsLayer(v.tol, v.digits);
  const layers = { map: fc([...L.map, ...W.feats]), rooms: fc(L.map), walls: fc(W.feats), routes: fc(L.routes), pois: fc(L.pois) };
  const m = Object.fromEntries(Object.entries(layers).map(([k2, val]) => [k2, measure(val)]));
  const perFloor = d.floors.map((f, i) => {
    const pick = (fs) => fs.filter((x) => x.properties.floor === i);
    const all = fc([...pick(L.map), ...pick(W.feats), ...pick(L.routes), ...pick(L.pois)]);
    return { floor: f.name, rooms: pick(L.map).length, walls: pick(W.feats).length, paths: pick(L.routes).length, pois: pick(L.pois).length, ...measure(all) };
  });
  const total = ["map", "routes", "pois"].reduce((t, key) => ({ raw: t.raw + m[key].raw, gzip: t.gzip + m[key].gzip, brotli: t.brotli + m[key].brotli }), { raw: 0, gzip: 0, brotli: 0 });
  results.push({ ...v, counts: { rooms: L.map.length, walls: W.feats.length, paths: L.routes.length, pois: L.pois.length, roomVertices: sumVerts(L.map), wallVertices: sumVerts(W.feats), pathVertices: sumVerts(L.routes) }, wallUnionMs: W.ms, sizes: m, total, perFloor });
  if (v.id === "15cm") for (const [k2, val] of Object.entries(layers)) writeFileSync(`${outDir}/unbc-${k2}.geojson`, JSON.stringify(val));
  console.error(v.id, "circulation coverage", JSON.stringify(coverage.at(-1)), JSON.stringify(results.at(-1).counts), JSON.stringify(total), "walls union ms", W.ms);
}
writeFileSync(`${outDir}/sizes.json`, JSON.stringify(results, null, 1));
