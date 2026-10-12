import * as DMath from "./deterministic-math";
import type { IndoorDataset, IndoorEdge } from "./contract";
import { routingDoorApertures } from "./routing-apertures";
import {
  routingSnapshot,
  routingArrays,
  sameRoutingArrays,
} from "./routing-cache";

type XY = [number, number];
export type WalkPassage = { edge: IndoorEdge; forward: boolean };
type Aperture = {
  edge: IndoorEdge;
  ring: XY[];
  center: XY;
  normal: XY;
  bounds: number[];
};
const bounds = (points: readonly number[][]) => [
  Math.min(...points.map((p) => p[0])),
  Math.min(...points.map((p) => p[1])),
  Math.max(...points.map((p) => p[0])),
  Math.max(...points.map((p) => p[1])),
];
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const planeSide = (p: readonly number[], c: XY, n: XY) =>
  (p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1];
function contains(p: XY, ring: XY[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    if (
      Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) < 1e-8 &&
      p[0] >= Math.min(a[0], b[0]) - 1e-8 &&
      p[0] <= Math.max(a[0], b[0]) + 1e-8 &&
      p[1] >= Math.min(a[1], b[1]) - 1e-8 &&
      p[1] <= Math.max(a[1], b[1]) + 1e-8
    )
      return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1])
    )
      inside = !inside;
  }
  return inside;
}

type PassageQuery = (
  levelId: number,
  points: readonly [number, number, number][],
) => WalkPassage[];
const passageCache = new WeakMap<
  IndoorDataset,
  {
    snapshot: string;
    arrays: ReturnType<typeof routingArrays>;
    query: PassageQuery;
    walks?: Map<string, WalkPassage[]>;
  }
>();

/** Recover native doorway crossings already present in a saved walking branch.
 * Geometry identifies a dependency, never a new connection. Reviews are read
 * from the current door edges by the graph builder on every route request. */
export function createDoorPassageQuery(data: IndoorDataset): PassageQuery {
  const snapshot = routingSnapshot(data),
    arrays = routingArrays(data);
  const cached = passageCache.get(data);
  if (
    cached &&
    cached.snapshot === snapshot &&
    sameRoutingArrays(cached.arrays, arrays)
  )
    return cached.query;
  const edges = new Map(data.edges.map((e) => [e.id, e])),
    bins = new Map<string, Aperture[]>(),
    floors = new Map<number, Aperture[]>(),
    spanning = new Map<number, Aperture[]>(),
    size = 8;
  // A stale source aperture still identifies a dependency to reject; it is
  // never added to the geometry that permits a new physical crossing.
  for (const door of routingDoorApertures(data, true)) {
    const edge = edges.get(door.id),
      ring = door.footprintFeet;
    if (door.state !== "connected" || !ring || edge?.kind !== "door") continue;
    const a = edge.pointsFeet[0],
      b = edge.pointsFeet.at(-1)!;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = DMath.hypot(dx, dy);
    if (length < 1e-6) continue;
    // Use the native aperture plane, rather than the raster-snapped portal
    // direction. Snap offsets can tilt a pair of anchors beside a side door.
    let normal: XY = [dx / length, dy / length];
    if (door.normalFeet) {
      normal = [...door.normalFeet];
      if (normal[0] * dx + normal[1] * dy < 0)
        normal = [-normal[0], -normal[1]];
    } else if (ring.length === 4) {
      let longest = 0;
      for (let i = 0; i < ring.length; i++) {
        const u = ring[i],
          v = ring[(i + 1) % ring.length],
          span = DMath.hypot(v[0] - u[0], v[1] - u[1]);
        if (span < 1e-8) continue;
        const candidate: XY = [-(v[1] - u[1]) / span, (v[0] - u[0]) / span];
        if (
          span > longest + 1e-8 ||
          (Math.abs(span - longest) <= 1e-8 &&
            Math.abs(candidate[0] * dx + candidate[1] * dy) >
              Math.abs(normal[0] * dx + normal[1] * dy))
        ) {
          longest = span;
          normal = candidate;
        }
      }
      if (normal[0] * dx + normal[1] * dy < 0)
        normal = [-normal[0], -normal[1]];
    }
    const center: XY = [0, 0];
    for (const p of ring) {
      center[0] += p[0] / ring.length;
      center[1] += p[1] / ring.length;
    }
    const aperture: Aperture = {
      edge,
      ring,
      normal,
      bounds: bounds(ring),
      center,
    };
    floors.set(door.levelId, [...(floors.get(door.levelId) ?? []), aperture]);
    const [x0, y0, x1, y1] = aperture.bounds.map((v) => Math.floor(v / size));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) {
      spanning.set(door.levelId, [
        ...(spanning.get(door.levelId) ?? []),
        aperture,
      ]);
      continue;
    }
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const key = `${door.levelId}:${x}:${y}`;
        bins.set(key, [...(bins.get(key) ?? []), aperture]);
      }
  }
  const query = (
    levelId: number,
    points: readonly [number, number, number][],
  ): WalkPassage[] => {
    const passages: WalkPassage[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        area = bounds([a, b]);
      const [x0, y0, x1, y1] = area.map((v) => Math.floor(v / size));
      const candidates = new Set(spanning.get(levelId));
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096)
        for (const aperture of floors.get(levelId) ?? [])
          candidates.add(aperture);
      else
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++)
            for (const aperture of bins.get(`${levelId}:${x}:${y}`) ?? [])
              candidates.add(aperture);
      for (const aperture of candidates) {
        if (
          !overlaps(area, aperture.bounds) ||
          Math.abs(a[2] - aperture.edge.pointsFeet[0][2]) > 0.05 ||
          Math.abs(b[2] - aperture.edge.pointsFeet[0][2]) > 0.05
        )
          continue;
        const { center: c, normal: n } = aperture,
          last = planeSide(b, c, n);
        let first = planeSide(a, c, n);
        const onPlane = Math.abs(first) < 1e-8;
        if (onPlane) {
          // A grid vertex can lie exactly on the native threshold. Compare the
          // preceding non-tangent vertex so splitting a segment cannot bypass
          // its review; touching and returning to the same side is still free.
          for (let j = i - 2; j >= 0; j--) {
            if (Math.abs(points[j][2] - a[2]) > 0.05) break;
            first = planeSide(points[j], c, n);
            if (Math.abs(first) >= 1e-8) break;
          }
        }
        if (first * last >= -1e-10) continue;
        const t = onPlane ? 0 : first / (first - last),
          hit: XY = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          forward = last > first;
        if (
          contains(hit, aperture.ring) &&
          !passages.some(
            (p) => p.edge.id === aperture.edge.id && p.forward === forward,
          )
        )
          passages.push({ edge: aperture.edge, forward });
      }
    }
    return passages;
  };
  passageCache.set(data, { snapshot, arrays, query });
  return query;
}

export function walkPassages(data: IndoorDataset): Map<string, WalkPassage[]> {
  const query = createDoorPassageQuery(data),
    cached = passageCache.get(data)!;
  if (cached.walks) return cached.walks;
  const result = new Map<string, WalkPassage[]>(),
    nodes = new Map(data.nodes.map((n) => [n.id, n]));
  for (const edge of data.edges) {
    if (edge.kind !== "walk") continue;
    const from = nodes.get(edge.from),
      to = nodes.get(edge.to);
    if (!from || from.levelId !== to?.levelId) continue;
    const passages = query(from.levelId, edge.pointsFeet);
    if (passages.length > 0) result.set(edge.id, passages);
  }
  cached.walks = result;
  return result;
}
