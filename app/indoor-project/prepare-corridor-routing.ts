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
      const networks = nativeExactPartsForProposals(physical).map((rings) =>
        createCorridorCenterline(rings, terminals, support.supported, {
          ...parameters,
          requiredEdges: edges,
        }),
      );
      for (const edge of edges) {
        const paths = networks
          .flatMap((network) => {
            const route = network.routeDetails(edge.from, edge.to);
            return route ? [route] : [];
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
        if (!candidate) {
          report.refusedEdges.push({
            edgeId: edge.id,
            reason:
              paths.length === 0
                ? networks
                    .map((network) => network.refusalReason(edge.from, edge.to))
                    .join(";") || "no-supported-shared-route"
                : withinDistance.length === 0
                  ? "guide-distance-limit"
                  : "final-planar-width",
          });
          continue;
        }
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
        ) {
          report.refusedEdges.push({
            edgeId: edge.id,
            reason: "original-terminal-mismatch",
          });
          continue;
        }
        if (!options.edgeIds || options.edgeIds.has(edge.id)) {
          prepared.guides.push({
            edgeId: edge.id,
            pointsFeet,
            kind: "shared-corridor",
            hallwayJoins: candidate.hallwayJoins,
          });
          report.emittedEdges++;
        }
        report.guideIds.push(edge.id);
        report.compiledEdges++;
      }
      report.networks = networks.map((network) => network.statistics());
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
