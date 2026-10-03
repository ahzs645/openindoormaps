import type { IndoorDataset } from "./contract";
import { prepareWalkingGuide } from "./centered-route";
import { withRoutingCalculation } from "./routing-cache";
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
    progress?: (completed: number, total: number, compiled: number) => void;
  } = {},
) {
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
