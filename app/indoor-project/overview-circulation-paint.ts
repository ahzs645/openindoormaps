import type { FeatureCollection } from "geojson";
import { HALLWAY_COLOR } from "./display-passages";

/** A native face may have a neutral copy followed by a circulation copy.
 * Give coincident copies the same low-zoom tint. Require an existing green
 * circulation feature with the same identity and exact drawing geometry. */
export function consistentOverviewCirculation<T extends FeatureCollection>(
  value: T,
): T {
  const candidates = new Set(
    value.features
      .filter(
        (f) =>
          f.properties?.color === HALLWAY_COLOR &&
          f.properties.circulation !== true &&
          f.properties.restricted !== true &&
          Number.isFinite(f.properties.levelId) &&
          typeof f.properties.nativeRegionId === "string",
      )
      .map((f) => `${f.properties!.levelId}|${f.properties!.nativeRegionId}`),
  );
  if (!candidates.size) return value;
  const approved = new Map<string, Set<string>>();
  for (const feature of value.features) {
    const p = feature.properties,
      id = `${p?.levelId}|${p?.nativeRegionId}`;
    if (
      !candidates.has(id) ||
      p?.circulation !== true ||
      p.color !== HALLWAY_COLOR ||
      p.restricted === true
    )
      continue;
    let geometries = approved.get(id);
    if (!geometries) approved.set(id, (geometries = new Set()));
    geometries.add(JSON.stringify(feature.geometry));
  }
  let changed = false;
  const features = value.features.map((feature) => {
    const p = feature.properties,
      id = `${p?.levelId}|${p?.nativeRegionId}`;
    if (
      p?.color !== HALLWAY_COLOR ||
      p.circulation === true ||
      p.restricted === true ||
      !approved.get(id)?.has(JSON.stringify(feature.geometry))
    )
      return feature;
    changed = true;
    return { ...feature, properties: { ...p, circulation: true } };
  });
  return changed ? { ...value, features } : value;
}
