/** Actual normal-calculator requests over one complete unchanged, previously
 * accepted source JSON. Fresh policy graphs are built here; this command does
 * not perform a package import or mint validation/cache authority. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
import path from "node:path";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRoutingOptions } from "../../app/indoor-project/routing-options";
import { createWorkerRouteCalculator } from "../../app/indoor-project/route-calculation";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { localRoutingImplementation } from "./lib/local-routing-implementation";
const [source, casesFile, out] = process.argv.slice(2);
if (!source || !casesFile || !out)
  throw new Error(
    "Usage: audit-selected-route-repairs.ts COMPLETE-INDOOR.json CASES.json EMPTY-OUTPUT",
  );
const sha = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const implementation = localRoutingImplementation();
const raw = await readFile(source),
  data = JSON.parse(raw.toString()) as IndoorDataset;
const before = sha(JSON.stringify(data));
const cases = JSON.parse(await readFile(casesFile, "utf8")) as {
  id: string;
  from: string;
  to: string;
  mode: "public" | "accessible";
  options?: ProjectRoutingOptions;
  expected?: boolean;
  straightCell?: string;
  sameLevel?: boolean;
}[];
await mkdir(out, { recursive: false });
await initializeNativeExactGeosOverlay();
const calculate = createWorkerRouteCalculator(data);
const results = [];
const actual = [];
for (const item of cases) {
  const from = data.records.find((r) => r.key === item.from)!;
  const to = data.records.find((r) => r.key === item.to)!;
  assert.ok(from && to);
  const started = performance.now();
  const result = calculate(item.from, item.to, item.mode, item.options);
  const route = result.route;
  const checkFailures: string[] = [];
  try {
    if (typeof item.expected === "boolean")
      assert.equal(!!route, item.expected, item.id);
    if (route) {
      for (const e of route.edges) {
        assert.equal(e.enabled, true);
        assert.notEqual(e.kind, "stairs");
      }
      if (item.sameLevel)
        assert.ok(
          route.paths.every(
            (p) => p.levelIds.length === 1 && p.levelIds[0] === from.levelId,
          ),
        );
      if (item.straightCell) {
        const walks = route.paths.filter((p) =>
          p.edgeIds.some((id) => id.startsWith(item.straightCell! + ":walk:")),
        );
        assert.ok(walks.length, item.id + ": expected vestibule not traversed");
        assert.ok(
          walks.every((p) => p.pointsFeet.length === 2),
          item.id + ": vestibule is not straight",
        );
      }
    }
  } catch (error) {
    checkFailures.push(error instanceof Error ? error.message : String(error));
  }
  const steps = route
    ? projectNavigationSteps(data, route, item.from, item.to)
    : [];
  const summary = {
    ...item,
    checkFailures,
    fromNumber: from.number,
    toNumber: to.number,
    available: !!route,
    seconds: (performance.now() - started) / 1000,
    distanceMetres: route?.distanceMetres,
    turnAroundInstructions: steps.filter((s) => /turn around/i.test(s.message))
      .length,
    sourceEdgeIds: route?.edges.map((e) => e.id),
    paths: route?.paths.length,
    diagnostic: result.diagnostic,
  };
  results.push(summary);
  actual.push({ summary, result, steps });
  console.log(JSON.stringify(summary));
  await writeFile(
    path.join(out, sha(item.id) + ".json"),
    JSON.stringify({ summary, result, steps }),
  );
}
assert.equal(sha(JSON.stringify(data)), before);
assert.equal(
  localRoutingImplementation().sha256,
  implementation.sha256,
  "Routing implementation changed during the audit",
);
assert.equal(
  data.edges.filter((e) => e.kind === "stairs" && e.enabled).length,
  0,
);
await writeFile(
  path.join(out, "report.json"),
  JSON.stringify(
    {
      status: "targeted-normal-calculator-requests",
      completeSourceRetained: true,
      fullPackageImportPerformed: false,
      cacheAuthorityGranted: false,
      freshPolicyGraphs: true,
      sourceUnchanged: true,
      inputJsonSha256: sha(raw),
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      implementation,
      results,
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(out, "actual-routes.json.gz"),
  gzipSync(JSON.stringify(actual), { level: 9 }),
);

if (results.some((r) => r.checkFailures.length > 0)) process.exitCode = 1;
