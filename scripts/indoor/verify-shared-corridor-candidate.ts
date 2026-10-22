/** Normal source import, policy-preserving guide installation and actual route
 * worker replay. Results are candidate evidence, never a published receipt.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { build } from "esbuild";
import { strFromU8, unzipSync } from "fflate";
import type { IndoorProject } from "../../app/indoor-project/package";
import {
  exportPreparedRoutingProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
import {
  preparedRoutingKey,
  preparedWalkingGuides,
  validatePreparedRouting,
  withPreparedRouting,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
import {
  createWorkerRouteCalculator,
  type RouteCalculation,
  type RouteRequest,
  type RouteResponse,
} from "../../app/indoor-project/route-calculation";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import { projectRoutingOptionsKey } from "../../app/indoor-project/routing-options";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";

type CandidateCase = {
  id: string;
  from: string;
  to: string;
  mode: RouteRequest["mode"];
  options: NonNullable<RouteRequest["options"]>;
  expected: boolean;
  requiredNativeDoorId?: number;
  requireSharedGuide?: boolean;
};
const [input, guidesPath, casesPath, output, ...extra] = process.argv.slice(2);
if (!input || !guidesPath || !casesPath || !output || extra.length > 0)
  throw new Error(
    "Usage: verify-shared-corridor-candidate.ts SOURCE-MASTER.zip PREPARED-ROUTING.json CASES.json NEW-OUTPUT-DIRECTORY",
  );
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.resolve(output),
  started = performance.now();
await mkdir(out, { recursive: false });
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const jsonSha = (value: unknown) => sha(JSON.stringify(value));
async function fileSha(filename: string) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest("hex");
}
const binding = () =>
  preparedDisplayEngineBinding(
    root,
    [
      "scripts/indoor/verify-shared-corridor-candidate.ts",
      "app/indoor-project/package.ts",
      "app/indoor-project/route-calculation.worker.ts",
    ],
    { namespace: "shared-corridor-candidate-acceptance-v1" },
  );
const implementation = binding(),
  inputSha256 = await fileSha(input),
  casesBytes = await readFile(casesPath),
  cases = JSON.parse(casesBytes.toString()) as CandidateCase[];
assert(
  Array.isArray(cases) && cases.length > 0,
  "Require explicit route cases",
);
const ids = new Set<string>();
for (const item of cases) {
  assert(item.id && !ids.has(item.id), "Cases require unique explicit IDs");
  ids.add(item.id);
  assert(item.from && item.to && item.from !== item.to);
  assert(["public", "accessible"].includes(item.mode));
  assert.equal(
    typeof item.expected,
    "boolean",
    "Every case needs an expectation",
  );
  projectRoutingOptionsKey(item.options);
}
assert(
  cases.some((item) => item.expected && item.requireSharedGuide),
  "Require an actual shared-guide route; an all-fallback replay is incomplete",
);
const phases: { phase: string; seconds: number }[] = [];
const log = (phase: string, details: object = {}) =>
  console.log(
    JSON.stringify({
      phase,
      elapsedSeconds: (performance.now() - started) / 1000,
      ...details,
    }),
  );
const write = (name: string, value: unknown) =>
  writeFile(path.join(out, name), JSON.stringify(value, null, 2) + "\n");
await write("started.json", {
  format: "shared-corridor-candidate-acceptance-v1",
  status: "RUNNING",
  sourceMaster: path.resolve(input),
  inputSha256,
  guidesPath: path.resolve(guidesPath),
  casesSha256: sha(casesBytes),
  implementation,
  nodeVersion: process.version,
  published: false,
  compiledTrustRootChanged: false,
});
await initializeNativeExactGeosOverlay();
let at = performance.now();
let project: IndoorProject | undefined = await readIndoorProject(
  await readFile(input),
  (progress) => log("normal-source-import", progress),
);
assert.equal(
  project.manifest.format,
  "reviter-project",
  "Require the authoring master with preserved source assets",
);
phases.push({
  phase: "normal-source-import",
  seconds: (performance.now() - at) / 1000,
});
const source = project.dataset,
  sourceSha256 = jsonSha(source),
  heldTransitions = source.edges
    .filter((edge) => !edge.enabled && edge.kind !== "walk")
    .map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      nativeElementId: edge.nativeElementId,
    }));
// A complete import can overlap independent complete-cell compilation. Never
// restart the importer just because its immutable guides are not ready yet.
for (let attempt = 0; ; attempt++) {
  try {
    await readFile(guidesPath);
    break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || attempt >= 180)
      throw error;
    log("waiting-for-candidate-guides");
    await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
  }
}
const guidesBytes = await readFile(guidesPath),
  metadata = JSON.parse(guidesBytes.toString()) as PreparedRouting,
  data = withPreparedRouting(source, metadata);
validatePreparedRouting(data);
assert.equal(metadata.sourceGeometryKey, preparedRoutingKey(source));
assert.equal(preparedWalkingGuides(data).size, metadata.guides.length);
assert(metadata.guides.length > 0, "Candidate must install accepted guides");
assert(
  metadata.guides.every((guide) => guide.kind === "shared-corridor"),
  "Require the shared-corridor candidate product",
);
assert.equal(
  jsonSha(source),
  sourceSha256,
  "Guide installation changed the source",
);
log("candidate-guides-bound", { guides: metadata.guides.length });
at = performance.now();
let archive: Uint8Array | undefined = await exportPreparedRoutingProject(
  project,
  data,
);
const archiveSha256 = sha(archive),
  outputZip = path.join(out, "UNBC.shared-pathways.candidate.reviter.zip");
await writeFile(outputZip, archive, { flag: "wx" });
const manifestFiles = unzipSync(archive, {
  filter: (entry) => entry.name === "manifest.json",
});
const manifest = JSON.parse(strFromU8(manifestFiles["manifest.json"]));
const preservation: { name: string; sha256: string; bytes: number }[] = [];
for (const [name, original] of Object.entries(project.files)) {
  if (name === "manifest.json" || name.startsWith("viewer/display/")) continue;
  const saved: Uint8Array = unzipSync(archive, {
    filter: (entry) => entry.name === name,
  })[name];
  assert(saved, `Missing exported member ${name}`);
  const digest = sha(saved);
  if (name === "viewer/indoor.json") {
    assert.equal(
      digest,
      jsonSha(data),
      "Exported dataset bytes differ from the accepted value",
    );
    assert.equal(digest, manifest.indoor.sha256);
    assert.equal(saved.length, manifest.indoor.bytes);
  } else {
    assert.equal(digest, sha(original), `Source asset changed: ${name}`);
    assert.equal(saved.length, original.length);
    preservation.push({ name, sha256: digest, bytes: saved.length });
  }
}
const archiveBytes = archive.length;
archive = undefined;
project = undefined;
phases.push({
  phase: "normal-export-and-transport-verification",
  seconds: (performance.now() - at) / 1000,
});
await write("package.json", {
  status: "EXPORTED_CANDIDATE_NOT_ACCEPTED_RELEASE",
  outputZip,
  archiveSha256,
  archiveBytes,
  indoor: manifest.indoor,
  sourceAssetsUnchanged: preservation,
});
const byKey = new Map(data.records.map((record) => [record.key, record]));
const originalEdges = new Map(data.edges.map((edge) => [edge.id, edge]));
for (const item of cases) {
  assert(
    byKey.has(item.from) && byKey.has(item.to),
    `${item.id}: missing original destination`,
  );
}
const calculate = createWorkerRouteCalculator(data),
  actual: {
    id: string;
    result: RouteCalculation;
    instructions: ReturnType<typeof projectNavigationSteps>;
  }[] = [],
  rows: unknown[] = [],
  failures: { id: string; message: string }[] = [];
for (const item of cases) {
  at = performance.now();
  log("normal-route-start", { id: item.id });
  try {
    const options = { ...item.options, useSharedCorridorGuides: true },
      result = calculate(item.from, item.to, item.mode, options),
      baseline = calculate(item.from, item.to, item.mode, {
        ...options,
        useSharedCorridorGuides: false,
      });
    assert.equal(
      !!result.route,
      item.expected,
      `${item.id}: route expectation`,
    );
    assert.equal(
      !!result.route,
      !!baseline.route,
      "Guides changed route availability",
    );
    if (result.route && baseline.route) {
      assert.deepEqual(
        result.route.edges.map((edge) => edge.id),
        baseline.route.edges.map((edge) => edge.id),
        "Guides changed selected source edges",
      );
      assert.deepEqual(result.route.doorEdgeIds, baseline.route.doorEdgeIds);
      assert.deepEqual(
        result.route.unknownAccessAreas,
        baseline.route.unknownAccessAreas,
      );
      assert.deepEqual(
        result.route.unknownAccessibilityEdges,
        baseline.route.unknownAccessibilityEdges,
      );
      for (const edge of result.route.edges) {
        const original = originalEdges.get(edge.id);
        assert(
          original?.enabled,
          "A disabled or invented source edge was used",
        );
        assert.deepEqual(edge, original, "A source edge changed");
      }
      if (item.requiredNativeDoorId !== undefined)
        assert(
          result.route.edges.some(
            (edge) =>
              edge.kind === "door" &&
              edge.nativeElementId === item.requiredNativeDoorId,
          ),
          "Required original door was not used",
        );
      if (item.requireSharedGuide)
        assert(
          result.route.paths.some((part) => part.sharedCorridorGuideUsed),
          "No accepted shared guide exercised",
        );
      if (item.mode === "accessible")
        assert(
          result.route.paths.every((part) => !part.sharedCorridorGuideUsed),
          "Shared walking guides cannot approve step-free clearance",
        );
    }
    const instructions = result.route
      ? projectNavigationSteps(data, result.route, item.from, item.to)
      : [];
    actual.push({ id: item.id, result, instructions });
    const row = {
      ...item,
      fromNumber: byKey.get(item.from)!.number,
      toNumber: byKey.get(item.to)!.number,
      available: !!result.route,
      sharedPaths:
        result.route?.paths.filter((part) => part.sharedCorridorGuideUsed)
          .length ?? 0,
      distanceMetres: result.route?.distanceMetres,
      edgeIds: result.route?.edges.map((edge) => edge.id),
      diagnostic: result.diagnostic,
      seconds: (performance.now() - at) / 1000,
    };
    rows.push(row);
    log("normal-route-done", row);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ id: item.id, message });
    log("normal-route-failed", { id: item.id, message });
  }
  await write("normal-routes.json", { rows, failures });
}
await write("actual-route-values.json", actual);
// Bundle the unchanged production worker entry. The adapter supplies only the
// Node message bridge; no fake cache, source mutation or receipt is installed.
const workerDirectory = path.join(out, "worker");
await mkdir(workerDirectory);
const workerEntry = path.join(
    root,
    "app/indoor-project/route-calculation.worker.ts",
  ),
  wrapper = path.join(workerDirectory, "wrapper.mjs"),
  bundle = path.join(workerDirectory, "route.worker.mjs");
await writeFile(
  wrapper,
  `import { parentPort } from "node:worker_threads";\nglobalThis.name = "oim-heavy-node-shared-guide-acceptance";\nglobalThis.postMessage = value => parentPort.postMessage(value);\nawait import(${JSON.stringify(workerEntry)});\nparentPort.on("message", value => globalThis.onmessage({data:value}));\nparentPort.postMessage({_ready:true});\n`,
);
const built = await build({
  entryPoints: [wrapper],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  metafile: true,
  banner: {
    js: 'import { createRequire as __qaCreateRequire } from "node:module"; const require = __qaCreateRequire(import.meta.url);',
  },
});
await write("worker/metafile.json", built.metafile);
await mkdir(path.join(workerDirectory, "vendor/native-exact-geos"), {
  recursive: true,
});
await writeFile(
  path.join(workerDirectory, "vendor/native-exact-geos/native-exact-geos.wasm"),
  await readFile(
    path.join(
      root,
      "app/indoor-project/vendor/native-exact-geos/native-exact-geos.wasm",
    ),
  ),
);
const worker = new Worker(pathToFileURL(bundle), {
  execArgv: [],
  resourceLimits: {
    maxOldGenerationSizeMb: 4096,
    maxYoungGenerationSizeMb: 64,
  },
});
let pending:
  | {
      resolve: (value: RouteCalculation) => void;
      reject: (error: Error) => void;
    }
  | undefined;
let ready: (() => void) | undefined;
let rejectReady: ((error: Error) => void) | undefined;
const readiness = new Promise<void>((resolve, reject) => {
  ready = resolve;
  rejectReady = reject;
});
worker.on("message", (response: RouteResponse & { _ready?: boolean }) => {
  if (response._ready) {
    ready?.();
    return;
  }
  if ("error" in response) pending?.reject(new Error(response.error));
  else if ("value" in response) pending?.resolve(response.value);
  pending = undefined;
});
worker.on("error", (error) => {
  rejectReady?.(error);
  pending?.reject(error);
});
const workerRows: unknown[] = [];
let sentData = false;
try {
  let readyTimeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    readiness,
    new Promise<never>((_, reject) => {
      readyTimeout = setTimeout(
        () => reject(new Error("Production route worker did not initialize")),
        30_000,
      );
    }),
  ]).finally(() => clearTimeout(readyTimeout));
  for (const [index, item] of cases.entries()) {
    const expected = actual.find((row) => row.id === item.id);
    if (!expected) continue;
    at = performance.now();
    log("production-worker-route-start", { id: item.id });
    try {
      const response = new Promise<RouteCalculation>((resolve, reject) => {
        pending = { resolve, reject };
      });
      worker.postMessage({
        requestId: index + 1,
        ...(sentData ? {} : { data: routeWorkerDataset(data) }),
        start: item.from,
        end: item.to,
        mode: item.mode,
        options: { ...item.options, useSharedCorridorGuides: true },
      } satisfies RouteRequest);
      sentData = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const value = await Promise.race([
        response,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(new Error("Production route worker exceeded 20 minutes")),
            1_200_000,
          );
        }),
      ]).finally(() => clearTimeout(timeout));
      assert.deepEqual(
        value,
        expected.result,
        `${item.id}: serialized production worker differs from synchronous calculator`,
      );
      assert.deepEqual(
        value.route
          ? projectNavigationSteps(data, value.route, item.from, item.to)
          : [],
        expected.instructions,
        "Worker instructions differ",
      );
      const row = {
        id: item.id,
        status: "PASS",
        seconds: (performance.now() - at) / 1000,
      };
      workerRows.push(row);
      log("production-worker-route-done", row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: `worker:${item.id}`, message });
      workerRows.push({ id: item.id, status: "FAILED", message });
      break;
    }
  }
} finally {
  await worker.terminate();
}
assert.equal(
  jsonSha(source),
  sourceSha256,
  "Normal calculation changed original source data",
);
assert.equal(
  await fileSha(input),
  inputSha256,
  "Original source archive changed",
);
assert.equal(
  sha(await readFile(guidesPath)),
  sha(guidesBytes),
  "Candidate guides changed during acceptance",
);
assert.equal(
  await fileSha(casesPath),
  sha(casesBytes),
  "Route cases changed during acceptance",
);
assert.equal(
  binding().sha256,
  implementation.sha256,
  "Implementation changed during acceptance",
);
const report = {
  format: "shared-corridor-candidate-acceptance-v1",
  status: failures.length > 0 ? "FAILED" : "PASS",
  sourceMasterSha256: inputSha256,
  sourceModel: data.source,
  sourceDatasetSha256: sourceSha256,
  guideSha256: sha(guidesBytes),
  guides: metadata.guides.length,
  outputZip,
  archiveSha256,
  archiveBytes,
  casesSha256: sha(casesBytes),
  implementation,
  nodeVersion: process.version,
  productionWorkerBundleSha256: await fileSha(bundle),
  productionWorkerSourceSha256: await fileSha(workerEntry),
  phases,
  normalCases: rows,
  productionWorkerCases: workerRows,
  heldTransitions,
  sourceGraphGeometryAndPolicyUnchanged: true,
  sourceAssetsUnchanged: preservation,
  failures,
  seconds: (performance.now() - started) / 1000,
  fullNormalSourceImportPerformed: true,
  normalExportPerformed: true,
  productionWorkerSerializedReplay:
    workerRows.length === cases.length && failures.length === 0,
  published: false,
  compiledTrustRootChanged: false,
  releaseAcceptance: false,
};
await write("report.json", report);
log("candidate-acceptance-complete", {
  status: report.status,
  failures: failures.length,
});
if (failures.length > 0) process.exitCode = 1;
