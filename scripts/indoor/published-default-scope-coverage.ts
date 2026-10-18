import type { IndoorDataset } from "../../app/indoor-project/contract";
import { nativePhysicalDisplayPlanes } from "../../app/indoor-project/native-display-planes";
import { publishedScopeFor } from "../../app/indoor-project/published-project-scope";
import type { ProgressiveManifest } from "../../app/indoor-project/progressive-delivery";

/** Enumerate the actual page's native 2D choices, including its Main default.
 * Combined campus floors are still required for the ordinary 3D view. Checking
 * only a manifest's own scopes misses absent subset/physical-plane assets. */
export function publishedDefaultScopeCoverage(
  data: IndoorDataset,
  manifest: ProgressiveManifest,
) {
  return data.floors.flatMap((floor) => {
    const requests = [
      { planeId: "combined", label: floor.name, levelIds: floor.levelIds },
      ...(data.nativeIndoorEnvelopes
        ? nativePhysicalDisplayPlanes(data, floor.id).map((plane) => ({
            planeId: plane.id,
            label: `${floor.name} · ${plane.label}`,
            levelIds: plane.levelIds,
          }))
        : []),
    ];
    return requests.map((request) => ({
      ...request,
      floorId: floor.id,
      scopeId: publishedScopeFor(manifest, {
        data,
        levelIds: request.levelIds,
        building: "all",
        relativeHeights: false,
        showPillars: true,
        showPassThroughPlaces: false,
        showVestibuleDoors: false,
        showStructures: false,
        showDoorwayRecesses: false,
        review: false,
        simplifyGeometry: false,
      })?.id,
    }));
  });
}
