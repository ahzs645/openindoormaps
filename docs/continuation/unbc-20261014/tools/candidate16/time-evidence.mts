/** Moderate. Times main-thread render computations of the editor page on a project ZIP.  node --import tsx time-evidence.mts <zip> */
import { readFile } from "node:fs/promises";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const { readIndoorProject } = await import(A + "package.ts");
const { projectBoundaryEvidence } = await import(A + "boundary-evidence.ts");
const { nativeCirculationCells } = await import(A + "native-circulation.ts");
let t = Date.now();
const p = await readIndoorProject(new Uint8Array(await readFile(process.argv[2]!)));
console.log("read", (Date.now() - t) / 1000);
t = Date.now(); const cells = nativeCirculationCells(p.dataset, { connectorAnchors: false }); console.log("nativeCirculationCells", cells.length, (Date.now() - t) / 1000);
t = Date.now(); const ev = projectBoundaryEvidence(p.dataset, p.rooms); console.log("projectBoundaryEvidence", ev.size, (Date.now() - t) / 1000);
