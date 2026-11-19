import {
  reviewedRampLanding,
  reviewedRampLandingGuide,
} from "./raised-rotunda-plane";
import { pathwayCirculationOwner } from "./reviewed-rotunda-role";
import { sampledCorridorRun } from "./sampled-corridor-run";
import { compareCombinedCorridorGuides } from "./corridor-guide-contacts";
import { straightenSharedDoorGuideBends } from "./shared-door-guide-bend";
import { recoverCorridorRuns } from "./corridor-run-recovery";
import { routingDoorApertures } from "./routing-apertures";
import { createIndoorExclusionQuery } from "./indoor-exclusions";
import { createNativeFloorHoleQuery } from "./walking-support";
import { createDoorPassageQuery } from "./route-passages";
import { createNativeTransitRefinementPolicy } from "./native-walk-transit-owners";
import type { IndoorDataset } from "./contract";
import {
  createCorridorCenterline,
  type CorridorCenterlineTerminal,
} from "./corridor-centerline";
import { createCorridorGuideSupport } from "./corridor-guide-support";
import { createNativeDoorApproachQuery } from "./native-door-approach";
import {
  CORRIDOR_COMPILER_PARAMETERS,
  type CorridorCompilerParameters,
} from "./corridor-routing-parameters";
import {
  corridorRoutingCoverage,
  indexCorridorRoutingScope,
} from "./corridor-routing-scope";
import {
  nativeCirculationCells,
  nativeCirculationExactCellParts,
} from "./native-circulation";
import { nativeExactPartsForProposals } from "./native-exact-planar-topology";
import { createImmutableRoutingSession } from "./routing-cache";
import {
  corridorGuideLength,
  MAX_SHARED_CORRIDOR_APPROACH_FEET,
} from "./shared-corridor-guides";
import {
  preparedRoutingKey,
  ROUTING_GUIDE_VERSION,
  type PreparedRouting,
} from "./prepared-routing";

export type CorridorCellCompilation = {
  cellId: string;
  elevationFeet: number;
  eligibleEdges: number;
  terminalCount: number;
  requestedEdges: number;
  emittedEdges: number;
  compiledEdges: number;
  refusedEdges: { edgeId: string; reason: string }[];
  guideIds: string[];
  networks: ReturnType<
    ReturnType<typeof createCorridorCenterline>["statistics"]
  >[];
  /** Guides whose shaped-approach network was refused and which therefore
   * use the legacy approach network's checked geometry (same exact checks). */
  legacyApproachFallbackEdgeIds?: string[];
  /** Opt-in run geometry was withdrawn for the whole cell after comparing
   * all final guides, including legacy/recovery paths, with its control. */
  straightRunsWithdrawn?: boolean;
  straightRunsComparison?: {
    missingGuideIds: string[];
    newContactCount: number;
    newContacts: { edgeIds: [string, string]; at: string }[];
    candidateNetworks: ReturnType<
      ReturnType<typeof createCorridorCenterline>["statistics"]
    >[];
  };
  recoveredStraightRunEdgeIds?: string[];
  recoveredSampledRunEdgeIds?: string[];
  recoveredRampLandingEdgeIds?: string[];
  alignedDoorwayStationEdgeIds?: string[];
  legacyNetworks?: ReturnType<
    ReturnType<typeof createCorridorCenterline>["statistics"]
  >[];
  seconds: number;
};

/** `data` is a privately cloned routing-worker snapshot. Source geometry and
 * existing graph links are never edited. The current independent physical cell
 * and own door halves qualify a two-foot planar guide; runtime crossing/access
 * checks remain mandatory. Held stairs and confirmed accessible paths retain
 * their original geometry and approval state.
 */
