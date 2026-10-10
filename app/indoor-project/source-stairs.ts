import * as DMath from "./deterministic-math";
import type { IndoorDataset } from "./contract";
import pointInPolygon from "@turf/boolean-point-in-polygon";
export type SourceStair = NonNullable<
  NonNullable<IndoorDataset["stairDisplay"]>["sourceFlights"]
>[number];
export const sourceStairId = (id: number) => `source-stair:${id}`;
export function sourceStairKind(stair: SourceStair) {
  if (stair.context === "tiered-seating") return "Tiered seating";
  if (stair.context === "outdoor") return "Outdoor stairs";
  return "Staircase";
}
/** A source stair area is a floor/landing selection, not a second solid flight. */
export function sourceStairAreaKeys(
  data: IndoorDataset,
  visibleIds: readonly number[],
  levels: readonly number[],
) {
  return (
    data.stairDisplay?.flights
      .filter(
        (f) =>
          !f.displayOnly &&
          visibleIds.includes(f.stairElementId) &&
          levels.includes(f.levelId) &&
          data.records.some(
            (r) =>
              r.key === f.roomKey &&
              r.stair &&
              f.sourceGeometryKey ===
                JSON.stringify([r.levelId, r.elevationFeet, r.ringsFeet]),
          ),
      )
      .map((f) => f.roomKey) ?? []
  );
}
export function sourceStairEdges(data: IndoorDataset, stair: SourceStair) {
  return data.edges.filter(
    (e) =>
      e.nativeElementId === stair.stairElementId &&
      (e.kind === "stairs" || e.kind === "local-steps"),
  );
}

/** Physical tread proximity helps locate a source assembly from a review pin.
 * A railing or projected flight does not prove a landing or authorize a route. */
export function nearbySourceStairs(
  data: IndoorDataset,
  levelId: number,
  point: [number, number],
  maxDistanceFeet = 8,
) {
  if (data.stairDisplay?.sourceModelSha256 !== data.source.modelSha256)
    return [];
  const distanceToTread = (ring: [number, number][]) => {
    if (ring.length < 3) return Infinity;
    if (
      pointInPolygon(point, {
        type: "Polygon",
        coordinates: [[...ring, ring[0]]],
      })
    )
      return 0;
    return Math.min(
      ...ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          t = Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          );
        return DMath.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
      }),
    );
  };
  return (data.stairDisplay.sourceFlights ?? [])
    .filter((stair) => stair.levelIds.includes(levelId))
    .map((stair) => ({
      stair,
      distanceFeet: Math.min(
        ...stair.treads.map((t) => distanceToTread(t.ringFeet)),
      ),
      routeEdges: sourceStairEdges(data, stair),
    }))
    .filter((hit) => hit.distanceFeet <= maxDistanceFeet)
    .sort(
      (a, b) =>
        a.distanceFeet - b.distanceFeet ||
        a.stair.stairElementId - b.stair.stairElementId,
    );
}
export function sourceStairAnchor(
  data: IndoorDataset,
  stair: SourceStair,
  levels: readonly number[],
  building = "all",
): [number, number, number] {
  // Use the saved, supported landing when this assembly is connected. The
  // nearest tread is a physical display fallback, not the floor's arrival.
  // In a combined campus floor prefer the lowest visible native landing;
  // a single native-level view gets its own original endpoint.
  if (data.stairDisplay?.sourceModelSha256 === data.source.modelSha256) {
    const ids = new Set(
      sourceStairEdges(data, stair)
        .filter((edge) => edge.enabled)
        .flatMap((edge) => [edge.from, edge.to]),
    );
    const landing = data.nodes
      .filter(
        (node) =>
          ids.has(node.id) &&
          levels.includes(node.levelId) &&
          stair.levelIds.includes(node.levelId) &&
          (building === "all" || node.building === building),
      )
      .sort(
        (a, b) => a.pointFeet[2] - b.pointFeet[2] || a.id.localeCompare(b.id),
      )[0];
    if (landing) return [...landing.pointFeet];
  }
  const native = data.nativeLevels.filter(
    (l) => levels.includes(l.id) && stair.levelIds.includes(l.id),
  );
  const target =
    native.length > 0
      ? Math.min(...native.map((l) => l.elevationFeet))
      : stair.floorElevationFeet;
  const t = [...stair.treads].sort(
    (a, b) =>
      Math.abs(a.elevationFeet - target) - Math.abs(b.elevationFeet - target),
  )[0];
  const points = stair.treads
    .filter((s) => Math.abs(s.elevationFeet - t.elevationFeet) < 0.001)
    .flatMap((t) => t.ringFeet);
  const center: [number, number, number] = [0, 0, t.elevationFeet];
  for (const p of points) {
    center[0] += p[0] / points.length;
    center[1] += p[1] / points.length;
  }
  return center;
}
