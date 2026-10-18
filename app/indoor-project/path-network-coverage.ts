import type { IndoorDataset, IndoorEdge } from "./contract";
import { isPathArea } from "./hallway-path-view";
import { hasReviewedThroughNavigation } from "./through-navigation";
import { isProjectDestination } from "./route-policy";
import { nativeWalkTouchesTransitRoom } from "./native-walk-transit-owners";
import { withRoutingCalculation } from "./routing-cache";

export const PATH_VERTICAL_KINDS = new Set<IndoorEdge["kind"]>([
  "stairs",
  "local-steps",
  "ramp",
  "elevator",
  "escalator",
]);

/** Source graph inventory, not physical route approval. Every doorway and
 * vertical stop uses the SAME directed lateral-approach check. Coincident XY
 * on another floor, another staircase or a held edge cannot supply an approach.
 */
export function pathNetworkCoverage(
  data: IndoorDataset,
  levels: number[],
  building: string,
) {
  return withRoutingCalculation(data, () =>
    buildPathNetworkCoverage(data, levels, building),
  );
}
function buildPathNetworkCoverage(
  data: IndoorDataset,
  levels: number[],
  building: string,
) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const rooms = new Map(data.records.map((r) => [r.key, r]));
  const outgoing = new Map<string, { edge: IndoorEdge; other: string }[]>();
  const incoming = new Map<string, { edge: IndoorEdge; other: string }[]>();
  const ordinary = (edge: IndoorEdge) =>
    edge.roomKeys.filter((k) => {
      const r = rooms.get(k);
      return (
        r &&
        isProjectDestination(r) &&
        !r.circulation &&
        !r.stair &&
        !hasReviewedThroughNavigation(r, data.source.modelSha256) &&
        nativeWalkTouchesTransitRoom(data, edge, r)
      );
    });
  const restricted = (edge: IndoorEdge) =>
    edge.roomKeys.some((k) => {
      const r = rooms.get(k);
      return !r?.walkable || r.access === "staff";
    });
  const link = (
    map: typeof outgoing,
    from: string,
    to: string,
    edge: IndoorEdge,
  ) => {
    const list = map.get(from) ?? [];
    list.push({ edge, other: to });
    map.set(from, list);
  };
  for (const edge of data.edges) {
    if (!edge.enabled || PATH_VERTICAL_KINDS.has(edge.kind)) continue;
    if (edge.direction !== "to-from") {
      link(outgoing, edge.from, edge.to, edge);
      link(incoming, edge.to, edge.from, edge);
    }
    if (edge.direction !== "from-to") {
      link(outgoing, edge.to, edge.from, edge);
      link(incoming, edge.from, edge.to, edge);
    }
  }
  const approach = (
    id: string,
    map: typeof outgoing,
    ownConnections: ReadonlySet<string>,
  ) => {
    const start = nodes.get(id),
      found = new Map<string, { edgeId: string; ordinaryRoomKeys: string[] }>();
    if (!start) return [];
    const queue = [id],
      seen = new Set(queue);
    for (let i = 0; i < queue.length; i++)
      for (const { edge, other } of map.get(queue[i]) ?? []) {
        // A door's far side cannot supply its missing near-side approach.
        // Vertical links were excluded above; apply the same rule to thresholds.
        if (ownConnections.has(edge.id)) continue;
        const next = nodes.get(other),
          owner = next && rooms.get(next.roomKey);
        if (
          !next ||
          !owner ||
          !isPathArea(owner) ||
          restricted(edge) ||
          next.pointFeet[2] !== start.pointFeet[2]
        )
          continue;
        const moving = edge.pointsFeet.some((p) =>
          p.some((v, k) => v !== edge.pointsFeet[0][k]),
        );
        if (edge.kind === "walk" && moving) {
          found.set(edge.id, {
            edgeId: edge.id,
            ordinaryRoomKeys: ordinary(edge),
          });
          continue;
        }
        if (
          !seen.has(other) &&
          ["walk", "door", "opening"].includes(edge.kind)
        ) {
          seen.add(other);
          queue.push(other);
        }
      }
    return [...found.values()];
  };
  const stops = new Map<
    string,
    {
      nodeId: string;
      roomKey: string;
      roomNumber: string;
      levelId: number;
      building: string;
      pointFeet: [number, number, number];
      edgeIds: string[];
      kinds: string[];
      held: boolean;
      restricted: boolean;
      incoming: ReturnType<typeof approach>;
      outgoing: ReturnType<typeof approach>;
    }
  >();
  const connections = [];
  for (const edge of data.edges) {
    const vertical = PATH_VERTICAL_KINDS.has(edge.kind),
      held = !edge.enabled && edge.kind === "stairs";
    if (
      (!edge.enabled && !held) ||
      (!vertical && !["door", "opening"].includes(edge.kind))
    )
      continue;
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b) continue;
    const selected = [a, b].filter(
      (n) =>
        levels.includes(n.levelId) &&
        (building === "all" || n.building === building),
    );
    if (selected.length === 0) continue;
    connections.push({
      edgeId: edge.id,
      kind: edge.kind,
      enabled: edge.enabled,
      direction: edge.direction ?? "both",
      from: edge.from,
      to: edge.to,
      nativeElementId: edge.nativeElementId,
      restricted: restricted(edge),
    });
    for (const n of selected) {
      const r = rooms.get(n.roomKey);
      if (!r?.walkable || r.access === "staff" || !isPathArea(r)) continue;
      const key = `${held ? "held" : "active"}:${n.id}`,
        old = stops.get(key);
      if (old) {
        old.edgeIds.push(edge.id);
        if (!old.kinds.includes(edge.kind)) old.kinds.push(edge.kind);
        old.restricted &&= restricted(edge);
        continue;
      }
      stops.set(key, {
        nodeId: n.id,
        roomKey: r.key,
        roomNumber: r.number,
        levelId: n.levelId,
        building: n.building,
        pointFeet: n.pointFeet,
        edgeIds: [edge.id],
        kinds: [edge.kind],
        held,
        restricted: restricted(edge),
        incoming: [],
        outgoing: [],
      });
    }
  }
  return {
    connections,
    stops: [...stops.values()].map((stop) => {
      const own = new Set(stop.edgeIds);
      const s = {
        ...stop,
        incoming: approach(stop.nodeId, incoming, own),
        outgoing: approach(stop.nodeId, outgoing, own),
      };
      return {
        ...s,
        status: s.held
          ? "held"
          : s.restricted
            ? "restricted"
            : s.incoming.length === 0 && s.outgoing.length === 0
              ? "missing-walking-approach"
              : s.incoming.length === 0 || s.outgoing.length === 0
                ? "one-way-approach"
                : !s.incoming.some((a) => a.ordinaryRoomKeys.length === 0) ||
                    !s.outgoing.some((a) => a.ordinaryRoomKeys.length === 0)
                  ? "ordinary-room-requirements"
                  : "saved-approach",
      };
    }),
  };
}