export async function prepareSharedCorridorRouting(
  data: IndoorDataset,
  options: {
    edgeIds?: ReadonlySet<string>;
    cellIds?: ReadonlySet<string>;
    parameters?: Partial<CorridorCompilerParameters>;
    progress?: (completed: number, total: number, compiled: number) => void;
    cellCompleted?: (
      cell: CorridorCellCompilation,
      guides: PreparedRouting["guides"],
    ) => void;
  } = {},
) {
  const run = createImmutableRoutingSession(data);
  const parameters = { ...CORRIDOR_COMPILER_PARAMETERS, ...options.parameters };
  const scope = indexCorridorRoutingScope(data);
  const { nodes, eligible: allEligible, edgesByCell, doorsByNode } = scope;
  const requested = allEligible.filter(
    (edge) =>
      (!options.edgeIds || options.edgeIds.has(edge.id)) &&
      (!options.cellIds || options.cellIds.has(edge.nativeCellId!)),
  );
  const ids = new Set(requested.map((edge) => edge.nativeCellId!));
  const eligible = allEligible.filter((edge) => ids.has(edge.nativeCellId!));
  const prepared: PreparedRouting = {
    version: 1,
    resolverVersion: ROUTING_GUIDE_VERSION,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: run(() => preparedRoutingKey(data)),
    guides: [],
  };
  const admittedCells = run(() =>
    nativeCirculationCells(data, { cellIds: ids }),
  );
  const cells = admittedCells.sort(
    (a, b) => a.elevationFeet - b.elevationFeet || a.id.localeCompare(b.id),
  );
  const approach = run(() => createNativeDoorApproachQuery(data));
  const apertures = run(
    () => new Map(routingDoorApertures(data).map((d) => [d.id, d])),
  );
  const outside = run(() => createIndoorExclusionQuery(data));
  const floorHoles = run(() => createNativeFloorHoleQuery(data));
  const records = new Map(data.records.map((r) => [r.key, r]));
  const passages = run(() => createDoorPassageQuery(data));
  const reports: CorridorCellCompilation[] = [];
  const admittedIds = new Set(cells.map((cell) => cell.id));
  const compilationMissing = [...ids]
    .filter((id) => !admittedIds.has(id))
    .sort();
  let completed = 0;
  for (const cell of cells) {
    const started = performance.now();
    const edges = edgesByCell.get(cell.id)!;
    const terminalIds = [
      ...new Set(edges.flatMap((edge) => [edge.from, edge.to])),
    ].sort();
    const report: CorridorCellCompilation = {
      cellId: cell.id,
      elevationFeet: cell.elevationFeet,
      eligibleEdges: edges.length,
      terminalCount: terminalIds.length,
      requestedEdges: edges.filter(
        (edge) => !options.edgeIds || options.edgeIds.has(edge.id),
      ).length,
      emittedEdges: 0,
      compiledEdges: 0,
      refusedEdges: [],
      guideIds: [],
      networks: [],
      seconds: 0,
    };
    run(() => {
      const physical = nativeCirculationExactCellParts(data, cell);
      if (!physical?.length) {
        report.refusedEdges = edges.map((e) => ({
          edgeId: e.id,
          reason: "no-current-physical-face",
        }));
        return;
      }
      const support = createCorridorGuideSupport(
        physical,
        cell.elevationFeet,
        edges,
        approach,
      );
      const terminals: CorridorCenterlineTerminal[] = terminalIds.map((id) => {
        const node = nodes.get(id)!;
        const door = doorsByNode.get(id);
        const other = door && nodes.get(door.from === id ? door.to : door.from);
        return {
          id,
          point: [node.pointFeet[0], node.pointFeet[1]],
          ...(other
            ? {
                approachDirection: [
                  node.pointFeet[0] - other.pointFeet[0],
                  node.pointFeet[1] - other.pointFeet[1],
                ] as [number, number],
              }
            : {}),
        };
      });
      const proposalRings = nativeExactPartsForProposals(physical);
      // Each candidate/control includes every current recovery pass before
      // mixed-network contact comparison. No partially checked cell is emitted.
      const compileCell = (straightRuns: boolean) => {
        const trial: CorridorCellCompilation = {
          ...report,
          refusedEdges: [],
          guideIds: [],
          networks: [],
        };
        const build = (shapedApproaches: boolean) =>
          proposalRings.map((rings) =>
            createCorridorCenterline(rings, terminals, support.supported, {
              ...parameters,
              shapedApproaches,
              straightRuns,
              requiredEdges: edges,
            }),
          );
        const networks = build(parameters.shapedApproaches);
        // Built only if a shaped network refuses an edge. Its geometry is the
        // unchanged legacy proposal and passes the same final checks below.
        let legacy: typeof networks | null = null;
        const resolve = (
          candidates: typeof networks,
          edge: (typeof edges)[number],
        ) => {
          const paths = candidates
            .flatMap((network, networkIndex) => {
              const route = network.routeDetails(edge.from, edge.to);
              return route ? [{ ...route, networkIndex }] : [];
            })
            .sort(
              (a, b) =>
                corridorGuideLength(a.points) - corridorGuideLength(b.points),
            );
          const withinDistance = paths.filter(
            ({ points: p }) =>
              p.length >= 2 &&
              p.length <= 10_000 &&
              corridorGuideLength(p) <=
                corridorGuideLength(edge.pointsFeet) * 1.15 +
                  0.6 +
                  2 * MAX_SHARED_CORRIDOR_APPROACH_FEET,
          );
          const candidate = withinDistance.find(({ points }) =>
            support.edgeSupported(points, edge.from, edge.to),
          );
          if (!candidate)
            return {
              ok: false,
              reason:
                paths.length === 0
                  ? candidates
                      .map((network) =>
                        network.refusalReason(edge.from, edge.to),
                      )
                      .join(";") || "no-supported-shared-route"
                  : withinDistance.length === 0
                    ? "guide-distance-limit"
                    : "final-planar-width",
            } as const;
          // Require exact original coordinates, including physical elevation.
          const pointsFeet = candidate.points.map(
            (p): [number, number, number] => [p[0], p[1], cell.elevationFeet],
          );
          if (
            ![0, pointsFeet.length - 1].every((i, j) =>
              pointsFeet[i].every(
                (v, k) =>
                  v === edge.pointsFeet[j ? edge.pointsFeet.length - 1 : 0][k],
              ),
            )
          )
            return { ok: false, reason: "original-terminal-mismatch" } as const;
          return { ok: true, candidate, pointsFeet } as const;
        };
        let cellGuides: PreparedRouting["guides"] = [];
        const origins = new Map<string, string>();
        for (const edge of edges) {
          let resolved = resolve(networks, edge);
          let usedLegacy = false;
          if (!resolved.ok && parameters.shapedApproaches) {
            legacy ??= build(false);
            const fallback = resolve(legacy, edge);
            if (fallback.ok) {
              resolved = fallback;
              usedLegacy = true;
              (trial.legacyApproachFallbackEdgeIds ??= []).push(edge.id);
            }
          }
          if (!resolved.ok) {
            trial.refusedEdges.push({
              edgeId: edge.id,
              reason: resolved.reason,
            });
            continue;
          }
          const { candidate, pointsFeet } = resolved;
          origins.set(
            edge.id,
            `${usedLegacy ? "legacy" : "primary"}:${candidate.networkIndex}`,
          );
          cellGuides.push({
            edgeId: edge.id,
            pointsFeet,
            kind: "shared-corridor",
            hallwayJoins: candidate.hallwayJoins,
          });
        }
        const originalGuides = new Map(cellGuides.map((g) => [g.edgeId, g]));
        const refused = new Set(
          trial.refusedEdges
            .filter((r) => r.reason === "terminal-attachment")
            .map((r) => r.edgeId),
        );
        const sampled = trial.refusedEdges.filter(
          (r) => r.reason === "sampled-graph-disconnection",
        );
        if (cellGuides.length > 0 || sampled.length > 0) {
          const replay = (
            edge: (typeof edges)[number],
            guide: PreparedRouting["guides"][number],
          ) => {
            const p = guide.pointsFeet,
              xy = p.map(([x, y]): [number, number] => [x, y]),
              [a, b] = guide.hallwayJoins!;
            const level = nodes.get(edge.from)!.levelId;
            const crossings = (points: typeof p) =>
              passages(level, points).map((x) => [x.edge.id, x.forward]);
            return (
              support.supported(xy.slice(a, b + 1)) &&
              support.edgeSupported(xy, edge.from, edge.to) &&
              outside(p).length === 0 &&
              floorHoles(p).length === 0 &&
              JSON.stringify(crossings(p)) ===
                JSON.stringify(crossings(edge.pointsFeet)) &&
              createNativeTransitRefinementPolicy(
                data,
                [edge],
                edge.pointsFeet,
              )(p)
            );
          };
          for (const edge of edges) {
            if (!refused.has(edge.id)) continue;
            const ramp = reviewedRampLanding(
              data,
              edge,
              nodes.get(edge.from)!,
              nodes.get(edge.to)!,
              records,
            );
            if (!ramp) continue;
            const g = reviewedRampLandingGuide(
              edge,
              ramp,
              cellGuides,
              (e, g) =>
                [311, 1487816].every(
                  (level) =>
                    !passages(level, e.pointsFeet).length &&
                    !passages(level, g.pointsFeet).length,
                ) &&
                support.edgeSupported(
                  g.pointsFeet.toReversed().map(([x, y]) => [x, y]),
                  e.to,
                  e.from,
                ) &&
                replay(e, g),
            );
            if (!g) continue;
            cellGuides.push(g);
            refused.delete(edge.id);
            trial.refusedEdges = trial.refusedEdges.filter(
              (e) => e.edgeId !== edge.id,
            );
            (trial.recoveredRampLandingEdgeIds ??= []).push(edge.id);
          }
          const recovered = recoverCorridorRuns(
            edges,
            cellGuides,
            refused,
            (id) => {
              const door = doorsByNode.get(id);
              return door && apertures.get(door.id)?.normalFeet;
            },
            replay,
          );
          if (recovered.length > 0) {
            const previous = new Set(cellGuides.map((g) => g.edgeId));
            const additions = recovered.filter((g) => !previous.has(g.edgeId));
            const changes = new Map(
              recovered
                .filter((g) => previous.has(g.edgeId))
                .map((g) => [g.edgeId, g]),
            );
            if (changes.size > 0) {
              trial.alignedDoorwayStationEdgeIds = [...changes.keys()];
              cellGuides = cellGuides.map((g) => changes.get(g.edgeId) ?? g);
            }
            if (additions.length > 0) {
              const ids = new Set(additions.map((g) => g.edgeId));
              trial.recoveredStraightRunEdgeIds = [...ids];
              trial.refusedEdges = trial.refusedEdges.filter(
                (e) => !ids.has(e.edgeId),
              );
              cellGuides.push(...additions);
            }
          }
          if (sampled.length > 0) {
            const edgeById = new Map(edges.map((e) => [e.id, e]));
            for (const row of sampled) {
              const edge = edgeById.get(row.edgeId)!;
              for (const network of [...networks, ...(legacy ?? [])]) {
                if (
                  network.refusalReason(edge.from, edge.to) !==
                  "sampled-graph-disconnection"
                )
                  continue;
                const a = network.joins.get(edge.from),
                  b = network.joins.get(edge.to);
                if (!a || !b) continue;
                const guide = sampledCorridorRun(
                  edge,
                  cellGuides,
                  edgeById,
                  [a.approach, b.approach],
                  replay,
                );
                if (!guide) continue;
                cellGuides.push(guide);
                (trial.recoveredSampledRunEdgeIds ??= []).push(edge.id);
                break;
              }
            }
            const fixed = new Set(trial.recoveredSampledRunEdgeIds);
            trial.refusedEdges = trial.refusedEdges.filter(
              (row) => !fixed.has(row.edgeId),
            );
          }
          cellGuides = straightenSharedDoorGuideBends(
            edges,
            cellGuides,
            (id) => {
              const door = doorsByNode.get(id);
              return (
                !!door &&
                door.roomKeys.length === 2 &&
                door.roomKeys.every((k) => {
                  const r = records.get(k);
                  return (
                    r &&
                    pathwayCirculationOwner(data, r) &&
                    r.walkable &&
                    !r.stair &&
                    r.access !== "staff"
                  );
                })
              );
            },
            replay,
          );
        }
        for (const guide of cellGuides)
          if (originalGuides.get(guide.edgeId) !== guide)
            origins.set(guide.edgeId, `refined:${guide.edgeId}`);
        trial.networks = networks.map((network) => network.statistics());
        if (legacy)
          trial.legacyNetworks = legacy.map((network) => network.statistics());
        return { guides: cellGuides, origins, report: trial };
      };
      let result = compileCell(parameters.straightRuns);
      if (
        parameters.straightRuns &&
        result.report.networks.some(
          (network) => (network.straightRuns?.fittedRuns ?? 0) > 0,
        )
      ) {
        const control = compileCell(false);
        const sourceEdges = new Map(edges.map((edge) => [edge.id, edge]));
        const comparison = compareCombinedCorridorGuides(
          { ...control, edges: sourceEdges },
          { ...result, edges: sourceEdges },
        );
        const candidateNetworks = result.report.networks;
        const withdrawn =
          comparison.missingGuideIds.length > 0 ||
          comparison.newContacts.length > 0;
        if (withdrawn) result = control;
        result.report.straightRunsWithdrawn = withdrawn;
        result.report.straightRunsComparison = {
          missingGuideIds: comparison.missingGuideIds,
          newContactCount: comparison.newContacts.length,
          // Preserve a bounded diagnostic sample alongside the complete count.
          newContacts: comparison.newContacts.slice(0, 20),
          candidateNetworks,
        };
      }
      Object.assign(report, result.report);
      const cellGuides = result.guides;
      for (const guide of cellGuides) {
        report.guideIds.push(guide.edgeId);
        report.compiledEdges++;
        if (!options.edgeIds || options.edgeIds.has(guide.edgeId)) {
          prepared.guides.push(guide);
          report.emittedEdges++;
        }
      }
    });
    report.seconds = (performance.now() - started) / 1000;
    reports.push(report);
    completed += edges.length;
    options.cellCompleted?.(
      report,
      report.emittedEdges > 0
        ? prepared.guides.slice(-report.emittedEdges)
        : [],
    );
    options.progress?.(completed, eligible.length, prepared.guides.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  // Refused native admission is an accounted outcome, never a silently absent
  // cell. It carries no restored geometry or navigation authority.
  for (const cellId of compilationMissing) {
    const edges = edgesByCell.get(cellId)!;
    const report: CorridorCellCompilation = {
      cellId,
      elevationFeet: nodes.get(edges[0].from)!.pointFeet[2],
      eligibleEdges: edges.length,
      terminalCount: new Set(edges.flatMap((edge) => [edge.from, edge.to]))
        .size,
      requestedEdges: edges.filter(
        (edge) => !options.edgeIds || options.edgeIds.has(edge.id),
      ).length,
      emittedEdges: 0,
      compiledEdges: 0,
      refusedEdges: edges.map((edge) => ({
        edgeId: edge.id,
        reason: "native-cell-not-admitted",
      })),
      guideIds: [],
      networks: [],
      seconds: 0,
    };
    reports.push(report);
    completed += edges.length;
    options.cellCompleted?.(report, []);
    options.progress?.(completed, eligible.length, prepared.guides.length);
  }
  const floors = data.floors.map((floor) => {
    const ids = new Set(
      eligible
        .filter((e) => floor.levelIds.includes(nodes.get(e.from)!.levelId))
        .map((e) => e.id),
    );
    return {
      id: floor.id,
      name: floor.name,
      eligibleWalkingEdges: ids.size,
      compiledWalkingEdges: prepared.guides.filter((g) => ids.has(g.edgeId))
        .length,
    };
  });
  return {
    prepared,
    report: {
      version: 1,
      algorithm: ROUTING_GUIDE_VERSION,
      parameters,
      method: "shared-corridor" as const,
      walkingEdges: data.edges.filter((e) => e.enabled && e.kind === "walk")
        .length,
      eligibleWalkingEdges: eligible.length,
      requestedWalkingEdges: requested.length,
      completeCompiledWalkingEdges: reports.reduce(
        (sum, cell) => sum + cell.compiledEdges,
        0,
      ),
      compiledWalkingEdges: prepared.guides.length,
      fallbackWalkingEdges:
        data.edges.filter((e) => e.enabled && e.kind === "walk").length -
        prepared.guides.length,
      newGraphConnections: 0,
      floors,
      cells: reports,
      unavailableCellIds: compilationMissing,
      requestedCellsOutsideInitialTargets: [...(options.cellIds ?? [])]
        .filter((id) => !edgesByCell.has(id))
        .sort(),
      requestedEdgesOutsideInitialTargets: [...(options.edgeIds ?? [])]
        .filter((id) => !allEligible.some((edge) => edge.id === id))
        .sort()
        .map((edgeId) => ({
          edgeId,
          reason: scope.ineligibleReasons.get(edgeId) ?? "unknown-source-edge",
        })),
      coverage: corridorRoutingCoverage(data, scope),
      clearance:
        "two-foot planar strip; headroom and accessibility status unchanged",
    },
  };
}
