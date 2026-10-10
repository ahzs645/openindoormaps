import type { FeatureCollection, Geometry, Position } from "geojson";

export type GeoJsonStatistics = {
  features: number;
  vertices: number;
  propertyKeys: number;
  /** Rough JSON size of properties (strings by length, other values 8 B). */
  propertyBytes: number;
  /** Rough structured-clone payload: 16 B per vertex plus properties. */
  estimatedBytes: number;
};

/** Diagnostics only: scalar size of a collection handed to a map source.
 * Walks geometry/properties once; callers gate it behind the opt-in flag. */
export function geoJsonStatistics(
  collection: FeatureCollection | undefined,
): GeoJsonStatistics {
  let vertices = 0,
    propertyKeys = 0,
    propertyBytes = 0;
  const positions = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number") {
      vertices++;
      return;
    }
    for (const item of value as Position[]) positions(item);
  };
  const geometry = (g: Geometry | null | undefined): void => {
    if (!g) return;
    if (g.type === "GeometryCollection") {
      for (const part of g.geometries) geometry(part);
      return;
    }
    positions(g.coordinates);
  };
  const size = (value: unknown, depth = 0): number => {
    if (typeof value === "string") return value.length + 2;
    if (value === null || typeof value !== "object" || depth > 6) return 8;
    let bytes = 2;
    for (const item of Object.values(value)) bytes += size(item, depth + 1) + 1;
    return bytes;
  };
  for (const feature of collection?.features ?? []) {
    geometry(feature.geometry);
    const properties = feature.properties ?? {};
    for (const [key, value] of Object.entries(properties)) {
      propertyKeys++;
      propertyBytes += key.length + 3 + size(value);
    }
  }
  const features = collection?.features.length ?? 0;
  return {
    features,
    vertices,
    propertyKeys,
    propertyBytes,
    estimatedBytes: vertices * 16 + propertyBytes,
  };
}
