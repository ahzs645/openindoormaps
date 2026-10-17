import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { PreparedDisplayPayload } from "../../app/indoor-project/prepared-display-assets";
import { nativeRampPlanDrawing } from "../../app/indoor-project/ramp-plan";

/** Low-zoom paint from the same original visible stair surfaces used in 2D,
 * plus original ramp display triangles. This does not fill a slab aperture,
 * infer a landing from a room outline, or confer navigation permission. */
export function overviewConnectorSurfaces(
  data: IndoorDataset,
  payload: PreparedDisplayPayload,
  levelIds: readonly number[],
  building: string,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      ...payload.preparedFloor.nativeStairs.features
        .filter((feature) => feature.properties?.overhead !== true)
        .map((feature) => {
          const p = feature.properties;
          if (!p)
            throw new Error("Prepared stair surface has no source properties.");
          return {
            type: "Feature" as const,
            geometry: feature.geometry,
            properties: {
              id: p.id,
              stairElementId: p.stairElementId,
              runElementId: p.runElementId,
              surfaceKind: p.surfaceKind,
              levelId: p.levelId,
              color: p.color,
              circulation: true,
              roomKeys: [],
              connectorPlan: "original-prepared-stair",
              sourceModelSha256: data.source.modelSha256,
            },
          };
        }),
      ...nativeRampPlanDrawing(data, levelIds, building).features.map(
        (feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            roomKeys: [],
            connectorPlan: "original-display-ramp",
          },
        }),
      ),
    ],
  };
}
