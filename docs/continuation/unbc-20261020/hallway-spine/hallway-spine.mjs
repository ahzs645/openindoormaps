// Prototype: straight hallway spines from the gap-fixed native walkable cells.
// node --max-old-space-size=8000 hallway-spine.mjs routing.json levelId[,levelId...] out.json
import { readFileSync, writeFileSync } from "node:fs";
import Delaunator from "delaunator";
import pc from "polygon-clipping";

const [input, levelArg, output] = process.argv.slice(2);
const levels = new Set(levelArg.split(",").map(Number));
const d = JSON.parse(readFileSync(input, "utf8"));
const rec = new Map(d.records.map((r) => [r.key, r]));
const isCorridor = (k) => { const r = rec.get(k); return !!r && r.circulation && !r.stair; };
const nodes = new Map(d.nodes.map((n) => [n.id, n]));

const OPT = {
  spacing: 0.75,        // boundary densification (ft)
  spurFactor: 1.6,      // prune leaf branches shorter than this x local half-width
  devTol: 1.25,         // max deviation of a straight run from the medial axis (ft)
  clearFrac: 0.55,      // straight run must keep this share of the local half-width
  clearMax: 1.6,        // ...capped (ft), so wide halls are not over-constrained
  minClear: 0.45,       // absolute floor for clearance (ft)
};

