import { reviewedFlatLandingBridge } from "./reviewed-flat-landing-bridge";
import { reviewedLandingWaypoints } from "./reviewed-landing-waypoints";
import {
  reviewedClassroomKey,
  classroomStationTerminal,
  reviewedClassroomEntrance,
} from "./reviewed-classroom-entrance";
import {
  reviewedOfficeApproachCore,
  reviewedWestHallwayRun,
} from "./reviewed-office-approach-core";
import { nativeStairHallwayApproaches } from "./native-stair-hallway-approaches";
import { auditedCorridorSpans } from "./audited-corridor-spans";
import { buildReviewedCorridorRuns } from "./reviewed-rotunda-north";
import { buildReviewedStationDoor } from "./reviewed-station-door";
import { rotundaSouthDoor } from "./reviewed-rotunda-south-door";
import {
  isRotundaRampApproach,
  reviewedRampLanding,
} from "./raised-rotunda-plane";
import { balconyDoorSpec } from "./reviewed-balcony-door";
import { reviewedConnectorCorridorJunction } from "./reviewed-connector-corridor-junction";
import { buildReviewedCrossCorridor } from "./reviewed-cross-corridor-door";
import { buildReviewedVestibuleDoor } from "./reviewed-lower-vestibule";
import { prepareCirculationLabelPassages } from "./circulation-label-passage";
import { circulationDoorGuideJoins } from "./circulation-door-guide-joins";
import { isHorizontalCirculationAnnotation } from "./horizontal-circulation-annotations";
import {
  splitPathwayCore,
  type PathwayStation,
  type PathwayCut,
} from "./pathway-station";
import {
  buildReviewedPrintPreRoom,
  isReviewedPrintArea,
} from "./reviewed-print-entrance";
import { prepareSharedDoorCrossings } from "./shared-door-crossing";
import { createRoomPathwayBranches } from "./room-pathway-branch";
import { DistanceHeap } from "../indoor-directions/pathfinding/distance-heap";
import type { IndoorDataset, IndoorEdge } from "./contract";
import type { ProjectRoute } from "./viewer-routing";
import type { ProjectRouteArrival } from "./route-arrival";
import type { ProjectRoutingOptions } from "./routing-options";
import {
  projectRoutingGraph,
  type ProjectRouteMode,
  type ProjectRoutingLink,
} from "./routing-graph";
import { hallwayRouteEndpoints } from "./route-endpoints";
import {
  preparedWalkingGuides,
  validatePreparedRouting,
  type PreparedRouting,
} from "./prepared-routing";
import {
  withRoutingCalculation,
  routingCalculationValue,
} from "./routing-cache";
import {
  nativeCirculationCells,
  nativeCirculationExactCellParts,
  nativeCellSharedFloorAlias,
} from "./native-circulation";
import { indexCorridorRoutingScope } from "./corridor-routing-scope";
import { createCorridorGuideSupport } from "./corridor-guide-support";
import { createNativeDoorApproachQuery } from "./native-door-approach";
import { createNativeTransitRefinementPolicy } from "./native-walk-transit-owners";
import { createDoorPassageQuery } from "./route-passages";
import { createIndoorExclusionQuery } from "./indoor-exclusions";
import { createNativeFloorHoleQuery } from "./walking-support";
import { prepareReviewedGuideBends } from "./reviewed-guide-bends";
import {
  reviewedRetracesAllowed,
  trimReviewedRouteRetraces,
} from "./reviewed-route-retraces";
import { trimSharedGuideRetraces } from "./shared-guide-retrace";
import { composeSharedCorridorGuide } from "./shared-corridor-composition";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";
import { isProjectDestination } from "./route-policy";
import { validReviewedCirculationLinkEdge } from "./reviewed-circulation-links";
import { createNativeRoutingMaterialQuery } from "./native-routing-material";
import { sourceFallbackBarrierHits } from "./source-fallback-barriers";

export type SharedPathwayStop = {
  stopId: string;
  pointFeet: XYZ;
  levelId: number;
  building: string;
  cellId: string;
  terminalNodeId: string;
  guideEdgeId: string;
  station?: PathwayStation;
  entranceEdgeId?: string;
};
type Guide = PreparedRouting["guides"][number];
export type PathwayArc = {
  reviewedPreRoom?: true;
  validateReviewedRun?: () => boolean;
  validateReviewedDoor?: () => boolean;
  reviewedSillHeightFeet?: number;
  from: string;
  to: string;
  sourceFrom: string;
  sourceTo: string;
  points: XYZ[];
  metres: number;
  link: ProjectRoutingLink;
};
type Arc = PathwayArc;
type Candidate = {
  stop: SharedPathwayStop;
  departure: boolean;
  arrival: boolean;
};
const equal = (a: XYZ, b: XYZ) => a.every((v, i) => v === b[i]);
const stopKey = (cell: string, point: XYZ) => JSON.stringify([cell, ...point]);
// Geometry coincidence across different source terminals never grants a connection.
const vertex = (stop: SharedPathwayStop) =>
  stop.station
    ? JSON.stringify(["guide-station", stop.station.guideEdgeId, stop.stopId])
    : JSON.stringify([stop.terminalNodeId, stop.stopId]);
