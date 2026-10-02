import type { IndoorDataset } from "./contract";
type XY = readonly number[];
function insideRing(p: XY, ring: readonly XY[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1])
    )
      inside = !inside;
  }
  return inside;
}
const supported = (point: XY, rings: readonly (readonly XY[])[]) =>
  !!rings[0] &&
  insideRing(point, rings[0]) &&
  !rings.slice(1).some((ring) => insideRing(point, ring));

/** Positive native hole evidence, rather than absence of a slab profile. Every
 * interval separated by exact profile intersections is tested; thin openings
 * cannot disappear between sampled points. Overlapping supported slabs fill a
 * hole only when their own exact profiles support the same physical elevation. */
type HoleQuery = (points: readonly XY[]) => number[];
const queries = new WeakMap<
  IndoorDataset,
  {
    signature: string;
    floors: NonNullable<IndoorDataset["walkingSupport"]>["floors"];
    query: HoleQuery;
  }
>();
export function createNativeFloorHoleQuery(data: IndoorDataset): HoleQuery {
  const support = data.walkingSupport;
  if (
    !support ||
    support.version !== 1 ||
    support.sourceModelSha256 !== data.source.modelSha256
  )
    return () => [];
  const signature = JSON.stringify([data.source.modelSha256, support]);
  const existing = queries.get(data);
  if (existing?.signature === signature && existing.floors === support.floors)
    return existing.query;
  const indexed = support.floors
    .flatMap((floor) =>
      (floor.partsFeet ?? [floor.ringsFeet]).map((ringsFeet) => ({
        ...floor,
        ringsFeet,
      })),
    )
    .map((floor) => {
      const points = floor.ringsFeet[0];
      return {
        floor,
        bounds: [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      };
    });
  const query = (points: readonly XY[]): number[] => {
    const crossed = new Set<number>();
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1],
        b = points[index];
      if (Math.abs(a[2] - b[2]) > 0.05) continue;
      const floors = indexed
        .filter(
          ({ floor, bounds }) =>
            Math.abs(floor.elevationFeet - a[2]) <= 0.05 &&
            Math.min(a[0], b[0]) <= bounds[2] &&
            Math.max(a[0], b[0]) >= bounds[0] &&
            Math.min(a[1], b[1]) <= bounds[3] &&
            Math.max(a[1], b[1]) >= bounds[1],
        )
        .map(({ floor }) => floor);
      const holes = floors.filter((f) => f.ringsFeet.length > 1);
      if (holes.length === 0) continue;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        breaks = [0, 1];
      for (const floor of floors)
        for (const ring of floor.ringsFeet)
          for (let i = 0; i < ring.length; i++) {
            const p = ring[i],
              q = ring[(i + 1) % ring.length];
            const x = q[0] - p[0],
              y = q[1] - p[1],
              den = dx * y - dy * x;
            if (Math.abs(den) < 1e-12) continue;
            const ox = p[0] - a[0],
              oy = p[1] - a[1];
            const t = (ox * y - oy * x) / den,
              u = (ox * dy - oy * dx) / den;
            if (t > 0 && t < 1 && u >= 0 && u <= 1) breaks.push(t);
          }
      breaks.sort((a, b) => a - b);
      for (let i = 1; i < breaks.length; i++) {
        if (breaks[i] - breaks[i - 1] < 1e-12) continue;
        const t = (breaks[i] + breaks[i - 1]) / 2;
        const point = [a[0] + t * dx, a[1] + t * dy];
        if (floors.some((floor) => supported(point, floor.ringsFeet))) continue;
        for (const floor of holes)
          if (
            insideRing(point, floor.ringsFeet[0]) &&
            floor.ringsFeet.slice(1).some((hole) => insideRing(point, hole))
          )
            crossed.add(floor.nativeElementId);
      }
    }
    return [...crossed];
  };
  queries.set(data, { signature, floors: support.floors, query });
  return query;
}
export function nativeFloorHoleCrossings(
  data: IndoorDataset,
  points: readonly XY[],
) {
  return createNativeFloorHoleQuery(data)(points);
}
