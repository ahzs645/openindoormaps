/** Independent candidate QA. This module installs no prepared/published routing cache. */
import { createHash } from "node:crypto";
import type {
  IndoorDataset,
  IndoorEdge,
} from "../../app/indoor-project/contract";
import {
  isProjectDestination,
  projectRoutingGraph,
  reachableProjectDestinations,
  type ProjectRouteMode,
} from "../../app/indoor-project/routing-graph";
import { createIndoorExclusionQuery } from "../../app/indoor-project/indoor-exclusions";
import { isVisitorHallway } from "../../app/indoor-project/place-discovery";
import { isPassThroughPlace } from "../../app/indoor-project/display-passages";
import type { RouteCalculation } from "../../app/indoor-project/route-calculation";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import {
  nativeCirculationCells,
  nativeCirculationExactCellParts,
  nativeCirculationExactIndex,
} from "../../app/indoor-project/native-circulation";
import { nativeRationalPointInParts } from "../../app/indoor-project/native-exact-planar-topology";
import { certifiedStationaryNativeAlias } from "../../../reviter/lib/reviter/indoor-stationary-native-alias";
import { Rational as SourceRational } from "../../../reviter/lib/reviter/native-rational-overlay";

export const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
export const jsonSha256 = (value: unknown) =>
  sha256(JSON.stringify(value) ?? "undefined");
export const profiles = ["public", "accessible"] as const;
/** The original visitor exporter removes authoring history/notes. Normalize
 * only those documented nonphysical wrappers for master/visitor comparison;
 * every retained routing/source geometry operand is hashed exactly. */
export function masterVisitorPhysicalAuthoritySha256(data:IndoorDataset) {
  const projection={...data},physicalKeys=["source","alignment","records","nodes","edges","doors","walls","walkingSupport","circulationGeometry","nativeMaterialSections","nativeMaterialSectionSupplement","nativeSourceStairMaterials","nativeSteppedStairV2SourceIndices","nativeIndoorEnvelopes","nativePhysicalLevels","nativeDerivedFrameReturns","nativeProvisionalCornerSeals","reviewedDrawingReferences","connectors","rampDisplay","stairDisplay","nativeWallPositionRepairs","indoorExclusions","reviewedCirculationLinks","nativeAccessZones","boundaryPatchState","doorAperturePatchState"];
  // Callers pass routeWorkerDataset, which already drops render and portable
  // source-role authoring wrappers using the production worker projection.
  if(projection.stairDisplay)projection.stairDisplay={...projection.stairDisplay,sourceFlights:projection.stairDisplay.sourceFlights?.map(({historicalPreparedTreads:_,...flight})=>flight)};
  if(projection.nativeWallPositionRepairs)projection.nativeWallPositionRepairs={...projection.nativeWallPositionRepairs,walls:projection.nativeWallPositionRepairs.walls.map(wall=>({...wall,notes:""}))};
  if(projection.indoorExclusions)projection.indoorExclusions={...projection.indoorExclusions,areas:projection.indoorExclusions.areas.map(({notes:_,...area})=>area)};
  return jsonSha256(Object.fromEntries(physicalKeys.map(key=>[key,(projection as unknown as Record<string,unknown>)[key]])));
}
export const verticalKinds = new Set<IndoorEdge["kind"]>([
  "stairs",
  "local-steps",
  "elevator",
  "ramp",
  "escalator",
]);
export type Endpoint = {
  key: string;
  number: string;
  name: string;
  building: string;
  levelId: number;
  arrivalNodeId?: string;
  validArrival: boolean;
  defaultVisitor: boolean;
};
export type Coverage = {
  mode: ProjectRouteMode;
  endpoints: Endpoint[];
  rowBytes: number;
  matrix: Uint8Array;
  directedPairs: number;
  reachable: number;
  unavailable: number;
  oracleChecks: number;
  missingArrivals: string[];
  isolatedWithArrival: string[];
  rows: { key: string; reachable: number }[];
  blockers: {
    kind: string;
    edgeId: string;
    roomKey?: string;
    directions: string[];
  }[];
};

/** Full matrix plus independent BFS, checked at EVERY origin against the original oracle.
 * Call inside one immutable routing session after validating the candidate. */
