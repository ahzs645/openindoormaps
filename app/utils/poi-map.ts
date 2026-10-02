import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import type { LocationConfig } from "~/types/location";

function isPolygonFeature(
  feature: GeoJSON.Feature,
): feature is GeoJSON.Feature<GeoJSON.Polygon> {
  return (
    feature?.geometry?.type === "Polygon" &&
    feature?.properties?.feature_type === "unit"
  );
}

export function buildPoiMap(
  location: LocationConfig,
): Map<number, GeoJSON.Feature<GeoJSON.Point>[]> {
  const unitFeatures = location.data.indoorMap.features.filter((element) =>
    isPolygonFeature(element),
  );
  const poiMap = new Map<number, GeoJSON.Feature<GeoJSON.Point>[]>();

  unitFeatures.forEach((unitFeature) => {
    poiMap.set(Number(unitFeature.id), []);
  });

  (location.data.pois.features as GeoJSON.Feature<GeoJSON.Point>[]).forEach(
    (poiFeature) => {
      const poiCoordinates = poiFeature.geometry.coordinates;

      for (const unitFeature of unitFeatures) {
        const unitLevel = unitFeature.properties?.level_id;
        const poiLevel = poiFeature.properties?.floor;
        if (
          typeof unitLevel === "number" &&
          typeof poiLevel === "number" &&
          unitLevel !== poiLevel
        ) {
          continue;
        }
        const unitBuilding = unitFeature.properties?.building_id;
        const poiBuilding = poiFeature.properties?.building_id;
        if (
          unitBuilding != null &&
          poiBuilding != null &&
          unitBuilding !== poiBuilding
        ) {
          continue;
        }
        if (
          booleanPointInPolygon(
            poiCoordinates,
            unitFeature as GeoJSON.Feature<GeoJSON.Polygon>,
          )
        ) {
          poiMap.get(Number(unitFeature.id))?.push(poiFeature);
          break;
        }
      }
    },
  );

  return poiMap;
}
