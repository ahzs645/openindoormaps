/** Moderate-heavy. Rebuilds only the listed native circulation cells with the current reviter builder and merges their
 *  new walk edges into the routing dataset (other edges unchanged).  node --import tsx probe.mts <in.json> <cells.json> <out.json> */
import { readFile, writeFile } from "node:fs/promises";
const R = "/Users/ahmadjalil/github/reviter/lib/reviter/";
await (await import(R + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const { attachNativeCirculationCellRoutes } = await import(R + "native-circulation-geometry.ts");
const [inp, cellsPath, out] = process.argv.slice(2);
const D: any = JSON.parse(await readFile(inp, "utf8"));
const want = new Set<string>(JSON.parse(await readFile(cellsPath, "utf8")));
const original = D.edges.slice();
const allCells = D.circulationGeometry.cells;
D.circulationGeometry.cells = allCells.filter((c: any) => want.has(c.id));
const t = Date.now();
const n = attachNativeCirculationCellRoutes(D);
const fresh = D.edges.filter((e: any) => e.nativeCellId && want.has(e.nativeCellId));
D.circulationGeometry.cells = allCells;
D.edges = [...original.filter((e: any) => !(e.nativeCellId && want.has(e.nativeCellId))), ...fresh];
console.log("attach returned", n, "fresh edges", fresh.length, "stitches", fresh.filter((e: any) => e.id.includes(":stitch") || false).length, "old edges in cells", original.filter((e: any) => e.nativeCellId && want.has(e.nativeCellId)).length, "seconds", (Date.now() - t) / 1000);
await writeFile(out, JSON.stringify(D));
