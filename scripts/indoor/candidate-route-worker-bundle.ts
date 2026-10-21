/** Test/publication-candidate bundle only. Use a freshly checked isolated
 * receipt or explicitly test the compiled source receipt. The production
 * worker and checked WASM remain unchanged. Profiling is wrapper-only. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import type { PublishedRouteCellReceipt } from "../../app/indoor-project/published-route-cells";

export async function buildCandidateProductionRouteBundle(
  root: string,
  out: string,
  receipt: PublishedRouteCellReceipt,
  options: {
    useCompiledReceipt?: boolean;
    profileFirstRequest?: boolean;
    workerKind?: "published" | "progressive";
  } = {},
) {
  const workerEntry = path.join(
      root,
      options.workerKind === "progressive"
        ? "app/indoor-project/progressive-route.worker.ts"
        : "app/indoor-project/published-route-calculation.worker.ts",
    ),
    workerSource = new Uint8Array(await fs.readFile(workerEntry));
  const wrapper = path.join(out, "production-route-wrapper.mjs"),
    bundle = path.join(out, "production-route-worker.mjs");
  await fs.writeFile(
    wrapper,
    `import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { getHeapStatistics } from "node:v8";
${options.profileFirstRequest ? 'import inspector from "node:inspector/promises"; import { writeFile } from "node:fs/promises"; const profileSession=new inspector.Session(); profileSession.connect(); await profileSession.post("Profiler.enable"); await profileSession.post("Profiler.start"); let profilePending=true;' : ""}
const began=performance.now();
globalThis.name = "oim-heavy-node-route-audit";
globalThis.location = { href: "https://candidate.test/openindoormaps/assets/route.worker.js" };
globalThis.indexedDB = { open() { throw Error("Persistent browser cache intentionally unavailable"); } };
const memory = () => ({ ...process.memoryUsage(), heapLimit: getHeapStatistics().heap_size_limit });
globalThis.fetch = async input => {
 const url=String(input instanceof Request ? input.url : input);
 const cacheUrl=new URL(workerData.receipt.url,globalThis.location.href).href;
 const sourcePath=url===cacheUrl ? workerData.cachePath : workerData.downloads?.[url];
 if(!sourcePath) throw Error("Unexpected worker download: "+url);
 const bytes=await readFile(sourcePath);
 parentPort.postMessage({ _qaFetch: { url, bytes:bytes.length, elapsedSeconds:(performance.now()-began)/1000, memory:memory() } });
 return new Response(bytes,{status:200,headers:{"content-length":String(bytes.length)}});
};
globalThis.postMessage = async response => {
 ${options.profileFirstRequest ? 'if(profilePending){profilePending=false; const value=await profileSession.post("Profiler.stop"); await writeFile(new URL("./first-request.cpuprofile",import.meta.url),JSON.stringify(value.profile));profileSession.disconnect();}' : ""}
 parentPort.postMessage({ _qaResponse: response, memory: memory(), elapsedSeconds:(performance.now()-began)/1000 });
};
await import(${JSON.stringify(workerEntry)});
parentPort.on("message", data => globalThis.onmessage({data}));
parentPort.postMessage({ _qaReady:true,memory:memory(),elapsedSeconds:(performance.now()-began)/1000 });
`,
    { flag: "wx" },
  );
  let receiptReplacements = 0;
  const built = await build({
    entryPoints: [wrapper],
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    metafile: true,
    write: true,
    define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
    banner: {
      js: 'import { createRequire as __qaCreateRequire } from "node:module"; const require = __qaCreateRequire(import.meta.url);',
    },
    plugins: options.useCompiledReceipt
      ? []
      : [
          {
            name: "fresh-candidate-publisher-receipt",
            setup(api) {
              api.onLoad(
                { filter: /[/\\]published-route-cell-receipts\.ts$/ },
                () => {
                  receiptReplacements++;
                  return {
                    contents: `export const PUBLISHED_ROUTE_CELL_RECEIPTS=Object.freeze([${JSON.stringify(receipt)}]);`,
                    loader: "ts",
                  };
                },
              );
            },
          },
        ],
  });
  assert.equal(
    receiptReplacements,
    options.useCompiledReceipt ? 0 : 1,
    "Isolated bundle receipt mode must match its declared source",
  );
  const wasmRelative =
      "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm",
    wasmTarget = path.join(
      out,
      "vendor/native-exact-geos/native-exact-geos.wasm",
    );
  await fs.mkdir(path.dirname(wasmTarget), { recursive: true });
  await fs.copyFile(path.join(root, wasmRelative), wasmTarget);
  await fs.writeFile(
    path.join(out, "bundle-metafile.json"),
    JSON.stringify(built.metafile, null, 2),
  );
  return { workerEntry, workerSource, bundle };
}
