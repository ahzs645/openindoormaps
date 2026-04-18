import raftData from "./rafturi.geojson";
import routeData from "./traseu.geojson";
import poiData from "./puncte_rafturi.geojson";
import boundaryData from "./limita_magazin.geojson";

function unwrapMultiPolygon(
  feature: GeoJSON.Feature,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  if (feature.geometry.type === "MultiPolygon") {
    return (feature.geometry as GeoJSON.MultiPolygon).coordinates.map(
      (coords) => ({
        ...feature,
        id: feature.id ?? feature.properties?.Id,
        geometry: {
          type: "Polygon" as const,
          coordinates: coords,
        },
      }),
    );
  }
  return [feature as GeoJSON.Feature<GeoJSON.Polygon>];
}

function unwrapMultiLineString(
  feature: GeoJSON.Feature,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (feature.geometry.type === "MultiLineString") {
    return (feature.geometry as GeoJSON.MultiLineString).coordinates.map(
      (coords) => ({
        ...feature,
        geometry: {
          type: "LineString" as const,
          coordinates: coords,
        },
      }),
    );
  }
  return [feature as GeoJSON.Feature<GeoJSON.LineString>];
}

function transformIndoorMap(): GeoJSON.FeatureCollection {
  const raftFeatures = (raftData as GeoJSON.FeatureCollection).features.flatMap(
    (feature) =>
      unwrapMultiPolygon(feature).map((f) => ({
        ...f,
        id: f.properties?.Id ?? f.id,
        properties: {
          ...f.properties,
          feature_type: "unit",
          level_id: 0,
          show: "true",
        },
      })),
  );

  const boundaryFeatures = (
    boundaryData as GeoJSON.FeatureCollection
  ).features.flatMap((feature, index) =>
    unwrapMultiPolygon(feature).map((f) => ({
      ...f,
      id: 10_000 + index,
      properties: {
        ...f.properties,
        feature_type: "corridor",
        level_id: null,
        show: "true",
      },
    })),
  );

  return {
    type: "FeatureCollection",
    features: [...raftFeatures, ...boundaryFeatures],
  };
}

function transformIndoorRoutes(): GeoJSON.FeatureCollection {
  const features = (routeData as GeoJSON.FeatureCollection).features.flatMap(
    (feature) =>
      unwrapMultiLineString(feature).map((f) => ({
        ...f,
        properties: {},
      })),
  );

  return {
    type: "FeatureCollection",
    features,
  };
}

function transformPois(): GeoJSON.FeatureCollection {
  const features = (poiData as GeoJSON.FeatureCollection).features.map(
    (feature) => ({
      ...feature,
      properties: {
        id: feature.properties?.Id,
        name: feature.properties?.name,
        type: feature.properties?.type,
        floor: feature.properties?.floor,
        building_id: feature.properties?.buildng_id,
        metadata: {},
      },
    }),
  );

  return {
    type: "FeatureCollection",
    features,
  };
}

export const indoorMap: GeoJSON.FeatureCollection = transformIndoorMap();
export const indoorRoutes: GeoJSON.FeatureCollection = transformIndoorRoutes();
export const pois: GeoJSON.FeatureCollection = transformPois();
