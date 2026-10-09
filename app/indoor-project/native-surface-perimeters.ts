import type {
  FeatureCollection,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";

type Parts = [number, number][][][];

/** Stroke-only drawing. Fill pieces, exact selection and route authority stay
 * untouched. Each native surface uses its own boundary after visibility cuts,
 * so internal contained-paint edges cannot appear as room partitions. */
export function nativeSurfacePerimeters(
  data: IndoorDataset,
  surfaces: FeatureCollection<Polygon | MultiPolygon>,
): FeatureCollection<MultiLineString> {
  return {
    type: "FeatureCollection",
    features: surfaces.features.map((feature) => {
      const properties = feature.properties;
      let parts: Parts | undefined;
      if (Array.isArray(properties?.nativeBoundaryPartsFeet)) {
        parts = properties.nativeBoundaryPartsFeet as Parts;
      }
      const lines = parts
        ? parts.flatMap((part) =>
            part
              .filter((ring) => ring.length)
              .map((ring) => {
                const last = ring.at(-1)!;
                const closed =
                  last[0] === ring[0][0] && last[1] === ring[0][1]
                    ? ring
                    : [...ring, ring[0]];
                return closed.map((point) => geographicPoint(data, point));
              }),
          )
        : feature.geometry.type === "Polygon"
          ? feature.geometry.coordinates
          : feature.geometry.coordinates.flat();
      return {
        type: "Feature",
        id: feature.id,
        properties: { ...properties, drawingPerimeterOnly: true },
        geometry: { type: "MultiLineString", coordinates: lines },
      };
    }),
  };
}
