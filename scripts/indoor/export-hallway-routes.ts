/** Exports the simplified hallway network as a venue `indoorRoutes` GeoJSON
 * and proves that the app's own directions engine routes on it as the
 * network does.
 *
 *   node --import tsx scripts/indoor/export-hallway-routes.ts routing.json \
 *     indoor-routes.geojson [report.json]
 *
 * The check loads the file through `IndoorDirections.loadMapData` (the code
 * every simplified venue uses), then routes sampled destination pairs with
 * the engine's pathfinder, walking and step-free. For every pair the engine
 * must find a route exactly when the network does, at the same cost; the
 * command exits non-zero otherwise. */
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import IndoorDirections from "../../app/indoor-directions/directions/main";
import Pathfinder from "../../app/indoor-directions/pathfinding/pathfinder";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  buildHallwayNetwork,
  createHallwayRouter,
} from "../../app/indoor-project/hallway-network";
import { hallwayNetworkToIndoorRoutes } from "../../app/indoor-project/hallway-network-routes";
import { WALKING_SPEED } from "../../app/utils/route-summary";

const [input, output, reportOutput] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "usage: export-hallway-routes.ts routing.json indoor-routes.geojson [report.json]",
  );
const data = JSON.parse(readFileSync(input, "utf8")) as IndoorDataset;
const network = buildHallwayNetwork(data);
const routes = hallwayNetworkToIndoorRoutes(network, data, {
  walkingSpeedMetresPerSecond: WALKING_SPEED,
});
const text = JSON.stringify(routes);
writeFileSync(output, text);

// The engine without its map: loading and pathfinding never touch it.
type Engine = {
  pathFinder: Pathfinder;
  graph: {
    getEdgeBetween(a: string, b: string): { weight: number } | undefined;
  };
  loadMapData(geoJson: GeoJSON.FeatureCollection): void;
};
const engine = Object.create(IndoorDirections.prototype) as Engine;
engine.pathFinder = new Pathfinder();
engine.loadMapData(routes);

const destinations = new Map<string, GeoJSON.Position>();
for (const f of routes.features)
  if (f.geometry.type === "Point")
    destinations.set(f.properties!.space_id, f.geometry.coordinates);
const keys = [...destinations.keys()].sort();
const route = createHallwayRouter(network);
let seed = 5;
const random = () =>
  (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
const result = {
  pairs: 0,
  bothRoute: 0,
  neitherRoutes: 0,
  mismatchedReach: [] as string[],
  costDifferences: [] as { pair: string; network: number; engine: number }[],
  maxRelativeCostDifference: 0,
};
for (let s = 0; s < 600; s++) {
  const a = keys[Math.floor(random() * keys.length)],
    b = keys[Math.floor(random() * keys.length)];
  if (a === b) continue;
  for (const profile of ["walking", "step-free"] as const) {
    result.pairs++;
    const ours = route(a, b, profile);
    let path: GeoJSON.Position[] | null = null;
    try {
      path = engine.pathFinder.dijkstra(
        destinations.get(a)!,
        destinations.get(b)!,
        {
          accessibleOnly: profile === "step-free",
        },
      );
      if (path.length === 0) path = null;
    } catch {
      path = null;
    }
    if (!ours || !path) {
      if (!ours && !path) result.neitherRoutes++;
      else result.mismatchedReach.push(`${profile} ${a} -> ${b}`);
      continue;
    }
    result.bothRoute++;
    let cost = 0;
    for (let i = 1; i < path.length; i++)
      cost += engine.graph.getEdgeBetween(
        JSON.stringify(path[i - 1]),
        JSON.stringify(path[i]),
      )!.weight;
    const engineMetres = cost * WALKING_SPEED,
      relative =
        Math.abs(engineMetres - ours.metres) / Math.max(ours.metres, 1);
    result.maxRelativeCostDifference = Math.max(
      result.maxRelativeCostDifference,
      relative,
    );
    if (relative > 1e-6 && result.costDifferences.length < 10)
      result.costDifferences.push({
        pair: `${profile} ${a} -> ${b}`,
        network: +ours.metres.toFixed(2),
        engine: +engineMetres.toFixed(2),
      });
  }
}
const lines = routes.features.filter((f) => f.geometry.type === "LineString");
const report = {
  format: "hallway-indoor-routes-export-v1",
  sourceModelSha256: network.sourceModelSha256,
  file: {
    bytes: text.length,
    gzipBytes: gzipSync(text, { level: 9 }).length,
    lines: lines.length,
    destinations: destinations.size,
  },
  engineCheck: {
    ...result,
    maxRelativeCostDifference:
      +result.maxRelativeCostDifference.toExponential(2),
  },
};
if (reportOutput)
  writeFileSync(reportOutput, `${JSON.stringify(report, null, 1)}\n`);
console.log(
  JSON.stringify({
    ...report.file,
    ...report.engineCheck,
    mismatchedReach: result.mismatchedReach.length,
  }),
);
if (
  result.mismatchedReach.length > 0 ||
  result.maxRelativeCostDifference > 1e-6
)
  process.exitCode = 1;
