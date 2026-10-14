/** candidate-floors-3 copy of candidate-floors/integration/scripts/gen-rows.ts: also cites corner joins (drawnMaterial.cornerJoins,
 * OIM/reviter branch claude/unbc-candidate4-rules) between found face-line bands that the drawing joins at a mitred corner. */
/** integration copy (candidate-floors/integration, 2026-10-12) of fix-walls/scripts/validate-rows.ts. Changes: VV_INPUT_FILE selects the
 * full validation input (default the candidate-based fix-seams/work/db-validation-input.candidate.json, built from the candidate
 * prepared dataset 79b56afb); alone = the new row + only the rows the envelope levels bind (provisionalCornerIds), as fix-seams.
 * Original header: fix-walls copy of validator-v2/scripts/gen-new-kind.ts (production row tooling). Changes: specs may cite their
 * drawn face-line pair explicitly (dwgCite; tried first, then the automatic cite of every registered band/outline
 * near the body); every native positive-material band the body meets is declared (as db-generate.ts does for non-bridge
 * bodies); the standing-policy decision is resolved like db-generate.ts; the seal-index memo is on; the combined
 * pass uses VV_PRIOR = the candidate's assembled rows. Original header:
 * Re-express the refused/needed Floor 1, B8 theatre, facade and B10 cases as dwg-drawn-material
 * rows and validate each with the production checker (createNativeProvisionalCornerSealIndex +
 * verifyDrawingBackedDrawingEvidence). Cited DWG entities are chosen from the registered
 * sections of the row's level: every pair of parallel registered wall lines (0 < separation <= 3 ft)
 * and every small closed registered outline whose drawn region meets the body. Nothing is applied.
 *
 * env: VV_INPUT=bounded|full (default bounded), VV_SPECS, VV_OUT, VV_PRIOR (rows file for the full
 * combined run), VV_ONLY (comma list of id substrings).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pc from "/Users/ahmadjalil/github/openindoormaps/node_modules/polygon-clipping/dist/polygon-clipping.esm.js";
import {
  createNativeProvisionalCornerSealIndex,
  drawingBackedAssumptionFootprint,
  drawingBackedDrawnMaterial,
  drawingBackedDrawnMaterialSolidity,
  nativeProvisionalCornerSealsHash,
  nativeProvisionalAssumptionCounts,
  verifyDrawingBackedDrawingEvidence,
  setDrawingBackedRowMemoEnabled,
  drawingBackedRowMemoStats,
} from "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-provisional-corner-seals.ts";
import { nativePositiveMaterialBandsAcrossLevels, nativePositiveMaterialBandOverlapsParts } from "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-positive-material-bands.ts";
setDrawingBackedRowMemoEnabled(true);
import { exactNativeDoorFloorDifference } from "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-door-exact-overlay.ts";
import { nativeDerivedFrameHash } from "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-derived-frame-returns.ts";
type P2 = [number, number];
type Seg = [P2, P2];
const RUN = "/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009";
const V = RUN + "/validator-v2";
const sha = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
const MODE = process.env.VV_INPUT ?? "bounded";
await (await import("/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const t0 = performance.now();
let base: any, seals: any, material: any, br: any;
if (MODE === "full") {
  const input = JSON.parse(readFileSync(process.env.VV_INPUT_FILE ?? RUN + "/candidate-floors/fix-seams/work/db-validation-input.candidate.json", "utf8"));
  base = input; seals = input.nativeProvisionalCornerSeals; material = input.nativeMaterialSections; br = input.boundaryReference;
} else {
  const x = JSON.parse(readFileSync(V + "/extract/bounded-input.json", "utf8"));
  material = x.nativeMaterialSections;
  material.geometrySha256 = nativeDerivedFrameHash([material.version, material.sourceModelSha256, material.levels]);
  // bounded extract: keep only nonphysical curtain hosts whose relations and assemblies are in the extracted levels
  const hostIds = (x.seals.nonPhysicalCurtainHostNativeElementIds ?? []).filter((id: number) => material.levels.some((l: any) => (l.originalNativeHostRelations ?? []).some((h: any) => h.hostNativeElementId === id)) && material.levels.some((l: any) => l.sections.some((s: any) => s.nativeElementId === id && s.sourceNativeHostRelationsVerified === true)));
  seals = { ...x.seals, nonPhysicalCurtainHostNativeElementIds: hostIds, sourceMaterialGeometrySha256: material.geometrySha256 };
  br = x.boundaryReference;
  base = { source: x.source, nativeMaterialSections: material, nativeWallPositionRepairs: x.nativeWallPositionRepairs, walkingSupport: x.walkingSupport, doors: x.doors, edges: x.edges };
}
console.log("loaded", MODE, Math.round(performance.now() - t0), "ms");
const BRV = MODE === "full" ? br : JSON.parse(readFileSync(RUN + "/shared-extracts/dwg/registered-boundary-reference-all-sections.json", "utf8")).boundaryReference;
if (BRV.sourceSha256 !== br.sourceSha256) throw Error("boundary reference mismatch");
const DER = JSON.parse(readFileSync(process.env.VV_DERIVED ?? V + "/derived/dwg-derived-outlines.json", "utf8"));
const S = JSON.parse(readFileSync(process.env.VV_SPECS ?? V + "/specs-new-kind.json", "utf8"));
const ONLY = process.env.VV_ONLY?.split(",");
const MAXBAND = Number(process.env.VV_MAXBAND ?? "0");
const droppedWide = MAXBAND > 0 ? S.specs.filter((s: any) => s.construction?.kind === "bridge" && 2 * s.construction.halfWidthFeet > MAXBAND).map((s: any) => ({ id: s.id, cases: s.cases, bandWidthFeet: 2 * s.construction.halfWidthFeet, reason: `the cited registered face lines are ${(2 * s.construction.halfWidthFeet).toFixed(2)} ft apart: two parallel lines that far apart bound a space (niche, chase or corridor strip), not a wall thickness at this location; not accepted as drawn wall material (fix-walls cap ${MAXBAND} ft, below the 3 ft production limit) - owner review` })) : [];
const specs = S.specs.filter((s: any) => (!ONLY || ONLY.some((o) => s.id.includes(o))) && !droppedWide.some((d: any) => d.id === s.id));
const area = (p: any) => { let s = 0; for (const part of p) for (let k = 0; k < part.length; k++) { const r = part[k]; let a = 0; for (let i = 0; i < r.length; i++) { const x = r[i], y = r[(i + 1) % r.length]; a += (x[0] - r[0][0]) * (y[1] - r[0][1]) - (y[0] - r[0][0]) * (x[1] - r[0][1]); } s += (k ? -1 : 1) * Math.abs(a) / 2; } return s; };
const segDist = (p: P2, [a, b]: Seg) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const bandRowsOf = (lvl: number, b: number, t: number) => material.levels.filter((l: any) => l.levelId === lvl && l.cutElevationFeet >= b && l.cutElevationFeet < t);
const census = new Map<number, any>(seals.foreignBodies.map((b: any) => [b.nativeElementId, b]));
const positiveBands = nativePositiveMaterialBandsAcrossLevels(material.levels);
const decisionsCache = new Map<string, any>();
const decisionsOf = (f: string) => { if (!decisionsCache.has(f)) { const raw = readFileSync(f); decisionsCache.set(f, { sha: createHash("sha256").update(raw).digest("hex"), json: JSON.parse(raw.toString()) }); } return decisionsCache.get(f); };

/** The wall's own end face nearest a point, its own axis (from its own side faces) at a cut. */
function wallEnd(levelId: number, base0: number, top0: number, wallId: number, near: P2, hint: P2) {
  const rows = bandRowsOf(levelId, base0, top0);
  const l = rows[0];
  const parts = l.sections.filter((s: any) => s.nativeElementId === wallId).flatMap((s: any) => s.partsFeet);
  let best: any;
  for (const part of parts) for (const r of part) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!len) continue;
    const dotH = Math.abs(((b[0] - a[0]) * hint[0] + (b[1] - a[1]) * hint[1]) / len);
    if (dotH > 0.05) continue; // end face is normal to the extension direction
    const d = segDist(near, [a, b]);
    if (!best || d < best.d) best = { d, a, b, r, i };
  }
  if (!best) throw Error("no end face");
  // own axis: the side edge leaving the end face's first vertex, pointing back into the wall
  const r = best.r, n = r.length;
  const prev = r[(best.i - 1 + n) % n], a = best.a;
  const w = [a[0] - prev[0], a[1] - prev[1]], lw = Math.hypot(w[0], w[1]);
  let u: P2 = [w[0] / lw, w[1] / lw];
  if (u[0] * hint[0] + u[1] * hint[1] < 0) u = [-u[0], -u[1]];
  return { face: [best.a, best.b] as Seg, axis: u, distance: best.d, cut: l.cutElevationFeet };
}

