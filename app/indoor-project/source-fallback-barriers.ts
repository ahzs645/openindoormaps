import type { IndoorDataset, IndoorEdge } from "./contract";
import type { RoutePath } from "./centered-route";
import { routingDoorApertures } from "./routing-apertures";
import { nativeJointBarriers } from "./native-joint-barriers";
import { routingCalculationValue } from "./routing-cache";

type Point = readonly number[];
type Rings = readonly (readonly Point[])[];
const bounds = (rings: Rings) => {
  const points = rings.flat();
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
};
const overlap = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
function inRing(point: Point, ring: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function contact(point: Point, ring: readonly Point[]) {
  return ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length],
      x = b[0] - a[0],
      y = b[1] - a[1],
      length = x * x + y * y;
    const t = length
      ? ((point[0] - a[0]) * x + (point[1] - a[1]) * y) / length
      : 0;
    return (
      t >= 0 &&
      t <= 1 &&
      Math.hypot(point[0] - a[0] - t * x, point[1] - a[1] - t * y) <= 1e-8
    );
  });
}
const interior = (point: Point, rings: Rings) =>
  inRing(point, rings[0]) &&
  !contact(point, rings[0]) &&
  !rings.slice(1).some((r) => inRing(point, r) || contact(point, r));
function intervals(a: Point, b: Point, rings: Rings) {
  const ts = [0, 1],
    dx = b[0] - a[0],
    dy = b[1] - a[1];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i],
        q = ring[(i + 1) % ring.length],
        ex = q[0] - p[0],
        ey = q[1] - p[1],
        denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-14) continue;
      const ox = p[0] - a[0],
        oy = p[1] - a[1],
        t = (ox * ey - oy * ex) / denominator,
        k = (ox * dy - oy * dx) / denominator;
      if (t > 0 && t < 1 && k >= -1e-10 && k <= 1 + 1e-10) ts.push(t);
    }
  return [...new Set(ts)].sort((x, y) => x - y);
}

/** A failed refinement must not make unchecked saved fragments a wall-crossing
 * route. Check only planar no-clearance fallbacks, preserving stair geometry and
 * exact doorway contacts. Door apertures are licensed by the selected portal,
 * or by an enabled physical door whose two owners belong to this source leg;
 * a nearby side-room entrance does not authorize a shortcut through its wall. */
export function sourceFallbackBarrierHits(
  data: IndoorDataset,
  path: RoutePath,
  dependencies: IndoorEdge[],
): number[] {
  if (
    path.sourceReason !== "no-clearance-route" ||
    path.levelIds.length !== 1 ||
    path.pointsFeet.length < 2 ||
    path.pointsFeet.some(
      (p) => Math.abs(p[2] - path.pointsFeet[0][2]) >= 0.01,
    ) ||
    !data.doors ||
    data.walls.some((w) => w.kind === undefined)
  )
    return [];
  const level = path.levelIds[0],
    extent = bounds([path.pointsFeet]),
    ids = new Set(path.edgeIds),
    ownEdges = dependencies.filter((e) => ids.has(e.id)),
    owners = new Set(ownEdges.flatMap((e) => e.roomKeys));
  const indexed = routingCalculationValue(
    data,
    `source-fallback-barriers:${level}`,
    () =>
      [
        ...data.walls.filter((w) => w.levelId === level),
        ...nativeJointBarriers(data, level),
      ].map((w) => ({ ...w, bounds: bounds(w.ringsFeet) })),
  );
  const walls = indexed.filter((w) => overlap(extent, w.bounds));
  const selected = new Set(
    dependencies.filter((e) => e.kind === "door" && e.enabled).map((e) => e.id),
  );
  const portals = new Map(
    data.edges
      .filter((e) => e.enabled && e.kind === "door")
      .map((e) => [e.id, e]),
  );
  const apertures = routingDoorApertures(data)
    .filter(
      (d) =>
        d.levelId === level &&
        d.state === "connected" &&
        d.footprintFeet &&
        d.roomKeys.length === 2 &&
        portals.has(d.id) &&
        (selected.has(d.id) || d.roomKeys.every((k) => owners.has(k))),
    )
    .map((d) => d.footprintFeet!);
  const hits = new Set<number>();
  for (let i = 1; i < path.pointsFeet.length; i++) {
    const a = path.pointsFeet[i - 1],
      b = path.pointsFeet[i],
      segmentBounds = bounds([[a, b]]);
    for (const wall of walls.filter((w) => overlap(segmentBounds, w.bounds))) {
      const openings =
          wall.kind === "column"
            ? []
            : apertures.filter((r) => overlap(segmentBounds, bounds([r]))),
        ts = intervals(a, b, [...wall.ringsFeet, ...openings]);
      for (let j = 1; j < ts.length; j++) {
        if (ts[j] - ts[j - 1] <= 1e-10) continue;
        const t = (ts[j] + ts[j - 1]) / 2,
          point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (
          interior(point, wall.ringsFeet) &&
          !openings.some((r) => interior(point, [r]) || contact(point, r))
        ) {
          hits.add(wall.nativeElementId);
          break;
        }
      }
    }
  }
  return [...hits];
}