// ---------- geometry helpers ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function project(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return { t, q: [a[0] + t * dx, a[1] + t * dy] };
}
/** Polygon (outer + holes) with bucketed edges for point-in-polygon and clearance. */
function indexPolygon(rings) {
  const edges = [];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (len(a, b) > 1e-9) edges.push([a, b]);
  }
  const G = 3, grid = new Map(), rows = new Map();
  const key = (x, y) => x + "," + y;
  for (const e of edges) {
    const [a, b] = e;
    const x0 = Math.floor(Math.min(a[0], b[0]) / G), x1 = Math.floor(Math.max(a[0], b[0]) / G);
    const y0 = Math.floor(Math.min(a[1], b[1]) / G), y1 = Math.floor(Math.max(a[1], b[1]) / G);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); }
    for (let y = y0; y <= y1; y++) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push(e); }
  }
  const inside = (p) => {
    let c = false;
    for (const [a, b] of rows.get(Math.floor(p[1] / G)) ?? [])
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    return c;
  };
  const clearance = (p, c) => { // true when every edge is farther than c
    const x0 = Math.floor((p[0] - c) / G), x1 = Math.floor((p[0] + c) / G), y0 = Math.floor((p[1] - c) / G), y1 = Math.floor((p[1] + c) / G);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const [a, b] of grid.get(key(x, y)) ?? []) if (segDist(p, a, b) < c) return false;
    return true;
  };
  return { inside, clearance, edges };
}
/** Segment stays inside with clearance c, except within `free` ft of either end. */
function clearSegment(P, a, b, c, freeA = 0, freeB = 0) {
  const L = len(a, b), n = Math.max(1, Math.ceil(L / 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const s = t * L, atEnd = s < freeA || L - s < freeB;
    if (atEnd) continue; // inside the doorway itself the opening, not the surface, governs
    if (!P.inside(p) || !P.clearance(p, c)) return false;
  }
  return true;
}

// ---------- corridor network polygons ----------
function corridorPolygons(levelId) {
  const cells = d.circulationGeometry.cells.filter((c) => c.levelIds.includes(levelId) && c.roomKeys.some(isCorridor));
  const polys = cells.map((c) => c.ringsFeet.map((r) => [...r.map((p) => [p[0], p[1]]), [r[0][0], r[0][1]]]));
  // Doors between two circulation spaces join their surfaces (thresholds).
  const joins = d.doors.filter((x) => x.levelId === levelId && x.footprintFeet?.length >= 3 && x.roomKeys?.length === 2 && x.roomKeys.every(isCorridor));
  for (const door of joins) {
    const n = door.normalFeet ?? [0, 0], f = door.footprintFeet;
    // extend the footprint 0.3 ft each way along the door normal so it overlaps both cells
    const ext = f.map((p) => { const s = (p[0] - door.pointFeet[0]) * n[0] + (p[1] - door.pointFeet[1]) * n[1]; const k = s >= 0 ? 0.3 : -0.3; return [p[0] + n[0] * k, p[1] + n[1] * k]; });
    polys.push([[...ext, ext[0]]]);
  }
  const snap = (poly, q) => poly.map((ring) => ring.map(([x, y]) => [Math.round(x / q) * q, Math.round(y / q) * q]));
  let merged = [], failed = 0;
  for (const poly of polys) {
    let done = false;
    for (const q of [1e-4, 1e-3, 1e-2]) {
      try { merged = merged.length ? pc.union(merged, snap(poly, q)) : pc.union(snap(poly, q)); done = true; break; } catch { /* retry on a coarser grid */ }
    }
    if (!done) failed++;
  }
  if (failed) console.error("union failures", levelId, failed);
  return { merged: merged.map((poly) => poly.map((ring) => ring.slice(0, -1))), cells, joins };
}

// ---------- medial axis ----------
function medialAxis(rings, P) {
  const pts = [], ringOf = [], idxOf = [], ringLen = [];
  rings.forEach((ring, ri) => {
    let count = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], n = Math.max(1, Math.ceil(len(a, b) / OPT.spacing));
      for (let k = 0; k < n; k++) { pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); ringOf.push(ri); idxOf.push(count++); }
    }
    ringLen.push(count);
  });
  if (pts.length < 3) return { V: [], E: [] };
  const del = Delaunator.from(pts), T = del.triangles, H = del.halfedges;
  const cc = [], rad = [], ok = [];
  for (let t = 0; t < T.length / 3; t++) {
    const [a, b, c] = [pts[T[3 * t]], pts[T[3 * t + 1]], pts[T[3 * t + 2]]];
    const dd = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(dd) < 1e-12) { ok.push(false); cc.push(null); rad.push(0); continue; }
    const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / dd;
    const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / dd;
    const u = [ux, uy]; cc.push(u); rad.push(len(u, a)); ok.push(P.inside(u));
  }
  const E = [];
  for (let e = 0; e < H.length; e++) {
    const o = H[e]; if (o < 0 || o < e) continue;
    const t1 = Math.floor(e / 3), t2 = Math.floor(o / 3);
    if (!ok[t1] || !ok[t2]) continue;
    const pa = T[e], pb = T[e % 3 === 2 ? e - 2 : e + 1];
    if (ringOf[pa] === ringOf[pb]) {
      const L = ringLen[ringOf[pa]], dist = Math.abs(idxOf[pa] - idxOf[pb]);
      if (Math.min(dist, L - dist) <= 2) continue; // neighbours on one wall: a spur to the wall
    }
    E.push([t1, t2]);
  }
  return { cc, rad, E };
}

