import type { Map as MapLibreMap } from "maplibre-gl";

/** True while `map` is loaded and not removed. Recreating the map (a floor
 * switch releases GPU memory this way) removes the old instance in the same
 * React commit in which child effects still hold it with `isLoaded`; a removed
 * map has no style and throws on getLayer/getSource. */
export function mapReady(
  map: MapLibreMap | null | undefined,
  isLoaded: boolean,
): map is MapLibreMap {
  return !!map && isLoaded && (map as { style?: unknown }).style !== undefined;
}
