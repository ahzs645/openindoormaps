/** Complete selected-floor source/display inventory. No invented connections,
 * geometry import, physical approval or route-validation cache authority. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { hallwayPathView } from "../../app/indoor-project/hallway-path-view";
import { pathConnections } from "../../app/indoor-project/path-connections";
import { pathNetworkCoverage } from "../../app/indoor-project/path-network-coverage";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
const [input, output, ...names] = process.argv.slice(2);
if (!input || !output || names.length === 0)
  throw new Error(
    "Usage: audit-path-network-floors.ts SOURCE.json EMPTY-OUTPUT FLOOR-NAME...",
  );
const raw = await readFile(input),
  data = JSON.parse(raw.toString()) as IndoorDataset;
const sha = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex");
const original = sha(JSON.stringify(data));
const floors = names.map((name) => {
  const floor = data.floors.find((f) => f.name === name);
  if (!floor) throw new Error(`Unknown defined floor ${name}`);
  return floor;
});
await mkdir(output, { recursive: false });
const start = performance.now();
const run = createImmutableRoutingSession(data);
const results = run(() =>
  floors.map((floor) => {
    const paths = hallwayPathView(data, floor.levelIds, "all", {
      includeSourceFeet: true,
    });
    const displayed = new Set<string>(
      paths.features.flatMap(
        (f) => f.properties?.edgeIds ?? [f.properties?.edgeId],
      ),
    );
    const connections = pathConnections(data, floor.levelIds, "all", displayed);
    const coverage = pathNetworkCoverage(data, floor.levelIds, "all");
    const status = coverage.stops.reduce(
      (counts, stop) => {
        counts[stop.status] = (counts[stop.status] ?? 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );
    const vertical = coverage.connections.filter((e) =>
      ["ramp", "stairs", "local-steps", "elevator", "escalator"].includes(
        e.kind,
      ),
    );
    return {
      ...floor,
      status,
      vertical,
      coverage,
      paths,
      connections,
      summary: {
        floor: floor.name,
        levelIds: floor.levelIds,
        displaySegments: paths.features.length,
        sharedSegments: paths.features.filter(
          (f) => f.properties?.source === "shared-guide",
        ).length,
        savedFallbackSegments: paths.features.filter(
          (f) => f.properties?.source === "saved-walk",
        ).length,
        originalWalkingEdgesShown: displayed.size,
        connectionFeatures: connections.features.length,
        verticalEdges: vertical.length,
        enabledVerticalEdges: vertical.filter((e) => e.enabled).length,
        heldVerticalEdges: vertical.filter((e) => !e.enabled).length,
        status,
      },
    };
  }),
);
if (original !== sha(JSON.stringify(data)))
  throw new Error("Source was mutated by path preparation");
const report = {
  format: "selected-floor-path-network-v1",
  createdAt: new Date().toISOString(),
  sourceIndoorSha256: sha(raw),
  alignment: data.alignment,
  sourceUnchanged: true,
  elapsedSeconds: (performance.now() - start) / 1000,
  limitations: [
    "This is complete selected-floor saved-source/display coverage, not a physical all-destination navigation acceptance.",
    "Red gaps have no saved lateral approach; gray original paths are not shared-centerline or clearance certification.",
    "Held stair links and ordinary-room transit requirements remain unchanged. No source node or portal is joined by proximity.",
  ],
  floors: results,
  records: data.records.map((r) => ({
    key: r.key,
    number: r.number,
    name: r.name,
    building: r.building,
    levelId: r.levelId,
    circulation: r.circulation || r.stair,
    ringsFeet: r.ringsFeet,
  })),
};
await writeFile(`${output}/network.json`, JSON.stringify(report));
await writeFile(
  `${output}/summary.json`,
  JSON.stringify(
    { ...report, floors: results.map((r) => r.summary), records: undefined },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      output,
      elapsedSeconds: report.elapsedSeconds,
      sourceUnchanged: true,
      floors: results.map((r) => r.summary),
    },
    null,
    2,
  ),
);
