import {
  orient2d,
  rational,
} from "./vendor/native-rational-overlay-arithmetic.mjs";
import type { SharedGuidePoint } from "./shared-corridor-guides";

export type SharedGuideStops = {
  start?: SharedGuidePoint;
  end?: SharedGuidePoint;
};

const same = (a: SharedGuidePoint, b: SharedGuidePoint) =>
  a.every((value, i) => value === b[i]);

/** Compose stored shared chains without proposing a different route shape.
 * An intermediate source terminal can add an exactly reversed door/arrival
 * branch. Cancel only that retraced ink and exactly collinear subdivisions.
 * Real bends, cycles, physical thresholds and source edge dependencies stay
 * with the caller. Outer hallway stops survive until endpoint trimming.
 */
export function composeSharedCorridorGuide(
  points: readonly SharedGuidePoint[],
  stops: SharedGuideStops = {},
): SharedGuidePoint[] {
  if (points.length < 2) return points.map((point) => [...point]);
  const reverse = JSON.stringify(points) > JSON.stringify(points.toReversed());
  const ordered = reverse ? points.toReversed() : points;
  const result: SharedGuidePoint[] = [];
  const protectedPoint = (point: SharedGuidePoint) =>
    [stops.start, stops.end].some((stop) => stop && same(point, stop));
  for (const point of ordered) {
    if (result.length > 0 && same(result.at(-1)!, point)) continue;
    while (result.length > 1 && !protectedPoint(result.at(-1)!)) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (same(a, point)) {
        result.pop();
        break;
      }
      if (
        a[2] !== b[2] ||
        b[2] !== point[2] ||
        ![0, 1].every(
          (i) =>
            b[i] >= Math.min(a[i], point[i]) &&
            b[i] <= Math.max(a[i], point[i]),
        ) ||
        orient2d(
          rational(a[0]),
          rational(a[1]),
          rational(b[0]),
          rational(b[1]),
          rational(point[0]),
          rational(point[1]),
        ) !== 0
      )
        break;
      result.pop();
    }
    if (result.length === 0 || !same(result.at(-1)!, point))
      result.push([...point]);
  }
  return reverse ? result.toReversed() : result;
}
