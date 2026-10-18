/** Fresh checked physical-cache candidate from a complete saved visitor JSON.
 * No prior cache, receipt injection, source edit or publication occurs here.
 * Full physical validation and both policy graphs run once in one session.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const { resolve, join } = path;
import assert from "node:assert/strict";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { RouteRequest } from "../../app/indoor-project/route-calculation";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { localRoutingImplementation } from "./lib/local-routing-implementation";
import {
  collectFreshCandidateRoutingCache,
  writeFreshCandidateRoutingCache,
} from "./candidate-routing-cache";

const [input, expectedSha, casesFile, output] = process.argv.slice(2);
if (
  !input ||
  !expectedSha ||
  !casesFile ||
  !output ||
  !/^[a-f0-9]{64}$/.test(expectedSha)
)
  throw new Error(
    "Usage: prepare-directions-candidate.ts COMPLETE-VISITOR.json EXPECTED-SHA256 CASES.json NEW-OUTPUT",
  );
const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const root = resolve(import.meta.dirname, "../..");
assert.equal(
  preparedDisplayEngineBinding(root).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
  "Refresh the preparation engine before this isolated capture",
);
const implementation = localRoutingImplementation(),
  started = performance.now();
const raw = await readFile(input);
assert.equal(hash(raw), expectedSha, "Complete original visitor bytes differ");
const data = routeWorkerDataset(JSON.parse(raw.toString()) as IndoorDataset),
  snapshot = hash(JSON.stringify(data));
const cases = JSON.parse(await readFile(casesFile, "utf8")) as (Omit<
  RouteRequest,
  "data" | "requestId"
> & { id: string; from: string; to: string; expected?: boolean })[];
await mkdir(output, { recursive: false });
const phases: { phase: string; seconds: number }[] = [];
const log = (phase: string, extra = {}) =>
  console.log(
    JSON.stringify({
      phase,
      elapsedSeconds: (performance.now() - started) / 1000,
      ...extra,
    }),
  );
const measure = <T>(phase: string, fn: () => T): T => {
  log(phase + ":start");
  const at = performance.now(),
    value = fn();
  const seconds = (performance.now() - at) / 1000;
  phases.push({ phase, seconds });
  log(phase + ":done", { seconds });
  return value;
};
await initializeNativeExactGeosOverlay();
const run = createImmutableRoutingSession(data),
  calculate = createWorkerRouteCalculator(data);
const actual: unknown[] = [],
  routes: unknown[] = [];
const fresh = run(() => {
  measure("complete-route-projection-validation", () =>
    validateIndoorDataset(data),
  );
  for (const mode of ["public", "accessible"] as const)
    measure(mode + "-policy-graph", () => calculate("", "", mode));
  for (const item of cases) {
    const from = data.records.find((r) => r.key === item.from),
      to = data.records.find((r) => r.key === item.to);
    assert(from && to, "Case must retain original source identities");
    const at = performance.now(),
      result = calculate(item.from, item.to, item.mode, item.options);
    if (item.expected !== undefined)
      assert.equal(!!result.route, item.expected, item.id);
    if (result.route)
      for (const edge of result.route.edges) assert.equal(edge.enabled, true);
    actual.push({
      id: item.id,
      from: from.number,
      to: to.number,
      mode: item.mode,
      available: !!result.route,
      seconds: (performance.now() - at) / 1000,
      distanceMetres: result.route?.distanceMetres,
      edgeIds: result.route?.edges.map((e) => e.id),
      diagnostic: result.diagnostic,
    });
    routes.push({ id: item.id, result });
    log("normal-route", actual.at(-1) as object);
  }
  return measure("collect-fresh-physical-cache", () =>
    collectFreshCandidateRoutingCache(data),
  );
});
assert.equal(hash(JSON.stringify(data)), snapshot, "Source projection changed");
assert.equal(
  hash(await readFile(input)),
  expectedSha,
  "Original visitor changed during validation",
);
assert.equal(
  localRoutingImplementation().sha256,
  implementation.sha256,
  "Routing source changed during capture",
);
assert.equal(
  preparedDisplayEngineBinding(root).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
  "Preparation source changed during capture",
);
const cache = await writeFreshCandidateRoutingCache(
  fresh,
  join(output, "cache"),
);
await writeFile(join(output, "actual-routes.json"), JSON.stringify(routes));
const report = {
  format: "fresh-directions-candidate-preparation-v1",
  inputSha256: expectedSha,
  routingDatasetSha256: snapshot,
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  implementation,
  phases,
  actual,
  cache,
  elapsedSeconds: (performance.now() - started) / 1000,
  sourceUnchanged: true,
  fullPackageImportPerformed: false,
  completeRouteProjectionValidation: true,
  published: false,
  compiledTrustRootChanged: false,
};
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
log("candidate-ready", {
  cacheBytes: cache.receipt.compressedBytes,
  cachePath: cache.cachePath,
});
