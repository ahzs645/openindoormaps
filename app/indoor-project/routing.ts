import { validateNativeIndoorEnvelopes } from "./native-indoor-envelopes";
import { validateNativeDisplayScopes } from "./native-display-scopes";
import { validateNativeWindowDisplay } from "./native-window-display";
import {
  createIndoorExclusionQuery,
  validateIndoorExclusions,
} from "./indoor-exclusions";
import type { ProjectRouteArrival } from "./route-arrival";
import {
  withRoutingCalculation,
  routingCalculationValue,
} from "./routing-cache";
import { createProjectRouteDiagnostics } from "./route-diagnostics";
import { createNativeFloorHoleQuery } from "./walking-support";
import { sourceFallbackBarrierHits } from "./source-fallback-barriers";
import { validateNativeCirculationGeometry } from "./native-circulation";
import { validShaft } from "./connector-review";
import { validateVisitorMetadata } from "./visitor-metadata";
import type { IndoorDataset, IndoorEdge } from "./contract";
import { centeredRoutePaths, type RoutePath } from "./centered-route";
import {
  isProjectDestination,
  projectRoutingGraph,
  projectLinkCost,
  type ProjectRoutingGraph,
} from "./routing-graph";

export type ProjectRoute = {
  arrival?: ProjectRouteArrival;
  nodeIds: string[];
  edges: IndoorEdge[];
  distanceMetres: number;
  sourceDistanceMetres: number;
  preferenceCost?: number;
  paths: RoutePath[];
  unknownAccessAreas: string[];
  unknownAccessibilityEdges: number;
  /** Includes native doors crossed inside saved walking branches. */
  doorEdgeIds?: string[];
};
const resolvedRouteCache = new WeakMap<
  ProjectRoutingGraph,
  {
    geometry: string;
    routes: Map<string, ProjectRoute | null>;
    floorFailures: Map<string, number[]>;
  }
>();
const copyRoute = (route: ProjectRoute): ProjectRoute => ({
  ...route,
  arrival: route.arrival
    ? { ...route.arrival, pointFeet: [...route.arrival.pointFeet] }
    : undefined,
  edges: [...route.edges],
  nodeIds: [...route.nodeIds],
  unknownAccessAreas: [...route.unknownAccessAreas],
  doorEdgeIds: route.doorEdgeIds ? [...route.doorEdgeIds] : undefined,
  paths: route.paths.map((path) => ({
    ...path,
    levelIds: [...path.levelIds],
    edgeIds: [...path.edgeIds],
    pointsFeet: path.pointsFeet.map((p) => [...p] as [number, number, number]),
    curveRanges: path.curveRanges?.map((range) => ({ ...range })),
  })),
});

