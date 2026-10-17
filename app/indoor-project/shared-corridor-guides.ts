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

/** Average-axis projections differ by a few floating-point ulps. Remove their
 * redundant intermediate vertices (including an unused overshoot) before the
 * caller's continuous physical/policy checks. This numeric proposal alone has
 * no authority to erase a real bend, doorway or obstacle. */
export function straightenSharedGuideProposal(points: SharedGuidePoint[]) {
  const result: SharedGuidePoint[] = [];
  for (const point of removeSharedGuideRetraces(points)) {
    while (result.length >= 2) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (a[2] !== b[2] || b[2] !== point[2]) break;
      const ux = b[0] - a[0],
        uy = b[1] - a[1];
      const vx = point[0] - b[0],
        vy = point[1] - b[1];
      const scale = DMath.hypot(ux, uy) * DMath.hypot(vx, vy);
      if (Math.abs(ux * vy - uy * vx) > 1e-12 * scale) break;
      result.pop();
    }
    result.push([...point]);
  }
  return removeSharedGuideRetraces(result);
}
export const corridorGuideLength = (points: readonly (readonly number[])[]) =>
  points
    .slice(1)
    .reduce(
      (sum, point, i) =>
        sum + DMath.hypot(point[0] - points[i][0], point[1] - points[i][1]),
      0,
    );
