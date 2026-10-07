import type { Feature, Polygon } from "geojson";
import type { IndoorDataset } from "./contract";
import type { NativeExploreResult } from "./native-explore";

/** The current displayed face is the selection geometry. A shared component
 * stays shared; its registered room outlines are identity hints only. */
export function nativeExploreSelectionIds(
  result: NativeExploreResult,
  selected: string,
  picked: readonly string[] = [],
) {
  return result.regions
    .filter((r) =>
      picked.length ? picked.includes(r.id) : r.roomKeys.includes(selected),
    )
    .map((r) => r.id);
}

/** Use the actual uploaded outline polygons, including unioned tiered floor
 * pieces, disconnected parts and interior holes. Never substitute old rings. */
export function nativeExploreSelectionFeatures(
  result: NativeExploreResult,
  selected: string,
): Feature<Polygon>[] {
  const ids = new Set(nativeExploreSelectionIds(result, selected));
  return result.outlines.features.filter((f) =>
    ids.has(String(f.properties?.nativeRegionId)),
  );
}

/** Search may choose a record deliberately absent from the prepared display
 * list. Its outline can locate that identity without drawing an enclosure. */
export function nativeExploreIdentityLocation(
  data: IndoorDataset,
  selected: string,
  levels: readonly number[],
  building: string,
) {
  const room = data.records.find(
    (r) =>
      r.key === selected &&
      levels.includes(r.levelId) &&
      (building === "all" || r.building === building),
  );
  return room?.ringsFeet[0];
}
