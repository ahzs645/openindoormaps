import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import building from "~/data/building";
import { normalizeFloorValue } from "./floor-utils";

function isPolygonFeature(
  feature: GeoJSON.Feature,
): feature is GeoJSON.Feature<GeoJSON.Polygon> {
  return (
    feature?.geometry?.type === "Polygon" &&
    feature?.properties?.feature_type === "unit"
  );
}

const indoorMap = building.indoor_map as GeoJSON.FeatureCollection;
const unitFeatures = indoorMap.features.filter((element) =>
  isPolygonFeature(element),
);
const poiMap = new Map<number, GeoJSON.Feature<GeoJSON.Point>[]>();

unitFeatures.forEach((unitFeature) => {
  poiMap.set(Number(unitFeature.id), []);
});

(building.pois.features as GeoJSON.Feature<GeoJSON.Point>[]).forEach(
  (poiFeature) => {
    const poiCoordinates = poiFeature.geometry.coordinates;
    const poiFloor = normalizeFloorValue(poiFeature.properties?.floor) ?? 0;

    for (const unitFeature of unitFeatures) {
      const unitFloor = normalizeFloorValue(unitFeature.properties?.level_id);
      if (unitFloor !== null && unitFloor !== poiFloor) {
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

export default poiMap;
