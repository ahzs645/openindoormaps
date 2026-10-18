import type { Map as MapLibreMap } from "maplibre-gl";
import { mapReady } from "~/components/map/map-ready";

// Restart with automatic room reveal after the fixed-overview experiment.
// Deliberately ignore the old keep-building-overview.v1 value: a previously
// saved lock must not silently suppress zoom reveal on the updated map.
const key = "openindoormaps.reveal-rooms-on-zoom.v2";
export function loadBuildingOverview(): boolean {
  try {
    // Only an explicit new opt-out keeps the overview fixed. Missing or invalid
    // values restore automatic reveal; the page keeps its existing inverse prop.
    return globalThis.localStorage.getItem(key) === "false";
  } catch {
    return false;
  }
}
export function saveBuildingOverview(enabled: boolean) {
  try {
    globalThis.localStorage.setItem(key, String(!enabled));
  } catch {
    // The setting still works for this visit when browser storage is blocked.
  }
}

/** Keep route controls and map annotations while suppressing all room, selection and structure
 * layers. Restore their previous visibility when leaving the overview. The
 * native floor owns its separate grey/mint paint and detail visibility. */
export function lockBuildingOverviewLayers(map: MapLibreMap): () => void {
  const previous = new Map<string, string>();
  for (const layer of map.getStyle().layers) {
    if (
      !layer.id.startsWith("project-") ||
      (layer.type as string) === "custom" ||
      /^project-(?:overview-|label$|route-|network-|connector-|portal-|entrance-|annotation-|basemap-)/.test(
        layer.id,
      )
    )
      continue;
    previous.set(
      layer.id,
      String(map.getLayoutProperty(layer.id, "visibility") ?? "visible"),
    );
    map.setLayoutProperty(layer.id, "visibility", "none");
  }
  return () => {
    if (!mapReady(map, true)) return;
    for (const [id, visibility] of previous)
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  };
}
