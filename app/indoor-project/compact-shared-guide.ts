import type { SharedGuidePoint } from "./shared-corridor-guides";

export type SharedGuideStops = {
  start?: SharedGuidePoint;
  end?: SharedGuidePoint;
};

/** Proposal only: keep each complete outer doorway approach, and replace
 * only the through-run between its center stops. The caller must recheck
 * continuous clearance and policy over every segment, including approaches.
 */
export function compactSharedGuideProposal(
  points: SharedGuidePoint[],
  stops: SharedGuideStops,
) {
  const clone = (p: SharedGuidePoint): SharedGuidePoint => [...p];
  if (points.length < 2 || points.some((p) => p[2] !== points[0][2]))
    return points.map(clone);
  const same = (p: SharedGuidePoint, q: SharedGuidePoint | undefined) =>
    !!q && p.every((v, k) => v === q[k]);
  const start = stops.start
    ? points.findIndex((p) => same(p, stops.start))
    : -1;
  const end = stops.end ? points.findLastIndex((p) => same(p, stops.end)) : -1;
  const first = Math.max(start, 0);
  const last = end < 0 ? points.length - 1 : end;
  if (first >= last) return points.map(clone);
  return [...points.slice(0, first + 1), ...points.slice(last)].map(clone);
}
