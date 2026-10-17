import type { IndoorDataset } from "./contract";
import {
  createCorridorCenterline,
  type CorridorCenterlineTerminal,
} from "./corridor-centerline";
import { createCorridorGuideSupport } from "./corridor-guide-support";
import { createNativeDoorApproachQuery } from "./native-door-approach";
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
    progress?: (completed: number, total: number, compiled: number) => void;
    cellCompleted?: (
      cell: CorridorCellCompilation,
      guides: PreparedRouting["guides"],
    ) => void;
  } = {},
) {
  const run = createImmutableRoutingSession(data);
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const records = new Map(data.records.map((r) => [r.key, r]));
  const eligible = data.edges.filter((edge) => {
    if (
      !edge.enabled ||
      edge.kind !== "walk" ||
      !edge.nativeCellId ||
      (options.edgeIds && !options.edgeIds.has(edge.id)) ||
      (options.cellIds && !options.cellIds.has(edge.nativeCellId))
    )
      return false;
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    return (
      a &&
      b &&
      a.levelId === b.levelId &&
      a.pointFeet[2] === b.pointFeet[2] &&
      edge.pointsFeet.every((p) => p[2] === a.pointFeet[2]) &&
      [a, b].every((n) => {
        const owner = records.get(n.roomKey);
        return owner?.circulation && owner.walkable && owner.access !== "staff";
      })
    );
  });
  const ids = new Set(eligible.map((e) => e.nativeCellId!));
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
  const compilationMissing = [...ids].filter(
    (id) => !cells.some((cell) => cell.id === id),
  );
  let completed = 0;
  for (const cell of cells) {
    const started = performance.now();
    const edges = eligible.filter((e) => e.nativeCellId === cell.id);
    const report: CorridorCellCompilation = {
      cellId: cell.id,
      elevationFeet: cell.elevationFeet,
      eligibleEdges: edges.length,
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
      const ids = [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort();
      const terminals: CorridorCenterlineTerminal[] = ids.map((id) => {
        const node = nodes.get(id)!;
        const door = data.edges.find(
          (e) => e.enabled && e.kind === "door" && [e.from, e.to].includes(id),
        );
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
        createCorridorCenterline(rings, terminals, support.supported),
      );
      for (const edge of edges) {
        const paths = networks
          .map((network) => network.route(edge.from, edge.to))
          .filter((p): p is [number, number][] => !!p)
          .sort((a, b) => corridorGuideLength(a) - corridorGuideLength(b));
        const candidate = paths.find(
          (p) =>
            p.length >= 2 &&
            p.length <= 10_000 &&
            corridorGuideLength(p) <=
              corridorGuideLength(edge.pointsFeet) * 1.15 +
                0.6 +
                2 * MAX_SHARED_CORRIDOR_APPROACH_FEET &&
            support.edgeSupported(p, edge.from, edge.to),
        );
        if (!candidate) {
          report.refusedEdges.push({
            edgeId: edge.id,
            reason:
              paths.length > 0
                ? "distance-or-planar-width"
                : "no-supported-shared-route",
          });
          continue;
        }
        // Require exact original coordinates, including physical elevation.
        const pointsFeet = candidate.map((p): [number, number, number] => [
          p[0],
          p[1],
          cell.elevationFeet,
        ]);
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
        prepared.guides.push({
          edgeId: edge.id,
          pointsFeet,
          kind: "shared-corridor",
        });
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
      report.compiledEdges > 0
        ? prepared.guides.slice(-report.compiledEdges)
        : [],
    );
    options.progress?.(completed, eligible.length, prepared.guides.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
      method: "shared-corridor" as const,
      walkingEdges: data.edges.filter((e) => e.enabled && e.kind === "walk")
        .length,
      eligibleWalkingEdges: eligible.length,
      compiledWalkingEdges: prepared.guides.length,
      fallbackWalkingEdges:
        data.edges.filter((e) => e.enabled && e.kind === "walk").length -
        prepared.guides.length,
      newGraphConnections: 0,
      floors,
      cells: reports,
      unavailableCellIds: compilationMissing,
      clearance:
        "two-foot planar strip; headroom and accessibility status unchanged",
    },
  };
}
