import strict from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { createNativeFloorHoleQuery } from "../../app/indoor-project/walking-support";
import { createIndoorExclusionQuery } from "../../app/indoor-project/indoor-exclusions";
let context: any = {};
const validationFailures: any[] = [],
  routeCases: any[] = [],
  ordinaryTransit: any[] = [];
const fail = (kind: string, actual: any, expected: any) =>
  validationFailures.push({ ...context, kind, actual, expected });
// Route-policy admission determines permitted transit. Ordinary-room transit is
// disclosed below, not prohibited by a stale circulation-only audit invariant.
// Record case failures instead of abandoning untested endpoints at the first one.
const assert = {
  ok: (actual: any, message?: string) => {
    if (!actual) fail(message ?? "assert-ok", actual, true);
  },
  equal: (actual: any, expected: any, message?: string) => {
    if (actual !== expected) fail(message ?? "assert-equal", actual, expected);
  },
  deepEqual: (actual: any, expected: any, message?: string) => {
    if (!isDeepStrictEqual(actual, expected))
      fail(message ?? "assert-deepEqual", actual, expected);
  },
};
import { readFile, writeFile } from "node:fs/promises";
import { readIndoorProject } from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import {
  isProjectDestination,
  projectRoutingGraph,
  reachableProjectDestinations,
} from "../../app/indoor-project/routing-graph";

const args = process.argv.slice(2);
const input = args[0];
const output = args[args.indexOf("--out") + 1];
const shard = args.includes("--shard")
  ? args[args.indexOf("--shard") + 1].split("/").map(Number)
  : [0, 1];
if (
  shard.length !== 2 ||
  shard.some((n) => !Number.isSafeInteger(n)) ||
  shard[0] < 0 ||
  shard[1] < 1 ||
  shard[1] > 16 ||
  shard[0] >= shard[1]
)
  throw new Error("--shard must be an index/count pair, such as 0/4.");
if (!input || !args.includes("--out"))
  throw new Error(
    "Usage: tsx scripts/indoor/audit-room-routing.ts prepared.zip --out report.json [--topology-only] [--shard index/count]",
  );
const inputBytes = await readFile(input);
const project = await readIndoorProject(new Uint8Array(inputBytes));
const data = project.dataset;
const inputSha256 = createHash("sha256").update(inputBytes).digest("hex");
const holes = createNativeFloorHoleQuery(data),
  exclusions = createIndoorExclusionQuery(data);
const before = JSON.stringify(data);
const floors = new Map(
  data.floors.flatMap((f) => f.levelIds.map((id) => [id, f.id] as const)),
);
const records = data.records.filter((room) => isProjectDestination(room));
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const endpointDistance = (
  a: (typeof records)[number],
  b: (typeof records)[number],
) => {
  const x = nodes.get(a.arrivalNodeId!)!.pointFeet;
  const y = nodes.get(b.arrivalNodeId!)!.pointFeet;
  return Math.hypot(x[0] - y[0], x[1] - y[1]);
};
const identify = (key: string) => {
  const r = data.records.find((r) => r.key === key)!;
  return {
    key,
    number: r.number,
    name: r.name,
    building: r.building,
    levelId: r.levelId,
    floor: data.floors.find((f) => f.levelIds.includes(r.levelId))?.name,
  };
};
const profiles = [];
const examples = [];
let testedPaths = 0;
let centeredPaths = 0;
let orthogonalPaths = 0;
let sourcePaths = 0;
let stairTransitions = 0;
let floorTransitions = 0;
const sourceReasons: Record<string, number> = {},
  geometryReview = new Map<string, unknown>();
