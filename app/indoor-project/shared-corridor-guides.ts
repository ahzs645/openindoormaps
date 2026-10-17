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
export function straightenSharedGuideProposal(
  points: SharedGuidePoint[],
  shortHooks = true,
  preservePoint: (point: SharedGuidePoint) => boolean = () => false,
) {
  const result: SharedGuidePoint[] = [];
  for (const point of removeSharedGuideRetraces(points)) {
    while (result.length >= 2) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (preservePoint(b)) break;
      if (a[2] !== b[2] || b[2] !== point[2]) break;
      const ux = b[0] - a[0],
        uy = b[1] - a[1];
      const vx = point[0] - b[0],
        vy = point[1] - b[1];
      const scale = DMath.hypot(ux, uy) * DMath.hypot(vx, vy);
      const collinear = Math.abs(ux * vy - uy * vx) <= 1e-12 * scale;
      // Remove only short reversing hooks. Long bends and ordinary junctions
      // retain their shared lane. The caller rechecks the entire candidate and
      // falls back to the original if any real obstruction needs this hook.
      const shortReverse =
        shortHooks &&
        ux * vx + uy * vy < 0 &&
        Math.min(DMath.hypot(ux, uy), DMath.hypot(vx, vy)) <= 3;
      if (!collinear && !shortReverse) break;
      result.pop();
    }
    result.push([...point]);
  }
  return removeSharedGuideRetraces(result);
}

/** Simplify an already checked shared guide one local hook at a time. A real
 * obstruction can retain its own bend without retaining every other hook.
 * Chords need current continuous clearance and the complete trial path must
 * preserve crossing policy. Canonical orientation makes opposite journeys
 * choose the same geometry. No original point or graph identity is mutated. */
export function simplifyCheckedSharedGuide(
  points: SharedGuidePoint[],
  supportsChord: (a: SharedGuidePoint, b: SharedGuidePoint) => boolean,
  policyAllows: (points: SharedGuidePoint[]) => boolean,
  maximumChecks = 32,
  preservePoint: (point: SharedGuidePoint) => boolean = () => false,
) {
  const reverse =
    points.length > 1 &&
    JSON.stringify(points[0]) > JSON.stringify(points.at(-1));
  let result = (reverse ? points.toReversed() : points).map(
    (p): SharedGuidePoint => [...p],
  );
  let checks = 0;
  for (let i = 1; i < result.length - 1 && checks < maximumChecks; i++) {
    const a = result[i - 1],
      b = result[i],
      c = result[i + 1];
    if (preservePoint(b)) continue;
    if (straightenSharedGuideProposal([a, b, c]).length !== 2) continue;
    checks++;
    if (!supportsChord(a, c)) continue;
    const trial = [...result.slice(0, i), ...result.slice(i + 1)];
    if (!policyAllows(reverse ? trial.toReversed() : trial)) continue;
    result = trial;
    i = Math.max(0, i - 2);
  }
  return reverse ? result.toReversed() : result;
}
export const corridorGuideLength = (points: readonly (readonly number[])[]) =>
  points
    .slice(1)
    .reduce(
      (sum, point, i) =>
        sum + DMath.hypot(point[0] - points[i][0], point[1] - points[i][1]),
      0,
    );