export function auditCoverage(
  data: IndoorDataset,
  mode: ProjectRouteMode,
): Coverage {
  const records = data.records.filter(isProjectDestination),
    nodes = new Map(data.nodes.map((n, index) => [n.id, { ...n, index }])),
    outside = createIndoorExclusionQuery(data),
    graph = projectRoutingGraph(data, mode),
    arrivals = records.map((record) => {
      const node = record.arrivalNodeId
        ? nodes.get(record.arrivalNodeId)
        : undefined;
      return node && !outside([node.pointFeet]).length ? node.index : -1;
    }),
    endpoints = records.map(
      (r, i): Endpoint => ({
        key: r.key,
        number: r.number,
        name: r.name,
        building: r.building,
        levelId: r.levelId,
        arrivalNodeId: r.arrivalNodeId,
        validArrival: arrivals[i] >= 0,
        defaultVisitor: !isVisitorHallway(r) && !isPassThroughPlace(r),
      }),
    ),
    rowBytes = Math.ceil(records.length / 8),
    matrix = new Uint8Array(rowBytes * records.length),
    adjacency = data.nodes.map((node) =>
      (graph.adjacency.get(node.id) ?? []).map((link) => {
        const index = nodes.get(link.to)?.index;
        if (index === undefined)
          throw Error(`Graph references missing node ${link.to}`);
        return index;
      }),
    ),
    seen = new Uint32Array(data.nodes.length),
    queue = new Uint32Array(data.nodes.length),
    rows: Coverage["rows"] = [];
  let reachable = 0;
  for (let i = 0; i < records.length; i++) {
    const origin = arrivals[i],
      tag = i + 1;
    let tail = 0;
    if (origin >= 0) {
      queue[tail++] = origin;
      seen[origin] = tag;
      for (let head = 0; head < tail; head++)
        for (const next of adjacency[queue[head]])
          if (seen[next] !== tag) {
            seen[next] = tag;
            queue[tail++] = next;
          }
    }
    const actual = new Set<string>();
    let count = 0;
    for (let j = 0; j < records.length; j++)
      if (origin >= 0 && arrivals[j] >= 0 && seen[arrivals[j]] === tag) {
        actual.add(records[j].key);
        if (j !== i) {
          matrix[i * rowBytes + (j >> 3)] |= 1 << (j & 7);
          count++;
          reachable++;
        }
      }
    const original = reachableProjectDestinations(graph, records[i].key);
    if (
      actual.size !== original.size ||
      [...actual].some((key) => !original.has(key))
    )
      throw Error(
        `Original reachability oracle disagrees for ${mode}:${records[i].key}`,
      );
    rows.push({ key: records[i].key, reachable: count });
  }
  const blockers = new Map<string, Coverage["blockers"][number]>();
  for (const [from, links] of graph.allAdjacency)
    for (const link of links)
      for (const blocker of link.blockers) {
        const id = JSON.stringify([
          blocker.kind,
          blocker.edgeId,
          blocker.roomKey,
        ]);
        if (!blockers.has(id)) blockers.set(id, { ...blocker, directions: [] });
        blockers.get(id)!.directions.push(`${from}→${link.to}`);
      }
  return {
    mode,
    endpoints,
    rowBytes,
    matrix,
    directedPairs: records.length * (records.length - 1),
    reachable,
    unavailable: records.length * (records.length - 1) - reachable,
    oracleChecks: records.length,
    missingArrivals: endpoints.filter((r) => !r.validArrival).map((r) => r.key),
    isolatedWithArrival: endpoints
      .filter((r, i) => r.validArrival && rows[i].reachable === 0)
      .map((r) => r.key),
    rows,
    blockers: [...blockers.values()],
  };
}

export type Matrix = Pick<Coverage, "endpoints" | "rowBytes" | "matrix">;
export function available(matrix: Matrix, from: number, to: number): boolean {
  return (
    from !== to &&
    !!(matrix.matrix[from * matrix.rowBytes + (to >> 3)] & (1 << (to & 7)))
  );
}

