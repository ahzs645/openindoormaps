// Convert the original RVT exactly as the compiler does and dump wall/column records.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const [REVITER, rvt, out] = process.argv.slice(2);
const { convertRvtBytes } = await import(REVITER + "/lib/reviter/convert.ts");
const bytes = new Uint8Array(readFileSync(rvt));
const sha = createHash("sha256").update(bytes).digest("hex");
const t0 = performance.now();
const r: any = convertRvtBytes(bytes, "UNBC Model - 2026-06-30 - FINAL (Fixed Library) (1).rvt", {});
if (!r.ok) throw new Error(r.error);
const seconds = (performance.now() - t0) / 1000;
const recs = r.elementBounds.filter((e: any) => [-2000011, -2000100, -2001330, -2000170, -2000171].includes(e.categoryId));
const params = new Set<string>();
for (const e of recs.slice(0, 2000)) for (const k of Object.keys(e.parameters ?? {})) params.add(k);
writeFileSync(out, JSON.stringify({ sha256: sha, seconds, origin: r.origin, method: r.method, levels: r.levels,
  memory: process.memoryUsage(), parameterNames: [...params],
  records: recs.map((e: any) => ({ elementId: e.elementId, categoryId: e.categoryId, typeName: e.typeName, familyName: e.familyName,
    wallKind: e.wallKind, renderGeometryProvenance: e.renderGeometryProvenance, boundsFeet: e.boundsFeet, solid: e.solid, solids: e.solids,
    parameters: e.parameters })) }));
console.log(JSON.stringify({ seconds, n: recs.length, origin: r.origin, rss: process.memoryUsage().rss / 2 ** 20 }));
