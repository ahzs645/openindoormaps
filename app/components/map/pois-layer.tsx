import { useEffect, useMemo } from "react";
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useMap } from "~/components/map/map";

export const POIS_SOURCE_ID = "pois";
const POIS_LAYER_IDS = ["point", "point-label"];

interface PoisLayerProps {
  data: GeoJSON.FeatureCollection;
  floor: number;
  theme: string;
}

function getPoiColors(theme: string) {
  if (theme === "dark") {
    return {
      circle: "#9ca3af",
      halo: "#404040",
      text: "#ffffff",
    };
  }

  return {
    circle: "#695f58",
    halo: "#ffffff",
    text: "#404040",
  };
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    features: [],
    type: "FeatureCollection",
  };
}

function removePoisLayer(map: MapLibreMap) {
  try {
    for (const layerId of [...POIS_LAYER_IDS].reverse()) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }

    if (map.getSource(POIS_SOURCE_ID)) {
      map.removeSource(POIS_SOURCE_ID);
    }
  } catch {
    // The map may already be tearing down during route or style changes.
  }
}

function filterPoisData(
  data: GeoJSON.FeatureCollection,
  floor: number,
): GeoJSON.FeatureCollection {
  return {
    ...data,
    features: data.features.filter((feature) => {
      const poiFloor = feature.properties?.floor;
      return poiFloor === floor || poiFloor === null || poiFloor === undefined;
    }),
  };
}

export function PoisLayer({ data, floor, theme }: PoisLayerProps) {
  const { isLoaded, map } = useMap();
  const filteredData = useMemo(
    () => filterPoisData(data, floor),
    [data, floor],
  );

  useEffect(() => {
    if (!isLoaded || !map) return;

    const colors = getPoiColors(theme);
    const layers: LayerSpecification[] = [
      {
        id: "point",
        minzoom: 16,
        paint: {
          "circle-color": colors.circle,
          "circle-radius": 4,
        },
        source: POIS_SOURCE_ID,
        type: "circle",
      },
      {
        id: "point-label",
        layout: {
          "text-anchor": "left",
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 12,
          "text-offset": [0.8, 0],
          "text-size": 12,
        },
        minzoom: 16,
        paint: {
          "text-color": colors.text,
          "text-halo-color": colors.halo,
          "text-halo-width": 1.5,
        },
        source: POIS_SOURCE_ID,
        type: "symbol",
      },
    ];

    if (!map.getSource(POIS_SOURCE_ID)) {
      map.addSource(POIS_SOURCE_ID, {
        data: emptyFeatureCollection(),
        type: "geojson",
      });
    }

    for (const layer of layers) {
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer);
      }
    }

    return () => removePoisLayer(map);
  }, [isLoaded, map, theme]);

  useEffect(() => {
    if (!isLoaded || !map) return;

    const source = map.getSource(POIS_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(filteredData);
  }, [filteredData, isLoaded, map]);

  return null;
}