/** Join by stable source KEY, never array index/room number. Missing identities count as losses. */
export function compareCoverage(before: Matrix, after: Matrix) {
  const index = new Map(after.endpoints.map((r, i) => [r.key, i])),
    old = new Map(before.endpoints.map((r, i) => [r.key, i])),
    losses: { start: string; end: string }[] = [],
    gains: typeof losses = [];
  let gainCount = 0,
    lossCount = 0;
  for (let i = 0; i < before.endpoints.length; i++)
    for (let j = 0; j < before.endpoints.length; j++) {
      if (i === j) continue;
      const a = index.get(before.endpoints[i].key),
        b = index.get(before.endpoints[j].key),
        was = available(before, i, j),
        now = a !== undefined && b !== undefined && available(after, a, b);
      if (was && !now) {
        lossCount++;
        if (losses.length < 1000)
          losses.push({
            start: before.endpoints[i].key,
            end: before.endpoints[j].key,
          });
      }
      if (!was && now) {
        gainCount++;
        if (gains.length < 1000)
          gains.push({
            start: before.endpoints[i].key,
            end: before.endpoints[j].key,
          });
      }
    }
  // New source destinations are reported separately instead of inflating comparable gains.
  return {
    comparableGainCount: gainCount,
    comparableLossCount: lossCount,
    comparableGainExamples: gains,
    comparableLossExamples: losses,
    newEndpoints: after.endpoints
      .filter((r) => !old.has(r.key))
      .map((r) => r.key),
    removedEndpoints: before.endpoints
      .filter((r) => !index.has(r.key))
      .map((r) => r.key),
    recoveredArrivals: after.endpoints
      .filter(
        (r) =>
          r.validArrival &&
          old.has(r.key) &&
          !before.endpoints[old.get(r.key)!].validArrival,
      )
      .map((r) => r.key),
    lostArrivals: before.endpoints
      .filter(
        (r) =>
          r.validArrival &&
          (!index.has(r.key) ||
            !after.endpoints[index.get(r.key)!].validArrival),
      )
      .map((r) => r.key),
  };
}

export type SafetySnapshot = {
  source: IndoorDataset["source"];
  alignment: string;
  exclusions: string;
  records: {
    key: string;
    number: string;
    building: string;
    levelId: number;
    access: string;
    walkable: boolean;
    arrivalNodeId?: string;
    generated: boolean;
  }[];
  edges: {
    id: string;
    kind: string;
    nativeElementId?: number;
    connectorId?: string;
    accessible: string;
    enabled: boolean;
    direction?: string;
  }[];
  sourceFloors: { id: number; sha256: string }[];
  stationaryAliases: Record<string, ReturnType<typeof stationaryAliasBinding>>;
};
function stationaryAliasBinding(data: IndoorDataset, edge: IndoorEdge) {
  const nodes = [edge.from, edge.to].map((id) =>
    data.nodes.find((node) => node.id === id),
  );
  return {
    from: edge.from,
    to: edge.to,
    nativeCellId: edge.nativeCellId,
    roomKeys: [...edge.roomKeys],
    kind: edge.kind,
    lengthMetres: edge.lengthMetres,
    pointsFeet: edge.pointsFeet.map((p) => [...p]),
    direction: edge.direction ?? "both",
    enabled: edge.enabled,
    nodes: nodes.map(
      (node) =>
        node && {
          id: node.id,
          roomKey: node.roomKey,
          levelId: node.levelId,
          surfaceId: node.surfaceId,
          pointFeet: [...node.pointFeet],
        },
    ),
  };
}
export function safetySnapshot(data: IndoorDataset): SafetySnapshot {
  return {
    source: data.source,
    alignment: jsonSha256(data.alignment),
    exclusions: jsonSha256(data.indoorExclusions),
    records: data.records.map((r) => ({
      key: r.key,
      number: r.number,
      building: r.building,
      levelId: r.levelId,
      access: r.access,
      walkable: r.walkable,
      arrivalNodeId: r.arrivalNodeId,
      generated: r.properties.generatedLanding === true,
    })),
    edges: data.edges.map((e) => ({
      id: e.id,
      kind: e.kind,
      nativeElementId: e.nativeElementId,
      connectorId: e.connectorId,
      accessible: e.accessible,
      enabled: e.enabled,
      direction: e.direction,
    })),
    sourceFloors: (data.walkingSupport?.floors ?? []).map((f) => ({
      id: f.nativeElementId,
      sha256: jsonSha256(f),
    })),
    stationaryAliases: Object.fromEntries(
      data.edges
        .filter(
          (edge) =>
            edge.kind === "walk" &&
            !!edge.nativeCellId &&
            edge.lengthMetres === 0 &&
            edge.pointsFeet.length === 2 &&
            edge.pointsFeet[0]!.every(
              (coordinate, i) => coordinate === edge.pointsFeet[1]![i],
            ),
        )
        .map((edge) => [edge.id, stationaryAliasBinding(data, edge)]),
    ),
  };
}

/** Positive accessibility applies only to an unchanged, literally zero-motion
 * identity edge; it grants no passage/body/clearance approval. Call after fresh
 * original native walk validation, within the candidate's immutable session. */
