import { useEffect, useMemo, useRef } from "react";
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import { useMap } from "~/components/map/map";
import type { IndoorFeature, IndoorMapGeoJSON } from "~/types/geojson";

const INDOOR_SOURCE_ID = "indoor-map";
const INDOOR_LAYER_IDS = [
  "indoor-map-fill",
  "indoor-map-fill-outline",
  "indoor-map-extrusion",
  "indoor-map-fill-extrusion",
  "indoor-map-wall-line",
];

interface IndoorMapLayersProps {
  data: IndoorMapGeoJSON;
  floor: number;
  theme: string;
}

function getIndoorColors(theme: string) {
  if (theme === "dark") {
    return {
      corridor: "#030712",
      outline: "#1f2937",
      unit: "#1f2937",
      unitHovered: "#374151",
      wall: "#94a3b8",
    };
  }

  return {
    corridor: "#d6d5d1",
    outline: "#a6a5a2",
    unit: "#f3f3f3",
    unitHovered: "#e0e0e0",
    wall: "#6b7280",
  };
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    features: [],
    type: "FeatureCollection",
  };
}

function filterIndoorMapData(
  data: IndoorMapGeoJSON,
  floor: number,
): IndoorMapGeoJSON {
  return {
    ...data,
    features: data.features.filter(
      (feature: IndoorFeature) =>
        feature.properties.level_id === floor ||
        feature.properties.level_id === null,
    ),
  };
}

function removeIndoorMapLayers(map: MapLibreMap) {
  try {
    for (const layerId of [...INDOOR_LAYER_IDS].reverse()) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }

    if (map.getSource(INDOOR_SOURCE_ID)) {
      map.removeSource(INDOOR_SOURCE_ID);
    }
  } catch {
    // The map may already be tearing down during route or style changes.
  }
}

export function getAvailableFloors(data: IndoorMapGeoJSON): number[] {
  const floors = new Set<number>([0]);

  for (const feature of data.features) {
    if (feature.properties.level_id !== null) {
      floors.add(feature.properties.level_id);
    }
  }

  return [...floors].sort((a, b) => b - a);
}

export function IndoorMapLayers({ data, floor, theme }: IndoorMapLayersProps) {
  const { isLoaded, map } = useMap();
  const hoveredFeatureIdRef = useRef<number | string | null>(null);
  const filteredData = useMemo(
    () => filterIndoorMapData(data, floor),
    [data, floor],
  );

  useEffect(() => {
    if (!isLoaded || !map) return;

    const colors = getIndoorColors(theme);
    const layers: LayerSpecification[] = [
      {
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          ["!=", ["get", "feature_type"], "floor_outline"],
        ],
        id: "indoor-map-fill",
        paint: {
          "fill-color": ["coalesce", ["get", "fill"], colors.corridor],
        },
        source: INDOOR_SOURCE_ID,
        type: "fill",
      },
      {
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          ["!=", ["get", "feature_type"], "floor_outline"],
        ],
        id: "indoor-map-fill-outline",
        paint: {
          "line-color": ["coalesce", ["get", "stroke"], colors.outline],
          "line-opacity": ["coalesce", ["get", "stroke-opacity"], 1],
          "line-width": ["coalesce", ["get", "stroke-width"], 2],
        },
        source: INDOOR_SOURCE_ID,
        type: "line",
      },
      {
        filter: ["all", ["==", ["get", "feature_type"], "unit"]],
        id: "indoor-map-extrusion",
        paint: {
          "fill-extrusion-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            colors.unitHovered,
            colors.unit,
          ],
          "fill-extrusion-height": 2.5,
          "fill-extrusion-opacity": 1,
        },
        source: INDOOR_SOURCE_ID,
        type: "fill-extrusion",
      },
      {
        filter: ["all", ["==", ["get", "feature_type"], "corridor"]],
        id: "indoor-map-fill-extrusion",
        paint: {
          "fill-extrusion-color": colors.corridor,
          "fill-extrusion-height": 0.2,
          "fill-extrusion-opacity": 1,
        },
        source: INDOOR_SOURCE_ID,
        type: "fill-extrusion",
      },
      {
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["get", "feature_type"], "wall"],
          ["!=", ["get", "is_pillar_like"], true],
        ],
        id: "indoor-map-wall-line",
        paint: {
          "line-color": ["coalesce", ["get", "stroke"], colors.wall],
          "line-opacity": 0.85,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            16,
            0.7,
            20,
            2.2,
          ],
        },
        source: INDOOR_SOURCE_ID,
        type: "line",
      },
    ];

    if (!map.getSource(INDOOR_SOURCE_ID)) {
      map.addSource(INDOOR_SOURCE_ID, {
        data: emptyFeatureCollection(),
        type: "geojson",
      });
    }

    for (const layer of layers) {
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer);
      }
    }

    const clearHoveredFeature = () => {
      if (hoveredFeatureIdRef.current === null) return;
      map.setFeatureState(
        {
          id: hoveredFeatureIdRef.current,
          source: INDOOR_SOURCE_ID,
        },
        { hover: false },
      );
      hoveredFeatureIdRef.current = null;
    };

    const handleMouseMove = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.id === undefined) return;

      if (hoveredFeatureIdRef.current !== feature.id) {
        clearHoveredFeature();
      }

      hoveredFeatureIdRef.current = feature.id;
      map.setFeatureState(
        {
          id: feature.id,
          source: INDOOR_SOURCE_ID,
        },
        { hover: true },
      );
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      clearHoveredFeature();
      map.getCanvas().style.cursor = "";
    };

    map.on("mousemove", "indoor-map-extrusion", handleMouseMove);
    map.on("mouseleave", "indoor-map-extrusion", handleMouseLeave);

    return () => {
      map.off("mousemove", "indoor-map-extrusion", handleMouseMove);
      map.off("mouseleave", "indoor-map-extrusion", handleMouseLeave);
      removeIndoorMapLayers(map);
      hoveredFeatureIdRef.current = null;
    };
  }, [isLoaded, map, theme]);

  useEffect(() => {
    if (!isLoaded || !map) return;

    const source = map.getSource(INDOOR_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(filteredData);
  }, [filteredData, isLoaded, map]);

  return null;
}
