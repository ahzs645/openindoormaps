import type { FeatureCollection, MultiPolygon } from "geojson";
import polygonClipping from "polygon-clipping";
import type { IndoorDataset, IndoorRecord } from "./contract";
type Ring = [number, number][];
const bounds = (ring: Ring) => [
  Math.min(...ring.map((p) => p[0])),
  Math.min(...ring.map((p) => p[1])),
  Math.max(...ring.map((p) => p[0])),
  Math.max(...ring.map((p) => p[1])),
];
const overlaps = (a: number[], b: number[], reach = 0) =>
  a[0] - reach <= b[2] &&
  a[2] + reach >= b[0] &&
  a[1] - reach <= b[3] &&
  a[3] + reach >= b[1];
const distance = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
};
/** Visitor presentation only: hide disconnected native wall components that
 * have no mapped walkable floor within three feet. Preserve full native walls
 * for review, graph barriers and source export; never fabricate missing rooms. */
export function visitorWallGeometry(
  data: IndoorDataset,
  walls: FeatureCollection<MultiPolygon>,
  records: IndoorRecord[],
): FeatureCollection<MultiPolygon> {
  const a = data.alignment,
    cos = Math.cos(a.rotationRadians),
    sin = Math.sin(a.rotationRadians);
  const fromGeo = ([lon, lat]: number[]): [number, number] => {
    const east =
      ((((lon - a.originGeographic[0]) * Math.PI) / 180) *
        6_378_137 *
        Math.cos((a.projectionLatitude * Math.PI) / 180)) /
      a.horizontalMetresPerFoot;
    const north =
      ((((lat - a.originGeographic[1]) * Math.PI) / 180) * 6_378_137) /
      a.horizontalMetresPerFoot;
    return [
      a.originFeet[0] + east * cos + north * sin,
      a.originFeet[1] - east * sin + north * cos,
    ];
  };
  const roomEdges = (rings: Ring[]) =>
    rings.flatMap((ring) =>
      ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length];
        return { a, b, box: bounds([a, b]) };
      }),
    );
  const rooms = records
    .filter((r) => r.walkable)
    .map((r) => ({
      r,
      box: bounds(r.ringsFeet[0]),
      edges: roomEdges(r.ringsFeet),
    }));
  // Most wall fragments sit beside one or two rooms. Avoid scanning every room
  // on the campus and rebuilding every edge box for each fragment.
  const cells = (box: number[], reach = 0) => {
    const keys: string[] = [];
    if (!box.every(Number.isFinite)) return keys;
    for (
      let x = Math.floor((box[0] - reach) / 64);
      x <= Math.floor((box[2] + reach) / 64);
      x++
    )
      for (
        let y = Math.floor((box[1] - reach) / 64);
        y <= Math.floor((box[3] + reach) / 64);
        y++
      )
        keys.push(`${x}:${y}`);
    return keys;
  };
  const levels = new Map<number, Map<string, Set<(typeof rooms)[number]>>>();
  for (const room of rooms) {
    let grid = levels.get(room.r.levelId);
    if (!grid) {
      grid = new Map();
      levels.set(room.r.levelId, grid);
    }
    for (const key of cells(room.box)) {
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = new Set();
        grid.set(key, bucket);
      }
      bucket.add(room);
    }
  }
  return {
    type: "FeatureCollection",
    features: walls.features.flatMap((f) => {
      if (f.properties?.approximate === true) return [];
      const level = Number(f.properties?.levelId);
      const coordinates = f.geometry.coordinates.filter((part) => {
        const rings = part.map((r) => r.map(fromGeo)),
          box = bounds(rings[0]);
        const grid = levels.get(level);
        const nearby = new Set(
          cells(box, 3).flatMap((key) => [...(grid?.get(key) ?? [])]),
        );
        const wallEdges = roomEdges(rings);
        return [...nearby].some(({ r, box: roomBox, edges }) => {
          if (r.levelId !== level || !overlaps(box, roomBox, 3)) return false;
          try {
            if (polygonClipping.intersection(rings, r.ringsFeet).length > 0)
              return true;
          } catch {
            return true;
          }
          return wallEdges.some(({ a: p, b, box: wallBox }) =>
            edges.some(
              ({ a: q, b: end, box: edgeBox }) =>
                overlaps(wallBox, edgeBox, 3) &&
                Math.min(
                  distance(p, q, end),
                  distance(b, q, end),
                  distance(q, p, b),
                  distance(end, p, b),
                ) <= 3,
            ),
          );
        });
      });
      return coordinates.length > 0
        ? [{ ...f, geometry: { ...f.geometry, coordinates } }]
        : [];
    }),
  };
}
