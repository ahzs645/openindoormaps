import indoorMapData from "./indoor-map.geojson";
import indoorRouteData from "./indoor-routes.geojson";
import poiData from "./pois.geojson";

export const indoorMap = indoorMapData as GeoJSON.FeatureCollection;
export const indoorRoutes = indoorRouteData as GeoJSON.FeatureCollection;
export const pois = poiData as GeoJSON.FeatureCollection;