export function projectRouteFailure(
  data: IndoorDataset,
  startKey: string,
  endKey: string,
  mode: "public" | "accessible",
): string {
  if (
    data.boundaryPatchState?.regenerated === false ||
    data.doorAperturePatchState?.regenerated === false
  )
    return "Boundary patches changed the source geometry. Regenerate this reviewed ZIP in Reviter before directions are available.";
  return createProjectRouteDiagnostics(data, mode).inspect(startKey, endKey)
    .message;
}
export function geographicPoint(
  data: IndoorDataset,
  p: readonly number[],
): [number, number] {
  const a = data.alignment,
    x = p[0] - a.originFeet[0],
    y = p[1] - a.originFeet[1],
    c = Math.cos(a.rotationRadians),
    s = Math.sin(a.rotationRadians),
    east = (x * c - y * s) * a.horizontalMetresPerFoot,
    north = (x * s + y * c) * a.horizontalMetresPerFoot;
  return [
    a.originGeographic[0] +
      ((east / (6_378_137 * Math.cos((a.projectionLatitude * Math.PI) / 180))) *
        180) /
        Math.PI,
    a.originGeographic[1] + ((north / 6_378_137) * 180) / Math.PI,
  ];
}
export function findProjectRoute(
  data: IndoorDataset,
  startKey: string,
  endKey: string,
  mode: "public" | "accessible" = "public",
): ProjectRoute | null {
  if (
    data.boundaryPatchState?.regenerated === false ||
    data.doorAperturePatchState?.regenerated === false
  )
    return null;
  return withRoutingCalculation(data, () => {
    let excluded = new Set<string>();
    for (;;) {
      const result = resolveProjectRoute(
        data,
        startKey,
        endKey,
        mode,
        excluded,
      );
      if (result && "retry" in result) {
        excluded = result.retry;
        continue;
      }
      return result;
    }
  });
}
export function projectRouteFloorFailure(
  data: IndoorDataset,
  startKey: string,
  endKey: string,
  mode: "public" | "accessible" = "public",
) {
  return (
    resolvedRouteCache
      .get(projectRoutingGraph(data, mode))
      ?.floorFailures.get(JSON.stringify([startKey, endKey])) ?? []
  );
}
function resolveProjectRoute(
  data: IndoorDataset,
  startKey: string,
  endKey: string,
  mode: "public" | "accessible",
  excluded: Set<string>,
): ProjectRoute | null | { retry: Set<string> } {
  const graph = projectRoutingGraph(data, mode);
  const { records, adjacency } = graph;
  const geometry = routingCalculationValue(
    data,
    "resolved-route-geometry",
    () =>
      JSON.stringify([
        data.walls,
        data.nodes,
        data.alignment,
        data.walkingSupport,
        data.circulationGeometry,
        (data as IndoorDataset & { preparedRouting?: unknown }).preparedRouting,
      ]),
  );
  let resolved = resolvedRouteCache.get(graph);
  if (!resolved || resolved.geometry !== geometry) {
    resolved = { geometry, routes: new Map(), floorFailures: new Map() };
    resolvedRouteCache.set(graph, resolved);
  }
  const routeKey = JSON.stringify([startKey, endKey]);
  const existing = resolved.routes.get(routeKey);
  if (resolved.routes.has(routeKey) && excluded.size === 0) {
    resolved.routes.delete(routeKey);
    resolved.routes.set(routeKey, existing!);
    const floorIds = resolved.floorFailures.get(routeKey);
    if (floorIds) {
      resolved.floorFailures.delete(routeKey);
      resolved.floorFailures.set(routeKey, floorIds);
    }
    return existing ? copyRoute(existing) : null;
  }
  // Failure explanations ask for the same route again. Retain completed
  // failures under the same exact policy/geometry binding as successful routes.
  const remember = (route: ProjectRoute | null) => {
    resolved.routes.set(routeKey, route);
    while (resolved.routes.size > 16)
      resolved.routes.delete(resolved.routes.keys().next().value!);
    return route ? copyRoute(route) : null;
  };
  const start = records.get(startKey),
    end = records.get(endKey);
  const scopeQuery = createIndoorExclusionQuery(data);
  const arrivalPoints = data.nodes
    .filter((n) => n.id === start?.arrivalNodeId || n.id === end?.arrivalNodeId)
    .map((n) => n.pointFeet);
  if (arrivalPoints.some((p) => scopeQuery([p]).length)) return remember(null);
  if (
    !start?.arrivalNodeId ||
    !end?.arrivalNodeId ||
    !isProjectDestination(start) ||
    !isProjectDestination(end)
  )
    return remember(null);
  const distances = new Map<string, number>([[start.arrivalNodeId, 0]]),
    previous = new Map<string, { from: string; edge: IndoorEdge }>(),
    heap: { id: string; cost: number }[] = [];
  const push = (id: string, cost: number) => {
    heap.push({ id, cost });
    let i = heap.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (heap[p].cost <= cost) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let j = i;
        if (l < heap.length && heap[l].cost < heap[j].cost) j = l;
        if (r < heap.length && heap[r].cost < heap[j].cost) j = r;
        if (j === i) break;
        [heap[j], heap[i]] = [heap[i], heap[j]];
        i = j;
      }
    }
    return first;
  };
  push(start.arrivalNodeId, 0);
  while (heap.length > 0) {
    const current = pop()!;
    if (current.cost !== distances.get(current.id)) continue;
    if (current.id === end.arrivalNodeId) break;
    for (const { to, edge, requiredRooms } of adjacency.get(current.id) ?? []) {
      if (excluded.has(edge.id)) continue;
      const cost =
        current.cost +
        projectLinkCost({ edge, requiredRooms }, startKey, endKey);
      // Floating-point sums of successive lift rises can differ from the
      // direct rise by a fraction of a nanometre. Keep the existing direct
      // connection instead of adding a fictitious intermediate lift stop.
      if (cost < (distances.get(to) ?? Infinity) - 1e-9) {
        distances.set(to, cost);
        previous.set(to, { from: current.id, edge });
        push(to, cost);
      }
    }
  }
  if (!distances.has(end.arrivalNodeId)) return remember(null);
  const edges: IndoorEdge[] = [],
    nodeIds = [end.arrivalNodeId];
  let at = end.arrivalNodeId;
  while (at !== start.arrivalNodeId) {
    const step = previous.get(at);
    if (!step) return remember(null);
    edges.push(step.edge);
    at = step.from;
    nodeIds.push(at);
  }
  edges.reverse();
  nodeIds.reverse();
  const dependencies = new Map(edges.map((e) => [e.id, e]));
  edges.forEach((edge, i) => {
    const link = adjacency
      .get(nodeIds[i])
      ?.find((l) => l.edge.id === edge.id && l.to === nodeIds[i + 1]);
    for (const passage of link?.passages ?? [])
      dependencies.set(passage.edge.id, passage.edge);
  });
  const reviewedEdges = [...dependencies.values()],
    used = [...new Set(reviewedEdges.flatMap((e) => e.roomKeys))];
  const paths = centeredRoutePaths(data, edges, nodeIds, mode === "public");
  const outside = createIndoorExclusionQuery(data);
  const pathExclusions = (path: RoutePath) => {
    const edge =
      path.edgeIds.length === 1
        ? dependencies.get(path.edgeIds[0]!)
        : undefined;
    return edge?.kind === "elevator"
      ? outside.forEdge(path.pointsFeet, edge)
      : outside(path.pointsFeet);
  };
  // Refinement must not replace a safe source walk with an exterior shortcut.
  // A safe saved geometry remains usable when a refined guide is rejected.
  for (let i = 0; i < paths.length; i++) {
    if (!pathExclusions(paths[i]).length) continue;
    const source = centeredRoutePaths(data, edges, nodeIds, false);
    if (source.some((p) => pathExclusions(p).length)) return remember(null);
    paths.splice(0, paths.length, ...source);
    break;
  }
  const nativeFloorHoleCrossings = createNativeFloorHoleQuery(data);
  const unsafe = paths.filter(
    (path) =>
      path.edgeIds.every((id) =>
        ["walk", "door", "opening"].includes(dependencies.get(id)!.kind),
      ) && nativeFloorHoleCrossings(path.pointsFeet).length > 0,
  );
  if (unsafe.length > 0) {
    const floorIds = [
      ...new Set(
        unsafe.flatMap((path) => nativeFloorHoleCrossings(path.pointsFeet)),
      ),
    ];
    resolved.floorFailures.set(routeKey, floorIds);
    while (resolved.floorFailures.size > 32)
      resolved.floorFailures.delete(
        resolved.floorFailures.keys().next().value!,
      );
    const candidateIds = new Set(unsafe.flatMap((path) => path.edgeIds));
    const unsafeEdges = edges.filter(
      (edge) =>
        candidateIds.has(edge.id) &&
        ["walk", "door", "opening"].includes(edge.kind) &&
        nativeFloorHoleCrossings(edge.pointsFeet).length > 0,
    );
    const rejected =
      unsafeEdges.length > 0
        ? unsafeEdges.map((edge) => edge.id)
        : [...candidateIds];
    const next = new Set([...excluded, ...rejected]);
    // Every retry excludes at least one positively unsupported saved link.
    // Iterate rather than recurse, so many bad fragments cannot overflow the
    // stack or impose an arbitrary limit that hides a viable alternative.
    if (next.size > excluded.size) return { retry: next };
    return remember(null);
  }
  const blockedFallbacks = paths.filter(
    (path) => sourceFallbackBarrierHits(data, path, reviewedEdges).length > 0,
  );
  if (blockedFallbacks.length > 0) {
    const candidateIds = new Set(
      blockedFallbacks.flatMap((path) => path.edgeIds),
    );
    const rejected = edges
      .filter((edge) => {
        if (
          !candidateIds.has(edge.id) ||
          !["walk", "door", "opening"].includes(edge.kind)
        )
          return false;
        const path = blockedFallbacks.find((p) => p.edgeIds.includes(edge.id))!;
        return (
          sourceFallbackBarrierHits(
            data,
            { ...path, pointsFeet: edge.pointsFeet },
            reviewedEdges,
          ).length > 0
        );
      })
      .map((edge) => edge.id);
    const next = new Set([
      ...excluded,
      ...(rejected.length ? rejected : candidateIds),
    ]);
    if (next.size > excluded.size) return { retry: next };
    return remember(null);
  }
  resolved.floorFailures.delete(routeKey);
  const distanceMetres = paths.reduce(
    (sum, path) =>
      sum +
      (path.centered
        ? path.pointsFeet
            .slice(1)
            .reduce(
              (metres, p, i) =>
                metres +
                Math.hypot(
                  p[0] - path.pointsFeet[i][0],
                  p[1] - path.pointsFeet[i][1],
                ) *
                  data.alignment.horizontalMetresPerFoot,
              0,
            )
        : edges
            .filter((e) => path.edgeIds.includes(e.id))
            .reduce((metres, e) => metres + e.lengthMetres, 0)),
    0,
  );
  const result: ProjectRoute = {
    edges,
    nodeIds,
    paths,
    sourceDistanceMetres: edges.reduce(
      (sum, edge) => sum + edge.lengthMetres,
      0,
    ),
    distanceMetres,
    preferenceCost: distances.get(end.arrivalNodeId),
    unknownAccessAreas: used.filter(
      (k) => records.get(k)?.access === "unknown",
    ),
    unknownAccessibilityEdges: reviewedEdges.filter(
      (e) => e.accessible === "unknown",
    ).length,
    doorEdgeIds: reviewedEdges
      .filter((e) => e.kind === "door")
      .map((e) => e.id),
  };
  return remember(result);
}