export function checkedStationaryNativeAliasChanges(
  data: IndoorDataset,
  before: SafetySnapshot,
  reviewedEdgeIds: ReadonlySet<string>,
  freshPhysicalWalkBlockers: ReadonlySet<string>,
) {
  const cells = new Map(
      nativeCirculationCells(data).map((cell) => [cell.id, cell]),
    ),
    index = nativeCirculationExactIndex(data),
    nodes = new Map(data.nodes.map((node) => [node.id, node])),
    converted = new Map<
      string,
      Parameters<typeof certifiedStationaryNativeAlias>[3]
    >();
  return [...reviewedEdgeIds].map((edgeId) => {
    const reasons: string[] = [],
      edge = data.edges.find((candidate) => candidate.id === edgeId),
      old = before.edges.find((candidate) => candidate.id === edgeId);
    if (
      !edge ||
      !old ||
      old.accessible !== "unknown" ||
      edge.accessible !== "yes"
    )
      reasons.push("Not an existing unknown-to-yes identity change");
    if (!edge)
      return {
        edgeId,
        accepted: false,
        reasons,
        passageApproved: false as const,
      };
    if (
      !edge.enabled ||
      edge.kind !== "walk" ||
      !edge.nativeCellId ||
      edge.lengthMetres !== 0 ||
      edge.roomKeys.length !== 1 ||
      edge.pointsFeet.length !== 2 ||
      (edge.direction !== undefined && edge.direction !== "both")
    )
      reasons.push(
        "Not an enabled ordinary zero-length native walking identity",
      );
    if (
      !before.stationaryAliases[edge.id] ||
      JSON.stringify(before.stationaryAliases[edge.id]) !==
        JSON.stringify(stationaryAliasBinding(data, edge))
    )
      reasons.push(
        "Original node, owner, level, surface, cell, path or enabled binding changed",
      );
    if (freshPhysicalWalkBlockers.has(edge.id))
      reasons.push("Fresh original physical walk validator refused the edge");
    const cell = edge.nativeCellId && cells.get(edge.nativeCellId),
      a = nodes.get(edge.from),
      b = nodes.get(edge.to),
      owner = data.records.find((record) => record.key === edge.roomKeys[0]),
      original = cell && cell.exactFaceId && index?.parts(cell.exactFaceId),
      supported = cell && nativeCirculationExactCellParts(data, cell);
    let sourceHelperPassed = false,
      originalPhysicalSupport = false;
    if (!cell || !a || !b || !owner || !original || !supported)
      reasons.push(
        "Missing current model-bound original cell or physical source authority",
      );
    else {
      let sourceParts = converted.get(cell.id);
      if (!sourceParts) {
        // Cross-repository transport retains exact n/d, never numeric rounding.
        sourceParts = original.map((part) =>
          part.map((ring) =>
            ring.map(([x, y]) => [
              new SourceRational(x.n, x.d),
              new SourceRational(y.n, y.d),
            ]),
          ),
        );
        converted.set(cell.id, sourceParts);
      }
      sourceHelperPassed = certifiedStationaryNativeAlias(
        a,
        b,
        cell,
        sourceParts,
        owner,
      );
      originalPhysicalSupport =
        nativeRationalPointInParts(a.pointFeet, supported) &&
        nativeRationalPointInParts(b.pointFeet, supported);
      if (!sourceHelperPassed)
        reasons.push(
          "Source stationary-alias predicate refused original nodes/cell/owner",
        );
      if (!originalPhysicalSupport)
        reasons.push(
          "Original native floor/material authority does not support the stationary point",
        );
    }
    return {
      edgeId,
      accepted: !reasons.length,
      reasons,
      sourceHelperPassed,
      originalPhysicalSupport,
      originalBindingUnchanged:
        !!before.stationaryAliases[edge.id] &&
        JSON.stringify(before.stationaryAliases[edge.id]) ===
          JSON.stringify(stationaryAliasBinding(data, edge)),
      passageApproved: false as const,
    };
  });
}

/** Evidence for withholding an obsolete isolated arrival, never for admitting a path.
 * Blocker IDs must come from the original, exactly snapshot-bound physical audit.
 * No empty/foreign/noncell/alias/door/connector incident set can pass vacuously. */
