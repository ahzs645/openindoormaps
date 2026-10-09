import type { FeatureCollection } from "geojson";

// These worker preparation carriers remain on the prepared floor. MapLibre
// uses only the already-contained geographic paint geometry and style/pick
// properties; copying the carriers into every tile neither checks nor uses them.
const preparationProperties = new Set([
  "nativeDisplayExactParts",
  "nativeDisplayResidualParts",
  "nativeDisplayPartsFeet",
  "nativeBoundaryPartsFeet",
  "unchangedIEEEAnchorsFeet",
]);
const drawings = new WeakMap<FeatureCollection, FeatureCollection>();

/** Render transport only. Original exact authorities, residuals, source anchors
 * and geometry objects remain untouched for preparation, hit testing and export.
 * Immutable collection identity also avoids repeat tile-worker uploads. */
export function mapDrawingFeatures<C extends FeatureCollection>(
  collection: C,
): C {
  const cached = drawings.get(collection);
  if (cached) return cached as C;
  let changed = false;
  const features = collection.features.map((feature) => {
    if (
      !feature.properties ||
      !Object.keys(feature.properties).some((key) =>
        preparationProperties.has(key),
      )
    )
      return feature;
    changed = true;
    const properties = Object.fromEntries(
      Object.entries(feature.properties).filter(
        ([key]) => !preparationProperties.has(key),
      ),
    );
    return { ...feature, properties };
  });
  const result = changed ? { ...collection, features } : collection;
  drawings.set(collection, result);
  return result;
}