export function validateIndoorDataset(
  value: unknown,
): asserts value is IndoorDataset {
  validateNativeIndoorEnvelopes((value as IndoorDataset)?.nativeIndoorEnvelopes, (value as IndoorDataset)?.source?.modelSha256);
  validateNativeDisplayScopes((value as IndoorDataset)?.nativeDisplayScopes, (value as IndoorDataset)?.source?.modelSha256);
  const d = value as IndoorDataset,
    finitePoint = (p: unknown, n: number) =>
      Array.isArray(p) &&
      p.length === n &&
      p.every((v) => typeof v === "number" && Number.isFinite(v)),
    id = (s: unknown) =>
      typeof s === "string" && s.length > 0 && s.length < 2000;
  if (
    !d ||
    d.format !== "reviter-indoor" ||
    d.version !== 1 ||
    d.generator !== "reviter/indoor-pipeline-1" ||
    !d.source ||
    !d.alignment ||
    !finitePoint(d.alignment.originFeet, 3) ||
    !finitePoint(d.alignment.originGeographic, 2) ||
    Math.abs(d.alignment.originGeographic[1]) > 85 ||
    Math.abs(d.alignment.originGeographic[0]) > 180 ||
    ![
      d.alignment.projectionLatitude,
      d.alignment.rotationRadians,
      d.alignment.horizontalMetresPerFoot,
      d.alignment.verticalMetresPerFoot,
      d.alignment.rmsMetres,
    ].every(Number.isFinite) ||
    d.alignment.horizontalMetresPerFoot <= 0 ||
    d.alignment.verticalMetresPerFoot !== 0.3048 ||
    !Array.isArray(d.records) ||
    d.records.length > 60_000 ||
    !Array.isArray(d.nodes) ||
    d.nodes.length > 300_000 ||
    !Array.isArray(d.edges) ||
    d.edges.length > 500_000 ||
    !Array.isArray(d.floors) ||
    !Array.isArray(d.nativeLevels) ||
    !Array.isArray(d.walls) ||
    !Array.isArray(d.issues) ||
    !d.report
  )
    throw new Error("Unsupported or invalid prepared indoor dataset.");
  if (d.visitor !== undefined) validateVisitorMetadata(d.visitor, d.records);
  if (
    d.boundaryPatchState !== undefined &&
    (!d.boundaryPatchState ||
      typeof d.boundaryPatchState.regenerated !== "boolean" ||
      !Array.isArray(d.boundaryPatchState.patchIds) ||
      !d.boundaryPatchState.patchIds.length ||
      d.boundaryPatchState.patchIds.length > 5000 ||
      d.boundaryPatchState.patchIds.some(
        (p) => !id(p) || !d.walls.some((w) => w.reviewPatchId === p),
      ))
  )
    throw new Error("Invalid applied native-boundary patch binding.");
  if (d.walkingSupport !== undefined) {
    const support = d.walkingSupport;
    if (
      !support ||
      support.version !== 1 ||
      support.sourceModelSha256 !== d.source.modelSha256 ||
      !Array.isArray(support.floors) ||
      support.floors.length > 60_000
    )
      throw new Error("Invalid native walking support.");
    const floorIds = new Set<number>();
    for (const floor of support.floors) {
      if (
        !floor ||
        !Number.isSafeInteger(floor.nativeElementId) ||
        floor.nativeElementId <= 0 ||
        floorIds.has(floor.nativeElementId) ||
        !Number.isFinite(floor.elevationFeet) ||
        !Array.isArray(floor.ringsFeet) ||
        floor.ringsFeet.length === 0 ||
        floor.ringsFeet.length > 10_000 ||
        !floor.ringsFeet.every(
          (ring) =>
            Array.isArray(ring) &&
            ring.length >= 3 &&
            ring.length <= 60_000 &&
            ring.every((p) => finitePoint(p, 2)),
        )
      )
        throw new Error("Invalid precise native floor profile.");
      if (
        floor.partsFeet !== undefined &&
        (!Array.isArray(floor.partsFeet) ||
          floor.partsFeet.length === 0 ||
          floor.partsFeet.length > 10_000 ||
          floor.partsFeet.some(
            (part) =>
              !Array.isArray(part) ||
              part.length === 0 ||
              part.length > 10_000 ||
              part.some(
                (ring) =>
                  !Array.isArray(ring) ||
                  ring.length < 3 ||
                  ring.length > 60_000 ||
                  ring.some((p) => !finitePoint(p, 2)),
              ),
          ))
      )
        throw new Error("Invalid separate native floor shells.");
      floorIds.add(floor.nativeElementId);
    }
  }
  validateNativeCirculationGeometry(d);
  validateIndoorExclusions(
    d.indoorExclusions,
    d.source.modelSha256,
    d.nativeLevels,
  );
  if (d.doors !== undefined) {
    if (!Array.isArray(d.doors) || d.doors.length > 60_000)
      throw new Error("Invalid native doors.");
    const doors = new Set<string>();
    for (const door of d.doors) {
      if (
        !id(door.id) ||
        doors.has(door.id) ||
        !Number.isSafeInteger(door.levelId) ||
        !Number.isSafeInteger(door.nativeElementId) ||
        (door.hostWallNativeElementId !== undefined && (!Number.isSafeInteger(door.hostWallNativeElementId) || door.hostWallNativeElementId <= 0)) ||
        !finitePoint(door.pointFeet, 2) ||
        !["connected", "unmatched", "ambiguous"].includes(door.state) ||
        !Array.isArray(door.roomKeys) ||
        door.roomKeys.some(
          (k) =>
            !d.records.some((r) => r.key === k && r.levelId === door.levelId),
        ) ||
        (door.normalFeet !== undefined &&
          (!finitePoint(door.normalFeet, 2) ||
            Math.abs(Math.hypot(...door.normalFeet) - 1) > 1e-5)) ||
        (door.footprintFeet !== undefined &&
          (!Array.isArray(door.footprintFeet) ||
            door.footprintFeet.length < 3 ||
            door.footprintFeet.length > 50_000 ||
            door.footprintFeet.some((p) => !finitePoint(p, 2))))
      )
        throw new Error("Invalid native door geometry.");
      doors.add(door.id);
    }
  }
  const records = new Set<string>(),
    nodes = new Set<string>(),
    edges = new Set<string>();
  for (const r of d.records) {
    if (
      !id(r.key) ||
      records.has(r.key) ||
      !Number.isSafeInteger(r.levelId) ||
      !Number.isFinite(r.elevationFeet) ||
      !Array.isArray(r.ringsFeet) ||
      r.ringsFeet.length === 0 ||
      r.ringsFeet.some(
        (loop) =>
          !Array.isArray(loop) ||
          loop.length < 3 ||
          loop.length > 50_000 ||
          loop.some((p) => !finitePoint(p, 2)),
      ) ||
      !["public", "staff", "unknown"].includes(r.access) ||
      typeof r.walkable !== "boolean" ||
      typeof r.circulation !== "boolean" ||
      typeof r.stair !== "boolean"
    )
      throw new Error("Invalid indoor area.");
    records.add(r.key);
  }
  if (d.rampDisplay !== undefined) {
    const display = d.rampDisplay;
    if (
      !display ||
      display.version !== 1 ||
      display.sourceModelSha256 !== d.source.modelSha256 ||
      !Array.isArray(display.ramps) ||
      display.ramps.length > 10_000
    )
      throw new Error("Invalid native ramp display.");
    const seen = new Set<number>();
    for (const ramp of display.ramps) {
      const edge = d.edges.find((e) => e.id === ramp.edgeId);
      if (
        (ramp.displayOnly === true
          ? ramp.edgeId !== undefined
          : !edge ||
            edge.kind !== "ramp" ||
            edge.nativeElementId !== ramp.nativeElementId) ||
        (ramp.displayOnly !== undefined && ramp.displayOnly !== true) ||
        (ramp.circulation !== undefined &&
          typeof ramp.circulation !== "boolean") ||
        !Number.isSafeInteger(ramp.nativeElementId) ||
        ramp.nativeElementId <= 0 ||
        seen.has(ramp.nativeElementId) ||
        (ramp.buildings !== undefined &&
          (!Array.isArray(ramp.buildings) ||
            ramp.buildings.some((b) => typeof b !== "string"))) ||
        !finitePoint(ramp.anchorPointFeet, 3) ||
        !Array.isArray(ramp.levelIds) ||
        ramp.levelIds.length === 0 ||
        ramp.levelIds.some(
          (level) => !d.nativeLevels.some((l) => l.id === level),
        ) ||
        !Array.isArray(ramp.trianglesFeet) ||
        ramp.trianglesFeet.length === 0 ||
        ramp.trianglesFeet.length > 100_000 ||
        ramp.trianglesFeet.some(
          (triangle) =>
            !Array.isArray(triangle) ||
            triangle.length !== 3 ||
            triangle.some((p) => !finitePoint(p, 3)),
        )
      )
        throw new Error("Ramp display does not match its source connection.");
      const validTriangles = (triangles: unknown) =>
        Array.isArray(triangles) &&
        triangles.length > 0 &&
        triangles.length <= 100_000 &&
        triangles.every(
          (triangle) =>
            Array.isArray(triangle) &&
            triangle.length === 3 &&
            triangle.every((p) => finitePoint(p, 3)),
        );
      if (
        (ramp.bodyTrianglesFeet !== undefined &&
          !validTriangles(ramp.bodyTrianglesFeet)) ||
        (ramp.platforms !== undefined &&
          (!Array.isArray(ramp.platforms) ||
            ramp.platforms.length > 1000 ||
            ramp.platforms.some(
              (platform) =>
                !Number.isSafeInteger(platform.nativeElementId) ||
                platform.nativeElementId <= 0 ||
                !validTriangles(platform.trianglesFeet),
            )))
      )
        throw new Error("Invalid native ramp platform geometry.");
      seen.add(ramp.nativeElementId);
    }
  }
  validateNativeWindowDisplay(d);
  if (d.wallDisplay !== undefined) {
    const display = d.wallDisplay;
    const seen = new Set<number>();
    if (
      !display ||
      display.version !== 1 ||
      display.sourceModelSha256 !== d.source.modelSha256 ||
      !Array.isArray(display.elements) ||
      display.elements.length > 100_000
    )
      throw new Error("Invalid native wall display.");
    for (const w of display.elements) {
      if (
        !Number.isSafeInteger(w.nativeElementId) ||
        w.nativeElementId <= 0 ||
        seen.has(w.nativeElementId) ||
        !d.nativeLevels.some((l) => l.id === w.levelId) ||
        !Number.isFinite(w.baseElevationFeet) ||
        !Number.isFinite(w.topElevationFeet) ||
        w.topElevationFeet < w.baseElevationFeet
      )
        throw new Error("Invalid native wall ownership.");
      seen.add(w.nativeElementId);
    }
  }
  if (d.stairDisplay !== undefined) {
    const s = d.stairDisplay;
    if (
      !s ||
      s.version !== 1 ||
      s.generator !== "reviter/native-stair-display-1" ||
      s.sourceModelSha256 !== d.source.modelSha256 ||
      !Array.isArray(s.flights) ||
      s.flights.length > 60_000
    )
      throw new Error("Invalid native stair display.");
    const byRecord = new Map(d.records.map((r) => [r.key, r]));
    if (s.sourceFlights !== undefined) {
      const ids = new Set<number>();
      if (!Array.isArray(s.sourceFlights) || s.sourceFlights.length > 10_000)
        throw new Error("Invalid source stair inventory.");
      for (const f of s.sourceFlights) {
        if (
          !Number.isSafeInteger(f.stairElementId) ||
          f.stairElementId <= 0 ||
          ids.has(f.stairElementId) ||
          !Array.isArray(f.levelIds) ||
          f.levelIds.length === 0 ||
          f.levelIds.some((id) => !d.nativeLevels.some((l) => l.id === id)) ||
          !Array.isArray(f.buildings) ||
          f.buildings.some((b) => typeof b !== "string") ||
          !Number.isFinite(f.floorElevationFeet) ||
          !["native-cache", "native-brep"].includes(f.sourceGeometry) ||
          (f.context !== undefined &&
            !["outdoor", "tiered-seating"].includes(f.context)) ||
          (f.runs !== undefined &&
            (!Array.isArray(f.runs) ||
              f.runs.length > 1000 ||
              f.runs.some(
                (r) =>
                  !Number.isSafeInteger(r.runElementId) ||
                  !f.treads.some((t) => t.runElementId === r.runElementId) ||
                  !Number.isFinite(r.bottomElevationFeet) ||
                  !Number.isFinite(r.topElevationFeet) ||
                  r.topElevationFeet <= r.bottomElevationFeet ||
                  typeof r.beginWithRiser !== "boolean" ||
                  typeof r.endWithRiser !== "boolean",
              ))) ||
          !Array.isArray(f.treads) ||
          f.treads.length === 0 ||
          f.treads.length > 10_000 ||
          f.treads.some(
            (t) =>
              !Number.isSafeInteger(t.runElementId) ||
              !Number.isFinite(t.elevationFeet) ||
              (t.thicknessFeet !== undefined &&
                (!Number.isFinite(t.thicknessFeet) ||
                  t.thicknessFeet <= 0 ||
                  t.thicknessFeet > 10)) ||
              !Array.isArray(t.ringFeet) ||
              t.ringFeet.length < 3 ||
              t.ringFeet.length > 100 ||
              t.ringFeet.some((p) => !finitePoint(p, 2)),
          )
        )
          throw new Error("Invalid source stair geometry.");
        ids.add(f.stairElementId);
      }
    }
    const seen = new Set<string>();
    let treadCount = 0;
    for (const f of s.flights) {
      const r = byRecord.get(f.roomKey);
      const key = `${f.roomKey}:${f.stairElementId}`;
      if (
        !r ||
        (!r.stair && f.displayOnly !== true) ||
        (f.displayOnly !== undefined && f.displayOnly !== true) ||
        !r.walkable ||
        seen.has(key) ||
        r.levelId !== f.levelId ||
        f.floorElevationFeet !== r.elevationFeet ||
        f.sourceGeometryKey !==
          JSON.stringify([r.levelId, r.elevationFeet, r.ringsFeet]) ||
        !Number.isSafeInteger(f.stairElementId) ||
        !Array.isArray(f.treads) ||
        f.treads.length === 0 ||
        f.treads.length > 10_000
      )
        throw new Error("Invalid or stale native stair binding.");
      seen.add(key);
      if (
        f.floorOccluders !== undefined &&
        (!Array.isArray(f.floorOccluders) ||
          f.floorOccluders.length > 1000 ||
          f.floorOccluders.some(
            (s) =>
              !Number.isSafeInteger(s.nativeElementId) ||
              s.nativeElementId <= 0 ||
              !Number.isFinite(s.elevationFeet) ||
              Math.abs(s.elevationFeet - f.floorElevationFeet) > 0.15 ||
              !Array.isArray(s.ringsFeet) ||
              s.ringsFeet.length === 0 ||
              s.ringsFeet.length > 1000 ||
              s.ringsFeet.some(
                (r) =>
                  !Array.isArray(r) ||
                  r.length < 3 ||
                  r.length > 20_000 ||
                  r.some((p) => !finitePoint(p, 2)),
              ),
          ))
      )
        throw new Error("Invalid native stair floor occluder.");
      treadCount += f.treads.length;
      if (treadCount > 300_000)
        throw new Error("Native stair display is too large.");
      for (const t of f.treads) {
        if (
          !Number.isSafeInteger(t.runElementId) ||
          !Number.isFinite(t.elevationFeet) ||
          (t.thicknessFeet !== undefined &&
            (!Number.isFinite(t.thicknessFeet) ||
              t.thicknessFeet <= 0 ||
              t.thicknessFeet > 10)) ||
          !Array.isArray(t.ringFeet) ||
          t.ringFeet.length < 3 ||
          t.ringFeet.length > 100 ||
          t.ringFeet.some((p) => !finitePoint(p, 2))
        )
          throw new Error("Invalid native stair tread.");
      }
    }
  }
  if (d.presentation !== undefined) {
    const p = d.presentation;
    const validRings = (rings: unknown) =>
      Array.isArray(rings) &&
      rings.length > 0 &&
      rings.length <= 1000 &&
      rings.every(
        (ring) =>
          Array.isArray(ring) &&
          ring.length >= 3 &&
          ring.length <= 50_000 &&
          ring.every((point) => finitePoint(point, 2)),
      );
    if (
      !p ||
      p.version !== 1 ||
      ![
        "reviter/native-room-presentation-1",
        "reviter/native-room-presentation-2",
      ].includes(p.generator) ||
      p.sourceModelSha256 !== d.source.modelSha256 ||
      !Number.isFinite(p.junctionToleranceFeet) ||
      p.junctionToleranceFeet < 0 ||
      p.junctionToleranceFeet >
        (p.generator === "reviter/native-room-presentation-2" ? 0.08 : 0.05) ||
      !Array.isArray(p.rooms) ||
      p.rooms.length > d.records.length ||
      !Array.isArray(p.diagnostics) ||
      p.diagnostics.length > 60_000
    )
      throw new Error("Invalid prepared room presentation.");
    const byRecord = new Map(d.records.map((r) => [r.key, r]));
    const preparedKeys = new Set<string>();
    for (const room of p.rooms) {
      const source = byRecord.get(room.roomKey);
      if (
        !source ||
        preparedKeys.has(room.roomKey) ||
        source.levelId !== room.levelId ||
        !source.walkable ||
        source.circulation ||
        room.sourceGeometryKey !==
          JSON.stringify([source.levelId, source.ringsFeet]) ||
        ![
          "native-wall-enclosure",
          "reviewed-native-wall-enclosure",
          "revit-finish-face",
          "native-mesh-wall-enclosure",
          "registered-source-wall-enclosure",
          "source-backed-native-wall-enclosure",
        ].includes(room.boundarySource) ||
        ([
          "registered-source-wall-enclosure",
          "source-backed-native-wall-enclosure",
        ].includes(room.boundarySource) &&
          !room.sourceProof) ||
        (room.boundarySource === "reviewed-native-wall-enclosure" &&
          (!room.reviewProof ||
            room.reviewProof.sourceModelSha256 !== d.source.modelSha256 ||
            !Number.isFinite(room.reviewProof.nativeFloorCoveredSquareFeet) ||
            room.reviewProof.nativeFloorCoveredSquareFeet <= 0 ||
            !Array.isArray(room.reviewProof.closures) ||
            room.reviewProof.closures.length === 0 ||
            room.reviewProof.closures.length > 12 ||
            room.reviewProof.closures.some(
              (c) =>
                !Number.isSafeInteger(c.nativeWallId) ||
                c.nativeWallId <= 0 ||
                !room.boundaryElementIds.includes(c.nativeWallId) ||
                !Number.isFinite(c.reachFeet) ||
                c.reachFeet <= 0.05 ||
                c.reachFeet > 1.5 ||
                !Array.isArray(c.ringsFeet) ||
                c.ringsFeet.length !== 1 ||
                c.ringsFeet[0].length !== 4 ||
                c.ringsFeet[0].some(
                  (p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)),
                ),
            ))) ||
        (room.boundarySource === "native-mesh-wall-enclosure" &&
          !room.meshProof) ||
        (room.meshProof !== undefined &&
          (room.boundarySource !== "native-mesh-wall-enclosure" ||
            !room.meshProof ||
            !Number.isFinite(room.meshProof.cutElevationFeet) ||
            Math.abs(
              room.meshProof.cutElevationFeet -
                ((d.nativeLevels.find((l) => l.id === room.levelId)
                  ?.elevationFeet ?? Infinity) +
                  4),
            ) > 0.0001 ||
            !Number.isFinite(room.meshProof.precisionFeet) ||
            room.meshProof.precisionFeet <= 0 ||
            room.meshProof.precisionFeet > 0.0001 ||
            !Number.isFinite(room.meshProof.nativeFloorCoveredSquareFeet) ||
            room.meshProof.nativeFloorCoveredSquareFeet <= 0 ||
            !Array.isArray(room.meshProof.nativeElementIds) ||
            room.meshProof.nativeElementIds.length === 0 ||
            room.meshProof.nativeElementIds.length > 60_000 ||
            new Set(room.meshProof.nativeElementIds).size !==
              room.meshProof.nativeElementIds.length ||
            !room.meshProof.nativeElementIds.every(
              (id) =>
                Number.isSafeInteger(id) &&
                id > 0 &&
                Array.isArray(room.boundaryElementIds) &&
                room.boundaryElementIds.includes(id),
            ))) ||
        (room.sourceProof !== undefined &&
          (!room.sourceProof ||
            !/^[a-f0-9]{64}$/.test(room.sourceProof.sourceSha256) ||
            !id(room.sourceProof.sectionId) ||
            !Number.isFinite(room.sourceProof.registrationErrorFeet) ||
            room.sourceProof.registrationErrorFeet < 0 ||
            room.sourceProof.registrationErrorFeet > 0.05 ||
            ![
              room.sourceProof.wallSegmentIndices,
              room.sourceProof.doorSegmentIndices,
            ].every(
              (indices) =>
                Array.isArray(indices) &&
                indices.length <= 60_000 &&
                new Set(indices).size === indices.length &&
                indices.every((i) => Number.isSafeInteger(i) && i >= 0),
            ) ||
            room.sourceProof.wallSegmentIndices.length <
              (room.boundarySource === "source-backed-native-wall-enclosure"
                ? 2
                : 3) ||
            !Number.isFinite(room.sourceProof.nativeFloorCoveredSquareFeet) ||
            room.sourceProof.nativeFloorCoveredSquareFeet <= 0 ||
            (room.sourceProof.modelReviewedDividerIndices !== undefined &&
              (room.boundarySource !== "registered-source-wall-enclosure" ||
                !Array.isArray(room.sourceProof.modelReviewedDividerIndices) ||
                room.sourceProof.modelReviewedDividerIndices.length === 0 ||
                room.sourceProof.modelReviewedDividerIndices.length > 16 ||
                new Set(room.sourceProof.modelReviewedDividerIndices).size !==
                  room.sourceProof.modelReviewedDividerIndices.length ||
                room.sourceProof.modelReviewedDividerIndices.some(
                  (i) =>
                    !Number.isSafeInteger(i) ||
                    i < 0 ||
                    room.sourceProof!.wallSegmentIndices.includes(i),
                ))) ||
            (room.sourceProof.omittedNativeEdgeFragments !== undefined &&
              (room.boundarySource !== "registered-source-wall-enclosure" ||
                !Number.isFinite(
                  room.sourceProof.omittedNativeEdgeFragments.squareFeet,
                ) ||
                room.sourceProof.omittedNativeEdgeFragments.squareFeet < 0 ||
                room.sourceProof.omittedNativeEdgeFragments.squareFeet > 2 ||
                !Array.isArray(
                  room.sourceProof.omittedNativeEdgeFragments.ringsFeet,
                ) ||
                room.sourceProof.omittedNativeEdgeFragments.ringsFeet.length ===
                  0 ||
                room.sourceProof.omittedNativeEdgeFragments.ringsFeet.length >
                  100 ||
                !room.sourceProof.omittedNativeEdgeFragments.ringsFeet.every(
                  (r) =>
                    Array.isArray(r) &&
                    r.length > 0 &&
                    r.every(
                      (ring) =>
                        Array.isArray(ring) &&
                        ring.length >= 3 &&
                        ring.every((p) => finitePoint(p, 2)),
                    ),
                ))) ||
            (room.sourceProof.closedDoorSwings !== undefined &&
              (room.boundarySource !== "registered-source-wall-enclosure" ||
                !Array.isArray(room.sourceProof.closedDoorSwings) ||
                room.sourceProof.closedDoorSwings.length > 100 ||
                !room.sourceProof.closedDoorSwings.every(
                  (s) =>
                    s &&
                    Number.isFinite(s.radiusFeet) &&
                    s.radiusFeet >= 0.9 &&
                    s.radiusFeet <= 8 &&
                    finitePoint(s.hingeFeet, 2) &&
                    [
                      s.arcSegmentIndices,
                      s.leafSegmentIndices,
                      s.supportingWallSegmentIndices,
                    ].every(
                      (indices, i) =>
                        Array.isArray(indices) &&
                        indices.length >= (i === 0 ? 8 : i === 1 ? 1 : 2) &&
                        indices.length <= 60_000 &&
                        new Set(indices).size === indices.length &&
                        indices.every((n) => Number.isSafeInteger(n) && n >= 0),
                    ) &&
                    Array.isArray(s.thresholdSegments) &&
                    s.thresholdSegments.length > 0 &&
                    s.thresholdSegments.length <= 100 &&
                    [s.closedLeafFeet, ...s.thresholdSegments].every(
                      (line) =>
                        Array.isArray(line) &&
                        line.length === 2 &&
                        line.every((p) => finitePoint(p, 2)),
                    ),
                ))) ||
            (room.sourceProof.jointRepairs !== undefined &&
              (!Array.isArray(room.sourceProof.jointRepairs) ||
                room.sourceProof.jointRepairs.length > 60_000 ||
                !room.sourceProof.jointRepairs.every(
                  (j) =>
                    j &&
                    Number.isSafeInteger(j.nativeWallElementId) &&
                    j.nativeWallElementId > 0 &&
                    Number.isSafeInteger(j.supportingElementId) &&
                    j.supportingElementId > 0 &&
                    j.nativeWallElementId !== j.supportingElementId &&
                    Number.isFinite(j.gapFeet) &&
                    j.gapFeet > 0 &&
                    j.gapFeet <= 0.5 &&
                    Number.isFinite(j.toleranceFeet) &&
                    j.toleranceFeet >= j.gapFeet &&
                    j.toleranceFeet <= 0.5 &&
                    Array.isArray(j.wallSegmentIndices) &&
                    j.wallSegmentIndices.length === 2 &&
                    j.wallSegmentIndices.every(
                      (i) => Number.isSafeInteger(i) && i >= 0,
                    ),
                ))))) ||
        (room.boundaryEvidence !== undefined &&
          (typeof room.boundaryEvidence !== "string" ||
            room.boundaryEvidence.length > 10_000)) ||
        !validRings(room.interiorRingsFeet) ||
        !Array.isArray(room.blockPartsFeet) ||
        room.blockPartsFeet.length === 0 ||
        room.blockPartsFeet.length > 1000 ||
        !room.blockPartsFeet.every((parts) => validRings(parts)) ||
        !Array.isArray(room.boundaryElementIds) ||
        room.boundaryElementIds.length > 60_000 ||
        !room.boundaryElementIds.every((elementId) =>
          Number.isSafeInteger(elementId),
        ) ||
        ![room.sourceCoverage, room.cellCoverage].every(
          (coverage) =>
            Number.isFinite(coverage) && coverage >= 0 && coverage <= 1.000_001,
        )
      )
        throw new Error("Invalid or stale prepared room boundary.");
      preparedKeys.add(room.roomKey);
    }
    for (const diagnostic of p.diagnostics) {
      const source = byRecord.get(diagnostic.roomKey);
      if (
        !source ||
        source.levelId !== diagnostic.levelId ||
        !id(diagnostic.code) ||
        typeof diagnostic.message !== "string" ||
        diagnostic.message.length > 10_000
      )
        throw new Error("Invalid prepared room diagnostic.");
    }
  }
  for (const n of d.nodes) {
    if (
      !id(n.id) ||
      nodes.has(n.id) ||
      !records.has(n.roomKey) ||
      !Number.isSafeInteger(n.levelId) ||
      !finitePoint(n.pointFeet, 3) ||
      !finitePoint(n.geographic, 2)
    )
      throw new Error("Invalid indoor graph node.");
    nodes.add(n.id);
  }
  const byNode = new Map(d.nodes.map((n) => [n.id, n]));
  const edgeRecords = new Map(d.records.map((r) => [r.key, r]));
  for (const e of d.edges) {
    if (
      !id(e.id) ||
      edges.has(e.id) ||
      !nodes.has(e.from) ||
      !nodes.has(e.to) ||
      !Number.isFinite(e.lengthMetres) ||
      e.lengthMetres < 0 ||
      !Array.isArray(e.roomKeys) ||
      e.roomKeys.length === 0 ||
      e.roomKeys.some((k) => !records.has(k)) ||
      !Array.isArray(e.pointsFeet) ||
      e.pointsFeet.length < 2 ||
      e.pointsFeet.some((p) => !finitePoint(p, 3)) ||
      ![
        "walk",
        "door",
        "opening",
        "stairs",
        "local-steps",
        "ramp",
        "elevator",
        "escalator",
      ].includes(e.kind) ||
      !["yes", "no", "unknown"].includes(e.accessible) ||
      (e.direction !== undefined &&
        !["both", "from-to", "to-from"].includes(e.direction)) ||
      (e.routingQuality !== undefined &&
        (!Number.isSafeInteger(e.routingQuality.turnCount) ||
          e.routingQuality.turnCount < 0 ||
          !Number.isFinite(e.routingQuality.estimatedRasterClearanceFeet) ||
          e.routingQuality.estimatedRasterClearanceFeet < 0 ||
          e.routingQuality.clearanceCertified !== false)) ||
      typeof e.enabled !== "boolean"
    )
      throw new Error("Invalid indoor graph edge.");
    const from = byNode.get(e.from)!,
      to = byNode.get(e.to)!;
    if (e.sourceDoorProof !== undefined) {
      const p = e.sourceDoorProof;
      const indices = (v: number[], minimum: number) =>
        Array.isArray(v) &&
        v.length >= minimum &&
        v.length <= 60_000 &&
        new Set(v).size === v.length &&
        v.every((i) => Number.isSafeInteger(i) && i >= 0);
      if (
        e.kind !== "door" ||
        e.nativeElementId !== undefined ||
        p.version !== 1 ||
        p.sourceModelSha256 !== d.source.modelSha256 ||
        !/^[a-f\d]{64}$/i.test(p.sourceSha256) ||
        e.roomKeys.some((key) => {
          const dwg = edgeRecords.get(key)?.properties.dwg as
            | { sha256?: unknown; sectionId?: unknown }
            | undefined;
          return (
            dwg?.sha256 !== p.sourceSha256 || dwg.sectionId !== p.sectionId
          );
        }) ||
        typeof p.sectionId !== "string" ||
        p.sectionId.length === 0 ||
        p.sectionId.length > 10_000 ||
        !Number.isFinite(p.registrationErrorFeet) ||
        p.registrationErrorFeet < 0 ||
        p.registrationErrorFeet > 0.05 ||
        !Number.isSafeInteger(p.levelId) ||
        p.levelId !== from.levelId ||
        p.levelId !== to.levelId ||
        !Number.isFinite(p.elevationFeet) ||
        Math.abs(p.elevationFeet - from.pointFeet[2]) > 0.05 ||
        !Number.isFinite(p.walkingStripWidthFeet) ||
        p.walkingStripWidthFeet < 2 ||
        p.walkingStripWidthFeet > 40 ||
        !indices(p.wallSegmentIndices, 2) ||
        !indices(p.doorSymbolSegmentIndices, 1) ||
        p.doorSymbolCollection !== "wallSegments" ||
        !Array.isArray(p.nativeFloorElementIds) ||
        p.nativeFloorElementIds.length === 0 ||
        p.nativeFloorElementIds.length > 1000 ||
        new Set(p.nativeFloorElementIds).size !==
          p.nativeFloorElementIds.length ||
        p.nativeFloorElementIds.some(
          (id) =>
            !Number.isSafeInteger(id) ||
            id <= 0 ||
            !d.walkingSupport?.floors.some(
              (f) =>
                f.nativeElementId === id &&
                Math.abs(f.elevationFeet - p.elevationFeet) <= 0.05,
            ),
        ) ||
        !Array.isArray(p.apertureFeet) ||
        p.apertureFeet.length !== 4 ||
        p.apertureFeet.some((v) => !finitePoint(v, 2)) ||
        !p.apertureFeet.every((a, i) => {
          const b = p.apertureFeet[(i + 1) % 4],
            c = p.apertureFeet[(i + 2) % 4],
            [v0, v1, v2] = p.apertureFeet;
          const cross =
            (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
          const winding =
            (v1[0] - v0[0]) * (v2[1] - v1[1]) -
            (v1[1] - v0[1]) * (v2[0] - v1[0]);
          return Math.abs(cross) > 1e-6 && cross * winding > 0;
        })
      )
        throw new Error("Invalid or stale registered source doorway.");
    }
    if (e.openingSpan !== undefined) {
      const span = e.openingSpan;
      const profiles = d.walkingSupport?.floors;
      if (
        e.kind !== "opening" ||
        span.version !== 1 ||
        span.sourceModelSha256 !== d.source.modelSha256 ||
        !Number.isSafeInteger(span.levelId) ||
        span.levelId !== from.levelId ||
        span.levelId !== to.levelId ||
        !Array.isArray(span.pointsFeet) ||
        span.pointsFeet.length !== 2 ||
        span.pointsFeet.some(
          (p) =>
            !finitePoint(p, 3) || Math.abs(p[2] - from.pointFeet[2]) > 0.05,
        ) ||
        Math.hypot(
          span.pointsFeet[1][0] - span.pointsFeet[0][0],
          span.pointsFeet[1][1] - span.pointsFeet[0][1],
        ) < 0.001 ||
        !Number.isFinite(span.walkingStripWidthFeet) ||
        span.walkingStripWidthFeet < 2 ||
        span.walkingStripWidthFeet > 40 ||
        !Array.isArray(span.apertureFeet) ||
        span.apertureFeet.length !== 4 ||
        span.apertureFeet.some((p) => !finitePoint(p, 2)) ||
        !span.pointsFeet.every((p) =>
          span.apertureFeet.every((a, index) => {
            const b = span.apertureFeet[(index + 1) % 4];
            const c = span.apertureFeet[(index + 2) % 4];
            const dx = b[0] - a[0],
              dy = b[1] - a[1];
            const orientation = dx * (c[1] - b[1]) - dy * (c[0] - b[0]);
            const [v0, v1, v2] = span.apertureFeet;
            const winding =
              (v1[0] - v0[0]) * (v2[1] - v1[1]) -
              (v1[1] - v0[1]) * (v2[0] - v1[0]);
            const side = dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
            return (
              Math.abs(orientation) > 1e-6 &&
              orientation * winding > 0 &&
              (side * Math.sign(orientation)) / Math.hypot(dx, dy) >=
                span.walkingStripWidthFeet / 2 - 0.001
            );
          }),
        ) ||
        !Array.isArray(span.nativeFloorElementIds) ||
        span.nativeFloorElementIds.length === 0 ||
        span.nativeFloorElementIds.length > 1000 ||
        new Set(span.nativeFloorElementIds).size !==
          span.nativeFloorElementIds.length ||
        span.nativeFloorElementIds.some(
          (id) =>
            !Number.isSafeInteger(id) ||
            id <= 0 ||
            !profiles?.some(
              (p) =>
                p.nativeElementId === id &&
                Math.abs(p.elevationFeet - from.pointFeet[2]) <= 0.05,
            ),
        )
      )
        throw new Error("Invalid or stale prepared opening span.");
    }
    if (
      (e.kind === "walk" &&
        (from.surfaceId !== to.surfaceId || from.levelId !== to.levelId)) ||
      (["walk", "door", "opening"].includes(e.kind) &&
        (from.levelId !== to.levelId ||
          Math.abs(from.pointFeet[2] - to.pointFeet[2]) > 0.05)) ||
      (["stairs", "local-steps", "escalator"].includes(e.kind) &&
        e.accessible === "yes")
    )
      throw new Error(
        `Invalid floor or accessibility relationship for edge ${e.id}.`,
      );
    edges.add(e.id);
  }
  const connectors = new Map<
    string,
    NonNullable<IndoorDataset["connectors"]>[number]
  >();
  if (d.connectors !== undefined) {
    if (!Array.isArray(d.connectors) || d.connectors.length > 5000)
      throw new Error("Invalid prepared connectors.");
    for (const c of d.connectors) {
      if (
        !id(c.id) ||
        connectors.has(c.id) ||
        !["elevator", "escalator"].includes(c.kind) ||
        !Number.isSafeInteger(c.nativeElementId) ||
        c.sourceModelSha256 !== d.source.modelSha256 ||
        typeof c.evidence !== "string" ||
        !c.evidence.trim() ||
        !["yes", "no", "unknown"].includes(c.accessible) ||
        !["both", "from-to", "to-from"].includes(c.direction) ||
        (c.kind === "escalator" &&
          (c.accessible === "yes" || c.direction === "both")) ||
        !Array.isArray(c.entrances) ||
        c.entrances.length < 2 ||
        c.entrances.length > 200 ||
        (c.kind === "escalator" && c.entrances.length !== 2) ||
        new Set(c.entrances.map((e) => e.levelId)).size !==
          c.entrances.length ||
        c.entrances.some(
          (e) =>
            !byNode.has(e.nodeId) ||
            byNode.get(e.nodeId)!.roomKey !== e.roomKey ||
            byNode.get(e.nodeId)!.levelId !== e.levelId ||
            (e.areaKey !== undefined &&
              (!c.reviewedShaft ||
                !id(e.areaKey) ||
                !d.records.some(
                  (r) => r.key === e.areaKey && r.levelId === e.levelId,
                ))) ||
            !d.nativeLevels.some((l) => l.id === e.levelId),
        ) ||
        (c.reviewedShaft === undefined
          ? new Set(c.entrances.map((e) => byNode.get(e.nodeId)!.building))
              .size !== 1
          : !validShaft(c))
      )
        throw new Error(
          "Invalid model-bound connector entrances or direction.",
        );
      connectors.set(c.id, c);
    }
  }
  // Edge accessibility may carry a later geometry-bound review; the connector
  // declaration records its original default. Package import binds overrides.
  for (const e of d.edges)
    if (e.connectorId || ["elevator", "escalator"].includes(e.kind)) {
      const c = e.connectorId ? connectors.get(e.connectorId) : undefined;
      const a = c && c.entrances.findIndex((n) => n.nodeId === e.from),
        b = c && c.entrances.findIndex((n) => n.nodeId === e.to);
      if (
        !c ||
        e.kind !== c.kind ||
        a === undefined ||
        b === undefined ||
        a < 0 ||
        b <= a ||
        e.direction !== c.direction ||
        e.nativeElementId !== c.nativeElementId ||
        e.evidence !== c.evidence
      )
        throw new Error(
          "Connector edge does not match reviewed served entrances.",
        );
    }
  if (d.records.some((r) => r.arrivalNodeId && !nodes.has(r.arrivalNodeId)))
    throw new Error("Invalid area arrival node.");
  for (const f of d.floors)
    if (
      !id(f.id) ||
      !Array.isArray(f.levelIds) ||
      f.levelIds.length === 0 ||
      f.levelIds.some((x) => !Number.isSafeInteger(x))
    )
      throw new Error("Invalid floor catalog.");
  for (const w of d.walls)
    if (
      (w.kind !== undefined && w.kind !== "wall" && w.kind !== "column") ||
      (w.approximate !== undefined && typeof w.approximate !== "boolean") ||
      !Number.isSafeInteger(w.levelId) ||
      !Array.isArray(w.ringsFeet) ||
      w.ringsFeet.some(
        (loop) => !Array.isArray(loop) || loop.some((p) => !finitePoint(p, 2)),
      )
    )
      throw new Error("Invalid architectural wall.");
}