/** Registered drawn material near a body, per section of the level. */
function cite(levelId: number, body: any, tol: number, extraLevels: number[] = [], crossSections: string[] = []) {
  const ps = body.flat(2), box = [Math.min(...ps.map((p: P2) => p[0])), Math.min(...ps.map((p: P2) => p[1])), Math.max(...ps.map((p: P2) => p[0])), Math.max(...ps.map((p: P2) => p[1]))];
  const R = 3.1, near = (s: Seg) => !(Math.max(s[0][0], s[1][0]) < box[0] - R || Math.min(s[0][0], s[1][0]) > box[2] + R || Math.max(s[0][1], s[1][1]) < box[1] - R || Math.min(s[0][1], s[1][1]) > box[3] + R);
  const out: any[] = [];
  for (const sec of br.sections.filter((s: any) => s.levelId === levelId || extraLevels.includes(s.levelId) || crossSections.includes(s.sectionId))) {
    const cand = sec.wallSegments.map((s: Seg, index: number) => ({ index, s })).filter((x: any) => near(x.s) && Math.hypot(x.s[1][0] - x.s[0][0], x.s[1][1] - x.s[0][1]) > 1e-6);
    if (!cand.length) { out.push({ sectionId: sec.sectionId, nearby: 0 }); continue; }
    const entities = cand.map((x: any) => ({ kind: "wallSegments", index: x.index, segmentFeet: x.s }));
    const pairs: [number, number][] = [], outlines: number[][] = [];
    const nonSolid: string[] = [];
    const meets = (dwg: any) => { try { if (!drawingBackedDrawnMaterial(dwg).some((piece: any) => area(pc.intersection(body, [piece] as any)) > 1e-9)) return false; const why = drawingBackedDrawnMaterialSolidity(dwg, sec.wallSegments, body); if (why) { nonSolid.push(why); return false; } return true; } catch { return false; } };
    for (let i = 0; i < entities.length; i++) for (let j = i + 1; j < entities.length; j++) {
      const one = { toleranceFeet: tol, entities, drawnMaterial: { faceLinePairs: [[i, j]], closedOutlines: [] } };
      if (meets(one)) pairs.push([i, j]);
    }
    // small closed outlines: simple cycles (3..8 edges) of nearby segments sharing endpoints within tol
    const reps: P2[] = []; const key = (p: P2) => { let k = reps.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol); if (k < 0) { reps.push(p); k = reps.length - 1; } return String(k); };
    const adj = new Map<string, { e: number; other: string }[]>();
    entities.forEach((e: any, k: number) => { const a = key(e.segmentFeet[0]), b = key(e.segmentFeet[1]); if (a === b) return; for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x)!.push({ e: k, other: y }); } });
    const seen = new Set<string>();
    const dfs = (start: string, at: string, path: number[], visited: Set<string>) => {
      if (path.length > 8 || outlines.length > 40) return;
      for (const { e, other } of adj.get(at) ?? []) {
        if (path.includes(e)) continue;
        if (other === start && path.length >= 2) {
          const cyc = [...path, e], id = [...cyc].sort((a, b) => a - b).join(",");
          if (seen.has(id)) continue; seen.add(id);
          const one = { toleranceFeet: tol, entities, drawnMaterial: { faceLinePairs: [], closedOutlines: [cyc] } };
          if (meets(one)) outlines.push(cyc);
          continue;
        }
        if (visited.has(other)) continue;
        visited.add(other); dfs(start, other, [...path, e], visited); visited.delete(other);
      }
    };
    for (const k of adj.keys()) dfs(k, k, [], new Set([k]));
    // derived closed outlines (raw DWG circles / closed polylines / casings) of this section
    const dsec = DER.sections.find((x: any) => x.sectionId === sec.sectionId);
    for (const o of dsec?.outlines ?? []) {
      const xs = o.ringFeet.map((p: P2) => p[0]), ys = o.ringFeet.map((p: P2) => p[1]);
      if (Math.max(...xs) < box[0] - R || Math.min(...xs) > box[2] + R || Math.max(...ys) < box[1] - R || Math.min(...ys) > box[3] + R) continue;
      const ids = o.ringFeet.map((_: P2, k: number) => entities.push({ kind: "derivedOutlineSegments", index: o.firstSegment + k, segmentFeet: dsec.outlineSegments[o.firstSegment + k] }) - 1);
      const one = { toleranceFeet: tol, entities, drawnMaterial: { faceLinePairs: [], closedOutlines: [ids] } };
      if (meets(one)) outlines.push(ids);
    }
    if (process.env.VV_NO_OUTLINES === "1") outlines.splice(0); // integration: cite face-line pairs only (no closed outline)
    if (pairs.length + outlines.length > 100) { pairs.splice(100 - Math.min(outlines.length, 50)); outlines.splice(50); }
    // candidate-floors-3: corner joins between found bands (the drawing's outer and inner face lines meet at shared corners)
    const joins: [number, number][] = [];
    for (let p = 0; p < pairs.length; p++) for (let q = p + 1; q < pairs.length; q++) {
      const one = { toleranceFeet: tol, entities, drawnMaterial: { faceLinePairs: [pairs[p], pairs[q]], closedOutlines: [], cornerJoins: [[0, 1]] } };
      try { drawingBackedDrawnMaterial(one as any); } catch { continue; }
      if (meets(one)) joins.push([p, q]);
    }
    // keep only entities that are used, renumbered
    const used = [...new Set([...pairs.flat(), ...outlines.flat()])].sort((a, b) => a - b), pos = new Map(used.map((u, k) => [u, k]));
    const dwg = { derived: used.some((u) => entities[u].kind === "derivedOutlineSegments"), dsec, toleranceFeet: tol, entities: used.map((u) => entities[u]), drawnMaterial: { faceLinePairs: pairs.map(([a, b]) => [pos.get(a)!, pos.get(b)!]), closedOutlines: outlines.map((o) => o.map((u) => pos.get(u)!)), ...(joins.length ? { cornerJoins: joins } : {}) } };
    let covered = 0;
    try { covered = used.length ? 1 - area(body.flatMap((p: any) => exactNativeDoorFloorDifference(p, drawingBackedDrawnMaterial(dwg as any) as any))) / area(body) : 0; } catch { covered = 0; }
    out.push({ sectionId: sec.sectionId, nearby: cand.length, dwg, covered, nonSolidSkipped: nonSolid.length, nonSolidExample: nonSolid[0], nearestFeet: Math.min(...cand.map((x: any) => Math.min(...ps.map((p: P2) => segDist(p, x.s))))) });
  }
  out.sort((a, b) => (b.covered ?? -1) - (a.covered ?? -1) || (b.nearby - a.nearby));
  return out;
}

