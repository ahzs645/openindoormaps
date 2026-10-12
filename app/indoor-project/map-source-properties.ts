import type { Feature, FeatureCollection } from "geojson";

const projections = new WeakMap<FeatureCollection, Map<string, unknown>>();

/** Render transport only: keep geometry (the same objects) and just the
 * properties a source's layers read in paint/layout/filter expressions.
 * Everything else stays on the original features for picking, review and
 * export. MapLibre's worker clones and indexes every property it is given,
 * so unread properties cost tile-worker memory without changing a pixel.
 * Cached per immutable collection and property list. */
export function mapSourceFeatures<C extends FeatureCollection>(
  collection: C,
  keep: readonly string[],
): C {
  const key = keep.join("\u0000");
  let byKeep = projections.get(collection);
  const cached = byKeep?.get(key);
  if (cached) return cached as C;
  const wanted = new Set(keep);
  const features = collection.features.map((feature): Feature => {
    const properties = feature.properties;
    if (!properties) return feature;
    const slim: Record<string, unknown> = {};
    for (const name of Object.keys(properties))
      if (wanted.has(name)) slim[name] = properties[name];
    return { ...feature, properties: slim };
  });
  const result = { ...collection, features } as C;
  if (!byKeep) projections.set(collection, (byKeep = new Map()));
  byKeep.set(key, result);
  return result;
}

/** Every property read by the native explore layers' paint, layout and
 * filter expressions (native-explore-layer.tsx). Picking there uses the
 * worker-side native regions, never rendered feature properties. A unit test
 * checks this list against the layer source. */
export const NATIVE_EXPLORE_PROPERTIES = [
  "color",
  "circulation",
  "restricted",
  "nativeRegionId",
] as const;