function buildGraph(cc, rad, E) {
  // merge coincident circumcentres
  const id = new Map(), V = [], R = [];
  const vid = (t) => { const k = Math.round(cc[t][0] * 200) + "," + Math.round(cc[t][1] * 200); if (!id.has(k)) { id.set(k, V.length); V.push(cc[t]); R.push(rad[t]); } return id.get(k); };
  const adj = new Map();
  const add = (a, b) => { if (a === b) return; if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set()); adj.get(a).add(b); adj.get(b).add(a); };
  for (const [t1, t2] of E) add(vid(t1), vid(t2));
  return { V, R, adj };
}
function prune(G) {
  for (let round = 0; round < 8; round++) {
    let removed = 0;
    for (const [v, nb] of [...G.adj]) {
      if (!G.adj.has(v) || nb.size !== 1) continue;
      // walk to a junction
      const chain = [v]; let prev = v, cur = [...nb][0], length = len(G.V[v], G.V[cur]);
      while (G.adj.get(cur)?.size === 2) { const next = [...G.adj.get(cur)].find((x) => x !== prev); chain.push(cur); length += len(G.V[cur], G.V[next]); prev = cur; cur = next; }
      if ((G.adj.get(cur)?.size ?? 0) < 3) continue; // isolated chain: keep
      if (length < OPT.spurFactor * G.R[cur] + 0.5) {
        for (const x of chain) { for (const y of G.adj.get(x)) G.adj.get(y)?.delete(x); G.adj.delete(x); }
        removed++;
      }
    }
    if (!removed) break;
  }
}
function chains(G) {
  const out = [], seen = new Set(), ek = (a, b) => (a < b ? a + ":" + b : b + ":" + a);
  for (const [v, nb] of G.adj) {
    if (nb.size === 2) continue;
    for (const w of nb) {
      if (seen.has(ek(v, w))) continue;
      const c = [v]; let prev = v, cur = w; seen.add(ek(v, w));
      while (G.adj.get(cur).size === 2) { const next = [...G.adj.get(cur)].find((x) => x !== prev); c.push(cur); seen.add(ek(cur, next)); prev = cur; cur = next; }
      c.push(cur); out.push(c);
    }
  }
  // pure loops
  for (const [v, nb] of G.adj) if (nb.size === 2 && ![...nb].some((w) => seen.has(ek(v, w)))) {
    const c = [v]; let prev = v, cur = [...nb][0]; seen.add(ek(v, cur));
    while (cur !== v) { const next = [...G.adj.get(cur)].find((x) => x !== prev); c.push(cur); seen.add(ek(cur, next)); prev = cur; cur = next; }
    c.push(v); out.push(c);
  }
  return out;
}
/** Pull a medial chain into the fewest straight runs that stay near the axis and clear of walls. */
function straighten(chain, G, P) {
  const pts = chain.map((v) => G.V[v]), r = chain.map((v) => G.R[v]);
  const out = [0]; let i = 0;
  while (i < pts.length - 1) {
    let best = i + 1;
    for (let j = pts.length - 1; j > i + 1; j--) {
      let okDev = true, minR = Infinity;
      for (let k = i + 1; k < j; k++) { if (segDist(pts[k], pts[i], pts[j]) > OPT.devTol) { okDev = false; break; } minR = Math.min(minR, r[k]); }
      if (!okDev) continue;
      minR = Math.min(minR, r[i], r[j]);
      const c = Math.max(OPT.minClear, Math.min(OPT.clearMax, OPT.clearFrac * minR));
      if (clearSegment(P, pts[i], pts[j], c, 0, 0)) { best = j; break; }
    }
    out.push(best); i = best;
  }
  return out.map((k) => pts[k]);
}

// ---------- straight crossings through vestibule-like cells ----------
const SMALL_CELL_SQFT = 450;
const ringArea = (r) => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
function crossingCells(cells) {
  return cells.filter((c) => {
    const names = c.roomKeys.map((k) => rec.get(k)?.name ?? "");
    return names.some((n) => /vestibule|lobby|entr|link|bridge|crosswalk|airlock/i.test(n)) || ringArea(c.ringsFeet[0]) < SMALL_CELL_SQFT;
  });
}
function segIntersect(a, b, c, e) {
  const r = sub(b, a), q = sub(e, c), den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1 ? t : null;
}
/** Replace the spine inside a crossing cell by straight lines between the points
 * where the spine enters it: two entries become one line, more meet at a hub. */