const geometry: {
  start: string;
  end: string;
  paths: unknown;
  edgeIds: string[];
}[] = [];
for (const mode of ["public", "accessible"] as const) {
  const graph = projectRoutingGraph(data, mode);
  const rooms = [];
  let pairs = 0;
  let multiFloorPairs = 0;
  const uniquePairs = new Set<string>(),
    uniqueMultiFloorPairs = new Set<string>();
  for (const [index, start] of records.entries()) {
    const reachable = reachableProjectDestinations(graph, start.key);
    reachable.delete(start.key);
    const connected = [...reachable].map((key) => graph.records.get(key)!);
    const sameFloor = connected.filter(
      (r) => floors.get(r.levelId) === floors.get(start.levelId),
    );
    const otherFloors = connected.filter(
      (r) => floors.get(r.levelId) !== floors.get(start.levelId),
    );
    pairs += connected.length;
    multiFloorPairs += otherFloors.length;
    for (const end of connected)
      uniquePairs.add(JSON.stringify([start.key, end.key].sort()));
    for (const end of otherFloors)
      uniqueMultiFloorPairs.add(JSON.stringify([start.key, end.key].sort()));
    let status = "isolated-for-profile";
    if (connected.length > 0) status = "connected";
    if (!start.arrivalNodeId) status = "missing-entrance";
    rooms.push({
      ...identify(start.key),
      arrival: !!start.arrivalNodeId,
      status,
      reachableDestinations: connected.length,
      sameFloorDestinations: sameFloor.length,
      otherFloorDestinations: otherFloors.length,
      reviewIssues: data.issues
        .filter(
          (issue) =>
            issue.roomKey === start.key && issue.code !== "access-review",
        )
        .map((issue) => issue.id),
    });
    if (!args.includes("--topology-only") && index % shard[1] === shard[0]) {
      // Realise one same-floor and one other-floor route for every endpoint that
      // has one. Prefer actual rooms over corridors, and distant floors so a
      // single selected room exercises several successive flights where possible.
      for (const candidates of [sameFloor, otherFloors]) {
        const end = candidates.sort(
          (a, b) =>
            Number(a.circulation || a.stair) -
              Number(b.circulation || b.stair) ||
            Number(a.building !== start.building) -
              Number(b.building !== start.building) ||
            Math.abs(b.elevationFeet - start.elevationFeet) -
              Math.abs(a.elevationFeet - start.elevationFeet) ||
            endpointDistance(start, a) - endpointDistance(start, b) ||
            a.key.localeCompare(b.key),
        )[0];
        if (!end) continue;
        context = {
          mode,
          start: start.key,
          startNumber: start.number,
          end: end.key,
          endNumber: end.number,
          scope: candidates === sameFloor ? "same-floor" : "cross-floor",
        };
        const began = Date.now();
        const route = findProjectRoute(data, start.key, end.key, mode);
        routeCases.push({
          ...context,
          available: !!route,
          calculationMs: Date.now() - began,
          unknownAccessAreas: route?.unknownAccessAreas ?? [],
          unknownAccessibilityEdges: route?.unknownAccessibilityEdges,
        });
        if (!route) {
          fail("graph-reachable-but-route-unavailable", false, true);
          continue;
        }
        assert.ok(route, `${mode} ${start.number} → ${end.number}`);
        assert.equal(route.nodeIds[0], start.arrivalNodeId);
        assert.equal(route.nodeIds.at(-1), end.arrivalNodeId);
        assert.equal(route.nodeIds.length, route.edges.length + 1);
        assert.ok(
          Number.isFinite(route.distanceMetres) && route.distanceMetres >= 0,
        );
        for (const [i, edge] of route.edges.entries()) {
          assert.ok(edge.enabled);
          assert.ok(
            (edge.from === route.nodeIds[i] &&
              edge.to === route.nodeIds[i + 1]) ||
              (edge.to === route.nodeIds[i] &&
                edge.from === route.nodeIds[i + 1]),
          );
          for (const key of edge.roomKeys) {
            const room = graph.records.get(key)!;
            assert.ok(isProjectDestination(room));
            if (
              !room.circulation &&
              !room.stair &&
              key !== start.key &&
              key !== end.key
            )
              ordinaryTransit.push({
                ...context,
                roomKey: key,
                roomNumber: room.number,
                edgeId: edge.id,
                access: room.access,
              });
            const from = route.nodeIds[i],
              to = route.nodeIds[i + 1];
            assert.ok(
              graph.adjacency
                .get(from)
                ?.some((l) => l.to === to && l.edge.id === edge.id),
              "edge-not-in-admitted-profile-graph",
            );
          }
          if (mode === "accessible") {
            assert.equal(edge.accessible, "yes");
            assert.ok(edge.kind !== "stairs" && edge.kind !== "local-steps");
          }
        }
        const steps = projectNavigationSteps(
          data,
          route,
          start.number,
          end.number,
        );
        assert.equal(steps.at(-1)?.levelId, end.levelId);
        const transitions = route.edges.filter((e) =>
          ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
            e.kind,
          ),
        );
        const changes = steps.filter((s) => s.type === "floor-change");
        assert.equal(changes.length, transitions.length);
        for (const path of route.paths) {
          const edge = route.edges.find((e) => e.id === path.edgeIds[0])!;
          if (edge.kind === "stairs" || edge.kind === "local-steps") {
            const i = route.edges.indexOf(edge);
            assert.deepEqual(
              path.pointsFeet,
              edge.from === route.nodeIds[i]
                ? edge.pointsFeet
                : [...edge.pointsFeet].reverse(),
            );
          }
        }
        for (const path of route.paths) {
          if (exclusions(path.pointsFeet).length)
            fail(
              "realized-path-crosses-reviewed-exclusion",
              exclusions(path.pointsFeet),
              [],
            );
          if (
            path.levelIds.length === 1 &&
            Math.max(...path.pointsFeet.map((p) => p[2])) -
              Math.min(...path.pointsFeet.map((p) => p[2])) <
              0.05 &&
            holes(path.pointsFeet).length
          )
            fail(
              "planar-path-crosses-native-floor-hole",
              holes(path.pointsFeet),
              [],
            );
        }
        testedPaths++;
        centeredPaths += route.paths.filter((p) => p.centered).length;
        orthogonalPaths += route.paths.filter(
          (p) => p.shape === "orthogonal",
        ).length;
        sourcePaths += route.paths.filter((p) => !p.centered).length;
        for (const path of route.paths.filter((p) => !p.centered)) {
          const reason = path.sourceReason ?? "unclassified";
          sourceReasons[reason] = (sourceReasons[reason] ?? 0) + 1;
          if (
            [
              "unsupported-anchor",
              "missing-native-aperture",
              "no-clearance-route",
              "missing-native-geometry",
              "centering-error",
              "doorway-policy",
              "nonplanar",
            ].includes(reason)
          ) {
            const ids = [...path.edgeIds].sort();
            const key = JSON.stringify([reason, ids]);
            if (!geometryReview.has(key))
              geometryReview.set(key, {
                reason,
                start: identify(start.key),
                end: identify(end.key),
                edgeIds: ids,
                levelIds: path.levelIds,
                roomKeys: [
                  ...new Set(
                    route.edges
                      .filter((e) => ids.includes(e.id))
                      .flatMap((e) => e.roomKeys),
                  ),
                ],
                pointsFeet: path.pointsFeet,
              });
          }
        }
        floorTransitions += transitions.length;
        stairTransitions += transitions.filter(
          (e) => e.kind === "stairs" || e.kind === "local-steps",
        ).length;
        geometry.push({
          start: start.key,
          end: end.key,
          paths: route.paths.filter((p) => p.levelIds.length === 1),
          edgeIds: [
            ...new Set([
              ...route.edges.map((e) => e.id),
              ...(route.doorEdgeIds ?? []),
            ]),
          ],
        });
        if (
          changes.length >= 2 &&
          !start.circulation &&
          !start.stair &&
          !end.circulation &&
          !end.stair &&
          examples.length < 16
        )
          examples.push({
            start: identify(start.key),
            end: identify(end.key),
            metres: route.distanceMetres,
            floorChanges: changes.map((s) => ({
              message: s.message,
              from: s.fromLevel,
              to: s.toLevel,
            })),
            steps: steps.length,
          });
      }
    }
    if (index % 100 === 0)
      console.log(
        `${mode}: ${index}/${records.length} rooms; ${testedPaths} realised routes`,
      );
  }
  profiles.push({
    mode,
    connectedRooms: rooms.filter((r) => r.reachableDestinations > 0).length,
    roomsWithOtherFloorRoutes: rooms.filter((r) => r.otherFloorDestinations > 0)
      .length,
    directedReachablePairs: pairs,
    unorderedReachablePairs: uniquePairs.size,
    mutuallyReachablePairs: pairs - uniquePairs.size,
    directedMultiFloorPairs: multiFloorPairs,
    unorderedMultiFloorPairs: uniqueMultiFloorPairs.size,
    rooms,
  });
}
strict.equal(JSON.stringify(data), before, "Routing changed source dataset");
const report = {
  inputSha256,
  source: data.source,
  routeCases,
  ordinaryTransit,
  validationFailures,
  totalRecords: data.records.length,
  eligibleDestinations: records.length,
  missingEntrances: records.filter((r) => !r.arrivalNodeId).length,
  floors: data.floors,
  profiles,
  verification: {
    testedPaths,
    centeredPaths,
    orthogonalPaths,
    corridorCenterlinePaths: centeredPaths - orthogonalPaths,
    sourcePaths,
    stairTransitions,
    floorTransitions,
    sourceDatasetUnchanged: true,
    sourceReasons,
    geometryReviewSections: geometryReview.size,
  },
  shard,
  geometryReview: [...geometryReview.values()],
  examples,
};
await writeFile(output, JSON.stringify(report, null, 2));
if (!args.includes("--topology-only"))
  await writeFile(
    output.replace(/\.json$/, ".geometry-input.json"),
    JSON.stringify(geometry),
  );
console.log(
  JSON.stringify(
    {
      inputSha256,
      validationFailures: validationFailures.length,
      ordinaryTransitCases: ordinaryTransit.length,
      eligibleDestinations: records.length,
      missingEntrances: report.missingEntrances,
      profiles: profiles.map((p) => ({
        mode: p.mode,
        connectedRooms: p.connectedRooms,
        roomsWithOtherFloorRoutes: p.roomsWithOtherFloorRoutes,
        unorderedReachablePairs: p.unorderedReachablePairs,
        unorderedMultiFloorPairs: p.unorderedMultiFloorPairs,
      })),
      verification: report.verification,
      examples: examples.slice(0, 2),
    },
    null,
    2,
  ),
);
