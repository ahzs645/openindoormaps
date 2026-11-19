/** Export the published geometry and its directed source dependencies for inspection.
 * The visitor still evaluates access and physical evidence in its source graph. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { nativeCellSharedFloorAlias } from "../../app/indoor-project/native-circulation";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import {
  projectRoutingGraph,
  type ProjectRouteMode,
} from "../../app/indoor-project/routing-graph";
import {
  withPreparedRouting,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
import { indexSharedPathways } from "./shared-pathway-network-index";

const [datasetPath, guidePath, output] = process.argv.slice(2);
if (!datasetPath || !guidePath || !output)
  throw new Error(
    "Usage: export-shared-pathway-network.ts DATASET.json PREPARED-ROUTING.json NEW-NETWORK.json",
  );
const source = await readFile(datasetPath);
const guideBytes = await readFile(guidePath);
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const prepared: PreparedRouting = JSON.parse(guideBytes.toString("utf8"));
const data = withPreparedRouting(
  JSON.parse(source.toString("utf8")) as IndoorDataset,
  prepared,
);
await initializeNativeExactGeosOverlay();
const network = createImmutableRoutingSession(data)(() => {
  const cells = indexSharedPathways(data, prepared);
  const indexed = new Set(
    cells.flatMap((c) => c.walks.map((w) => w.sourceEdgeId)),
  );
  const points = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  // All actual source transitions keep their original native geometry. A
  // consumer can distinguish an unavailable flight from a working connector.
  const aliases = new Set(
    data.edges
      .filter(
        (e) =>
          e.kind === "walk" &&
          e.lengthMetres === 0 &&
          e.nativeCellId &&
          e.pointsFeet.length &&
          e.pointsFeet.every((p) =>
            [points.get(e.from), points.get(e.to)].every(
              (n) => n && n.pointFeet.every((v, i) => v === p[i]),
            ),
          ) &&
          nativeCellSharedFloorAlias(data, e),
      )
      .map((e) => e.id),
  );
  const transitions = data.edges
    .filter(
      (e) =>
        e.kind !== "walk" || !!e.reviewedCirculationLinkId || aliases.has(e.id),
    )
    .map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      kind: e.kind,
      nativeId: e.nativeElementId,
      review: e.reviewedCirculationLinkId,
      nativeIdentity: aliases.has(e.id) || undefined,
      levels: [points.get(e.from)?.levelId, points.get(e.to)?.levelId],
      roomKeys: e.roomKeys,
      pointsFeet: e.pointsFeet,
      enabled: e.enabled,
      direction: e.direction ?? "both",
      accessibility: e.accessible,
    }));
  const policy = (mode: ProjectRouteMode) => {
    const directions = [];
    for (const [from, links] of projectRoutingGraph(data, mode).adjacency)
      for (const link of links) {
        if (
          link.edge.kind === "walk" &&
          !link.edge.reviewedCirculationLinkId &&
          !aliases.has(link.edge.id) &&
          !indexed.has(link.edge.id)
        )
          continue;
        directions.push({
          edge: link.edge.id,
          from,
          to: link.to,
          requiredRooms: link.requiredRooms,
          passages: link.passages.map((p) => ({
            id: p.edge.id,
            forward: p.forward,
          })),
        });
      }
    return directions;
  };
  // Assert the geometry can be expanded into the original orientation and
  // retains both endpoints with exactly the coordinates used by the visitor.
  let pieces = 0;
  for (const c of cells)
    for (const w of c.walks) {
      const edge = edges.get(w.sourceEdgeId)!;
      assert.equal(edge.nativeCellId, c.cellId);
      let last: number | undefined;
      for (const piece of w.chain) {
        const pair = c.segments[Math.abs(piece) - 1];
        const a = pair[piece > 0 ? 0 : 1],
          b = pair[piece > 0 ? 1 : 0];
        if (last === undefined)
          assert.deepEqual(c.pointsFeet[a], edge.pointsFeet[0]);
        else assert.equal(last, a);
        last = b;
        pieces++;
      }
      assert(last !== undefined);
      assert.deepEqual(c.pointsFeet[last], edge.pointsFeet.at(-1));
    }
  return {
    format: "openindoormaps-shared-pathway-index-v1",
    units: "source model feet",
    datasetSha256: sha(source),
    preparedRoutingSha256: sha(guideBytes),
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: prepared.sourceGeometryKey,
    resolverVersion: prepared.resolverVersion,
    geometryEncoding:
      "Cell-local point indices, one-based signed segment references, zero-based half-open hallwayRange in each source walk chain.",
    cellCount: cells.length,
    walkCount: indexed.size,
    expandedSegmentCount: pieces,
    distinctSegmentCount: cells.reduce((sum, c) => sum + c.segments.length, 0),
    distinctHallwaySegmentCount: cells.reduce(
      (sum, c) => sum + c.hallwaySegmentIds.length,
      0,
    ),
    enabledWalkingEdgesWithoutGuides: data.edges.filter(
      (e) => e.enabled && e.kind === "walk" && !indexed.has(e.id),
    ).length,
    unrepresentedWalkingEdges: data.edges.filter(
      (e) => e.kind === "walk" && !indexed.has(e.id),
    ).length,
    cells,
    transitions,
    sourceDirections: {
      public: policy("public"),
      accessible: policy("accessible"),
    },
  };
});
await writeFile(output, JSON.stringify(network), { flag: "wx" });
console.log(
  JSON.stringify({
    cells: network.cellCount,
    walks: network.walkCount,
    uniqueHallwaySegments: network.distinctHallwaySegmentCount,
    allUniqueSegments: network.distinctSegmentCount,
    transitions: network.transitions.length,
    absentWalkingEdges: network.unrepresentedWalkingEdges,
  }),
);
