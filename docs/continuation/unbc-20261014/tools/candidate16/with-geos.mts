/** Light wrapper: initialize the exact native overlay engine, then run an OIM CLI script with the remaining arguments.
 *  node --import tsx with-geos.mts <script.ts> [args...] */
const A = "/Users/ahmadjalil/github/openindoormaps/app/indoor-project/";
await (await import(A + "native-exact-geos-overlay.ts")).initializeNativeExactGeosOverlay();
const [script, ...rest] = process.argv.slice(2);
process.argv = [process.argv[0]!, script!, ...rest];
await import(script!);
