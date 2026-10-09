/** Custom (three.js) layers owned by one mounted prepared floor. Removing a
 * custom layer runs its onRemove, which releases GPU buffers, materials and
 * renderer state; leaving one behind keeps a whole-floor mesh alive. */
export const PREPARED_CUSTOM_LAYER_IDS = [
  "project-connector-markers",
  "project-roof-labels",
  "project-lower-depth",
  "project-descending-stairs",
  "project-native-ramps",
  "project-precision-walls",
  "project-native-window-glass",
  "project-native-window-frames",
] as const;

/** GeoJSON sources emptied while another floor scope is preparing, so the old
 * scope's drawings are neither shown, clickable nor retained by MapLibre. */
export const PREPARED_FLOOR_SOURCE_IDS = [
  "project-overview",
  "project-areas",
  "project-walls",
  "project-network",
  "project-portals",
  "project-route",
  "project-doors",
  "project-lower-rooms",
  "project-labels",
  "project-room-blocks",
  "project-exposed-walls",
  "project-native-stairs",
  "project-selection-areas",
  "project-area-perimeters",
  "project-block-perimeters",
  "project-native-windows",
] as const;

type LayerMap = {
  getStyle(): unknown;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
};
type SourceMap = {
  getSource(id: string): unknown;
};
/** Returns the removed ids. A disposed map (no style) is left untouched. */
export function removePreparedCustomLayers(map: LayerMap): string[] {
  if (!map.getStyle()) return [];
  const removed: string[] = [];
  for (const id of PREPARED_CUSTOM_LAYER_IDS)
    if (map.getLayer(id)) {
      map.removeLayer(id);
      removed.push(id);
    }
  return removed;
}
/** Returns the emptied source ids. */
export function emptyPreparedFloorSources<T>(map: SourceMap, empty: T) {
  const emptied: string[] = [];
  for (const id of PREPARED_FLOOR_SOURCE_IDS) {
    const source = map.getSource(id) as
      | { setData?: (data: T) => unknown }
      | undefined;
    if (source?.setData) {
      source.setData(empty);
      emptied.push(id);
    }
  }
  return emptied;
}
