import * as DMath from "./deterministic-math";
import type { CorridorXY } from "./corridor-centerline";

/** Legacy doorway-normal elbow offsets, in feet. */
export const CORRIDOR_APPROACH_ELBOW_FEET = [0.5, 1, 2, 3] as const;

export type CorridorApproachShape =
  | "door-normal"
  | "straight"
  | "projected-elbow"
  | "elbow";

export type CorridorApproachProposal = {
  /** Terminal-owned approach, from the original terminal to `point`. */
  path: CorridorXY[];
  /** Receiving join on the segment. */
  point: CorridorXY;
  /** Position of `point` on the receiving segment, in [0, 1]. */
  fraction: number;
  shape: CorridorApproachShape;
  /** Geometric approach length in feet. */
  length: number;
  /** A drawing preference only: never a physical or access predicate. */
  cost: number;
};

const pathLength = (path: readonly CorridorXY[]) =>
  path
    .slice(1)
    .reduce(
      (sum, point, i) =>
        sum + DMath.hypot(point[0] - path[i][0], point[1] - path[i][1]),
      0,
    );

/** Projection of `p` on segment `a`-`b`, with exact endpoint copies. */
export function corridorSegmentProjection(
  p: CorridorXY,
  a: CorridorXY,
  b: CorridorXY,
): { point: CorridorXY; fraction: number } | null {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    squared = dx * dx + dy * dy;
  if (squared === 0) return null;
  const fraction = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / squared),
  );
  return {
    fraction,
    point:
      fraction === 0
        ? [...a]
        : fraction === 1
          ? [...b]
          : [a[0] + fraction * dx, a[1] + fraction * dy],
  };
}

/** First crossing of the original doorway normal ray with segment `a`-`b`.
 * Returns the ray distance `t` and the receiving fraction, or null. */
export function corridorDoorNormalHit(
  origin: CorridorXY,
  direction: CorridorXY,
  a: CorridorXY,
  b: CorridorXY,
): { t: number; point: CorridorXY; fraction: number } | null {
  const magnitude = DMath.hypot(direction[0], direction[1]);
  if (!(magnitude > 0)) return null;
  const nx = direction[0] / magnitude,
    ny = direction[1] / magnitude;
  const ex = b[0] - a[0],
    ey = b[1] - a[1];
  const denominator = nx * ey - ny * ex;
  // A segment parallel to the ray cannot be a perpendicular branch target.
  if (Math.abs(denominator) <= 1e-12 * DMath.hypot(ex, ey)) return null;
  const wx = a[0] - origin[0],
    wy = a[1] - origin[1];
  const t = (wx * ey - wy * ex) / denominator;
  const fraction = (wx * ny - wy * nx) / denominator;
  if (!(t > 0) || fraction < 0 || fraction > 1) return null;
  const point: CorridorXY =
    fraction === 0
      ? [...a]
      : fraction === 1
        ? [...b]
        : [a[0] + fraction * ex, a[1] + fraction * ey];
  return { t, point, fraction };
}

/** Ordered approach proposals from one original terminal to one receiving
 * segment. Each is only a proposal: the caller must check the complete path
 * against the terminal's own exact physical support and recheck both receiving
 * pieces of the segment at the proposed join.
 *
 * With `shaped`, cleaner geometry is proposed first:
 *  1. a straight branch along the original doorway normal to its crossing
 *     with the segment (a perpendicular door branch),
 *  2. a straight branch to the terminal's projection,
 *  3. a doorway-normal elbow whose second leg is perpendicular to the segment
 *     and which never runs past the receiving line (no sawtooth),
 * and the legacy candidates follow as the fallback (a legacy elbow that runs
 * past its receiving point is tried last). `cost` ranks proposals on
 * different segments for the attachment chooser. Without
 * `shaped`, exactly the legacy list is returned, in the legacy order.
 */
