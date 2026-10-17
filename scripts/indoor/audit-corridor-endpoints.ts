/** Fast replay of saved route identities against the complete current physical
 * source and new candidate guides. This is a refinement diagnostic, not an
 * import, policy-graph approval, publication cache or replacement for navigation
 * acceptance. No source obstacles or policy inputs are cropped out. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRoute } from "../../app/indoor-project/viewer-routing";
import type { ProjectRouteArrival } from "../../app/indoor-project/route-arrival";
import { centeredRoutePaths } from "../../app/indoor-project/viewer-centered-route";
import { centerHallwayRouteEndpoints } from "../../app/indoor-project/hallway-center-endpoints";
import {
  withPreparedRouting,
  validatePreparedRouting,
  preparedWalkingGuides,
} from "../../app/indoor-project/prepared-routing";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { corridorGuideLength } from "../../app/indoor-project/shared-corridor-guides";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";

const [input, guides, priorFile, output] = process.argv.slice(2);
if (!input || !guides || !priorFile || !output)
  throw new Error(
    "Usage: audit-corridor-endpoints.ts SOURCE.zip CANDIDATE-GUIDES.json PRIOR-NAVIGATION.json OUTPUT.json",
  );
const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const bytes = await readFile(input),
  files = unzipSync(bytes);
const manifest = JSON.parse(strFromU8(files["manifest.json"]));
for (const descriptor of [
  manifest.indoor,
  manifest.floors,
  manifest.georeference,
]) {
  const member = files[descriptor.path];
  assert.equal(member.length, descriptor.bytes);
  assert.equal(sha(member), descriptor.sha256);
}
const guideBytes = await readFile(guides);
const data = withPreparedRouting(
  JSON.parse(strFromU8(files[manifest.indoor.path])) as IndoorDataset,
  JSON.parse(guideBytes.toString()),
);
validatePreparedRouting(data);
const before = sha(JSON.stringify(data));
const priorBytes = await readFile(priorFile);
const prior = JSON.parse(priorBytes.toString()) as {
  results: {
    id: string;
    from: string;
    available: boolean;
    sourceEdgeIds: string[];
    departure?: ProjectRouteArrival;
    arrival?: ProjectRouteArrival;
  }[];
};
const selected = prior.results.filter(
  (r) => r.available && r.id.startsWith("05-415:"),
);
assert.equal(selected.length, 42);
await initializeNativeExactGeosOverlay();
const run = createImmutableRoutingSession(data);
assert.ok(run(() => preparedWalkingGuides(data).size) > 0);
const edgeMap = new Map(data.edges.map((e) => [e.id, e]));
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const results = [];
const started = performance.now();
for (const item of selected) {
  const at = performance.now();
  const edges = item.sourceEdgeIds.map((id: string) => {
    const edge = edgeMap.get(id);
    assert.ok(edge?.enabled);
    return edge;
  });
  const first = edges[0];
  const candidates = [first.from, first.to].filter((id) =>
    edges.length > 1
      ? ![edges[1].from, edges[1].to].includes(id)
      : item.departure
        ? nodes
            .get(id)!
            .pointFeet.every((v, k) => v === item.departure!.pointFeet[k])
        : data.records.find((r) => r.key === item.from)?.arrivalNodeId === id,
  );
  assert.equal(candidates.length, 1, "Original route orientation is ambiguous");
  const nodeIds = [candidates[0]];
  for (const edge of edges) {
    const id = nodeIds.at(-1)!;
    assert.ok(edge.from === id || edge.to === id);
    nodeIds.push(edge.from === id ? edge.to : edge.from);
  }
  const paths = run(() => centeredRoutePaths(data, edges, nodeIds, true, true));
  assert.ok(paths.some((p) => p.sharedCorridorGuideUsed));
  assert.deepEqual(paths[0].pointsFeet[0], nodes.get(nodeIds[0])!.pointFeet);
  assert.deepEqual(
    paths.at(-1)!.pointsFeet.at(-1),
    nodes.get(nodeIds.at(-1)!)!.pointFeet,
  );
  for (const [i, edge] of edges.entries()) {
    if (edge.kind !== "door") continue;
    const path = paths.find(
      (p) => p.edgeIds.length === 1 && p.edgeIds[0] === edge.id,
    );
    assert.ok(path, "Fixed doorway must remain separate");
    assert.deepEqual(
      path.pointsFeet,
      nodeIds[i] === edge.from ? edge.pointsFeet : edge.pointsFeet.toReversed(),
    );
  }
  const full: ProjectRoute = {
    edges,
    nodeIds,
    paths,
    distanceMetres: paths.reduce(
      (sum, p) =>
        sum +
        corridorGuideLength(p.pointsFeet) *
          data.alignment.horizontalMetresPerFoot,
      0,
    ),
    sourceDistanceMetres: edges.reduce(
      (sum, edge) => sum + edge.lengthMetres,
      0,
    ),
    unknownAccessAreas: [],
    unknownAccessibilityEdges: 0,
    departure: item.departure && {
      ...item.departure,
      pointFeet: nodes.get(nodeIds[0])!.pointFeet,
    },
    arrival: item.arrival && {
      ...item.arrival,
      pointFeet: nodes.get(nodeIds.at(-1)!)!.pointFeet,
    },
  };
  const route = run(() => centerHallwayRouteEndpoints(data, full));
  if (item.departure)
    assert.ok(
      route.departure?.hallwayCenter,
      `${item.id}: start not at shared hallway join`,
    );
  if (item.arrival)
    assert.ok(
      route.arrival?.hallwayCenter,
      `${item.id}: end not at shared hallway join`,
    );
  if (["05-415:05-411->05-423", "05-415:05-423->05-411"].includes(item.id)) {
    assert.equal(route.paths.length, 1);
    assert.equal(
      route.paths[0].pointsFeet.length,
      2,
      "Straight hall must be one segment without doorway hooks",
    );
  }
  const result = {
    id: item.id,
    seconds: (performance.now() - at) / 1000,
    departure: route.departure,
    arrival: route.arrival,
    paths: route.paths,
    distanceMetres: route.distanceMetres,
  };
  results.push(result);
  console.log(
    JSON.stringify({
      id: item.id,
      seconds: result.seconds,
      vertices: route.paths.reduce((sum, p) => sum + p.pointsFeet.length, 0),
    }),
  );
}
assert.equal(sha(JSON.stringify(data)), before);
await writeFile(
  output,
  JSON.stringify(
    {
      status: "targeted-refinement-replay-only",
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      sourceZipSha256: sha(bytes),
      candidateGuidesSha256: sha(guideBytes),
      priorNavigationSha256: sha(priorBytes),
      fullSourceContextRetained: true,
      policyGraphRebuilt: false,
      cacheAuthorityGranted: false,
      originalDatasetUnchanged: true,
      cases: results.length,
      seconds: (performance.now() - started) / 1000,
      results,
    },
    null,
    2,
  ) + "\n",
);
