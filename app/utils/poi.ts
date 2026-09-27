import type { POI, POIMetadata } from "~/types/poi";

/**
 * Flattens a POI GeoJSON feature (from `location.data.pois`) into the
 * {@link POI} shape used by search and the discovery panel.
 */
export function poiFromFeature(feature: GeoJSON.Feature<GeoJSON.Point>): POI {
  const properties = feature.properties ?? {};
  return {
    id: Number(properties.id ?? feature.id),
    name: String(properties.name ?? ""),
    coordinates: feature.geometry.coordinates,
    floor: typeof properties.floor === "number" ? properties.floor : undefined,
    type: properties.type,
    metadata: properties.metadata as POIMetadata | undefined,
  };
}

export function findPoiById(
  pois: GeoJSON.FeatureCollection,
  id: number,
): POI | null {
  const feature = pois.features.find(
    (candidate) => Number(candidate.properties?.id ?? candidate.id) === id,
  );
  return feature?.geometry.type === "Point"
    ? poiFromFeature(feature as GeoJSON.Feature<GeoJSON.Point>)
    : null;
}