export function originalBlockedArrivalEvidence(
  data: IndoorDataset,
  roomKey: string,
  originalPhysicalWalkBlockers: ReadonlySet<string>,
) {
  const record = data.records.find((r) => r.key === roomKey),
    arrival =
      record?.arrivalNodeId &&
      data.nodes.find((node) => node.id === record.arrivalNodeId),
    nodes = new Map(data.nodes.map((node) => [node.id, node])),
    incidents = arrival
      ? data.edges.filter(
          (edge) =>
            edge.enabled &&
            (edge.from === arrival.id || edge.to === arrival.id),
        )
      : [];
  const checked = incidents.map((edge) => {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to),
      ordinaryNativeCell =
        edge.kind === "walk" &&
        !!edge.nativeCellId &&
        !edge.reviewedCirculationLinkId &&
        !!a &&
        !!b &&
        a.levelId === b.levelId &&
        a.surfaceId === b.surfaceId &&
        a.pointFeet[2] === b.pointFeet[2],
      originalPhysicallyBlocked = originalPhysicalWalkBlockers.has(edge.id);
    return {
      edgeId: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      nativeCellId: edge.nativeCellId,
      ordinaryNativeCell,
      originalPhysicallyBlocked,
    };
  });
  return {
    roomKey,
    originalArrivalNodeId: record?.arrivalNodeId,
    originalArrivalOwnedByRoom: !!arrival && arrival.roomKey === roomKey,
    enabledIncidentEdges: checked,
    allOriginalApproachesPhysicallyRefused:
      !!arrival &&
      arrival.roomKey === roomKey &&
      checked.length > 0 &&
      checked.every(
        (edge) => edge.ordinaryNativeCell && edge.originalPhysicallyBlocked,
      ),
  };
}

export function compareSafety(
  before: SafetySnapshot,
  after: SafetySnapshot,
  stationaryAliasCertifications: ReadonlySet<string> = new Set(),
) {
  const violations: string[] = [],
    changes: {
      target: "record" | "edge";
      id: string;
      field: string;
      before: unknown;
      after: unknown;
    }[] = [],
    records = new Map(after.records.map((r) => [r.key, r])),
    edges = new Map(after.edges.map((e) => [e.id, e]));
  if (
    before.source.modelSha256 !== after.source.modelSha256 ||
    before.source.modelFileName !== after.source.modelFileName
  )
    violations.push("Original RVT source identity changed");
  if (before.alignment !== after.alignment)
    violations.push("Original GIS alignment changed");
  if (before.exclusions !== after.exclusions)
    violations.push("Reviewed indoor/off-limits exclusion footprints changed");
  for (const old of before.records) {
    const next = records.get(old.key);
    if (!next) {
      if (!old.generated) violations.push(`Source room removed: ${old.key}`);
      continue;
    }
    for (const field of [
      "number",
      "building",
      "levelId",
      "access",
      "walkable",
    ] as const)
      if (old[field] !== next[field])
        violations.push(`Original room ${field} changed: ${old.key}`);
    if (old.arrivalNodeId !== next.arrivalNodeId)
      changes.push({
        target: "record",
        id: old.key,
        field: "arrivalNodeId",
        before: old.arrivalNodeId,
        after: next.arrivalNodeId,
      });
  }
  for (const old of before.edges) {
    const next = edges.get(old.id);
    if (!next) continue; // Regenerated infrastructure is compared through matrix losses and physical validators.
    for (const field of [
      "kind",
      "nativeElementId",
      "connectorId",
      "accessible",
      "enabled",
      "direction",
    ] as const)
      if (old[field] !== next[field])
        changes.push({
          target: "edge",
          id: old.id,
          field,
          before: old[field],
          after: next[field],
        });
    // Changing restrictions needs separate authorization; this repair task does not grant it.
    if (
      old.accessible !== next.accessible &&
      !(
        old.accessible === "unknown" &&
        next.accessible === "yes" &&
        stationaryAliasCertifications.has(old.id)
      )
    )
      violations.push(
        `Accessibility metadata changed without a separate source review: ${old.id}`,
      );
    if ((old.direction ?? "both") !== (next.direction ?? "both"))
      violations.push(`Original connection direction changed: ${old.id}`);
  }
  const floors = new Map(after.sourceFloors.map((f) => [f.id, f.sha256]));
  return {
    violations,
    changes,
    missingSourceFloorIds: before.sourceFloors
      .filter((f) => !floors.has(f.id))
      .map((f) => f.id),
    changedSourceFloorIds: before.sourceFloors
      .filter((f) => floors.has(f.id) && floors.get(f.id) !== f.sha256)
      .map((f) => f.id),
    addedSourceFloorIds: after.sourceFloors
      .filter((f) => !before.sourceFloors.some((old) => old.id === f.id))
      .map((f) => f.id),
  };
}

