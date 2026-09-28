import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import type { LocationConfig } from "~/types/location";
import { normalizeFloorValue } from "~/utils/floor";

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
      const poiFloor = normalizeFloorValue(poiFeature.properties?.floor);

      for (const unitFeature of unitFeatures) {
        // Units on other floors overlap in 2D; only match the POI's own floor.
        const unitFloor = normalizeFloorValue(unitFeature.properties?.level_id);
        if (poiFloor !== null && unitFloor !== null && unitFloor !== poiFloor) {
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
