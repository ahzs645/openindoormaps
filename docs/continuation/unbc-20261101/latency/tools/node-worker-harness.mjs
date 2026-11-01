// Run the unchanged production progressive-route worker entry in a Node worker
// thread (same approach as scripts/indoor/verify-shared-corridor-candidate.ts),
// fed by a local HTTP server with the progressive export and directions cache.
// Each worker message is CPU-profiled inside the worker with node:inspector.
//
//   node node-worker-harness.mjs REPO_ROOT OUT_DIR [--no-profile] [--sequence=a,b|a|b]
//
// Sequence: requests sent to ONE worker in order; then each listed again as a
// fresh worker with --fresh. Journeys:
//   a: 04-204 -> 08-267 corridor, hallway-only (allowOtherRoomTransit false)
//   b: 04-255 -> 08-272 with transit (allowOtherRoomTransit true)
import { build } from "esbuild";
import { createServer } from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  appendFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [repo, out] = args.filter((a) => !a.startsWith("--"));
const profile = !flags.includes("--no-profile");
const sequence = (
  flags.find((f) => f.startsWith("--sequence="))?.slice(11) ?? "a,b"
).split(",");
const fresh = flags.includes("--fresh");
await mkdir(out, { recursive: true });
const progress = path.join(out, "progress.jsonl");
const t0 = performance.now();
const log = async (stage, extra = {}) => {
  const row = { stage, seconds: (performance.now() - t0) / 1000, ...extra };
  await appendFile(progress, JSON.stringify(row) + "\n");
  console.log(JSON.stringify(row));
  return row;
};

// ---- static server -------------------------------------------------------
const PUBLIC = "/home/user/unbc-work/agents/latency/public";
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (
    !file.startsWith(PUBLIC) ||
    !existsSync(file) ||
    statSync(file).isDirectory()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-length": statSync(file).size,
    "content-type": file.endsWith(".json")
      ? "application/json"
      : "application/octet-stream",
  });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const manifestUrl = `${base}/data/unbc/manifest.json`;
const manifest = JSON.parse(
  await readFile(path.join(PUBLIC, "data/unbc/manifest.json"), "utf8"),
);

// ---- bundle the production worker entry --------------------------------
const dir = path.join(out, "worker");
await mkdir(path.join(dir, "vendor/native-exact-geos"), { recursive: true });
const entry = path.join(repo, "app/indoor-project/progressive-route.worker.ts");
const wrapper = path.join(dir, "wrapper.mjs");
const bundle = path.join(dir, "progressive-route.worker.mjs");
await writeFile(
  wrapper,
  `import { parentPort } from "node:worker_threads";
import { Session } from "node:inspector/promises";
import { writeFileSync } from "node:fs";
const PROFILE = ${JSON.stringify(profile)};
const OUT = ${JSON.stringify(out)};
globalThis.name = "oim-heavy-node-latency-harness";
// No IndexedDB in Node: every open fails, exactly like a browser without storage.
globalThis.indexedDB = { open() { const r = {}; setTimeout(() => { r.error = new Error("IndexedDB unavailable"); r.onerror?.({ target: r }); }); return r; } };
const session = new Session();
session.connect();
if (PROFILE) { await session.post("Profiler.enable"); await session.post("Profiler.setSamplingInterval", { interval: 1000 }); }
let current;
globalThis.postMessage = async (value) => {
  if (PROFILE && current) {
    const { profile } = await session.post("Profiler.stop");
    writeFileSync(OUT + "/" + current + ".cpuprofile", JSON.stringify(profile));
  }
  const memory = process.memoryUsage();
  parentPort.postMessage({ value, memory: { rss: memory.rss, heapUsed: memory.heapUsed } });
};
await import(${JSON.stringify(entry)});
parentPort.on("message", async ({ tag, request }) => {
  current = tag;
  if (PROFILE) await session.post("Profiler.start");
  globalThis.onmessage({ data: request });
});
parentPort.postMessage({ ready: true });
`,
);
await build({
  entryPoints: [wrapper],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "error",
  banner: {
    js: 'import { createRequire as __qaCreateRequire } from "node:module"; const require = __qaCreateRequire(import.meta.url);',
  },
});
await copyFile(
  path.join(
    repo,
    "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm",
  ),
  path.join(dir, "vendor/native-exact-geos/native-exact-geos.wasm"),
);

const journeys = {
  a: {
    name: "corridor-default",
    start: "rm-694-2b971ef6dc47",
    end: "rm-694-43988ffdc334",
    options: { endpointMode: "inside", allowOtherRoomTransit: false },
  },
  b: {
    name: "office-transit",
    start: "rm-694-072a835d76b9",
    end: "rm-694-0179b206bb5d",
    options: { endpointMode: "inside", allowOtherRoomTransit: true },
  },
};
const serialize = (d) =>
  JSON.stringify(
    { value: d.value, steps: d.steps, summary: d.summary },
    (_k, v) =>
      v instanceof Set
        ? { $set: [...v].sort() }
        : v instanceof Map
          ? { $map: [...v] }
          : v,
  );

function startWorker() {
  const worker = new Worker(pathToFileURL(bundle), {
    resourceLimits: {
      maxOldGenerationSizeMb: 6144,
      maxYoungGenerationSizeMb: 64,
    },
  });
  let pending;
  const ready = new Promise((resolve, reject) => {
    worker.on("message", (m) => {
      if (m.ready) return resolve();
      pending?.(m);
    });
    worker.on("error", reject);
  });
  return {
    worker,
    ready,
    send: (tag, request) =>
      new Promise((resolve) => {
        pending = resolve;
        worker.postMessage({ tag, request });
      }),
  };
}
const results = [];
let requestId = 0;
async function run(workerLabel, keys) {
  const w = startWorker();
  await w.ready;
  let first = true;
  for (const key of keys) {
    const j = journeys[key];
    const tag = `${workerLabel}-${j.name}`;
    await log(`${tag}:request`);
    const started = performance.now();
    const { value: d, memory } = await w.send(tag, {
      requestId: ++requestId,
      revisionSha256: manifest.revisionSha256,
      delivery: first
        ? {
            url: manifestUrl,
            manifest,
            preferHttpBrotli: false,
            offline: false,
          }
        : undefined,
      start: j.start,
      end: j.end,
      mode: "public",
      options: j.options,
    });
    const seconds = (performance.now() - started) / 1000;
    first = false;
    if (d.error) {
      results.push({ tag, seconds, error: d.error });
      await log(`${tag}:error`, { seconds, error: d.error });
      continue;
    }
    const body = serialize(d);
    await writeFile(path.join(out, `${tag}-response.json`), body);
    const row = {
      tag,
      journey: j.name,
      seconds,
      distanceMetres: d.value.route?.distanceMetres,
      stepCount: d.steps.length,
      bodySha256: createHash("sha256").update(body).digest("hex"),
      bodyBytes: body.length,
      rssMiB: Math.round(memory.rss / 2 ** 20),
      heapUsedMiB: Math.round(memory.heapUsed / 2 ** 20),
    };
    results.push(row);
    await log(`${tag}:response`, row);
  }
  await w.worker.terminate();
}
await run("shared", sequence);
if (fresh) for (const key of sequence) await run(`fresh-${key}`, [key]);
await writeFile(
  path.join(out, "harness-results.json"),
  JSON.stringify(
    {
      repo,
      manifestRevision: manifest.revisionSha256,
      profile,
      sequence,
      results,
    },
    null,
    2,
  ),
);
server.close();
