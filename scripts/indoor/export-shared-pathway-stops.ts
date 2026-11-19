/** Export the same directional room-stop lookup used by a visitor journey. */
import assert from "node:assert/strict";
import { createPathwayStopVerifier } from "./lib/verify-pathway-station";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { withPreparedRouting } from "../../app/indoor-project/prepared-routing";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import {
  createSharedPathwayNetwork,
  type SharedPathwayStop,
} from "../../app/indoor-project/shared-pathway-routing";

const [sourcePath, guidesPath, indexPath, mode, output] = process.argv.slice(2);
if (!output || (mode !== "public" && mode !== "accessible"))
  throw new Error(
    "Usage: export-shared-pathway-stops.ts SOURCE GUIDES NETWORK public|accessible OUTPUT",
  );
function readBound(path: string, expectedHash: string) {
  const bytes = readFileSync(path);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expectedHash,
    path,
  );
  return JSON.parse(bytes.toString("utf8"));
}
type Cell = {
  cellId: string;
  pointsFeet: number[][];
  hallwaySegmentIds: number[];
  segments: [number, number][];
  walks: { sourceEdgeId: string }[];
};
const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
  datasetSha256: string;
  preparedRoutingSha256: string;
  cells: Cell[];
};
const core = new Map(
  index.cells.map((c) => [
    c.cellId,
    new Set(
      c.hallwaySegmentIds.flatMap((id) =>
        c.segments[id - 1].map((v) => JSON.stringify(c.pointsFeet[v])),
      ),
    ),
  ]),
);
const edgeCells = new Map(
  index.cells.flatMap((c) =>
    c.walks.map((w) => [w.sourceEdgeId, c.cellId] as const),
  ),
);
const prepared = readBound(
  guidesPath,
  index.preparedRoutingSha256,
) as import("../../app/indoor-project/prepared-routing").PreparedRouting;
const sourceGuides = new Map(prepared.guides.map((g) => [g.edgeId, g]));
const verifyStop = createPathwayStopVerifier(
  sourceGuides,
  (id) => edgeCells.get(id),
  (cell, point) => core.get(cell)?.has(JSON.stringify(point)) ?? false,
);
const data = routeWorkerDataset(
  withPreparedRouting(
    readBound(sourcePath, index.datasetSha256) as IndoorDataset,
    prepared,
  ),
);
await initializeNativeExactGeosOverlay();
const t = performance.now();
const result = createImmutableRoutingSession(data)(() => {
  const network = createSharedPathwayNetwork(data, mode);
  const locations = new Map<
    string,
    { pointFeet: number[]; levelId: number; cellId: string }
  >();
  function verify(stop: SharedPathwayStop | null) {
    if (!stop) return null;
    verifyStop(stop);
    const location = {
      pointFeet: stop.pointFeet,
      levelId: stop.levelId,
      cellId: stop.cellId,
    };
    // Some coincident source levels are distinct; the model cell and XYZ identify a physical stop.
    const existing = locations.get(stop.stopId);
    if (existing) assert.deepEqual(existing.pointFeet, location.pointFeet);
    else locations.set(stop.stopId, location);
    return {
      stopId: stop.stopId,
      levelId: stop.levelId,
      terminalNodeId: stop.terminalNodeId,
      guideEdgeId: stop.guideEdgeId,
      entranceEdgeId: stop.entranceEdgeId,
      ...(stop.station ? { station: stop.station } : {}),
    };
  }
  const rooms = data.records.map((r, i) => {
    const departure = verify(network.stopForRoom(r.key, true));
    const arrival = verify(network.stopForRoom(r.key, false));
    if ((i + 1) % 100 === 0)
      console.log(`Checked ${i + 1}/${data.records.length}`);
    return {
      key: r.key,
      number: r.number,
      name: r.name,
      building: r.building,
      levelId: r.levelId,
      departure,
      arrival,
      ...(mode === "public" &&
      (departure?.entranceEdgeId || arrival?.entranceEdgeId)
        ? { roomBranch: network.branchForRoom(r.key) }
        : {}),
    };
  });
  const reference = rooms.find((r) => r.number === "03-1104");
  const fallback = rooms.find((r) => r.number === "06-212");
  const origins = [reference, fallback].filter((r) => r !== undefined);
  const vestibuleCoverage = origins.map((origin) => {
    const results = rooms
      .filter((r) => /vestibule/i.test(r.name))
      .map((room) => {
        const walk = (a: typeof room, b: typeof room) => {
          if (!a.departure || !b.arrival) return null;
          const route = network.journey(a.key, b.key, {
            endpointMode: "pathway",
            allowOtherRoomTransit: false,
          });
          return route?.distanceMetres ?? null;
        };
        return {
          key: room.key,
          number: room.number,
          fromReferenceMetres: walk(origin, room),
          toReferenceMetres: walk(room, origin),
        };
      });
    return {
      origin: origin.number,
      hasDeparture: !!origin.departure,
      hasArrival: !!origin.arrival,
      results,
    };
  });
  return {
    mode,
    vestibuleCoverage,
    datasetSha256: index.datasetSha256,
    preparedRoutingSha256: index.preparedRoutingSha256,
    rooms,
    stops: Object.fromEntries(locations),
  };
});
writeFileSync(output, JSON.stringify(result), { flag: "wx" });
console.log(
  JSON.stringify({
    mode,
    seconds: (performance.now() - t) / 1000,
    rooms: result.rooms.length,
    departures: result.rooms.filter((r) => r.departure).length,
    arrivals: result.rooms.filter((r) => r.arrival).length,
    stops: Object.keys(result.stops).length,
  }),
);