export type RouteCase = {
  name: string;
  start: string;
  end: string;
  mode: ProjectRouteMode;
  expect?: "route" | "blocked";
  intendedEdgeId?: string;
  forbiddenEdgeIds?: string[];
};
export function connectorCases(data: IndoorDataset) {
  const byKey = new Map(data.records.map((r) => [r.key, r])),
    nodes = new Map(data.nodes.map((n) => [n.id, n])),
    cases: RouteCase[] = [],
    unresolved: { edgeId: string; roomKeys: string[] }[] = [];
  for (const edge of data.edges.filter(
    (e) => e.enabled && verticalKinds.has(e.kind),
  )) {
    const owners = [edge.from, edge.to].map((nodeId, i) => {
      const record = byKey.get(nodes.get(nodeId)?.roomKey ?? "");
      return record?.arrivalNodeId
        ? record
        : (edge.roomKeys
            .map((key) => byKey.get(key))
            .find((r) => r?.arrivalNodeId === nodeId) ??
            byKey.get(edge.roomKeys[i]));
    });
    if (!owners.every((record) => record?.arrivalNodeId)) {
      unresolved.push({ edgeId: edge.id, roomKeys: edge.roomKeys });
      continue;
    }
    for (const mode of profiles)
      for (const reverse of [false, true]) {
        const [a, b] = reverse
          ? [owners[1]!, owners[0]!]
          : [owners[0]!, owners[1]!];
        const profilePermitsConnector = mode === "public" ||
          (edge.accessible === "yes" && !["stairs", "local-steps", "escalator"].includes(edge.kind));
        cases.push({
          name: `${edge.kind}:${edge.id}:${reverse ? "down/reverse" : "up/forward"}:${mode}`,
          start: a.key,
          end: b.key,
          mode,
          ...(profilePermitsConnector
            ? { intendedEdgeId: edge.id }
            : { forbiddenEdgeIds: [edge.id] }),
        });
      }
  }
  return { cases, unresolved };
}

/** Check calculator output independently against candidate policy graph, arrivals and original IDs. */
export function checkRouteResult(
  data: IndoorDataset,
  test: RouteCase,
  value: RouteCalculation,
) {
  const errors: string[] = [],
    graph = projectRoutingGraph(data, test.mode),
    expected = reachableProjectDestinations(graph, test.start).has(test.end),
    start = data.records.find((r) => r.key === test.start),
    end = data.records.find((r) => r.key === test.end),
    route = value.route;
  if (!!route !== expected) errors.push("graph-vs-calculator-availability");
  if (
    (test.expect === "route" && !route) ||
    (test.expect === "blocked" && route)
  )
    errors.push("explicit-route-expectation");
  let instructionCount = 0;
  if (route) {
    if (
      route.nodeIds[0] !== start?.arrivalNodeId ||
      route.nodeIds.at(-1) !== end?.arrivalNodeId
    )
      errors.push("original-arrival-mismatch");
    for (let i = 0; i < route.edges.length; i++) {
      const edge = route.edges[i],
        from = route.nodeIds[i],
        to = route.nodeIds[i + 1];
      if (
        !graph.adjacency
          .get(from)
          ?.some((link) => link.to === to && link.edge.id === edge.id)
      )
        errors.push(`inadmissible-edge:${edge.id}`);
      if (!edge.enabled) errors.push(`disabled-edge:${edge.id}`);
      if (
        test.mode === "accessible" &&
        (edge.accessible !== "yes" ||
          ["stairs", "local-steps", "escalator"].includes(edge.kind))
      )
        errors.push(`step-free-veto:${edge.id}`);
    }
    if (
      !Number.isFinite(route.distanceMetres) ||
      route.paths.some((path) =>
        path.pointsFeet.some(
          (p) => p.length !== 3 || p.some((n) => !Number.isFinite(n)),
        ),
      )
    )
      errors.push("nonfinite-path");
    if (
      test.intendedEdgeId &&
      !route.edges.some((edge) => edge.id === test.intendedEdgeId)
    )
      errors.push("intended-connector-not-exercised");
    for (const id of test.forbiddenEdgeIds ?? [])
      if (route.edges.some(edge => edge.id === id))
        errors.push(`forbidden-connector-exercised:${id}`);
    instructionCount = projectNavigationSteps(
      data,
      route,
      start?.number ?? test.start,
      end?.number ?? test.end,
    ).length;
    if (!instructionCount && route.edges.length)
      errors.push("missing-instructions");
  }
  return {
    available: !!route,
    graphAvailable: expected,
    instructionCount,
    errors,
  };
}
