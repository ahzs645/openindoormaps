import type { IndoorDataset } from "./contract";
import { hallwayPathView } from "./hallway-path-view";
import { pathConnections } from "./path-connections";

/** The floor worker and exported inspection use the same saved network.
 * This composes existing display layers; it cannot create a route or access. */
export function pathNetworkView(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  options: { includeSourceFeet?: boolean } = {},
) {
  const hallwayPaths = hallwayPathView(data, levelIds, building, options);
  const displayedWalkingEdges = new Set<string>(
    hallwayPaths.features.flatMap(
      (feature) => feature.properties?.edgeIds ?? [feature.properties?.edgeId],
    ),
  );
  return {
    hallwayPaths,
    pathConnections: pathConnections(
      data,
      levelIds,
      building,
      displayedWalkingEdges,
      options,
    ),
  };
}