function straightCrossings(segs, cell, P) {
  const C = indexPolygon(cell.ringsFeet.map((r) => r.map((p) => [p[0], p[1]])));
  const outside = [], entries = [];
  for (const [a, b] of segs) {
    const ts = [0, 1];
    for (const ring of cell.ringsFeet) for (let i = 0; i < ring.length; i++) { const t = segIntersect(a, b, ring[i], ring[(i + 1) % ring.length]); if (t !== null) ts.push(t); }
    ts.sort((x, y) => x - y);
    for (let i = 1; i < ts.length; i++) {
      const p0 = [a[0] + (b[0] - a[0]) * ts[i - 1], a[1] + (b[1] - a[1]) * ts[i - 1]], p1 = [a[0] + (b[0] - a[0]) * ts[i], a[1] + (b[1] - a[1]) * ts[i]];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (C.inside(mid)) { if (ts[i - 1] > 0) entries.push(p0); if (ts[i] < 1) entries.push(p1); }
      else outside.push([p0, p1]);
    }
  }
  const uniq = entries.filter((p, i) => entries.findIndex((q) => len(p, q) < 0.5) === i);
  if (uniq.length < 2) return null;
  const add = [];
  if (uniq.length === 2) {
    if (!clearSegment(P, uniq[0], uniq[1], 0.3, 0.6, 0.6)) return null;
    add.push([uniq[0], uniq[1]]);
  } else {
    const hub = [uniq.reduce((t, p) => t + p[0], 0) / uniq.length, uniq.reduce((t, p) => t + p[1], 0) / uniq.length];
    if (!C.inside(hub) || !uniq.every((p) => clearSegment(P, hub, p, 0.3, 0, 0.6))) return null;
    for (const p of uniq) add.push([hub, p]);
  }
  return [...outside, ...add];
}

// ---------- anchors (doors and vertical connectors) ----------
function anchorsFor(levelId) {
  const out = [];
  for (const e of d.edges) {
    if (!e.enabled || (e.kind !== "door" && e.kind !== "opening")) continue;
    const ks = e.roomKeys ?? [];
    const corridorKeys = ks.filter(isCorridor);
    if (!corridorKeys.length || corridorKeys.length === ks.length) continue; // room<->corridor only
    for (const nid of [e.from, e.to]) {
      const n = nodes.get(nid); if (!n || n.levelId !== levelId) continue;
      out.push({ id: nid, edge: e.id, kind: e.kind, p: [n.pointFeet[0], n.pointFeet[1]], other: e.pointsFeet });
    }
  }
  for (const n of d.nodes) if (n.levelId === levelId && (n.kind === "stair" || n.kind === "connector")) out.push({ id: n.id, kind: n.kind, p: [n.pointFeet[0], n.pointFeet[1]] });
  return out;
}


// ---------- v3: regions joined through door gates ----------
function regionsFor(levelId) {
  const cells = d.circulationGeometry.cells.filter((c) => c.levelIds.includes(levelId) && c.roomKeys.some(isCorridor));
  const snap = (poly, q) => poly.map((ring) => ring.map(([x, y]) => [Math.round(x / q) * q, Math.round(y / q) * q]));
  let merged = [];
  for (const c of cells) {
    const poly = c.ringsFeet.map((r) => [...r.map((p) => [p[0], p[1]]), [r[0][0], r[0][1]]]);
    for (const q of [1e-4, 1e-3, 1e-2]) { try { merged = merged.length ? pc.union(merged, snap(poly, q)) : pc.union(snap(poly, q)); break; } catch {} }
  }
  return merged.map((poly) => {
    const rings = poly.map((ring) => ring.slice(0, -1));
    const P = indexPolygon(rings);
    const inner = cells.filter((c) => { const r = c.ringsFeet[0]; const m = r.reduce((t, p) => [t[0] + p[0] / r.length, t[1] + p[1] / r.length], [0, 0]); return P.inside(m) || r.some((p) => P.inside(p)); });
    return { rings, P, cells: inner, area: ringArea(rings[0]) - rings.slice(1).reduce((t, h) => t + ringArea(h), 0) };
  });
}
const nearRing = (P, rings, p, tol) => P.inside(p) || rings.some((ring) => ring.some((q, i) => segDist(p, q, ring[(i + 1) % ring.length]) < tol));
function regionAt(regions, p, tol = 0.75) {
  let best = null, bd = Infinity;
  for (const R of regions) {
    if (R.P.inside(p)) return R;
    for (const ring of R.rings) for (let i = 0; i < ring.length; i++) { const dd = segDist(p, ring[i], ring[(i + 1) % ring.length]); if (dd < bd) { bd = dd; best = R; } }
  }
  return bd <= tol ? best : null;
}
const isCrossing = (R) => R.area < SMALL_CELL_SQFT || R.cells.every((c) => c.roomKeys.some((k) => /vestibule|lobby|entr|link|bridge|crosswalk|airlock/i.test(rec.get(k)?.name ?? "")));
function connect(R, from, freeFrom) {
  const cands = R.segs.map(([x, y]) => ({ ...project(from, x, y) })).map((c) => ({ ...c, dist: len(from, c.q) })).sort((m, n) => m.dist - n.dist);
  for (const c of cands.slice(0, 8)) if (c.dist < 1e-6 || clearSegment(R.P, from, c.q, 0.35, freeFrom, 0)) return { to: c.q, perpendicular: c.t > 0.001 && c.t < 0.999 };
  return null;
}

