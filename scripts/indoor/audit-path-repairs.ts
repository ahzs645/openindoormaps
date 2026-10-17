/** Scoped refinement over a complete immutable source. This is not a fresh
 * package import, policy graph approval, or a replacement for actual routes. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { centeredRoutePaths } from "../../app/indoor-project/viewer-centered-route";
import type { ProjectRoute } from "../../app/indoor-project/viewer-routing";
import { centerHallwayRouteEndpoints } from "../../app/indoor-project/hallway-center-endpoints";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import type { PreparedRouting } from "../../app/indoor-project/prepared-routing";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
const [input, examplesFile, output, prefix] = process.argv.slice(2);
if (!input || !examplesFile || !output)
  throw new Error(
    "Usage: audit-path-repairs.ts COMPLETE-INDOOR.json PRIOR-EXAMPLES.json.gz OUTPUT.json [ID-PREFIXES-SEPARATED-BY-|]",
  );
const sha = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const raw = await readFile(input),
  data = JSON.parse(raw.toString()) as IndoorDataset;
const before = sha(JSON.stringify(data));
const prior = JSON.parse(
  gunzipSync(await readFile(examplesFile)).toString(),
) as Record<string, { route: ProjectRoute }>;
await initializeNativeExactGeosOverlay();
const run = createImmutableRoutingSession(data),
  nodes = new Map(data.nodes.map((n) => [n.id, n]));
const edges = new Map(data.edges.map((e) => [e.id, e]));
const guides = new Map(
  (
    (data as IndoorDataset & { preparedRouting?: PreparedRouting })
      .preparedRouting?.guides ?? []
  ).map((g) => [g.edgeId, g]),
);
const results: {
  id: string;
  edgeIds: string[];
  nodeIds: string[];
  priorPaths?: ProjectRoute["paths"];
  visiblePaths?: ProjectRoute["paths"];
  turnAroundInstructions?: number;
  visibleDistanceMetres?: number;
  paths: ProjectRoute["paths"];
  seconds: number;
}[] = [];
const replay = (
  id: string,
  original: IndoorEdge[],
  nodeIds: string[],
  priorPaths?: ProjectRoute["paths"],
  priorRoute?: ProjectRoute,
) => {
  if (prefix && !prefix.split("|").some((p) => id.startsWith(p))) return;
  const at = performance.now();
  const paths = run(() =>
    centeredRoutePaths(data, original, nodeIds, true, true),
  );
  assert.deepEqual(paths[0].pointsFeet[0], nodes.get(nodeIds[0])!.pointFeet);
  assert.deepEqual(
    paths.at(-1)!.pointsFeet.at(-1),
    nodes.get(nodeIds.at(-1)!)!.pointFeet,
  );
  for (let i = 0; i < original.length; i++)
    if (
      ["stairs", "local-steps", "ramp", "elevator", "door"].includes(
        original[i].kind,
      )
    ) {
      const e = original[i];
      const p = paths.find(
        (p) => p.edgeIds.length === 1 && p.edgeIds[0] === e.id,
      );
      assert.ok(p, `Missing fixed source transition ${e.id}`);
      assert.deepEqual(
        p.pointsFeet,
        nodeIds[i] === e.from ? e.pointsFeet : e.pointsFeet.toReversed(),
      );
    }
  const full: ProjectRoute = {
    ...priorRoute,
    edges: original,
    nodeIds,
    paths,
    distanceMetres: paths.reduce(
      (sum, p) =>
        sum +
        p.pointsFeet
          .slice(1)
          .reduce(
            (s, b, i) =>
              s +
              Math.hypot(b[0] - p.pointsFeet[i][0], b[1] - p.pointsFeet[i][1]),
            0,
          ) *
          data.alignment.horizontalMetresPerFoot,
      0,
    ),
    sourceDistanceMetres: original.reduce((sum, e) => sum + e.lengthMetres, 0),
    unknownAccessAreas: priorRoute?.unknownAccessAreas ?? [],
    unknownAccessibilityEdges: priorRoute?.unknownAccessibilityEdges ?? 0,
    departure: priorRoute?.departure && {
      ...priorRoute.departure,
      pointFeet: nodes.get(nodeIds[0])!.pointFeet,
      hallwayCenter: undefined,
    },
    arrival: priorRoute?.arrival && {
      ...priorRoute.arrival,
      pointFeet: nodes.get(nodeIds.at(-1)!)!.pointFeet,
      hallwayCenter: undefined,
    },
  };
  const shown = run(() => centerHallwayRouteEndpoints(data, full));
  const steps = projectNavigationSteps(data, shown, id, id);
  const result = {
    id,
    visiblePaths: shown.paths,
    visibleDistanceMetres: shown.distanceMetres,
    turnAroundInstructions: steps.filter((s) => /turn around/i.test(s.message))
      .length,
    edgeIds: original.map((e) => e.id),
    nodeIds,
    priorPaths,
    paths,
    seconds: (performance.now() - at) / 1000,
  };
  results.push(result);
  console.log(
    JSON.stringify({
      id,
      points: paths.reduce((s, p) => s + p.pointsFeet.length, 0),
      shared: paths.filter((p) => p.sharedCorridorGuideUsed).length,
      seconds: result.seconds,
    }),
  );
};
for (const room of data.records.filter(
  (r) => r.building === "04" && /vestibule/i.test(r.name),
)) {
  const walks = data.edges.filter(
    (e) =>
      e.enabled &&
      e.kind === "walk" &&
      [e.from, e.to].every((id) => nodes.get(id)?.roomKey === room.key),
  );
  // Enumerate individual approaches and two-leg journeys through an original
  // arrival. All foreign geometry/access evidence remains in `data`.
  for (const e of walks)
    for (const forward of [true, false]) {
      const ids = forward ? [e.from, e.to] : [e.to, e.from];
      const g = guides.get(e.id);
      if (!g) continue;
      replay(`${room.number}:${e.id}:${forward}`, [e], ids, [
        {
          edgeIds: [e.id],
          levelIds: [room.levelId],
          pointsFeet: forward ? g.pointsFeet : g.pointsFeet.toReversed(),
          centered: false,
        },
      ]);
    }
  for (let a = 0; a < walks.length; a++)
    for (let b = a + 1; b < walks.length; b++) {
      const e = walks[a],
        f = walks[b];
      const mid = [e.from, e.to].find(
        (id) =>
          [f.from, f.to].includes(id) && nodes.get(id)?.kind === "arrival",
      );
      if (!mid || !guides.has(e.id) || !guides.has(f.id)) continue;
      const ids = [
        e.from === mid ? e.to : e.from,
        mid,
        f.from === mid ? f.to : f.from,
      ];
      for (const reverse of [false, true])
        replay(
          `${room.number}:through:${a}:${b}:${reverse}`,
          reverse ? [f, e] : [e, f],
          reverse ? ids.toReversed() : ids,
        );
    }
}
for (const [id, item] of Object.entries(prior).filter(
  ([id]) =>
    id.startsWith("fourTo") ||
    id.startsWith("libraryLift") ||
    id.startsWith("selected:"),
)) {
  const source = item.route.edges.map((e) => edges.get(e.id)!);
  assert.ok(source.every(Boolean));
  replay(id, source, item.route.nodeIds, item.route.paths, item.route);
}
assert.equal(sha(JSON.stringify(data)), before);
await writeFile(
  output,
  JSON.stringify({
    status: "targeted-refinement-replay-only",
    selectedPrefix: prefix,
    inputJsonSha256: sha(raw),
    sourceUnchanged: true,
    fullPhysicalAndPolicyContextRetained: true,
    policyGraphRebuilt: false,
    sourceModelSha256: data.source.modelSha256,
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    results,
  }),
);
