import type {
  IndoorDataset,
  IndoorEdge,
  IndoorRecord,
  IndoorNode,
} from "./contract";
import { floorDisplayName } from "./floor-display-name";
import { sourceStairId } from "./source-stairs";

/** Show only compiled connections. An overlapping tread/shaft outline never
 * establishes a connection to another floor. */
export function connectorFloorTargets(
  data: IndoorDataset,
  selected: {
    room?: IndoorRecord;
    edge?: IndoorEdge;
    nativeElementId?: number;
  },
) {
  const vertical = data.edges.filter(
    (edge) =>
      edge.enabled &&
      ["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
        edge.kind,
      ),
  );
  const selectedEdge =
    selected.edge && vertical.find((edge) => edge.id === selected.edge!.id);
  const seeds = vertical.filter(
    (edge) =>
      selectedEdge?.id === edge.id ||
      (selected.room && edge.roomKeys.includes(selected.room.key)) ||
      (selected.nativeElementId !== undefined &&
        edge.nativeElementId === selected.nativeElementId),
  );
  const connected = new Set<string>();
  const steps = (edge: IndoorEdge) =>
    edge.kind === "stairs" || edge.kind === "local-steps";
  const graphNodes = new Map(data.nodes.map((node) => [node.id, node]));
  const transfers = data.edges.filter((edge) => {
    if (!edge.enabled || edge.kind !== "walk" || edge.lengthMetres !== 0)
      return false;
    const a = graphNodes.get(edge.from),
      b = graphNodes.get(edge.to);
    return (
      a &&
      b &&
      a.levelId === b.levelId &&
      a.surfaceId === b.surfaceId &&
      a.roomKey === b.roomKey &&
      a.pointFeet.every((p, i) => p === b.pointFeet[i]) &&
      edge.pointsFeet.length >= 2 &&
      edge.pointsFeet.every((point) =>
        point.every((p, i) => p === a.pointFeet[i]),
      )
    );
  });
  for (const seed of seeds) {
    const peers = [
      ...vertical.filter(
        (edge) =>
          edge.id === seed.id ||
          (steps(seed)
            ? steps(edge)
            : edge.kind === seed.kind &&
              (seed.connectorId
                ? edge.connectorId === seed.connectorId
                : seed.nativeElementId !== undefined &&
                  !edge.connectorId &&
                  edge.nativeElementId === seed.nativeElementId)),
      ),
      ...(steps(seed) ? transfers : []),
    ];
    const nodes = new Set([seed.from, seed.to]);
    const visited = new Set<string>();
    // Separate stair flights can share one compiled landing. Follow only their
    // exact saved node or enabled stationary identity-transfer edge;
    // overlapping drawings or nearby points cannot link them.
    // A disconnected segment with the same source ID remains unavailable.
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of peers) {
        if (
          visited.has(edge.id) ||
          (!nodes.has(edge.from) && !nodes.has(edge.to))
        )
          continue;
        visited.add(edge.id);
        connected.add(edge.id);
        nodes.add(edge.from);
        nodes.add(edge.to);
        changed = true;
      }
    }
  }
  const edges = vertical.filter((edge) => connected.has(edge.id));
  const targets = new Map<
    string,
    { floorId: string; label: string; node: IndoorNode; edge: IndoorEdge }
  >();
  for (const edge of edges)
    for (const id of [edge.from, edge.to]) {
      const node = data.nodes.find((n) => n.id === id);
      const floor =
        node && data.floors.find((f) => f.levelIds.includes(node.levelId));
      if (!node || !floor) continue;
      // Separate landings remain available even when a campus floor includes
      // multiple native levels (for example a local ramp).
      const key = `${floor.id}:${node.levelId}`;
      if (!targets.has(key))
        targets.set(key, {
          floorId: floor.id,
          label: floorDisplayName(floor.name),
          node,
          edge,
        });
    }
  return [...targets.values()].sort(
    (a, b) => a.node.pointFeet[2] - b.node.pointFeet[2],
  );
}

/** The selected inspector follows the actual target flight after changing floors. */
export function connectorFloorSelectionId(
  data: IndoorDataset,
  target: ReturnType<typeof connectorFloorTargets>[number],
) {
  const currentEdge = data.edges.find(
    (edge) =>
      edge.id === target.edge.id &&
      edge.enabled &&
      [edge.from, edge.to].includes(target.node.id),
  );
  const stair =
    currentEdge &&
    ["stairs", "local-steps"].includes(currentEdge.kind) &&
    data.stairDisplay?.sourceModelSha256 === data.source.modelSha256 &&
    data.stairDisplay.sourceFlights?.find(
      (source) =>
        source.stairElementId === currentEdge.nativeElementId &&
        source.levelIds.includes(target.node.levelId),
    );
  return stair ? sourceStairId(stair.stairElementId) : target.edge.id;
}

export function ConnectorFloorLinks({
  data,
  room,
  edge,
  nativeElementId,
  onNavigate,
}: {
  data: IndoorDataset;
  room?: IndoorRecord;
  edge?: IndoorEdge;
  nativeElementId?: number;
  onNavigate: (
    target: ReturnType<typeof connectorFloorTargets>[number],
  ) => void;
}) {
  const targets = connectorFloorTargets(data, { room, edge, nativeElementId });
  if (!targets.length) return null;
  return (
    <div
      className="project-connected-floor-links"
      aria-label="Connected floor landings"
    >
      <p>View the connected landings:</p>
      {targets.map((target) => (
        <button
          key={`${target.floorId}:${target.node.levelId}`}
          onClick={() => onNavigate(target)}
        >
          Show {target.label}
          {targets.filter((t) => t.floorId === target.floorId).length > 1
            ? ` · Building ${target.node.building} · ${target.node.pointFeet[2].toFixed(1)} ft`
            : ""}
        </button>
      ))}
    </div>
  );
}