const result = { levels: [] };
for (const levelId of levels) {
  const t0 = Date.now();
  const regions = regionsFor(levelId);
  const level = { levelId, polygons: regions.map((R) => R.rings), spines: [], gates: [], connectors: [], unconnected: [], stats: {} };
  // gates: doors whose both sides are circulation
  const gates = [], seenGate = new Set(), linkEnds = [];
  for (const e of d.edges) {
    if (!e.enabled || (e.kind !== "door" && e.kind !== "opening")) continue;
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (a?.levelId !== levelId || b?.levelId !== levelId) continue;
    const pa = [a.pointFeet[0], a.pointFeet[1]], pb = [b.pointFeet[0], b.pointFeet[1]];
    const Ra = regionAt(regions, pa, 0.6), Rb = regionAt(regions, pb, 0.6);
    if (Ra && Rb && Ra !== Rb) {
      const c = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], L = len(pa, pb);
      const door = d.doors.find((x) => x.nativeElementId === e.nativeElementId && x.levelId === levelId);
      const n = L > 1e-6 ? [(pb[0] - pa[0]) / L, (pb[1] - pa[1]) / L] : door?.normalFeet ?? [0, 0];
      const half = Math.max(L / 2, door ? Math.max(...door.footprintFeet.map((p) => Math.abs((p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1]))) : 0);
      const key = Math.round(c[0] * 10) + "," + Math.round(c[1] * 10);
      if (!seenGate.has(key)) { seenGate.add(key); gates.push({ id: e.id, kind: e.kind, c, half, n, sides: [Rb, Ra] }); }
    } else if (Ra || Rb) {
      // a doorway from a room (outside every walking surface) into one surface
      linkEnds.push({ e, p: Ra ? pa : pb, R: Ra ?? Rb });
    }
  }
  for (const R of regions) R.gates = gates.filter((g) => g.sides.includes(R));
  for (const { p, R } of linkEnds) (R.doorPts ??= []).push(p);
  let rawLen = 0, runs = 0, crossings = 0, hubs = 0;
  const unreached = [];
  for (const R of regions) {
    R.segs = [];
    const entries = R.gates.map((g) => g.c);
    if (isCrossing(R) && entries.length >= 2) {
      const lines = straightCrossing(entries, R.P);
      if (lines) { R.segs = lines; crossings++; continue; }
    }
    const { cc, rad, E } = medialAxis(R.rings, R.P);
    if (!E?.length) continue;
    const G = buildGraph(cc, rad, E);
    prune(G);
    // Compact open areas (about as wide as they are long): spokes from the most
    // central point straight to each entrance, instead of a bent skeleton.
    let maxR = 0, hubV = null, axisLen = 0;
    for (const [v, nb] of G.adj) { if (G.R[v] > maxR) { maxR = G.R[v]; hubV = v; } for (const w of nb) if (w > v) axisLen += len(G.V[v], G.V[w]); }
    const entrances = [...R.gates.map((g) => g.c), ...(R.doorPts ?? [])];
    if (!entrances.length) {
      if (process.env.DEBUG && unreached.length < 6) {
        let best = Infinity;
        for (const e of d.edges) { if (e.kind !== "door" && e.kind !== "opening") continue; for (const id of [e.from, e.to]) { const n = nodes.get(id); if (n?.levelId !== levelId) continue; for (const ring of R.rings) for (let i = 0; i < ring.length; i++) best = Math.min(best, segDist([n.pointFeet[0], n.pointFeet[1]], ring[i], ring[(i + 1) % ring.length])); } }
        console.error("unreached area", Math.round(R.area), "nearest door node ft", best.toFixed(2), R.cells.map((c) => c.roomKeys.map((k) => rec.get(k)?.number).join("+")).slice(0, 3).join(" | "));
      }
      unreached.push(R); continue;
    } // no doorway reaches it: nothing to route
    if (hubV !== null && axisLen < 3 * maxR && entrances.length >= 1) {
      const hub = G.V[hubV];
      if (entrances.every((p) => clearSegment(R.P, hub, p, 0.3, 0, 1.2))) { R.segs = entrances.map((p) => [hub, p]); hubs++; continue; }
    }
    for (const c of chains(G)) {
      for (let k = 1; k < c.length; k++) rawLen += len(G.V[c[k - 1]], G.V[c[k]]);
      const st = straighten(c, G, R.P);
      for (let k = 1; k < st.length; k++) { R.segs.push([st[k - 1], st[k]]); runs++; }
    }
  }
  // gate connectors: door centre straight onto each side's spine
  let gateLinks = 0, gateMissing = 0;
  for (const g of gates) {
    level.gates.push(g.c);
    g.sides.forEach((R, si) => {
      const sgn = si === 0 ? 1 : -1;
      if (R.segs.some(([a, b]) => len(a, g.c) < 0.05 || len(b, g.c) < 0.05)) { gateLinks++; return; }
      // walk straight out of the door along its normal, then onto the spine
      for (const out of [g.half + 1.2, g.half + 2.5, g.half + 0.6]) {
        const e = [g.c[0] + g.n[0] * sgn * out, g.c[1] + g.n[1] * sgn * out];
        if (!R.P.inside(e) || !clearSegment(R.P, g.c, e, 0.25, g.half + 0.3, 0)) continue;
        // prefer meeting a spine end straight on, so the line runs on through the door
        const ends = R.segs.flatMap(([a, b]) => [a, b]).map((q) => ({ q, d: len(q, e) })).sort((m, n) => m.d - n.d);
        const end = ends.find((x) => x.d < 6 && R.segs.filter(([a, b]) => len(a, x.q) < 1e-6 || len(b, x.q) < 1e-6).length === 1 && clearSegment(R.P, e, x.q, 0.3, 0, 0));
        if (end) {
          // move the spine's end out to the door's entry point so the line runs straight on
          const seg = R.segs.find(([a, b]) => len(a, end.q) < 1e-6 || len(b, end.q) < 1e-6);
          const other = len(seg[0], end.q) < 1e-6 ? seg[1] : seg[0];
          if (clearSegment(R.P, other, e, 0.35, 0, 0)) {
            if (len(seg[0], end.q) < 1e-6) seg[0] = e; else seg[1] = e;
            level.connectors.push({ kind: "gate", from: g.c, to: e, perpendicular: true }); gateLinks++; return;
          }
        }
        const link = end ? { to: end.q, perpendicular: false } : R.segs.length ? connect(R, e, 0) : null;
        if (link) { level.connectors.push({ kind: "gate", from: g.c, via: e, to: link.to, perpendicular: link.perpendicular }); gateLinks++; return; }
      }
      gateMissing++; level.unconnected.push({ kind: "gate", p: g.c });
    });
  }
  // room doors: one connection per doorway, from its walking-surface side
  let doorsLinked = 0, doorsMissing = 0;
  for (const { e, p, R } of linkEnds) {
    if (!R.segs.length) { doorsMissing++; level.unconnected.push({ kind: e.kind, p }); continue; }
    const link = connect(R, p, 1.2);
    if (link) { level.connectors.push({ kind: e.kind, from: p, to: link.to, perpendicular: link.perpendicular }); doorsLinked++; }
    else { doorsMissing++; level.unconnected.push({ kind: e.kind, p }); }
  }
  for (const R of regions) level.spines.push(...R.segs);
  if (process.env.DEBUG) for (const R of unreached.filter((R) => R.area >= 40).slice(0, 12)) {
    let walkPts = 0; for (const e of d.edges) if (e.kind === "walk" && e.enabled) for (const q of e.pointsFeet) if (R.P.inside([q[0], q[1]])) { walkPts++; break; }
    let best = Infinity, bestKind = ""; for (const e of d.edges) { if (e.kind !== "door" && e.kind !== "opening") continue; for (const id of [e.from, e.to]) { const n = nodes.get(id); if (n?.levelId !== levelId) continue; for (const ring of R.rings) for (let i = 0; i < ring.length; i++) { const dd = segDist([n.pointFeet[0], n.pointFeet[1]], ring[i], ring[(i + 1) % ring.length]); if (dd < best) { best = dd; bestKind = e.kind + ":" + (e.roomKeys ?? []).map((k) => (isCorridor(k) ? "C" : "R") + (rec.get(k)?.number ?? "")).join("/"); } } } }
    const owners = d.circulationGeometry.cells.filter((c) => c.levelIds.includes(levelId) && c.roomKeys.some(isCorridor) && c.ringsFeet[0].some((p) => R.P.inside([p[0], p[1]]) || false)).flatMap((c) => c.roomKeys.map((k) => rec.get(k)?.number + " " + rec.get(k)?.name));
    console.error("UNREACHED", levelId, Math.round(R.area) + "sqft", "walkEdgesInside", walkPts, "nearestDoorNode", best.toFixed(2), bestKind, "|", [...new Set(owners)].slice(0, 4).join(", "));
  }
  level.unreached = unreached.filter((R) => R.area >= 40).map((R) => ({ rings: R.rings, names: [...new Set(R.cells.flatMap((c) => c.roomKeys.map((k) => rec.get(k)?.number + " " + rec.get(k)?.name)))] }));
  level.stats = { regions: regions.length, gates: gates.length, gateLinks, gateMissing, straightCrossings: crossings, hubAreas: hubs, unreachedAreas: unreached.filter((R) => R.area >= 40).length, unreachedSlivers: unreached.filter((R) => R.area < 40).length, medialAxisFt: Math.round(rawLen), spineFt: Math.round(level.spines.reduce((t, [a, b]) => t + len(a, b), 0)), straightRuns: runs, roomDoorsLinked: doorsLinked, roomDoorsMissing: doorsMissing, perpendicular: level.connectors.filter((c) => c.perpendicular).length, ms: Date.now() - t0 };
  console.log(levelId, JSON.stringify(level.stats));
  result.levels.push(level);
}
writeFileSync(output, JSON.stringify(result));

function straightCrossing(entries, P) {
  const uniq = entries.filter((p, i) => entries.findIndex((q) => len(p, q) < 0.5) === i);
  if (uniq.length === 2) return clearSegment(P, uniq[0], uniq[1], 0.3, 1.2, 1.2) ? [[uniq[0], uniq[1]]] : null;
  const hub = [uniq.reduce((t, p) => t + p[0], 0) / uniq.length, uniq.reduce((t, p) => t + p[1], 0) / uniq.length];
  if (!P.inside(hub) || !uniq.every((p) => clearSegment(P, hub, p, 0.3, 0, 1.2))) return null;
  return uniq.map((p) => [hub, p]);
}
