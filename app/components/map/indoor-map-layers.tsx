import { useEffect, useMemo, useRef } from "react";
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import { useMap } from "~/components/map/map";
import { MapLibreGlIndoorDirectionsDefaultConfiguration } from "~/indoor-directions/types";
import type { IndoorFeature, IndoorMapGeoJSON } from "~/types/geojson";
import { POIS_SOURCE_ID } from "./pois-layer";

const INDOOR_SOURCE_ID = "indoor-map";

/** Sources drawn above the floor plan: the active route and POI markers. */
const OVERLAY_SOURCE_IDS = new Set([
  POIS_SOURCE_ID,
  MapLibreGlIndoorDirectionsDefaultConfiguration.sourceName,
]);

/**
 * Indoor layers are added asynchronously (after icon loading, and again on
 * theme changes), so appending them would cover the route line and POI
 * markers that were added earlier. Insert below the first overlay instead.
 */
function firstOverlayLayerId(map: MapLibreMap): string | undefined {
  return map
    .getStyle()
    .layers.find(
      (layer) => "source" in layer && OVERLAY_SOURCE_IDS.has(layer.source),
    )?.id;
}
const INDOOR_LAYER_IDS = [
  "indoor-map-fill",
  "indoor-map-fill-outline",
  "indoor-map-extrusion",
  "indoor-map-fill-extrusion",
  "indoor-map-wall-line",
  "indoor-map-vertical-fill",
  "indoor-map-vertical-hatch",
  "indoor-map-vertical-detail",
  "indoor-map-vertical-label",
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
      vertical: {
        stairs: "#78350f",
        escalator: "#9a3412",
        elevator: "#5b21b6",
        ramp: "#065f46",
        fallback: "#374151",
      },
    };
  }

  return {
    corridor: "#d6d5d1",
    outline: "#a6a5a2",
    unit: "#f3f3f3",
    unitHovered: "#e0e0e0",
    wall: "#6b7280",
    vertical: {
      stairs: "#fbbf24",
      escalator: "#fb923c",
      elevator: "#a78bfa",
      ramp: "#34d399",
      fallback: "#d1d5db",
    },
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
          "fill-opacity": ["coalesce", ["get", "fill-opacity"], 1],
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 16, 0.7, 20, 2.2],
        },
        source: INDOOR_SOURCE_ID,
        type: "line",
      },
      {
        filter: ["==", ["get", "feature_type"], "vertical_connection"],
        id: "indoor-map-vertical-fill",
        paint: {
          "fill-color": [
            "match",
            ["get", "connection_type"],
            "stairs",
            colors.vertical.stairs,
            "escalator",
            colors.vertical.escalator,
            "elevator",
            colors.vertical.elevator,
            "ramp",
            colors.vertical.ramp,
            colors.vertical.fallback,
          ],
          "fill-opacity": 0.75,
        },
        source: INDOOR_SOURCE_ID,
        type: "fill",
      },
      {
        filter: ["==", ["get", "feature_type"], "vertical_connection"],
        id: "indoor-map-vertical-hatch",
        paint: {
          "line-color": colors.outline,
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.9,
          "line-width": 1.2,
        },
        source: INDOOR_SOURCE_ID,
        type: "line",
      },
      {
        filter: ["==", ["get", "feature_type"], "vertical_detail"],
        id: "indoor-map-vertical-detail",
        paint: {
          "line-color": theme === "dark" ? "#e5e7eb" : "#1f2937",
          "line-opacity": 0.9,
          "line-width": 1.6,
        },
        source: INDOOR_SOURCE_ID,
        type: "line",
      },
      {
        filter: ["==", ["get", "feature_type"], "vertical_connection"],
        id: "indoor-map-vertical-label",
        layout: {
          "icon-allow-overlap": true,
          "icon-anchor": "bottom",
          "icon-image": [
            "match",
            ["get", "connection_type"],
            "stairs",
            "vc-stairs",
            "escalator",
            "vc-escalator",
            "elevator",
            "vc-elevator",
            "vc-stairs",
          ],
          "icon-size": 0.8,
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 6,
          "text-offset": [0, 0.2],
          "text-size": 11,
        },
        paint: {
          "text-color": colors.wall,
          "text-halo-blur": 1,
          "text-halo-color": colors.unit,
          "text-halo-width": 1.5,
        },
        source: INDOOR_SOURCE_ID,
        type: "symbol",
      },
    ];

    if (!map.getSource(INDOOR_SOURCE_ID)) {
      map.addSource(INDOOR_SOURCE_ID, {
        data: emptyFeatureCollection(),
        type: "geojson",
      });
    }

    let cancelled = false;
    const iconFiles: [string, string][] = [
      ["vc-stairs", "/images/vendor-reference-icons/stairs.png"],
      ["vc-escalator", "/images/vendor-reference-icons/escalator.png"],
      ["vc-elevator", "/images/vendor-reference-icons/elevator.png"],
    ];

    Promise.all(
      iconFiles.map(async ([id, url]) => {
        if (map.hasImage(id)) return;
        try {
          const image = await map.loadImage(url);
          if (!map.hasImage(id)) {
            map.addImage(id, image.data);
          }
        } catch {
          // icon unavailable; symbol layer falls back to text-only
        }
      }),
    ).then(() => {
      if (cancelled) return;
      const beforeId = firstOverlayLayerId(map);
      for (const layer of layers) {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer, beforeId);
        }
      }
    });

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
      cancelled = true;
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
