import type { FeatureCollection, Polygon } from "geojson";
import type { IndoorDataset } from "./contract";
import {
  nativeMaterialPlanWalls,
  nativeMaterialPlanExactWalls,
} from "./native-material-plan";
import { createNativeRoutingMaterialQuery } from "./native-routing-material";
import { nativeContainedWallDrawing } from "./native-wall-contained-display";
import { geographicPoint } from "./routing";

/** Drawing only: callers first validate the native floor snapshot. Wall
 * detail can finish after its exact floor faces are visible; it never changes
 * their source authority, selection, metadata or navigation. */
export function nativeExploreWallFeatures(
  data: IndoorDataset,
  levelIds: number[],
  exactLevelIds: number[],
): FeatureCollection<Polygon> {
  const features: FeatureCollection<Polygon>["features"] = [];
  if (!data.nativeMaterialSections)
    return { type: "FeatureCollection", features };
  const exactLevels = new Set(exactLevelIds);
  const query = exactLevels.size
    ? createNativeRoutingMaterialQuery(data)
    : undefined;
  for (const levelId of [...new Set(levelIds)]) {
    // Only contained drawing pieces of the exact, aperture-cut source material
    // can supply strict wall paint. Rounded Boolean cuts cannot refill a door.
    const drawings = exactLevels.has(levelId)
      ? nativeMaterialPlanExactWalls(data, levelId, query!).flatMap((wall) =>
          nativeContainedWallDrawing(wall.exactParts).map((ringsFeet) => ({
            ...wall,
            ringsFeet,
          })),
        )
      : nativeMaterialPlanWalls(data, levelId);
    features.push(
      ...drawings
        .filter((wall) => !wall.approximate)
        .map((wall) => ({
          type: "Feature" as const,
          properties: {
            levelId,
            nativeElementId: wall.nativeElementId,
            kind: wall.kind,
            reviewPatchId: wall.reviewPatchId,
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: wall.ringsFeet.map((ring) =>
              [...ring, ring[0]].map((point) => geographicPoint(data, point)),
            ),
          },
        })),
    );
  }
  return { type: "FeatureCollection", features };
}