const sourceVertex = (id: string) => JSON.stringify([id]);
const ordering = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function createSharedPathwayNetwork(
  data: IndoorDataset,
  mode: ProjectRouteMode = "public",
) {
  return withRoutingCalculation(data, () =>
    routingCalculationValue(data, "shared-pathway-network:" + mode, () =>
      buildNetwork(data, mode),
    ),
  );
}

function buildNetwork(data: IndoorDataset, mode: ProjectRouteMode) {
  const graph = projectRoutingGraph(data, mode);
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  const prepared = (
    data as IndoorDataset & { preparedRouting?: PreparedRouting }
  ).preparedRouting;
  let saved = new Map<string, XYZ[]>();
  try {
    validatePreparedRouting(data);
    saved = preparedWalkingGuides(data);
  } catch {
    // A malformed optional atlas has no usable pathways.
  }
  const guides = new Map<string, Guide>();
  const cores = new Map<string, Set<IndoorEdge>>();
  const scope = indexCorridorRoutingScope(data);
  const eligible = new Set(scope.eligible.map((e) => e.id));
  for (const guide of saved.size > 0 ? prepared!.guides : []) {
    const edge = edges.get(guide.edgeId);
    if (
      !edge?.nativeCellId ||
      !saved.has(guide.edgeId) ||
      !eligible.has(edge.id) ||
      guide.kind !== "shared-corridor" ||
      !guide.hallwayJoins
    )
      continue;
    guides.set(edge.id, guide);
  }
  const sourceGuides = new Map(guides);
  const moved =
    mode === "public"
      ? circulationDoorGuideJoins(data, guides, edges)
      : new Map<string, { guide: Guide; previous: XYZ }>();
  for (const [id, change] of moved) guides.set(id, change.guide);
  for (const [id, guide] of guides) {
    const edge = edges.get(id)!;
    const [a, b] = guide.hallwayJoins!;

    const core = guide.pointsFeet.slice(a, b + 1);
    if (core.some((p) => !equal(p, core[0])))
      for (const p of core) {
        const id = stopKey(edge.nativeCellId!, p);
        let contributors = cores.get(id);
        if (!contributors) cores.set(id, (contributors = new Set()));
        contributors.add(edge);
      }
  }
  const cells = new Map(
    nativeCirculationCells(data).map((cell) => [cell.id, cell]),
  );
  const supportByCell = new Map<
    string,
    ReturnType<typeof createCorridorGuideSupport>
  >();
  const checks = new Map<string, boolean>();
  const outside = createIndoorExclusionQuery(data);
  const floorHoles = createNativeFloorHoleQuery(data);
  const passages = createDoorPassageQuery(data);
  const openCoreEdges = new Set<string>();
  function usable(edge: IndoorEdge): boolean {
    const previous = checks.get(edge.id);
    if (previous !== undefined) return previous;
    let ok = false;
    try {
      const guide = guides.get(edge.id);
      const cell = cells.get(edge.nativeCellId ?? "");
      if (guide && cell) {
        let support = supportByCell.get(cell.id);
        if (!support) {
          const face = nativeCirculationExactCellParts(data, cell);
          if (face?.length) {
            const doors = routingCalculationValue(
              data,
              "native-door-approach-query",
              () => createNativeDoorApproachQuery(data),
            );
            support = createCorridorGuideSupport(
              face,
              cell.elevationFeet,
              scope.edgesByCell.get(cell.id)!,
              doors,
            );
            supportByCell.set(cell.id, support);
          }
        }
        const p = guide.pointsFeet;
        const level = nodes.get(edge.from)!.levelId;
        const savedCrossings = (points: XYZ[]) =>
          passages(level, points).map((x) => [x.edge.id, x.forward]);
        const [firstJoin, lastJoin] = sourceGuides.get(edge.id)!.hallwayJoins!;
        const core = p.slice(firstJoin, lastJoin + 1);
        // The hallway run itself must fit entirely inside the native cell.
        // Only terminal approaches may use their source doorway's finite half.
        // A step-free source review applies to the exact surveyed trace.
        ok =
          !!support &&
          (!isRotundaRampApproach(edge) ||
            (!!reviewedRampLanding(
              data,
              edge,
              nodes.get(edge.from)!,
              nodes.get(edge.to)!,
              graph.records,
            ) &&
              [311, 1487816].every(
                (id) =>
                  !passages(id, p).length &&
                  !passages(id, edge.pointsFeet).length,
              ))) &&
          (mode !== "accessible" ||
            JSON.stringify(composeSharedCorridorGuide(p)) ===
              JSON.stringify(composeSharedCorridorGuide(edge.pointsFeet))) &&
          outside(p).length === 0 &&
          floorHoles(p).length === 0 &&
          JSON.stringify(savedCrossings(p)) ===
            JSON.stringify(savedCrossings(edge.pointsFeet)) &&
          createNativeTransitRefinementPolicy(
            data,
            [edge],
            edge.pointsFeet,
          )(p) &&
          support.supported(core.map(([x, y]) => [x, y])) &&
          support.edgeSupported(
            p.map(([x, y]) => [x, y]),
            edge.from,
            edge.to,
          );
      }
    } catch {
      // An unavailable exact overlay cannot certify this guide.
    }
    checks.set(edge.id, ok);
    return ok;
  }
  // A directional graph link carries precisely the passage dependencies the
  // source policy admitted. Check only selected transitions and reuse that
  // result on subsequent requests against this immutable graph.
  const checkedTransitions = new WeakMap<ProjectRoutingLink, boolean>();
  function usableArc(arc: Arc) {
    if (arc.validateReviewedRun) return arc.validateReviewedRun();
    if (arc.validateReviewedDoor) return arc.validateReviewedDoor();
    if (arc.reviewedPreRoom) return true;
    const original = crossings?.original(arc) ?? arc.points;
    const { link } = arc,
      { edge } = link;
    if (
      crossings &&
      (crossings.held(edge) ||
        link.passages.some((p) => crossings.held(p.edge)))
    )
      return false;
    if (guides.has(edge.id)) return usable(edge);
    const cached = checkedTransitions.get(link);
    if (cached !== undefined) return cached;
    const level = nodes.get(arc.sourceFrom)!.levelId;
    let ok = true;
    if (["walk", "door", "opening"].includes(edge.kind)) {
      const admitted = new Map(
        link.passages.map((p) => [
          p.edge.id,
          arc.sourceFrom === edge.from ? p.forward : !p.forward,
        ]),
      );
      if (edge.kind === "door")
        admitted.set(edge.id, arc.sourceFrom === edge.from);
      // The reviewed open-bay registry can license a bounded cut through an
      // old modeled wall face. It verifies the original slab, finite bay, door
      // leaves, exclusions, restricted identities and current native material.
      const checkedPhysicalTransition = edge.reviewedCirculationLinkId
        ? routingCalculationValue(
            data,
            `reviewed-circulation-link:${edge.id}`,
            () =>
              validReviewedCirculationLinkEdge(
                data,
                edge,
                routingCalculationValue(
                  data,
                  "native-route-material-query",
                  () => createNativeRoutingMaterialQuery(data),
                ),
              ),
          )
        : edge.kind === "walk"
          ? sourceAlias(edge) && nativeCellSharedFloorAlias(data, edge)
          : sourceFallbackBarrierHits(
              data,
              {
                pointsFeet: original,
                levelIds: [level],
                edgeIds: [edge.id],
                centered: false,
                sourceReason: "no-clearance-route",
              },
              [edge, ...link.passages.map((p) => p.edge)],
            ).length === 0;
      ok =
        checkedPhysicalTransition &&
        floorHoles(original).length === 0 &&
        passages(level, original).every(
          (p) => admitted.get(p.edge.id) === p.forward,
        );
    }
    checkedTransitions.set(link, ok);
    return ok;
  }
  const sourceAlias = (edge: IndoorEdge) => {
    if (
      !edge.nativeCellId ||
      edge.kind !== "walk" ||
      edge.lengthMetres !== 0 ||
      edge.pointsFeet.length === 0
    )
      return false;
    const p = nodes.get(edge.from)?.pointFeet,
      q = nodes.get(edge.to)?.pointFeet;
    return (
      !!p &&
      !!q &&
      equal(p, q) &&
      edge.pointsFeet.every((point) => equal(point, p))
    );
  };
  const checkOfficeCore =
    mode === "public" ? reviewedOfficeApproachCore(data) : undefined;
  const outgoing = new Map<string, Arc[]>(),
    incoming = new Map<string, Arc[]>();
  const terminals = new Map<string, Map<string, Candidate>>();
  const coreArcs = new Map<string, Arc[]>();
  const scale = data.alignment.horizontalMetresPerFoot;
  function add(arc: Arc) {
    for (const [index, key] of [
      [outgoing, arc.from],
      [incoming, arc.to],
    ] as const) {
      const list = index.get(key) ?? [];
      list.push(arc);
      index.set(key, list);
    }
  }
  // Split each saved guide only at its two published joins. Approaches lead
  // back to their own real source node for authorized doors and level changes.
  for (const [from, links] of graph.adjacency) {
    for (const link of links) {
      const { edge } = link;
      const forward = from === edge.from;
      const guide = guides.get(edge.id);
      if (guide && link.requiredRooms.length === 0) openCoreEdges.add(edge.id);
      if (!guide) {
        // Only explicit, source-admitted physical transitions bridge pathways.
        if (
          edge.kind === "walk" &&
          !edge.reviewedCirculationLinkId &&
          !sourceAlias(edge)
        )
          continue;
        const points = forward ? edge.pointsFeet : edge.pointsFeet.toReversed();
        const level = nodes.get(from)?.levelId;
        if (level === undefined || points.length === 0) continue;
        add({
          from: sourceVertex(from),
          to: sourceVertex(link.to),
          sourceFrom: from,
          sourceTo: link.to,
          points,
          metres: edge.lengthMetres,
          link,
        });
        continue;
      }
      const [i, j] = guide.hallwayJoins!;
      const points = guide.pointsFeet;
      const stops = [edge.from, edge.to].map((id, index) => {
        const p = points[index ? j : i];
        const node = nodes.get(id)!;
        const stop: SharedPathwayStop = {
          stopId: stopKey(edge.nativeCellId!, p),
          pointFeet: p,
          cellId: edge.nativeCellId!,
          levelId: node.levelId,
          building: node.building,
          terminalNodeId: id,
          guideEdgeId: edge.id,
        };
        if (cores.has(stop.stopId) && link.requiredRooms.length === 0) {
          let list = terminals.get(id);
          if (!list) terminals.set(id, (list = new Map()));
          const key = JSON.stringify([stop.stopId, edge.id]);
          const candidate = list.get(key) ?? {
            stop,
            departure: false,
            arrival: false,
          };
          if ((index === 0) === forward) candidate.departure = true;
          else candidate.arrival = true;
          list.set(key, candidate);
        }
        return stop;
      });
      const ends = [
        sourceVertex(edge.from),
        vertex(stops[0]),
        vertex(stops[1]),
        sourceVertex(edge.to),
      ];
      const source = [edge.from, edge.from, edge.to, edge.to];
      const portions = [
        points.slice(0, i + 1),
        points.slice(i, j + 1),
        points.slice(j),
      ];
      portions.forEach((p, k) => {
        const a = forward ? k : k + 1,
          b = forward ? k + 1 : k;
        if (ends[a] === ends[b]) return;
        const arc: Arc = {
          from: ends[a],
          to: ends[b],
          sourceFrom: source[a],
          sourceTo: source[b],
          points: forward ? p : p.toReversed(),
          metres: corridorGuideLength(p) * scale,
          link,
        };
        const part = k === 1 && checkOfficeCore ? checkOfficeCore(arc) : arc;
        add(part);
        if (k === 1) {
          const list = coreArcs.get(edge.id) ?? [];
          list.push(part);
          coreArcs.set(edge.id, list);
        }
      });
    }
  }
  if (checkOfficeCore) {
    for (const arc of reviewedWestHallwayRun(
      data,
      graph,
      guides,
      coreArcs,
      usableArc,
    ))
      add(arc);
  }
  if (mode === "public") {
    for (const arc of nativeStairHallwayApproaches(
      data,
      graph,
      nodes,
      outgoing,
      guides,
      usableArc,
    ))
      add(arc);
    for (const arc of reviewedConnectorCorridorJunction(
      data,
      graph,
      outgoing,
      guides.values(),
      usableArc,
    ))
      add(arc);
    const balcony = balconyDoorSpec(data);
    if (balcony)
      for (const arc of buildReviewedStationDoor(
        data,
        nodes,
        coreArcs,
        usable,
        balcony,
      ))
        add(arc);
    for (const arc of buildReviewedVestibuleDoor(
      data,
      nodes,
      cells.get("native-cell:14.435696:637"),
      (id, enter) => {
        const options = [...(terminals.get(id)?.values() ?? [])].filter(
          (c) =>
            (enter ? c.arrival : c.departure) &&
            usable(edges.get(c.stop.guideEdgeId)!),
        );
        const ids = new Set(options.map((c) => c.stop.stopId));
        return ids.size === 1 ? options[0].stop : undefined;
      },
      vertex,
    ))
      add(arc);
  }
  if (mode === "public") {
    const reviewedRuns = buildReviewedCorridorRuns(
      data,
      graph,
      guides,
      (id, at, departure, cell) => {
        const candidate = [...(terminals.get(id)?.values() ?? [])].find(
          (c) =>
            (departure ? c.departure : c.arrival) &&
            c.stop.cellId === cell &&
            c.stop.pointFeet[0] === at[0] &&
            c.stop.pointFeet[1] === at[1],
        );
        return candidate?.stop;
      },
      (id) => !!edges.get(id) && usable(edges.get(id)!),
      vertex,
    );
    for (const arc of reviewedRuns) add(arc);
  }
  const crossCorridor =
    mode === "public"
      ? buildReviewedCrossCorridor(
          data,
          nodes,
          guides,
          edges,
          (id) => coreArcs.get(id),
          usable,
          vertex,
        )
      : undefined;
  for (const arc of crossCorridor?.arcs ?? []) add(arc);
  if (mode === "public")
    for (const arc of buildReviewedStationDoor(
      data,
      nodes,
      coreArcs,
      usable,
      rotundaSouthDoor(data),
    ))
      add(arc);
  const roomCandidates = new Map<string, Candidate | null>();
  const printPreRoom =
    mode === "public"
      ? buildReviewedPrintPreRoom(data, graph, nodes, recordedStopForRoom)
      : undefined;
  for (const arc of printPreRoom?.arcs ?? []) add(arc);
  const crossings =
    mode === "accessible"
      ? undefined
      : prepareSharedDoorCrossings(
          data,
          cells,
          outgoing,
          incoming,
          new Set(guides.keys()),
          scale,
          new Map([...moved].map(([id, change]) => [id, change.previous])),
        );
  const checkLabelPassage =
    mode === "public"
      ? prepareCirculationLabelPassages(
          data,
          outgoing,
          incoming,
          new Set(guides.keys()),
          (arcs, source, proposal) => {
            const cell = arcs[0].link.edge.nativeCellId!;
            // Usable source guides initialize this cell's checked physical scope.
            if (!arcs.every((arc) => usable(arc.link.edge))) return false;
            const support = supportByCell.get(cell);
            const level = nodes.get(arcs[0].sourceFrom)!.levelId;
            return (
              !!support &&
              arcs.every((arc, i) => {
                const path = proposal[i];
                return (
                  outside(path).length === 0 &&
                  floorHoles(path).length === 0 &&
                  passages(level, source[i]).length === 0 &&
                  passages(level, path).length === 0 &&
                  support.supported(path.map(([x, y]) => [x, y])) &&
                  createNativeTransitRefinementPolicy(
                    data,
                    [arc.link.edge],
                    source[i],
                  )(path)
                );
              })
            );
          },
          scale,
        )
      : undefined;
  // The landing checks its donor with the fully initialized physical crossing policy.
  const landings =
    mode === "public"
      ? reviewedLandingWaypoints(
          data,
          prepared,
          nodes,
          edges,
          outgoing,
          usableArc,
          vertex,
        )
      : undefined;
  for (const arc of landings?.arcs ?? []) add(arc);
  const flatLanding =
    mode === "public"
      ? reviewedFlatLandingBridge(
          data,
          prepared,
          nodes,
          outgoing,
          (arc) =>
            usableArc(arc) &&
            (!crossings || crossings.check(arc)) &&
            (!checkLabelPassage || checkLabelPassage(arc)),
        )
      : undefined;
  for (const arc of flatLanding?.arcs ?? []) add(arc);
  for (const id of flatLanding?.derivedNodes ?? [])
    landings?.derivedNodes.add(id);
  if (mode === "public") {
    const spans = auditedCorridorSpans(
      data,
      graph,
      nodes,
      eligible,
      guides,
      (terminal, cell, point, arriving) => {
        const id = JSON.stringify([terminal, stopKey(cell, point)]);
        const donors = (arriving ? incoming : outgoing)
          .get(id)
          ?.filter(
            (arc) =>
              guides.has(arc.link.edge.id) &&
              arc.link.edge.nativeCellId === cell &&
              arc.link.requiredRooms.length === 0 &&
              arc.link.blockers.length === 0,
          );
        if (!donors || donors.length === 0) return;
        return {
          vertex: id,
          admitted: () =>
            donors.some(
              (arc) =>
                usableArc(arc) &&
                (!crossings || crossings.check(arc)) &&
                equal(arriving ? arc.points.at(-1)! : arc.points[0], point),
            ),
        };
      },
      prepared,
    );
    for (const span of spans) add(span);
  }
  const straighten =
    mode === "public" && prepared && saved.size > 0
      ? prepareReviewedGuideBends(data, prepared)
      : undefined;
  if (straighten)
    for (const arcs of outgoing.values())
      for (const arc of arcs) straighten(arc);
  // The directory chooses once per room. Direction affects eligibility but
  // choosing another destination can never select a different door or stop.
  for (const [index, backward] of [
    [outgoing, false],
    [incoming, true],
  ] as const) {
    for (const arcs of index.values())
      arcs.sort(
        (a, b) =>
          ordering(a.link.edge.id, b.link.edge.id) ||
          ordering(backward ? a.from : a.to, backward ? b.from : b.to),
      );
  }
  function recordedStopForRoom(
    key: string,
    departure: boolean,
  ): SharedPathwayStop | null {
    const room = graph.records.get(key);
    if (!room || !isProjectDestination(room) || isReviewedPrintArea(data, key))
      return null;
    if (!roomCandidates.has(key)) {
      const candidates = new Map<string, Candidate>();
      for (const leave of [true, false]) {
        for (const endpoint of hallwayRouteEndpoints(
          data,
          graph,
          room,
          leave,
          true,
        )) {
          for (const candidate of terminals.get(endpoint.nodeId)?.values() ??
            []) {
            if (!(leave ? candidate.departure : candidate.arrival)) continue;
            const entranceEdgeId = endpoint.entrance?.entranceEdgeId;
            const id = JSON.stringify([
              entranceEdgeId,
              candidate.stop.stopId,
              candidate.stop.guideEdgeId,
            ]);
            const entry = candidates.get(id) ?? {
              stop: { ...candidate.stop, entranceEdgeId },
              departure: false,
              arrival: false,
            };
            if (leave) entry.departure = true;
            else entry.arrival = true;
            candidates.set(id, entry);
          }
        }
      }
      const ordered = [...candidates.entries()].sort(
        ([a, x], [b, y]) =>
          // A corridor or vestibule keeps its own verified pathway. Where
          // that run is absent, only its real outside hallway doorway qualifies.
          Number(!!x.stop.entranceEdgeId) - Number(!!y.stop.entranceEdgeId) ||
          Number(y.departure && y.arrival) - Number(x.departure && x.arrival) ||
          ordering(a, b),
      );
      roomCandidates.set(
        key,
        ordered
          .map(([, c]) => c)
          .find((c) => {
            if (!usable(edges.get(c.stop.guideEdgeId)!)) return false;
            if (
              !Array.from(cores.get(c.stop.stopId) ?? []).some(
                (e) => openCoreEdges.has(e.id) && usable(e),
              )
            )
              return false;
            if (mode === "accessible") {
              const publicNetwork = createSharedPathwayNetwork(data, "public");
              const fixed =
                publicNetwork.stopForRoom(key, true) ??
                publicNetwork.stopForRoom(key, false);
              return (
                !!fixed &&
                (fixed.station?.previousStopId ?? fixed.stopId) ===
                  c.stop.stopId &&
                fixed.terminalNodeId === c.stop.terminalNodeId &&
                fixed.entranceEdgeId === c.stop.entranceEdgeId
              );
            }
            return true;
          }) ?? null,
      );
    }
    const candidate = roomCandidates.get(key);
    return candidate && (departure ? candidate.departure : candidate.arrival)
      ? { ...candidate.stop, pointFeet: [...candidate.stop.pointFeet] }
      : null;
  }
  let roomBranches: ReturnType<typeof createRoomPathwayBranches> | undefined;
  const branches = () =>
    (roomBranches ??= createRoomPathwayBranches(
      data,
      graph,
      guides,
      edges,
      nodes,
      usable,
    ));
  let classroom: ReturnType<typeof reviewedClassroomEntrance> | undefined;
  const destinationEntrance = (key: string) => {
    if (mode === "public" && key === reviewedClassroomKey) {
      if (classroom === undefined)
        classroom = reviewedClassroomEntrance(
          data,
          graph,
          edges,
          terminals.get(classroomStationTerminal)?.values() ?? [],
          guides.values(),
          usable,
          (id) => !!coreArcs.get(id)?.length,
        );
      return classroom;
    }
    return printPreRoom?.branches.get(key);
  };
  const branchForRoom = (key: string) => {
    const room = graph.records.get(key);
    if (
      mode !== "public" ||
      !room ||
      isHorizontalCirculationAnnotation(data, room)
    )
      return null;
    const office = destinationEntrance(key);
    if (office)
      return {
        ...structuredClone(office.branch),
        directions: { ...office.directions },
      };
    const leave = recordedStopForRoom(key, true),
      enter = recordedStopForRoom(key, false),
      stop = leave ?? enter;
    const branch = stop?.entranceEdgeId ? branches()(key, stop) : null;
    return branch
      ? {
          ...branch,
          directions: { roomToHallway: !!leave, hallwayToRoom: !!enter },
        }
      : null;
  };
  function stopForRoom(
    key: string,
    departure: boolean,
  ): SharedPathwayStop | null {
    const room = graph.records.get(key);
    const landing = landings?.stops.get(key);
    if (landing) return structuredClone(landing);
    if (room && isHorizontalCirculationAnnotation(data, room)) {
      if (!departure) return null;
      // A preset starts on the checked core station. Some stations are indexed
      // by a real doorway. Their source door ID adds no room branch to a trip.
      const existing = recordedStopForRoom(key, true);
      if (existing || mode !== "public" || room.number !== "04-124")
        return existing;
      // This split-level rotunda has its own checked shared station at the lift.
      // A departure preset can use that station without a branch to the printed label.
      const lift = "connector:unbc-04-lift:0";
      const terminal = nodes.get(lift);
      if (
        !terminal ||
        terminal.roomKey !== key ||
        terminal.levelId !== room.levelId ||
        terminal.pointFeet[2] !== room.elevationFeet
      )
        return null;
      for (const { stop, departure, arrival } of terminals
        .get(lift)
        ?.values() ?? []) {
        const edge = edges.get(stop.guideEdgeId);
        if (
          edge &&
          departure &&
          arrival &&
          isRotundaRampApproach(edge) &&
          usable(edge)
        )
          return { ...stop, pointFeet: [...stop.pointFeet] };
      }
      return null;
    }
    const office = destinationEntrance(key);
    if (office)
      return (
        departure
          ? office.directions.roomToHallway
          : office.directions.hallwayToRoom
      )
        ? structuredClone(office.stop)
        : null;
    const original = recordedStopForRoom(key, departure);
    if (!original?.entranceEdgeId) return original;
    if (mode === "accessible") {
      const fixed = createSharedPathwayNetwork(data, "public").stopForRoom(
        key,
        departure,
      );
      if (!fixed?.station) return original;
      const core = edges.get(fixed.station.guideEdgeId);
      if (!core || !coreArcs.get(core.id)?.length || !usable(core)) return null;
      return {
        ...original,
        pointFeet: [...fixed.pointFeet],
        stopId: fixed.stopId,
        station: structuredClone(fixed.station),
      };
    }
    const proof = branches()(key, original)?.normalProof;
    if (!proof || equal(proof.hallwayJoinFeet, original.pointFeet))
      return original;
    const pointFeet: XYZ = [...proof.hallwayJoinFeet];
    return {
      ...original,
      pointFeet,
      stopId: stopKey(original.cellId, pointFeet),
      station: {
        guideEdgeId: proof.hallwayGuideEdgeId,
        segment: proof.hallwaySegment,
        fraction: proof.fraction,
        previousStopId: original.stopId,
        previousPointFeet: original.pointFeet,
      },
    };
  }
  function stationOverlay(stops: SharedPathwayStop[], reverse: boolean) {
    const extra = new Map<string, Arc[]>(),
      replaced = new Set<Arc>();
    const groups = new Map<string, Map<string, SharedPathwayStop>>();
    // Entry to the raised doorway falls inside two established guide cores.
    // Include their permanent stations in the same split as room-specific stops.
    for (const stop of [...stops, ...(crossCorridor?.stations ?? [])])
      if (stop.station) {
        const id = stop.station.guideEdgeId;
        let group = groups.get(id);
        if (!group) groups.set(id, (group = new Map()));
        group.set(vertex(stop), stop);
      }
    for (const [id, group] of groups) {
      const guide = guides.get(id)!,
        [first, last] = guide.hallwayJoins!;
      const points = guide.pointsFeet.slice(first, last + 1);
      const cuts: PathwayCut[] = [...group.values()].map((stop) => ({
        id: vertex(stop),
        node: stop.terminalNodeId,
        point: stop.pointFeet,
        segment: stop.station!.segment - first,
        fraction: stop.station!.fraction,
      }));
      for (const arc of coreArcs.get(id) ?? []) {
        const forward = arc.sourceFrom === arc.link.edge.from;
        const from = {
          id: forward ? arc.from : arc.to,
          node: arc.link.edge.from,
          point: points[0],
          segment: 0,
          fraction: 0,
        };
        const to = {
          id: forward ? arc.to : arc.from,
          node: arc.link.edge.to,
          point: points.at(-1)!,
          segment: points.length - 2,
          fraction: 1,
        };
        for (const piece of splitPathwayCore(points, from, to, cuts)) {
          const a = forward ? piece.from : piece.to,
            b = forward ? piece.to : piece.from;
          const part: Arc = {
            ...arc,
            from: a.id,
            to: b.id,
            sourceFrom: a.node,
            sourceTo: b.node,
            points: forward ? piece.points : piece.points.toReversed(),
            metres: corridorGuideLength(piece.points) * scale,
          };
          straighten?.(part);
          const at = reverse ? part.to : part.from;
          const list = extra.get(at) ?? [];
          list.push(part);
          extra.set(at, list);
        }
        replaced.add(arc);
      }
    }
    return { extra, replaced };
  }
  function journey(
    startKey: string,
    endKey: string,
    options: ProjectRoutingOptions,
  ): ProjectRoute | null {
    const start = stopForRoom(startKey, true),
      end = stopForRoom(endKey, false);
    if (!start || !end || options.useSharedCorridorGuides === false)
      return null;
    const startId = vertex(start),
      endId = vertex(end);
    // Search from the same canonical end in either direction. Transpose the
    // admitted arcs when necessary, retaining one-way connector policy.
    const reverse = ordering(startId, endId) > 0;
    const root = reverse ? endId : startId,
      goal = reverse ? startId : endId;
    const index = reverse ? incoming : outgoing;
    const overlay = stationOverlay([start, end], reverse);
    const excluded = new Set(options.excludedNativeStairIds ?? []);
    const rejected = new Set<ProjectRoutingLink>();
    for (;;) {
      const costs = new Map([[root, 0]]),
        previous = new Map<string, Arc>();
      const queue = new DistanceHeap();
      queue.push([0, root]);
      while (queue.size > 0) {
        const [cost, id] = queue.pop()!;
        if (cost !== costs.get(id)) continue;
        if (id === goal) break;
        const base = index.get(id) ?? [],
          cuts = overlay.extra.get(id);
        const links = cuts ? [...base, ...cuts] : base;
        for (const arc of links) {
          if (overlay.replaced.has(arc)) continue;
          const { edge, requiredRooms } = arc.link;
          if (
            rejected.has(arc.link) ||
            (requiredRooms.length > 0 &&
              options.allowOtherRoomTransit !== true) ||
            (["stairs", "local-steps"].includes(edge.kind) &&
              edge.nativeElementId &&
              excluded.has(edge.nativeElementId))
          )
            continue;
          const next = reverse ? arc.from : arc.to,
            distance = cost + arc.metres * (requiredRooms.length > 0 ? 4 : 1);
          if (distance >= (costs.get(next) ?? Infinity) - 1e-9) continue;
          costs.set(next, distance);
          previous.set(next, arc);
          queue.push([distance, next]);
        }
      }
      if (!costs.has(goal)) return null;
      const arcs: Arc[] = [];
      let at = goal;
      while (at !== root) {
        const arc = previous.get(at)!;
        arcs.push(arc);
        at = reverse ? arc.to : arc.from;
      }
      if (!reverse) arcs.reverse();
      const blocked = arcs.find((a) => !usableArc(a));
      if (blocked) {
        rejected.add(blocked.link);
        continue;
      }
      if (crossings && arcs.some((arc) => !crossings.check(arc))) continue;
      if (checkLabelPassage && arcs.some((arc) => !checkLabelPassage(arc)))
        continue;
      if (mode !== "public")
        return buildRoute(arcs, start, end, costs.get(goal)!);
      const walked = trimSharedGuideRetraces(
        arcs,
        (arc) =>
          guides.has(arc.link.edge.id) &&
          !!arc.link.edge.nativeCellId &&
          !arc.link.requiredRooms.length &&
          !arc.link.passages.length &&
          nodes.get(arc.sourceFrom)!.levelId ===
            nodes.get(arc.sourceTo)!.levelId,
        (arc) =>
          !passages(nodes.get(arc.sourceFrom)!.levelId, arc.points).length,
        scale,
      );
      const reviewed = trimReviewedRouteRetraces(walked.arcs, scale, () =>
        reviewedRetracesAllowed(data, prepared),
      );
      return buildRoute(
        reviewed.arcs,
        start,
        end,
        Math.max(
          0,
          costs.get(goal)! - walked.removedMetres - reviewed.removedMetres,
        ),
      );
    }
  }
  function buildRoute(
    arcs: Arc[],
    start: SharedPathwayStop,
    end: SharedPathwayStop,
    cost: number,
  ): ProjectRoute {
    const routeEdges: IndoorEdge[] = [],
      nodeIds = [start.terminalNodeId],
      paths: ProjectRoute["paths"] = [];
    const dependencies = new Map<string, IndoorEdge>();
    for (const arc of arcs) {
      const edge = arc.link.edge;
      const last = paths.at(-1);
      const walking =
        guides.has(edge.id) ||
        ((arc.reviewedPreRoom === true ||
          !!arc.validateReviewedDoor ||
          !!arc.validateReviewedRun) &&
          edge.kind === "walk");
      if (last && last.edgeIds[0] === edge.id) {
        last.pointsFeet.push(...arc.points.slice(1).map((p): XYZ => [...p]));
        nodeIds[nodeIds.length - 1] = arc.sourceTo;
      } else {
        routeEdges.push(edge);
        nodeIds.push(arc.sourceTo);
        const levels = [
          ...new Set([
            nodes.get(arc.sourceFrom)!.levelId,
            nodes.get(arc.sourceTo)!.levelId,
          ]),
        ];
        paths.push({
          edgeIds: [edge.id],
          pointsFeet: arc.points.map((p): XYZ => [...p]),
          levelIds: levels,
          centered: walking,
          ...(walking
            ? {
                nativeCirculationUsed: true,
                nativeFloorSupported: true,
                preparedGuideUsed:
                  guides.has(edge.id) || !arc.validateReviewedRun,
                sharedCorridorGuideUsed: true,
              }
            : {}),
        });
      }
      for (const dep of [edge, ...arc.link.passages.map((p) => p.edge)])
        dependencies.set(dep.id, dep);
    }
    // Distinct source terminals may share a physical stop. Only erase a
    // fully admitted, checked walk that exactly retraces its own line. Keep
    // the original graph witness; coincidence never creates connectivity.
    const retracedStop =
      arcs.length > 0 &&
      start.stopId === end.stopId &&
      equal(start.pointFeet, end.pointFeet) &&
      arcs.every(
        ({ link }) =>
          guides.has(link.edge.id) &&
          link.edge.nativeCellId === start.cellId &&
          link.passages.length === 0 &&
          link.requiredRooms.length === 0,
      ) &&
      composeSharedCorridorGuide(paths.flatMap((path) => path.pointsFeet))
        .length === 1;
    const arrival = (stop: SharedPathwayStop): ProjectRouteArrival => ({
      mode: "pathway",
      pointFeet: [...stop.pointFeet],
      levelId: stop.levelId,
      building: stop.building,
      entranceEdgeId: stop.entranceEdgeId,
      pathwayStop: { ...stop, pointFeet: [...stop.pointFeet] },
    });
    const reviewedPortalNodes = [
      ...new Set(
        arcs
          .filter(
            (arc) =>
              (arc.validateReviewedDoor && arc.link.edge.kind === "door") ||
              landings?.derivedNodes.has(arc.sourceFrom) ||
              landings?.derivedNodes.has(arc.sourceTo),
          )
          .flatMap((arc) => [arc.sourceFrom, arc.sourceTo]),
      ),
    ].map((id) => ({
      ...nodes.get(id)!,
      pointFeet: [...nodes.get(id)!.pointFeet] as XYZ,
      geographic: [...nodes.get(id)!.geographic] as [number, number],
    }));
    const reviewedDoorSills = arcs.flatMap((arc) =>
      arc.reviewedSillHeightFeet === undefined
        ? []
        : [
            {
              edgeId: arc.link.edge.id,
              heightFeet: arc.reviewedSillHeightFeet,
            },
          ],
    );
    return {
      ...(reviewedDoorSills.length ? { reviewedDoorSills } : {}),
      ...(reviewedPortalNodes.length ? { reviewedPortalNodes } : {}),
      departure: arrival(start),
      arrival: arrival(end),
      edges: routeEdges,
      nodeIds,
      paths: retracedStop ? [] : paths,
      distanceMetres: retracedStop ? 0 : arcs.reduce((n, a) => n + a.metres, 0),
      sourceDistanceMetres: routeEdges.reduce((n, e) => n + e.lengthMetres, 0),
      preferenceCost: cost,
      doorEdgeIds: [...dependencies.values()]
        .filter((e) => e.kind === "door")
        .map((e) => e.id),
      unknownAccessibilityEdges: [...dependencies.values()].filter(
        (e) => e.accessible === "unknown",
      ).length,
      unknownAccessAreas: [
        ...new Set(
          [...dependencies.values()]
            .flatMap((e) => e.roomKeys)
            .filter((k) => graph.records.get(k)?.access === "unknown"),
        ),
      ],
    };
  }
  return { stopForRoom, journey, branchForRoom };
}
