import * as DMath from "./deterministic-math";
/** Match the existing narrow-corridor centering limit (24-foot width). */
export const MAX_SHARED_CORRIDOR_APPROACH_FEET = 12;
export type SharedGuidePoint = [number, number, number];

/** Remove an exactly retraced unused doorway spur in joined walking guides.
 * This changes only proposed geometry. Original graph/door identities remain;
 * the complete result must still pass continuous support and crossing policy.
 */
export function removeSharedGuideRetraces(points: SharedGuidePoint[]) {
  const result: SharedGuidePoint[] = [];
  const equal = (a: SharedGuidePoint, b: SharedGuidePoint) =>
    a.every((n, i) => n === b[i]);
  for (const p of points) {
    if (result.length > 0 && equal(result.at(-1)!, p)) continue;
    if (result.length > 1 && equal(result.at(-2)!, p)) {
      result.pop();
      continue;
    }
    result.push([...p]);
  }
  return result;
}
export const corridorGuideLength = (points: readonly (readonly number[])[]) =>
  points
    .slice(1)
    .reduce(
      (sum, point, i) =>
        sum + DMath.hypot(point[0] - points[i][0], point[1] - points[i][1]),
      0,
    );
