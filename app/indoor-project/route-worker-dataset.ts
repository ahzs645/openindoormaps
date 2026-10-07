import type { IndoorDataset } from "./contract";

/** Physical routing evidence stays exact. Render meshes, selection tessellation
 * and authoring issue text are unused by route policy or floor/path validation;
 * sending them to a route worker wastes a large synchronous structured clone. */
export function routeWorkerDataset(data: IndoorDataset): IndoorDataset {
  return {
    ...data,
    presentation: undefined,
    nativeExploreMapping: undefined,
    windowDisplay: undefined,
    stairDisplay: undefined,
    rampDisplay: undefined,
    nativeDisplayScopes: undefined,
    issues: [],
  };
}
