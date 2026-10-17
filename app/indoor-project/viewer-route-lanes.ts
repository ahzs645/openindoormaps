import { routeLanes as originalRouteLanes } from "./route-lanes";

export const MAX_VIEWER_LANE_GRID_POINTS = 128;

/** Lane search is optional path refinement. Large grids retain the original
 * centering algorithm's continuously checked guide/elbow fallbacks. Returning
 * null never supplies a path or skips any support, obstacle or policy check. */
export function routeLanes(
  ...args: Parameters<typeof originalRouteLanes>
): ReturnType<typeof originalRouteLanes> {
  const [xs, ys] = args;
  if (xs.length * ys.length > MAX_VIEWER_LANE_GRID_POINTS) return null;
  return originalRouteLanes(...args);
}
