import pc from "polygon-clipping";
import { ShapeUtils, Vector2 } from "three";
type Point = [number, number];
type Rings = Point[][];
/** Bound the complexity of a map tile's triangulation without simplifying the
 * reviewed boundary. These pieces are display-only; hit testing uses the source
 * polygon, and the outline is drawn separately to avoid internal grid lines. */
export function nativeAreaDisplayParts(rings: Rings): Rings[] {
  const triangulate = (part: Rings): Rings[] => {
    const open = part.map((r) =>
      r.length > 3 && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1]
        ? r.slice(0, -1)
        : r,
    );
    const vertices = open.flat();
    // Triangulate in native feet before tile quantization can collapse narrow
    // wall holes. Each emitted polygon is simple and carries no hole grouping.
    const [x, y] = vertices[0];
    const vectors = open.map((r) =>
      r.map((p) => new Vector2(p[0] - x, p[1] - y)),
    );
    return ShapeUtils.triangulateShape(vectors[0], vectors.slice(1)).map(
      (t) => [t.map((i) => vertices[i])],
    );
  };
  if (rings.reduce((n, r) => n + r.length, 0) < 180) return triangulate(rings);
  const points = rings[0],
    size = 32;
  const minX = Math.floor(Math.min(...points.map((p) => p[0])) / size) * size;
  const minY = Math.floor(Math.min(...points.map((p) => p[1])) / size) * size;
  const maxX = Math.max(...points.map((p) => p[0]));
  const maxY = Math.max(...points.map((p) => p[1]));
  const parts: Rings[] = [];
  for (let x = minX; x < maxX; x += size)
    for (let y = minY; y < maxY; y += size)
      parts.push(
        ...pc.intersection(
          [rings],
          [
            [
              [x, y],
              [x + size, y],
              [x + size, y + size],
              [x, y + size],
            ],
          ],
        ),
      );
  return parts.flatMap(triangulate);
}
