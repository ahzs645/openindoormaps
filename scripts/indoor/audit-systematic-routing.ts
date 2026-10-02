import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readIndoorProject } from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { createProjectRouteDiagnostics } from "../../app/indoor-project/route-diagnostics";
import { createNativeFloorHoleQuery } from "../../app/indoor-project/walking-support";
import {
  isProjectDestination,
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";
import { architecturalPlanGeometry } from "../../../reviter/lib/reviter/architectural-plan.ts";
import { routingFloorPlateRecords } from "../../../reviter/lib/reviter/routing-floor-support.ts";
import { recoverNativeWallJunctionRepairs } from "../../../reviter/lib/reviter/native-room-presentation.ts";
import {
  nativeRouteBlocker,
  containsRoomPoint,
  type RoomPoint,
} from "../../../reviter/lib/reviter/room-directory.ts";
import type { ConvertResult } from "../../../reviter/lib/reviter/types.ts";
import {
  nativeSlabsCoverSegment,
  type FloorPolygon,
} from "./native-floor-proof";

const [beforePath, afterPath, cachePath, output] = process.argv.slice(2);
if (!beforePath || !afterPath || !cachePath || !output)
  throw new Error(
    "Usage: tsx scripts/indoor/audit-systematic-routing.ts before.zip after.zip native-cache.json report.json",
  );
const before = await readIndoorProject(
  new Uint8Array(await readFile(beforePath)),
);
const afterBytes = await readFile(afterPath);
const after = await readIndoorProject(new Uint8Array(afterBytes));
const data = after.dataset;
const cache = JSON.parse(await readFile(cachePath, "utf8")) as {
  sourceModelSha256: string;
  nativeModel: ConvertResult;
};
assert.equal(cache.sourceModelSha256, data.source.modelSha256);
assert.deepEqual(
  before.rooms,
  after.rooms,
  "Source annotations, reviews, pins and connector recipes survive regeneration",
);
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const preservedAssets = Object.keys(before.files)
  .filter(
    (path) => !path.startsWith("viewer/") && !/manifest\.json$/.test(path),
  )
  .map((path) => {
    assert.ok(after.files[path], `Missing preserved asset ${path}`);
    assert.equal(
      sha(before.files[path]),
      sha(after.files[path]),
      `Source asset changed: ${path}`,
    );
    return { path, sha256: sha(after.files[path]) };
  });
const oldRecords = new Map(before.dataset.records.map((r) => [r.key, r]));
const lostArrivals = before.dataset.records.filter(
  (r) =>
    r.arrivalNodeId &&
    !data.records.find((n) => n.key === r.key)?.arrivalNodeId,
);
assert.deepEqual(lostArrivals, []);
const newArrivals = data.records.filter(
  (r) => r.arrivalNodeId && !oldRecords.get(r.key)?.arrivalNodeId,
);
const oldDoors = before.dataset.edges.filter((e) => e.kind === "door");
assert.ok(
  oldDoors.every((e) =>
    data.edges.some((n) => n.id === e.id && n.enabled === e.enabled),
  ),
  "Existing native door links remain available",
);
const newDoors = data.edges.filter(
  (e) => e.kind === "door" && !oldDoors.some((old) => old.id === e.id),
);
const beforeEdges = new Map(before.dataset.edges.map((e) => [e.id, e]));
const changedEdges = data.edges.filter((e) => {
  const old = beforeEdges.get(e.id);
  return (
    !old ||
    JSON.stringify([
      e.from,
      e.to,
      e.pointsFeet,
      e.openingSpan,
      e.sourceDoorProof,
    ]) !==
      JSON.stringify([
        old.from,
        old.to,
        old.pointsFeet,
        old.openingSpan,
        old.sourceDoorProof,
      ])
  );
});
const knownHoleCrossings = createNativeFloorHoleQuery(data);
const sourceEdgesCrossingKnownNativeHoles = data.edges
  .filter((e) => ["walk", "door", "opening"].includes(e.kind))
  .flatMap((e) => {
    const nativeFloorIds = knownHoleCrossings(e.pointsFeet);
    return nativeFloorIds.length > 0 ? [{ edgeId: e.id, nativeFloorIds }] : [];
  });
const graph = projectRoutingGraph(data),
  diagnostics = createProjectRouteDiagnostics(data);
const eligible = data.records.filter(
  (r) => r.arrivalNodeId && isProjectDestination(r),
);
const raw = new Map<string, string[]>();
for (const edge of data.edges) {
  if (edge.direction !== "to-from")
    raw.set(edge.from, [...(raw.get(edge.from) ?? []), edge.to]);
  if (edge.direction !== "from-to")
    raw.set(edge.to, [...(raw.get(edge.to) ?? []), edge.from]);
}
let reachableDirectedPairs = 0,
  sourceGapDirectedPairs = 0,
  policyBlockedDirectedPairs = 0;
const coverage = [];
const reach = new Map<string, Set<string>>();
for (const start of eligible) {
  const reached = reachableProjectDestinations(graph, start.key);
  reach.set(start.key, reached);
  const seen = new Set([start.arrivalNodeId!]),
    queue = [...seen];
  for (let i = 0; i < queue.length; i++)
    for (const next of raw.get(queue[i]) ?? [])
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  let connected = 0,
    gaps = 0,
    blocked = 0;
  for (const end of eligible)
    if (end.key !== start.key) {
      if (reached.has(end.key)) connected++;
      else if (seen.has(end.arrivalNodeId!)) blocked++;
      else gaps++;
    }
  reachableDirectedPairs += connected;
  sourceGapDirectedPairs += gaps;
  policyBlockedDirectedPairs += blocked;
  coverage.push({
    key: start.key,
    number: start.number,
    name: start.name,
    building: start.building,
    levelId: start.levelId,
    connected,
    gaps,
    blocked,
  });
}
const geometryCache = new Map<
  number,
  ReturnType<typeof architecturalPlanGeometry>
>();
function geometry(levelId: number) {
  if (!geometryCache.has(levelId)) {
    const g = architecturalPlanGeometry(cache.nativeModel, levelId);
    const walls = [
      ...g.walls.map((w) => ({ ...w, kind: "wall" as const })),
      ...g.columns.map((w) => ({ ...w, kind: "column" as const })),
    ]
      .filter((w) => w.polygon.length >= 3)
      .map((w) => ({
        levelId,
        nativeElementId: w.elementId,
        kind: w.kind,
        approximate: w.approximate,
        ringsFeet: [w.polygon],
      }));
    const repairs = recoverNativeWallJunctionRepairs(
      walls,
      (data.doors ?? []).filter((d) => d.levelId === levelId),
    );
    geometryCache.set(levelId, {
      ...g,
      walls: [
        ...g.walls,
        ...repairs.map((r) => ({
          elementId: r.nativeWallElementId,
          approximate: true,
          polygon: r.ringsFeet[0]!,
        })),
      ],
    });
  }
  return geometryCache.get(levelId)!;
}
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const source = new Map(after.rooms.annotations.map((r) => [r.key, r]));
const failedSegments: { edgeId: string; segment: number; reason: string }[] =
  [];
let nativeBarrierSegments = 0,
  exactFloorSegments = 0;
const checkEdges = data.edges.filter(
  (e) =>
    ["walk", "door", "opening"].includes(e.kind) &&
    (changedEdges.some((changed) => changed.id === e.id) ||
      newArrivals.some((r) => e.roomKeys.includes(r.key)) ||
      newDoors.some((d) => d.id === e.id)),
);
for (const edge of checkEdges) {
  const node = nodes.get(edge.from)!,
    g = geometry(node.levelId);
  const floorPolygons = routingFloorPlateRecords(
    cache.nativeModel,
    node.pointFeet[2],
  ).map((f) =>
    f.loops!.map((loop) => loop.map((p) => [p[0], p[1]] as RoomPoint)),
  );
  const openings = (data.doors ?? [])
    .filter(
      (d) =>
        d.levelId === node.levelId &&
        d.footprintFeet &&
        data.edges.some((e) => e.id === d.id && e.enabled),
    )
    .map((d) => ({
      rooms: d.roomKeys.slice(0, 2) as [string, string],
      point: d.pointFeet,
      from: d.pointFeet,
      to: d.pointFeet,
      halfWidth: 0,
      halfHeight: 0,
      footprint: d.footprintFeet!,
    }));
  const blocked = nativeRouteBlocker(g, openings);
  for (let i = 1; i < edge.pointsFeet.length; i++) {
    const a = edge.pointsFeet[i - 1].slice(0, 2) as RoomPoint,
      b = edge.pointsFeet[i].slice(0, 2) as RoomPoint;
    nativeBarrierSegments++;
    exactFloorSegments++;
    if (blocked(a, b))
      failedSegments.push({
        edgeId: edge.id,
        segment: i,
        reason: "native-barrier",
      });
    if (!nativeSlabsCoverSegment(a, b, floorPolygons as FloorPolygon[]))
      failedSegments.push({
        edgeId: edge.id,
        segment: i,
        reason: "exact-floor-gap-or-hole",
      });
  }
}
const newlyRoutable = newArrivals.map((room) => {
  const others = eligible.filter(
    (end) => end.key !== room.key && reach.get(room.key)?.has(end.key),
  );
  const label = nodes.get(room.arrivalNodeId!)!.pointFeet;
  others.sort((a, b) => {
    const distance = (r: typeof room) =>
      Math.hypot(
        ...nodes.get(r.arrivalNodeId!)!.pointFeet.map((v, i) => v - label[i]),
      );
    return distance(a) - distance(b);
  });
  const end = others[0],
    route = end ? findProjectRoute(data, room.key, end.key) : null;
  assert.ok(
    !end || route,
    "The shortest-path implementation agrees with the reachability index",
  );
  return {
    key: room.key,
    number: room.number,
    name: room.name,
    elevationEvidence: room.elevationEvidence,
    reachableOtherDestinations: others.length,
    example: end && {
      number: end.number,
      name: end.name,
      metres: route!.distanceMetres,
      edges: route!.edges.map((e) => e.id),
    },
  };
});
const missingArrivals = data.records
  .filter((r) => isProjectDestination(r) && !r.arrivalNodeId)
  .map((room) => {
    const annotation = source.get(room.key);
    if (!annotation)
      return {
        key: room.key,
        number: room.number,
        name: room.name,
        building: room.building,
        levelId: room.levelId,
        elevationFeet: room.elevationFeet,
        category: "generated-connector-without-arrival",
        floorAtAnchor: undefined,
        obstacles: [],
        portalEdges: [],
        nearbyDoors: [],
        issueCodes: data.issues
          .filter((i) => i.roomKey === room.key)
          .map((i) => i.code),
      };
    const point = (annotation.routePointFeet ??
      annotation.labelPointFeet) as RoomPoint;
    const g = geometry(room.levelId);
    const floors = routingFloorPlateRecords(
      cache.nativeModel,
      room.elevationFeet,
    ).map((f) =>
      f.loops!.map((loop) => loop.map((p) => [p[0], p[1]] as RoomPoint)),
    );
    const floorAtAnchor = nativeSlabsCoverSegment(
      point,
      point,
      floors as FloorPolygon[],
    );
    const obstacles = [...g.walls, ...g.columns]
      .filter((w) => containsRoomPoint(point, w.polygon))
      .map((w) => w.elementId);
    const portalEdges = data.edges
      .filter(
        (e) =>
          ["door", "opening"].includes(e.kind) && e.roomKeys.includes(room.key),
      )
      .map((e) => e.id);
    const nearbyDoors = (data.doors ?? [])
      .filter(
        (d) =>
          d.levelId === room.levelId &&
          Math.hypot(d.pointFeet[0] - point[0], d.pointFeet[1] - point[1]) <=
            12,
      )
      .map((d) => ({ id: d.id, state: d.state, rooms: d.roomKeys }));
    const category = floorAtAnchor
      ? obstacles.length > 0
        ? "anchor-in-native-obstacle"
        : portalEdges.length > 0
          ? "entrance-present-arrival-unattached"
          : nearbyDoors.length > 0
            ? "nearby-door-ownership-or-boundary"
            : "open-front-or-source-boundary"
      : "no-precise-floor-at-anchor";
    return {
      key: room.key,
      number: room.number,
      name: room.name,
      building: room.building,
      levelId: room.levelId,
      elevationFeet: room.elevationFeet,
      category,
      floorAtAnchor,
      obstacles,
      portalEdges,
      nearbyDoors,
      issueCodes: data.issues
        .filter((i) => i.roomKey === room.key)
        .map((i) => i.code),
    };
  });
const issueCounts: Record<string, number> = {},
  missingCounts: Record<string, number> = {};
for (const issue of data.issues)
  issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
for (const row of missingArrivals)
  missingCounts[row.category] = (missingCounts[row.category] ?? 0) + 1;
const examples = [
  ["07-240", "07-244"],
  ["09-230", "09-232"],
  ["10-1016", "07-244"],
].map(([a, b]) => {
  const start = data.records.find((r) => r.number === a)!,
    end = data.records.find((r) => r.number === b)!;
  const route = findProjectRoute(data, start.key, end.key);
  return {
    from: a,
    to: b,
    fromArrival: !!start.arrivalNodeId,
    toArrival: !!end.arrivalNodeId,
    diagnostic: diagnostics.inspect(start.key, end.key),
    route: route && {
      metres: route.distanceMetres,
      sourceMetres: route.sourceDistanceMetres,
      preferenceCost: route.preferenceCost,
      edges: route.edges.map((e) => e.id),
      floors: [...new Set(route.nodeIds.map((id) => nodes.get(id)!.levelId))],
    },
  };
});
const report = {
  input: {
    beforePath,
    afterPath,
    afterSha256: sha(afterBytes),
    source: data.source,
  },
  scope:
    "Every directed public-review endpoint pair, including Buildings 07 and 10. Unknown access remains unknown. Missing-arrival categories are triage signals, not proof that an entire room lacks floor support or has no entrance. Continuous segment checks cover new/changed walking links and links touching new arrivals/native doors; they are not an accessibility-width certification. Ramp surfaces require separate continuous native triangle/seam checks.",
  summary: {
    before: before.dataset.report,
    after: data.report,
    newArrivals: newArrivals.length,
    lostArrivals: lostArrivals.length,
    newNativeDoorLinks: newDoors.filter((e) => e.nativeElementId !== undefined)
      .length,
    newRegisteredDoorLinks: newDoors.filter(
      (e) => e.sourceDoorProof !== undefined,
    ).length,
    preparedOpeningSpans: data.edges.filter((e) => e.openingSpan !== undefined)
      .length,
    newOrChangedEdges: changedEdges.length,
    eligibleDepartures: eligible.length,
    reachableDirectedPairs,
    sourceGapDirectedPairs,
    policyBlockedDirectedPairs,
    missingArrivals: missingArrivals.length,
    arrivalsReachingAnotherDestination: coverage.filter((r) => r.connected > 0)
      .length,
    isolatedPreparedArrivals: coverage.filter((r) => r.connected === 0).length,
    missingCounts,
    nativeBarrierSegments,
    exactFloorSegments,
    geometryFailures: failedSegments.length,
    sourceEdgesCrossingKnownNativeHoles:
      sourceEdgesCrossingKnownNativeHoles.length,
  },
  preservedAssets,
  newArrivals: newlyRoutable,
  missingArrivals,
  issueCounts,
  presentation: {
    before: before.dataset.presentation?.rooms.length ?? 0,
    after: data.presentation?.rooms.length ?? 0,
    sources: Object.fromEntries(
      [...new Set(data.presentation?.rooms.map((r) => r.boundarySource))].map(
        (kind) => [
          kind,
          data.presentation!.rooms.filter((r) => r.boundarySource === kind)
            .length,
        ],
      ),
    ),
    diagnosticCounts: Object.fromEntries(
      [...new Set(data.presentation?.diagnostics.map((d) => d.code))].map(
        (code) => [
          code,
          data.presentation!.diagnostics.filter((d) => d.code === code).length,
        ],
      ),
    ),
    remaining: data.presentation?.diagnostics ?? [],
  },
  unmatchedDoors: (data.doors ?? []).filter((d) => d.state !== "connected"),
  registeredDoorways: data.edges.filter((e) => e.sourceDoorProof !== undefined),
  sourceEdgesCrossingKnownNativeHoles,
  coverageScope:
    "Directed graph connectivity before route geometry resolution. Known native slab openings require supported detours; unresolved source links are excluded by the runtime solver. These topology counts are not independently realized geometry proofs for every pair.",
  coverage,
  isolatedPreparedArrivals: coverage.filter((r) => r.connected === 0),
  examples,
  failedSegments,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    { summary: report.summary, examples: report.examples },
    null,
    2,
  ),
);
assert.deepEqual(
  failedSegments,
  [],
  "Recoveries must not cross native barriers or unsupported floor intervals",
);
