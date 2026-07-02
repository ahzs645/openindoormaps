import { useEffect } from "react";
import type { LayerSpecification } from "maplibre-gl";
import { useMap } from "./map";

const BUILDINGS_LAYER_ID = "basemap-3d-buildings";
const OPENMAPTILES_SOURCE_ID = "openmaptiles";
const BUILDING_SOURCE_LAYER = "building";

function hasOpenMapTilesBuildingsSource(map: maplibregl.Map) {
  return Boolean(map.getSource(OPENMAPTILES_SOURCE_ID));
}

function getFirstSymbolLayerId(map: maplibregl.Map) {
  const style = map.getStyle();
  return style.layers?.find((layer) => layer.type === "symbol")?.id;
}

function makeBuildingsLayer(): LayerSpecification {
  return {
    filter: [
      "all",
      ["has", "render_height"],
      [">", ["coalesce", ["get", "render_height"], 0], 0],
    ],
    id: BUILDINGS_LAYER_ID,
    minzoom: 15,
    paint: {
      "fill-extrusion-base": [
        "interpolate",
        ["linear"],
        ["zoom"],
        15,
        0,
        16,
        ["coalesce", ["get", "render_min_height"], 0],
      ],
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "render_height"], 0],
        0,
        "#d8d6d0",
        120,
        "#b7c4cf",
        260,
        "#9fb8d0",
      ],
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        15,
        0,
        16,
        ["coalesce", ["get", "render_height"], 0],
      ],
      "fill-extrusion-opacity": 0.72,
    },
    source: OPENMAPTILES_SOURCE_ID,
    "source-layer": BUILDING_SOURCE_LAYER,
    type: "fill-extrusion",
  };
}

interface Basemap3dBuildingsLayerProps {
  enabled?: boolean;
}

export function Basemap3dBuildingsLayer({
  enabled = false,
}: Basemap3dBuildingsLayerProps) {
  const { isLoaded, map } = useMap();

  useEffect(() => {
    if (!enabled) return;
    if (!isLoaded || !map) return;
    if (map.getLayer(BUILDINGS_LAYER_ID)) return;
    if (!hasOpenMapTilesBuildingsSource(map)) return;

    map.addLayer(makeBuildingsLayer(), getFirstSymbolLayerId(map));

    return () => {
      if (map.getLayer(BUILDINGS_LAYER_ID)) {
        map.removeLayer(BUILDINGS_LAYER_ID);
      }
    };
  }, [enabled, isLoaded, map]);

  return null;
}