const rows: any[] = [], notes: any[] = [];
for (const s of specs) {
  const tol = 0.05;
  let c: any = s.construction;
  if (c.kind === "bridge") {
    const g = Math.hypot(c.pointBFeet[0] - c.pointAFeet[0], c.pointBFeet[1] - c.pointAFeet[1]);
    c = { kind: "bridge", pointAFeet: c.pointAFeet, pointBFeet: c.pointBFeet, directionFeet: g > 0 ? [(c.pointBFeet[0] - c.pointAFeet[0]) / g, (c.pointBFeet[1] - c.pointAFeet[1]) / g] : c.directionFeet, halfWidthFeet: c.halfWidthFeet, overlapFeet: c.overlapFeet };
    s.measuredGapFeet = g;
  } else if (c.kind === "wall-end-extension-hint") {
    const e = wallEnd(s.levelId, s.baseElevationFeet, s.topElevationFeet, c.wallNativeElementId, c.endMidFeet, c.axisHintFeet);
    c = { kind: "wall-end-extension", wallNativeElementId: c.wallNativeElementId, endFaceFeet: e.face, axisFeet: e.axis, lengthFeet: c.lengthFeet, backOverlapFeet: c.backOverlapFeet };
    notes.push({ id: s.id, endFaceFoundAtDistanceFeet: e.distance, cut: e.cut, endFaceWidthFeet: Math.hypot(e.face[1][0] - e.face[0][0], e.face[1][1] - e.face[0][1]) });
  }
  const partsFeet = drawingBackedAssumptionFootprint(c);
  const cites = cite(s.levelId, partsFeet, tol, s.dwgLevels ?? [], s.crossLevel?.sectionIds ?? []);
  const candidates = cites.filter((x: any) => x.dwg && x.dwg.entities.length);
  if (s.dwgCite) {
    const sec = br.sections.find((x: any) => x.sectionId === s.dwgCite.sectionId);
    for (const e of s.dwgCite.faceLinePair) if (JSON.stringify(sec.wallSegments[e.index]) !== JSON.stringify(e.segmentFeet)) throw Error("cited segment differs from the registered section: " + s.id);
    candidates.unshift({ sectionId: s.dwgCite.sectionId, explicit: true, dwg: { derived: false, toleranceFeet: tol, entities: s.dwgCite.faceLinePair, drawnMaterial: { faceLinePairs: [[0, 1]], closedOutlines: [] } } });
  }
  const build = (pick: any) => {
    const sec = pick ? br.sections.find((x: any) => x.sectionId === pick.sectionId) : undefined;
    const bandCuts = bandRowsOf(s.levelId, s.baseElevationFeet, s.topElevationFeet);
    // declared owners the body never touches at its band are not owners of this body (noted)
    const touches = (id: number) => { const own = bandCuts.flatMap((l: any) => l.sections.filter((x: any) => x.nativeElementId === id).flatMap((x: any) => x.partsFeet)); return own.length ? area(pc.intersection(partsFeet as any, own)) > 0 : census.has(id); };
    // with declared sides, the owners are the members of each side the body touches (each side keeps at least its first member)
    const owners: number[] = s.ownerSides
      ? s.ownerSides.flatMap((side: number[]) => { const t = side.filter(touches); return t.length ? t : [side[0]]; })
      : (s.owners ?? []).filter((o: number, k: number) => k < 2 || touches(o));
    if (owners.length !== (s.owners ?? []).length) notes.push({ id: s.id, droppedUntouchedDeclaredOwners: (s.owners ?? []).filter((o: number) => !owners.includes(o)) });
    // a curtain/door assembly host whose section is the union of an owner's children is that owner's material
    for (const l of bandCuts) for (const x of l.sections) if (!owners.includes(x.nativeElementId) && (x.sourceAssemblyChildIds ?? []).some((k: number) => owners.includes(k)) && area(pc.intersection(partsFeet as any, x.partsFeet)) > 0) owners.push(x.nativeElementId);
    if (s.declareMetMembers) for (const l of bandCuts) for (const x of l.sections) if (!owners.includes(x.nativeElementId) && area(pc.intersection(partsFeet as any, x.partsFeet)) > 0) owners.push(x.nativeElementId);
    if (s.declareMetMembers) for (const b of positiveBands) if (!owners.includes(b.nativeElementId) && b.baseElevationFeet < s.topElevationFeet && b.topElevationFeet > s.baseElevationFeet && nativePositiveMaterialBandOverlapsParts(b, partsFeet as any)) owners.push(b.nativeElementId);
    const ps = partsFeet.flat(2), box = { min: [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), s.baseElevationFeet], max: [Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1])), s.topElevationFeet] };
    const meets = (b: any) => !(b.max.some((x: number, i: number) => x < box.min[i]) || b.min.some((x: number, i: number) => x > box.max[i]));
    const acknowledged = seals.foreignBodies.filter((b: any) => !owners.includes(b.nativeElementId) && !(seals.nonPhysicalCurtainHostNativeElementIds ?? []).includes(b.nativeElementId) && meets(b.boundsFeet) && !b.partsFeet).map((b: any) => b.nativeElementId).sort((a: number, b: number) => a - b);
    let floorsSel = base.walkingSupport.floors.filter((f: any) => Math.abs(f.elevationFeet - s.elevationFeet) < 0.05 && area(pc.intersection(partsFeet as any, f.partsFeet ?? [f.ringsFeet])) > 0);
    if (!floorsSel.length) floorsSel = base.walkingSupport.floors.filter((f: any) => Math.abs(f.elevationFeet - s.elevationFeet) < 0.05).slice(0, 1);
    if (s.floorIds) floorsSel = base.walkingSupport.floors.filter((f: any) => s.floorIds.includes(f.nativeElementId));
    const floors = floorsSel.map((f: any) => ({ nativeElementId: f.nativeElementId, elevationFeet: f.elevationFeet, partsFeet: f.partsFeet ?? [f.ringsFeet] }));
    const dwgBlock = s.kind !== "owner-authorized-seal" && sec && pick?.dwg ? { sourceDwgSha256: br.sourceSha256, registrationSha256: sha(JSON.stringify([br.sourceSha256, sec])), sectionId: sec.sectionId, toleranceFeet: tol, entities: pick.dwg.entities, drawnMaterial: pick.dwg.drawnMaterial, ...(pick.dwg.derived ? { derivedOutlinesSha256: sha(JSON.stringify([DER.sourceDwgSha256, pick.dwg.dsec])) } : {}), ...(sec.levelId !== s.levelId && s.crossLevel?.levelId === sec.levelId ? { crossLevel: { decisionId: s.crossLevel.decisionId, sourceLevelId: sec.levelId, alignmentToleranceFeet: tol } } : {}) } : undefined;
    const D = decisionsOf(s.decisionsFile), [, dec] = s.decisionId.split("#");
    const resolvedKey = Object.keys(D.json.resolved ?? {}).find((k) => k === dec || k.startsWith(dec + " "));
    const decisionBody = dec === "standingPolicy" ? D.json.standingPolicy : D.json.rawAnswers?.[dec] ?? D.json.decisions?.[dec] ?? (resolvedKey ? D.json.resolved[resolvedKey] : undefined);
    if (!decisionBody) throw Error("decision not found " + s.decisionId);
    const drawingBacked: any = { version: 1, kind: s.kind ?? "dwg-drawn-material", decisionId: s.decisionId, decisionsSha256: D.sha, nativeOwnerIds: owners, measuredGapFeet: s.measuredGapFeet ?? 0, construction: c, ...(dwgBlock ? { dwg: dwgBlock } : {}), acknowledgedUnverifiedBodyIds: acknowledged };
    const applied = s.state !== "proposed";
    const row: any = {
      id: s.id, levelId: s.levelId, elevationFeet: s.elevationFeet, baseElevationFeet: s.baseElevationFeet, topElevationFeet: s.topElevationFeet, state: applied ? "applied" : "proposed",
      carrierContactNativeElementIds: owners.length > 1 ? owners.slice(0, -1) : owners, targetNativeElementId: owners.length > 1 ? owners.at(-1) : 0,
      carrierContactFaceFeet: c.kind === "bridge" ? [c.pointAFeet, c.pointBFeet] : c.kind === "dwg-face-pair" ? c.faceAFeet : c.endFaceFeet,
      nearestCarrierContactFeet: c.kind === "bridge" ? c.pointAFeet : c.kind === "dwg-face-pair" ? c.faceAFeet[0] : c.endFaceFeet[0],
      nearestTargetContactFeet: c.kind === "bridge" ? c.pointBFeet : c.kind === "dwg-face-pair" ? c.faceBFeet[0] : c.endFaceFeet[1],
      contactPaddingFeet: c.kind === "bridge" ? c.overlapFeet : c.kind === "wall-end-extension" ? c.backOverlapFeet : 0.00002,
      partsFeet, sourceFloorIds: floors.map((f: any) => f.nativeElementId), sourceFloorBindings: floors, sourceFloorPartsSha256: nativeDerivedFrameHash(floors), ...(s.materialRole ? { materialRole: s.materialRole } : {}), drawingBacked,
      assumption: { kind: "drawing-backed", authorizationRecorded: applied, authorizationEvidenceSha256: sha([D.sha, dec, decisionBody]), revisitRequired: true, sourceVerified: false, evidenceSha256: sha(drawingBacked) },
    };
    row.evidenceSha256 = sha({ ...row });
    return row;
  };
  const variants = s.kind === "owner-authorized-seal" ? [build(undefined)] : (candidates.length ? candidates : [cites[0]]).map(build);
  rows.push({ row: variants[0], variants, spec: s, cites: cites.map(({ dwg, ...x }: any) => ({ ...x, cited: dwg ? { entities: dwg.entities.length, pairs: dwg.drawnMaterial.faceLinePairs.length, outlines: dwg.drawnMaterial.closedOutlines.length } : undefined })) });
}
console.log("built", rows.length, Math.round(performance.now() - t0), "ms");
if (process.env.VV_DRY === "1") { console.log(JSON.stringify(rows.slice(0, 3).map((x) => ({ id: x.row.id, owners: x.row.drawingBacked.nativeOwnerIds, variants: x.variants.length, explicit: !!x.spec.dwgCite, sec: x.row.drawingBacked.dwg?.sectionId, ack: x.row.drawingBacked.acknowledgedUnverifiedBodyIds.length, floors: x.row.sourceFloorIds })))); console.log("variants", rows.map((x) => x.variants.length).join(",")); process.exit(0); }
const PRIOR: any[] = process.env.VV_PRIOR ? JSON.parse(readFileSync(process.env.VV_PRIOR, "utf8")).rows : [];
const boundIds = new Set((base.nativeIndoorEnvelopes?.levels ?? []).flatMap((l: any) => l.provisionalCornerIds ?? []));
const baseRows = MODE === "full" ? seals.rows.filter((r: any) => boundIds.has(r.id)) : [];
console.log("alone base rows (envelope-bound)", baseRows.length);
const descriptor = (extra: any[]) => { const v = { ...seals, rows: [...baseRows, ...PRIOR, ...extra] }; v.geometrySha256 = nativeProvisionalCornerSealsHash(v); return v; };
const envelopes = (v: any) => MODE === "full" ? { nativeIndoorEnvelopes: { ...base.nativeIndoorEnvelopes, levels: base.nativeIndoorEnvelopes.levels.map((l: any) => l.provisionalCornerGeometrySha256 ? { ...l, provisionalCornerGeometrySha256: v.geometrySha256 } : l) } } : {};
const validate = (rs: any[], withPrior: boolean) => {
  const v = withPrior ? descriptor(rs) : (() => { const x = { ...seals, rows: [...baseRows, ...rs] }; x.geometrySha256 = nativeProvisionalCornerSealsHash(x); return x; })();
  createNativeProvisionalCornerSealIndex({ ...base, nativeProvisionalCornerSeals: v, ...envelopes(v) }, { reviewProposed: true });
  verifyDrawingBackedDrawingEvidence({ ...v, rows: rs }, BRV, DER);
};
const results: any[] = [];
for (const item of rows) {
  const { spec, cites } = item;
  const t = performance.now();
  let error: string | undefined, row = item.variants[0];
  // a row passes if any registered section of its level draws the material; else report the best-covered section's reason
  for (const [k, candidate] of item.variants.entries()) {
    try { validate([candidate], false); row = candidate; error = undefined; break; } catch (e: any) { if (k === 0) error = String(e.message); }
  }
  item.row = row;
  if (error && !row.drawingBacked.dwg && row.drawingBacked.kind === "dwg-drawn-material") error = `no drawn DWG material near the body: ${cites.map((c: any) => `${c.sectionId} ${c.nearby} line(s) within 1.5 ft${c.nearby ? `, none forming a cited wall band/outline that meets the body` : ""}`).join("; ") || "no registered section on this level"} (checker: ${error})`;
  results.push({ id: row.id, case: spec.case, cases: spec.cases, explicitCite: !!(row.drawingBacked.dwg && spec.dwgCite && row.drawingBacked.dwg.sectionId === spec.dwgCite.sectionId && JSON.stringify(row.drawingBacked.dwg.entities) === JSON.stringify(spec.dwgCite.faceLinePair)), state: row.state, ok: !error, error, ms: Math.round(performance.now() - t), construction: row.drawingBacked.construction.kind, bodySqFt: area(row.partsFeet), owners: row.drawingBacked.nativeOwnerIds, sectionId: row.drawingBacked.dwg?.sectionId, cites });
  console.log(error ? "REJECT" : "PASS  ", row.id, error ?? "", Math.round(performance.now() - t) + "ms");
}
const good = rows.filter((_, i) => results[i].ok).map((x) => x.row);
let combined: any = { skipped: true };
if (MODE === "full" && process.env.VV_COMBINED === "1") {
  const t = performance.now();
  let priorDrawingEvidence: string;
  try { verifyDrawingBackedDrawingEvidence(descriptor(good), BRV, DER); priorDrawingEvidence = "all prior + new rows cite this project's registered drawing"; } catch (e: any) { priorDrawingEvidence = "FAILED: " + String(e.message); }
  console.log("drawing evidence", priorDrawingEvidence);
  try { validate(good, true); combined = { priorDrawingEvidence, ok: true, priorRows: PRIOR.length, newRows: good.length, ms: Math.round(performance.now() - t), counts: nativeProvisionalAssumptionCounts(descriptor(good)) }; }
  catch (e: any) { combined = { ok: false, error: String(e.message), ms: Math.round(performance.now() - t) }; }
  console.log("combined", JSON.stringify(combined));
}
const OUT = process.env.VV_OUT ?? V + "/gen-" + MODE;
writeFileSync(OUT + "-rows.json", JSON.stringify({ format: "unbc-drawing-backed-assumption-rows", version: 1, kind: "dwg-drawn-material", input: MODE, note: "integration candidate rows (built by candidate-floors/integration/scripts/gen-rows.ts).", rows: rows.map((x) => x.row) }));
writeFileSync(OUT + "-dropped.json", JSON.stringify(droppedWide, null, 1));
writeFileSync(OUT + "-results.json", JSON.stringify({ input: MODE, results, notes, combined, memo: drawingBackedRowMemoStats() }, null, 1));
console.log("done", Math.round(performance.now() - t0), "ms");
