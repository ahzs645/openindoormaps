import Graph from "../app/indoor-directions/pathfinding/graph";
import Pathfinder from "../app/indoor-directions/pathfinding/pathfinder";
import routes from "../app/data/galleria/indoor-routes.geojson";

const graph = new Graph();

for (const feature of routes.features) {
  if (feature.geometry.type !== "LineString") continue;
  const p = feature.properties ?? {};
  const networkType =
    typeof p.network_type === "string" ? p.network_type.toLowerCase() : null;
  const metadata = {
    access_type: p.access_type ?? null,
    direction:
      p.direction === "forward" || p.direction === "backward"
        ? p.direction
        : "both",
    from_level_id: p.from_level_id ?? null,
    is_accessible:
      typeof p.is_accessible === "boolean"
        ? p.is_accessible
        : !["stairs", "escalator"].includes(networkType ?? ""),
    level_id: p.level_id ?? null,
    network_type: networkType,
    to_level_id: p.to_level_id ?? null,
    vertical_connection_id: p.vertical_connection_id ?? null,
  };
  const coords = feature.geometry.coordinates;
  for (let i = 0; i < coords.length - 1; i++) {
    const cost = typeof p.cost === "number" ? p.cost : null;
    const weight = cost
      ? cost / (coords.length - 1)
      : Math.hypot(
          coords[i + 1][0] - coords[i][0],
          coords[i + 1][1] - coords[i][1],
        );
    graph.addEdge(
      JSON.stringify(coords[i]),
      JSON.stringify(coords[i + 1]),
      weight,
      metadata,
    );
  }
}

const pathfinder = new Pathfinder(graph);

const lineAt = (feature: (typeof routes.features)[number], index: number) =>
  (feature.geometry as GeoJSON.LineString).coordinates[index];

const f1West = lineAt(
  routes.features.find((f) => f.properties?.level_id === 1)!,
  0,
);
const f0Branch = lineAt(
  routes.features.find(
    (f) =>
      f.properties?.level_id === 0 &&
      f.properties?.network_type === "corridor" &&
      (f.geometry as GeoJSON.LineString).coordinates.length === 2,
  )!,
  1,
);

const normal = pathfinder.dijkstra(f1West, f0Branch);
const accessible = pathfinder.dijkstra(f1West, f0Branch, {
  accessibleOnly: true,
});
const upward = pathfinder.dijkstra(f0Branch, f1West);

const vertical = (type: string): number[][] => {
  const feature = routes.features.find(
    (f) => f.properties?.network_type === type,
  )!;
  return (feature.geometry as GeoJSON.LineString).coordinates as number[][];
};

const [escF0, escF1] = vertical("escalator").map((c) => JSON.stringify(c));
const [elevF0, elevF1] = vertical("elevator").map((c) => JSON.stringify(c));
const [stairsF0, stairsF1] = vertical("stairs").map((c) => JSON.stringify(c));

const usesEdge = (path: number[][], a: string, b: string) =>
  path.some((c: number[], i: number) => {
    const next = path[i + 1];
    if (!next) return false;
    const here = JSON.stringify(c);
    const there = JSON.stringify(next);
    return (here === a && there === b) || (here === b && there === a);
  });

console.log("down F1->F0 (escalator is up-only, so stairs expected):");
console.log("  uses escalator edge:", usesEdge(normal, escF0, escF1));
console.log("  uses stairs edge:", usesEdge(normal, stairsF0, stairsF1));
console.log("  uses elevator edge:", usesEdge(normal, elevF0, elevF1));
console.log("up F0->F1 (escalator expected):");
console.log("  uses escalator edge:", usesEdge(upward, escF0, escF1));
console.log("accessible F1->F0 (elevator expected):");
console.log("  uses escalator edge:", usesEdge(accessible, escF0, escF1));
console.log("  uses stairs edge:", usesEdge(accessible, stairsF0, stairsF1));
console.log("  uses elevator edge:", usesEdge(accessible, elevF0, elevF1));
