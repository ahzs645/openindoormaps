import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

/** Keep unsupported source contours available for selection and review without
 * presenting their irregular edges as physical room boundaries to visitors. */
export function visitorRoomSurfaces<T extends Polygon | MultiPolygon>(
  areas: FeatureCollection<T>,
  review: boolean,
): FeatureCollection<T> {
  return review
    ? areas
    : {
        ...areas,
        features: areas.features.filter(
          (f) => f.properties?.boundaryReviewRequired !== true,
        ),
      };
}
