import type { IndoorDataset } from "./contract";

type Point = [number, number];
type Wall = IndoorDataset["walls"][number];
export type DisplayDoorwayClosure = {
  levelId: number;
  wallIds: number[];
  widthFeet: number;
  rings: Point[][];
};
export const DISPLAY_DOORWAY_MAX_WIDTH_FEET = 5;
const precision = 0.02;
const length = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const inside = (p: Point, ring: Point[]) => {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
};

/** Assumed door-sized openings for identified room *display* only. Opposing,
 * aligned end caps of exact rectangular native walls supply both jambs. Never
 * used as a physical wall or an access/routing decision. Floor support and room
 * ownership are checked by the caller before any room tint is changed. */
export function displayDoorwayClosures(
  walls: Wall[],
  maxWidthFeet = DISPLAY_DOORWAY_MAX_WIDTH_FEET,
): DisplayDoorwayClosure[] {
  const caps = walls.flatMap((wall) => {
    if (wall.kind !== "wall" || wall.approximate || wall.ringsFeet.length !== 1)
      return [];
    let ring = wall.ringsFeet[0];
    if (ring.length === 5 && length(ring[0], ring[4]) < 1e-8)
      ring = ring.slice(0, -1);
    if (ring.length !== 4) return [];
    const lengths = ring.map((p, i) => length(p, ring[(i + 1) % 4]));
    return ring.flatMap((a, i) => {
      const size = lengths[i],
        b = ring[(i + 1) % 4];
      if (size < 0.1 || size > 2 || size * 3 > Math.max(...lengths)) return [];
      return [
        {
          wall,
          ring,
          a,
          b,
          size,
          mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point,
          unit: [(b[0] - a[0]) / size, (b[1] - a[1]) / size] as Point,
        },
      ];
    });
  });
  const result: DisplayDoorwayClosure[] = [];
  for (let i = 0; i < caps.length; i++)
    for (let j = i + 1; j < caps.length; j++) {
      const a = caps[i],
        b = caps[j];
      if (
        a.wall === b.wall ||
        a.wall.levelId !== b.wall.levelId ||
        Math.abs(a.size - b.size) > precision ||
        Math.abs(dot(a.unit, b.unit)) < 0.9999
      )
        continue;
      const delta: Point = [b.mid[0] - a.mid[0], b.mid[1] - a.mid[1]],
        width = length(a.mid, b.mid);
      if (
        width < 0.5 ||
        width > maxWidthFeet ||
        Math.abs(dot(a.unit, delta)) > precision
      )
        continue;
      const direction: Point = [delta[0] / width, delta[1] / width];
      const shifted = (p: Point, offset: number): Point => [
        p[0] + direction[0] * offset,
        p[1] + direction[1] * offset,
      ];
      // Jambs must face each other across free space, not through either wall.
      if (
        inside(shifted(a.mid, 0.05), a.ring) ||
        !inside(shifted(a.mid, -0.05), a.ring) ||
        inside(shifted(b.mid, -0.05), b.ring) ||
        !inside(shifted(b.mid, 0.05), b.ring)
      )
        continue;
      const aligned = dot(a.unit, b.unit) >= 0;
      result.push({
        levelId: a.wall.levelId,
        wallIds: [a.wall.nativeElementId, b.wall.nativeElementId],
        widthFeet: width,
        rings: [
          [
            shifted(a.a, -0.0002),
            shifted(a.b, -0.0002),
            shifted(aligned ? b.b : b.a, 0.0002),
            shifted(aligned ? b.a : b.b, 0.0002),
          ],
        ],
      });
    }
  return result;
}
