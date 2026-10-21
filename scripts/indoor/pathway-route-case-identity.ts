import type { RouteCase } from "./pathway-candidate-audit";

/** Audit-only case identity; an explicit expectation must survive generated cases. */
export function retainDistinctActualRouteCase(
  test: RouteCase,
  seen: Set<string>,
) {
  const key = JSON.stringify([
    test.start,
    test.end,
    test.mode,
    test.intendedEdgeId,
    test.forbiddenEdgeIds,
    test.expect,
  ]);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
