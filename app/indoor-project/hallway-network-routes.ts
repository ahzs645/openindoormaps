import type { IndoorDataset } from "./contract";
import {
  EDGE_STAFF,
  EDGE_STEPS,
  type HallwayEdgeKind,
  type HallwayNetwork,
} from "./hallway-network";

/** The hallway network as a venue's `indoorRoutes` GeoJSON, the routing file
 * of a simplified product such as the BC Children's hospital example. The
 * app's own directions engine (`app/indoor-directions`) routes on it:
 * - lines join where they share a coordinate, so every network point keeps
 *   its own coordinate (split levels on one floor never merge);
 * - each line carries `routing_cost` in seconds from the network's own
 *   length, so the engine picks the same routes;
 * - staff-only links and destinations are left out, because the engine has
 *   no staff rule; stairs, steps and escalators are `is_accessible: false`
 *   for its step-free option;
 * - `level_id` is the floor's index in `data.floors`. */
export type IndoorRoutesOptions = {
  /** Decimal places of longitude and latitude (8 is about a millimetre). */
  digits?: number;
  /** Seconds per metre walked; the app summarises routes at 1.2 m/s. */
  walkingSpeedMetresPerSecond?: number;
};

const NETWORK_TYPE: Record<HallwayEdgeKind, string> = {
  spine: "corridor",
  join: "corridor",
  gate: "corridor",
  hop: "corridor",
  walk: "corridor",
  door: "door",
  opening: "door",
  stairs: "stairs",
  "local-steps": "stairs",
  ramp: "ramp",
  elevator: "elevator",
  escalator: "escalator",
};

export function hallwayNetworkToIndoorRoutes(
  network: HallwayNetwork,
  data: IndoorDataset,
  options: IndoorRoutesOptions = {},
): GeoJSON.FeatureCollection {
  const digits = options.digits ?? 8,
    speed = options.walkingSpeedMetresPerSecond ?? 1.2,
    unit = 10 ** digits;
  const a = data.alignment,
    cos = Math.cos(a.rotationRadians),
    sin = Math.sin(a.rotationRadians),
    metresPerFoot = a.horizontalMetresPerFoot,
    radius = 6_378_137,
    lonScale =
      180 /
      Math.PI /
      (radius * Math.cos((a.projectionLatitude * Math.PI) / 180)),
    latScale = 180 / Math.PI / radius;
  /** Plan feet to longitude and latitude, in grid units of `digits`. */
  const grid = (x: number, y: number): [number, number] => {
    const dx = x - a.originFeet[0],
      dy = y - a.originFeet[1];
    const east = (dx * cos - dy * sin) * metresPerFoot,
      north = (dx * sin + dy * cos) * metresPerFoot;
    return [
      Math.round((a.originGeographic[0] + east * lonScale) * unit),
      Math.round((a.originGeographic[1] + north * latScale) * unit),
    ];
  };
  const position = ([x, y]: [number, number]) => [x / unit, y / unit];
  const floorOf = new Map<number, number>();
  for (const [i, f] of data.floors.entries())
    for (const id of f.levelIds) floorOf.set(id, i);

  // One coordinate per network point. A point that would land on another
  // point's coordinate moves by one grid unit until it is free.
  const taken = new Map<string, number>(),
    coordinate: [number, number][] = [];
  for (const [i, [, x, y]] of network.nodes.entries()) {
    const p = grid(x, y);
    while (taken.has(`${p[0]},${p[1]}`)) p[0] += 1;
    taken.set(`${p[0]},${p[1]}`, i);
    coordinate.push(p);
  }
  const level = (i: number) => floorOf.get(network.nodes[i][0]) ?? null;

  const features: GeoJSON.Feature[] = [];
  const used = new Set<number>();
  for (const [from, to, metres, kind, flags, mid = []] of network.edges) {
    if (flags & EDGE_STAFF) continue;
    const fromLevel = level(from),
      toLevel = level(to),
      vertical = network.nodes[from][0] !== network.nodes[to][0];
    const points = [coordinate[from]];
    for (let k = 0; k < mid.length; k += 2) {
      // An interior point on any other point's coordinate (on this floor or
      // a stacked one) would join the lines there: move it off by a unit.
      const p = grid(mid[k], mid[k + 1]);
      while (taken.has(`${p[0]},${p[1]}`)) p[1] += 1;
      taken.set(`${p[0]},${p[1]}`, -1);
      points.push(p);
    }
    points.push(coordinate[to]);
    used.add(from).add(to);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: points.map(position) },
      properties: {
        network_type: NETWORK_TYPE[kind],
        hallway_kind: kind,
        level_id: vertical ? null : fromLevel,
        from_level_id: vertical ? fromLevel : null,
        to_level_id: vertical ? toLevel : null,
        is_accessible: !(flags & EDGE_STEPS),
        access_type: "public",
        direction: "both",
        routing_cost: metres / speed,
        length_m: Math.round(metres * 100) / 100,
      },
    });
  }
  const records = new Map(data.records.map((r) => [r.key, r]));
  for (const [key, node] of Object.entries(network.arrivals).sort()) {
    const r = records.get(key);
    if (!r || r.access === "staff" || !used.has(node)) continue;
    const p = position(coordinate[node]);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: p },
      properties: {
        network_type: "destination",
        level_id: level(node),
        source_coordinate: p,
        space_id: key,
        number: r.number || undefined,
        name: r.name,
      },
    });
  }
  return {
    type: "FeatureCollection",
    features,
    // The source records are tagged, not part of the GeoJSON spec.
    ...({
      source_model_sha256: network.sourceModelSha256,
    } as object),
  } as GeoJSON.FeatureCollection;
}