export function corridorTerminalApproachProposals(
  terminal: { point: CorridorXY; approachDirection?: CorridorXY },
  a: CorridorXY,
  b: CorridorXY,
  options: { shaped: boolean; maxFeet: number },
): CorridorApproachProposal[] {
  const projection = corridorSegmentProjection(terminal.point, a, b);
  if (!projection) return [];
  const proposals: CorridorApproachProposal[] = [];
  const add = (
    path: CorridorXY[],
    point: CorridorXY,
    fraction: number,
    shape: CorridorApproachShape,
  ) => {
    const length = pathLength(path);
    proposals.push({
      path,
      point,
      fraction,
      shape,
      length,
      // Elbows are preferred less than straight branches, and a sawtooth
      // elbow that runs past its receiving line is the last resort.
      cost:
        length +
        (shape === "projected-elbow" ? 1 : shape === "elbow" ? 2 : 0) +
        (shape === "elbow" && overshoots(path) ? 6 : 0),
    });
  };
  const direction = terminal.approachDirection;
  const magnitude = direction ? DMath.hypot(direction[0], direction[1]) : 0;
  const unit: CorridorXY | null =
    direction && magnitude > 0
      ? [direction[0] / magnitude, direction[1] / magnitude]
      : null;
  if (options.shaped && unit) {
    const hit = corridorDoorNormalHit(terminal.point, unit, a, b);
    const perpendicular = DMath.hypot(
      projection.point[0] - terminal.point[0],
      projection.point[1] - terminal.point[1],
    );
    // A grazing crossing of an oblique segment is not a cleaner branch.
    if (hit && hit.t <= options.maxFeet && hit.t <= 1.5 * perpendicular + 1)
      add([terminal.point, hit.point], hit.point, hit.fraction, "door-normal");
  }
  add(
    [terminal.point, projection.point],
    projection.point,
    projection.fraction,
    "straight",
  );
  if (options.shaped && unit)
    for (const distance of CORRIDOR_APPROACH_ELBOW_FEET) {
      const elbow: CorridorXY = [
        terminal.point[0] + unit[0] * distance,
        terminal.point[1] + unit[1] * distance,
      ];
      const foot = corridorSegmentProjection(elbow, a, b)!;
      // The second leg must continue away from the doorway: an elbow at or
      // beyond the receiving line would draw a reversal.
      const ahead =
        (foot.point[0] - elbow[0]) * unit[0] +
        (foot.point[1] - elbow[1]) * unit[1];
      if (!(ahead > 0)) continue;
      if (
        DMath.hypot(
          foot.point[0] - terminal.point[0],
          foot.point[1] - terminal.point[1],
        ) > options.maxFeet
      )
        continue;
      add(
        [terminal.point, elbow, foot.point],
        foot.point,
        foot.fraction,
        "projected-elbow",
      );
    }
  if (unit)
    for (const distance of CORRIDOR_APPROACH_ELBOW_FEET)
      add(
        [
          terminal.point,
          [
            terminal.point[0] + unit[0] * distance,
            terminal.point[1] + unit[1] * distance,
          ],
          projection.point,
        ],
        projection.point,
        projection.fraction,
        "elbow",
      );
  if (!options.shaped) return proposals;
  // Fixed shape priority; a sawtooth legacy elbow is tried last.
  const rank = (proposal: CorridorApproachProposal) =>
    proposal.shape === "elbow" && overshoots(proposal.path) ? 1 : 0;
  return proposals
    .map((proposal, index) => ({ proposal, index }))
    .sort((x, y) => rank(x.proposal) - rank(y.proposal) || x.index - y.index)
    .map(({ proposal }) => proposal);
}

/** True when the last leg of a three-point approach turns back by more than
 * 90 degrees, i.e. the elbow ran past its receiving point. */
function overshoots(path: readonly CorridorXY[]) {
  if (path.length !== 3) return false;
  const [a, b, c] = path;
  return (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0;
}
