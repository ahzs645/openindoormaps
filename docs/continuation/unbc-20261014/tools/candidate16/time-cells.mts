/** Moderate. Profiles nativeCirculationCells pieces on a viewer/indoor.json dataset.  node --cpu-prof --import tsx time-cells.mts <indoor.json> */
import { readFile } from "node:fs/promises";
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const N = await import(A + "native-circulation.ts");
const D = JSON.parse(await readFile(process.argv[2]!, "utf8"));
let t = Date.now(); N.nativeCirculationGeometryKey(D); console.log("geometryKey", (Date.now() - t) / 1000);
t = Date.now(); N.nativeCirculationExactIndex(D); console.log("exactIndex", (Date.now() - t) / 1000);
t = Date.now(); const c = N.nativeCirculationCells(D, { connectorAnchors: false }); console.log("cells", c.length, (Date.now() - t) / 1000);
