import { ShapeUtils, Vector2 } from "three";

type Point = [number, number];
type Rings = Point[][];
const cache = new WeakMap<Rings, Point | undefined>();
const insideRing = (p: Point, ring: Point[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
      p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const inside = (p: Point, rings: Rings) => insideRing(p, rings[0]) &&
  !rings.slice(1).some(ring => insideRing(p, ring));

/** A label identifies the existing polygon; it never supplies its boundary or
 * a routing anchor. Unlike a vertex mean, the area centroid is invariant under
 * edge subdivision. Concave rooms and holes use a checked interior triangle. */
export function interiorLabelPoint(rings: Rings): Point | undefined {
  if (cache.has(rings)) return cache.get(rings);
  if (!rings[0]?.length) return undefined;
  const origin = rings[0][0];
  let weight = 0, mx = 0, my = 0;
  for (const [index, ring] of rings.entries()) {
    let twiceArea = 0, xMoment = 0, yMoment = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ax = a[0] - origin[0], ay = a[1] - origin[1];
      const bx = b[0] - origin[0], by = b[1] - origin[1];
      const cross = ax * by - bx * ay;
      twiceArea += cross; xMoment += (ax + bx) * cross; yMoment += (ay + by) * cross;
    }
    if (Math.abs(twiceArea) < 1e-12) continue;
    const contribution = Math.abs(twiceArea) * (index ? -1 : 1);
    weight += contribution;
    mx += contribution * xMoment / (3 * twiceArea);
    my += contribution * yMoment / (3 * twiceArea);
  }
  let result: Point | undefined;
  const centroid: Point = [origin[0] + mx / weight, origin[1] + my / weight];
  if (weight > 1e-12 && centroid.every(Number.isFinite) && inside(centroid, rings)) result = centroid;
  else {
    const open = rings.map(ring => ring.length > 3 && ring[0][0] === ring.at(-1)![0] &&
      ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring);
    const vertices = open.flat();
    const vectors = open.map(ring => ring.map(p => new Vector2(p[0] - origin[0], p[1] - origin[1])));
    let largest = 0;
    for (const triangle of ShapeUtils.triangulateShape(vectors[0], vectors.slice(1))) {
      const [a, b, c] = triangle.map(i => vertices[i]);
      const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      const point: Point = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
      if (area > largest && inside(point, rings)) { largest = area; result = point; }
    }
  }
  cache.set(rings, result);
  return result;
}
