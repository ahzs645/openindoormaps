/** Targeted refinement replay over the COMPLETE accepted dataset. This does
 * not import a thin source, rebuild policy graphs or grant cache authority.
 * Stored route identities only select original edges for fresh physical and
 * passage checks; a failed guide keeps the original refinement fallback.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { centeredRoutePaths } from "../../app/indoor-project/viewer-centered-route";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";

const [input, acceptedPackageReport, priorNavigation, output] =
  process.argv.slice(2);
if (!input || !acceptedPackageReport || !priorNavigation || !output)
  throw new Error(
    "Usage: audit-corridor-refinement.ts ACCEPTED.zip PACKAGE-REPORT.json PRIOR-NAVIGATION.json OUTPUT.json",
  );
const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const bytes = await readFile(input),
  receipt = JSON.parse(await readFile(acceptedPackageReport, "utf8"));
assert.equal(
  sha(bytes),
  receipt.archiveSha256,
  "Select the exact previously accepted complete package",
);
const files = unzipSync(bytes),
  manifest = JSON.parse(strFromU8(files["manifest.json"]));
assert.equal(sha(files[manifest.indoor.path]), receipt.indoorSha256);
const data = JSON.parse(
  strFromU8(files[manifest.indoor.path]),
) as IndoorDataset;
const before = sha(JSON.stringify(data));
const prior = JSON.parse(await readFile(priorNavigation, "utf8")) as {
  results: {
    id: string;
    mode: string;
    available: boolean;
    sharedPaths: number;
    sourceEdgeIds: string[];
    paths: { pointsFeet: number[][] }[];
  }[];
};
const selected = prior.results.filter(
  (r) => r.available && r.mode === "public" && r.sharedPaths === 0,
);
assert.ok(selected.length > 0, "No previous composite fallbacks to replay");
await initializeNativeExactGeosOverlay();
const run = createImmutableRoutingSession(data),
  edges = new Map(data.edges.map((e) => [e.id, e])),
  nodes = new Map(data.nodes.map((n) => [n.id, n]));
const results = [];
const started = performance.now();
for (const item of selected) {
  const at = performance.now();
  const original = item.sourceEdgeIds.map((id) => {
    const edge = edges.get(id);
    assert.ok(edge?.enabled);
    return edge;
  });
  assert.ok(
    original.length >= 2,
    "Replay needs an ordered original graph chain",
  );
  const starts = [original[0].from, original[0].to].filter(
    (id) => ![original[1].from, original[1].to].includes(id),
  );
  assert.equal(
    starts.length,
    1,
    "Original start follows graph identity, not coordinate coincidence",
  );
  const start = starts[0];
  const nodeIds = [start];
  for (const edge of original) {
    const current = nodeIds.at(-1)!;
    assert.ok(edge.from === current || edge.to === current);
    nodeIds.push(edge.from === current ? edge.to : edge.from);
  }
  const shared = run(() =>
    centeredRoutePaths(data, original, nodeIds, true, true),
  );
  const existing = run(() =>
    centeredRoutePaths(data, original, nodeIds, true, false),
  );
  assert.ok(
    shared.some((p) => p.sharedCorridorGuideUsed),
    "No checked shared guide retained after splitting",
  );
  assert.ok(existing.every((p) => !p.sharedCorridorGuideUsed));
  assert.deepEqual(shared[0].pointsFeet[0], nodes.get(start)!.pointFeet);
  assert.deepEqual(
    shared.at(-1)!.pointsFeet.at(-1),
    nodes.get(nodeIds.at(-1)!)!.pointFeet,
  );
  for (const [i, edge] of original.entries()) {
    if (edge.kind !== "door") continue;
    const path = shared.find(
      (p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id,
    );
    assert.ok(path, "Fixed native door must remain separate");
    assert.equal(path.sharedCorridorGuideUsed, undefined);
    assert.deepEqual(
      path.pointsFeet,
      nodeIds[i] === edge.from ? edge.pointsFeet : edge.pointsFeet.toReversed(),
    );
  }
  const result = {
    id: item.id,
    previousSharedPaths: item.sharedPaths,
    sharedPaths: shared.filter((p) => p.sharedCorridorGuideUsed).length,
    seconds: (performance.now() - at) / 1000,
    originalDoorwaysAndOuterEndpointsUnchanged: true,
    paths: shared,
  };
  results.push(result);
  console.log(
    JSON.stringify({
      id: result.id,
      sharedPaths: result.sharedPaths,
      seconds: result.seconds,
    }),
  );
}
assert.equal(sha(JSON.stringify(data)), before);
const report = {
  status: "targeted-refinement-replay-only",
  engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
  archiveSha256: receipt.archiveSha256,
  indoorSha256: receipt.indoorSha256,
  fullSourceContextRetained: true,
  policyGraphRebuilt: false,
  cacheAuthorityGranted: false,
  originalDatasetUnchanged: true,
  cases: results.length,
  seconds: (performance.now() - started) / 1000,
  results,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
