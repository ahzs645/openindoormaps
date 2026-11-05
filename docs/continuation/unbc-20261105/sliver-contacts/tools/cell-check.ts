// Local, read-only check of saved routing cells under the contact rule.
// Noding only adds wall material, so a regenerated face is the saved exact face
// minus the noded walls. Each enabled walk in the cell is replayed against the
// pieces, and every node of the cell is placed in its piece.
// usage (from a Reviter checkout with the rule):
//   node --experimental-strip-types --import ./scripts/register-test-typescript.mjs \
//     cell-check.ts REVITER EXTRACT-DIR OUT.json CELL-ID...
// EXTRACT-DIR holds the top-level sections of a master's viewer/indoor.json
// (extract-sections.py): source nativeLevels nativeMaterialSections
// nativeMaterialSectionSupplement nativeDerivedFrameReturns
// nativeProvisionalCornerSeals nativeWallPositionRepairs nativeIndoorEnvelopes
// doors edges nodes walkingSupport walls records circulationGeometry.
import { readFileSync, writeFileSync } from "node:fs";
const [REVITER, DIR, OUT, ...CELLS] = process.argv.slice(2);
const lib = (m: string) => import(`${REVITER}/lib/reviter/${m}.ts`);
await (await lib("native-exact-geos-overlay")).initializeNativeExactGeosOverlay();
const { createNativeRoutingMaterialQuery } = await lib("native-routing-material");
const { nativeRationalOverlay, nativeRationalScalarToIEEE } = await lib("native-rational-overlay");
const { nativeRationalPathSupported, nativeRationalPointInParts } = await lib("native-exact-planar-topology");
// Diagnostic only: NODING_MODULE / CONTACT_FEET evaluate an alternative bound.
const noding = process.env.NODING_MODULE ? await import(process.env.NODING_MODULE) : await lib("native-routing-contact-noding");
const CONTACT = process.env.CONTACT_FEET ? Number(process.env.CONTACT_FEET) : undefined;
const NATIVE_ROUTING_CONTACT_NODING_VERSION = noding.NATIVE_ROUTING_CONTACT_NODING_VERSION + (CONTACT ? `@diagnostic-contact-${CONTACT}` : "");
const nativeRoutingContactNoding = (walls: any[]) => noding.nativeRoutingContactNoding(walls, CONTACT);
const { Rational } = await import(`${REVITER}/lib/reviter/vendor/native-rational-overlay-arithmetic.mjs`);
const load = (k: string) => JSON.parse(readFileSync(`${DIR}/${k}.json`, "utf8"));
const data: any = Object.fromEntries(["source", "nativeLevels", "nativeMaterialSections", "nativeMaterialSectionSupplement",
  "nativeDerivedFrameReturns", "nativeProvisionalCornerSeals", "nativeWallPositionRepairs", "nativeIndoorEnvelopes",
  "doors", "edges", "walkingSupport"].map((k) => [k, load(k)]));
const geometry = load("circulationGeometry"), nodes = new Map<string, any>(load("nodes").map((n: any) => [n.id, n]));
const records = new Map<string, any>(load("records").map((r: any) => [r.key, r]));
const coords = geometry.exactTopology.coordinates.map((c: any) => [
  new Rational(BigInt(c.x[0]), BigInt(c.x[1])), new Rational(BigInt(c.y[0]), BigInt(c.y[1]))]);
const faces = new Map<string, any>(geometry.exactTopology.faces.map((f: any) => [f.id,
  f.parts.map((part: number[][]) => part.map((ring) => ring.slice(0, -1).map((i) => coords[i])))]));
const query = createNativeRoutingMaterialQuery(data), noded = new Map<number, any>();
const result: any[] = [];
for (const id of CELLS) {
  const cell = geometry.cells.find((c: any) => c.id === id);
  const z = cell.elevationFeet, face = faces.get(cell.exactFaceId);
  if (!noded.has(z)) {
    const m = query(z), walls = [...(m.derivedParts ?? []), ...m.parts.filter((p: any) => !p.column).map((p: any) => p.rings)];
    const after = nativeRoutingContactNoding(walls);
    noded.set(z, after.flatMap((w: any, i: number) => w !== walls[i] ? [w] : []));
  }
  const xs = cell.ringsFeet.flat().map((p: number[]) => p[0]), ys = cell.ringsFeet.flat().map((p: number[]) => p[1]);
  const near = noded.get(z).filter((w: any) => w[0].some((p: number[]) =>
    p[0] >= Math.min(...xs) - 1 && p[0] <= Math.max(...xs) + 1 && p[1] >= Math.min(...ys) - 1 && p[1] <= Math.max(...ys) + 1));
  const pieces = nativeRationalOverlay("difference", face, ...near);
  const area = (part: any) => part.reduce((s: number, ring: any, k: number) => {
    let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length];
      a += nativeRationalScalarToIEEE(p[0]) * nativeRationalScalarToIEEE(q[1]) - nativeRationalScalarToIEEE(q[0]) * nativeRationalScalarToIEEE(p[1]); }
    return s + (k ? -1 : 1) * Math.abs(a) / 2; }, 0);
  const walks = data.edges.filter((e: any) => e.kind === "walk" && e.enabled && e.nativeCellId === id);
  const ends = [...new Set(walks.flatMap((e: any) => [e.from, e.to]))] as string[];
  const label = (nid: string) => {
    const n = nodes.get(nid); if (!n) return nid;
    if (n.kind === "arrival") return `arrival ${records.get(n.roomKey)?.number ?? n.roomKey}`;
    const door = data.doors.find((d: any) => nid.startsWith(d.id + ":"));
    return door ? `${nid} (${door.roomKeys.map((k: string) => records.get(k)?.number ?? k).join("/")})` : nid;
  };
  const pieceOf = (nid: string) => { const p = nodes.get(nid)?.pointFeet; if (!p) return null;
    const i = pieces.findIndex((part: any) => nativeRationalPointInParts([p[0], p[1]], [part])); return i < 0 ? null : i; };
  result.push({ cell: id, elevationFeet: z, savedFaceParts: face.length, nodedWallsNearCell: near.length,
    pieces: pieces.map((part: any, i: number) => ({ piece: i, areaSqFt: area(part), nodes: ends.filter((n) => pieceOf(n) === i).map(label) })),
    nodesOutsidePieces: ends.filter((n) => pieceOf(n) === null).map(label),
    walks: walks.map((e: any) => ({ walk: e.id, from: label(e.from), to: label(e.to),
      stillSupported: nativeRationalPathSupported(e.pointsFeet.map((p: number[]) => [p[0], p[1]]), pieces) })) });
}
writeFileSync(OUT, JSON.stringify({ format: "unbc-sliver-contact-cell-check-v1", rule: NATIVE_ROUTING_CONTACT_NODING_VERSION, cells: result }, null, 1));
for (const r of result) console.log(r.cell, "pieces", r.pieces.length, "walks blocked", r.walks.filter((w: any) => !w.stillSupported).length, "/", r.walks.length);
