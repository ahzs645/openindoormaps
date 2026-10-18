import type { IndoorDataset } from "../../../app/indoor-project/contract";

/** A negative result establishes a break even in the enabled source graph.
 * A positive result is only a topology witness: physical geometry, staff/access,
 * ordinary-room preferences and step-free qualification are NOT checked here.
 * Preserve node identities, directions and selected native levels; never join XY.
 */
export function savedPathwayReachability(
  data: Pick<IndoorDataset, "nodes" | "edges">,
  from: string,
  to: string,
  levelIds: readonly number[],
) {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, { nodeId: string; edgeId: string }[]>();
  const selected = (id: string) => {
    const node = nodes.get(id);
    return !!node && levelIds.includes(node.levelId);
  };
  const link = (a: string, b: string, edgeId: string) => {
    const list = adjacency.get(a) ?? [];
    list.push({ nodeId: b, edgeId });
    adjacency.set(a, list);
  };
  for (const edge of data.edges) {
    if (!edge.enabled || !selected(edge.from) || !selected(edge.to)) continue;
    if (edge.direction !== "to-from") link(edge.from, edge.to, edge.id);
    if (edge.direction !== "from-to") link(edge.to, edge.from, edge.id);
  }
  const previous = new Map<string, { nodeId: string; edgeId: string }>();
  const seen = new Set<string>();
  const queue: string[] = [];
  if (selected(from) && selected(to)) {
    seen.add(from);
    queue.push(from);
  }
  for (let i = 0; i < queue.length && !seen.has(to); i++) {
    for (const next of adjacency.get(queue[i]) ?? []) {
      if (seen.has(next.nodeId)) continue;
      seen.add(next.nodeId);
      previous.set(next.nodeId, { nodeId: queue[i], edgeId: next.edgeId });
      queue.push(next.nodeId);
    }
  }
  const edgeIds: string[] = [];
  if (seen.has(to)) {
    for (let at = to; at !== from; ) {
      const prev = previous.get(at)!;
      edgeIds.push(prev.edgeId);
      at = prev.nodeId;
    }
  }
  return {
    connected: seen.has(to),
    edgeIds: edgeIds.reverse(),
    reachableNodeIds: [...seen],
  };
}
