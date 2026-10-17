import type { IndoorDataset } from "./contract";
import { prepareWalkingGuide } from "./centered-route";
import { withRoutingCalculation } from "./routing-cache";
import { routeWorkerDataset } from "./route-worker-dataset";
import {
  prepareSharedCorridorRouting,
  type CorridorCellCompilation,
} from "./prepare-corridor-routing";
import {
  preparedRoutingKey,
  ROUTING_GUIDE_VERSION,
  withPreparedRouting,
  type PreparedRouting,
} from "./prepared-routing";
/** Derived geometry only. Existing graph links, directions and reviews remain
 * authoritative. There is no room-pair route table and no new connection. */
export async function prepareRouting(
  data: IndoorDataset,
  options: {
    edgeIds?: Set<string>;
    method?: "per-edge" | "shared-corridor";
    cellIds?: ReadonlySet<string>;
    cellCompleted?: (
      cell: CorridorCellCompilation,
      guides: PreparedRouting["guides"],
    ) => void;
    progress?: (completed: number, total: number, compiled: number) => void;
  } = {},
) {
  if (options.method === "shared-corridor") {
    // A separate immutable physical snapshot permits resident caches across
    // yielded cells without reusing authority after an authoring edit.
    const snapshot = structuredClone(routeWorkerDataset(data));
    const { prepared, report } = await prepareSharedCorridorRouting(
      snapshot,
      options,
    );
    if (
      withRoutingCalculation(data, () => preparedRoutingKey(data)) !==
      prepared.sourceGeometryKey
    )
      throw new Error(
        "Source geometry or policy changed during corridor preparation",
      );
    return { dataset: withPreparedRouting(data, prepared), report };
  }
  const edges = data.edges.filter(
    (e) =>
      e.kind === "walk" &&
      e.enabled &&
      (!options.edgeIds || options.edgeIds.has(e.id)),
  );
  const prepared: PreparedRouting = {
    version: 1,
    resolverVersion: ROUTING_GUIDE_VERSION,
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: withRoutingCalculation(data, () =>
      preparedRoutingKey(data),
    ),
    guides: [],
  };
  for (let i = 0; i < edges.length; i += 32) {
    withRoutingCalculation(data, () => {
      for (const edge of edges.slice(i, i + 32)) {
        const pointsFeet = prepareWalkingGuide(data, edge);
        if (pointsFeet) prepared.guides.push({ edgeId: edge.id, pointsFeet });
      }
    });
    options.progress?.(
      Math.min(i + 32, edges.length),
      edges.length,
      prepared.guides.length,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return {
    dataset: withPreparedRouting(data, prepared),
    report: {
      version: 1,
      algorithm: ROUTING_GUIDE_VERSION,
      walkingEdges: edges.length,
      compiledWalkingEdges: prepared.guides.length,
      fallbackWalkingEdges: edges.length - prepared.guides.length,
      newGraphConnections: 0,
    },
  };
}
