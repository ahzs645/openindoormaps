import { useEffect, useMemo, useRef } from "react";
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import { useMap } from "~/components/map/map";
import { MapLibreGlIndoorDirectionsDefaultConfiguration } from "~/indoor-directions/types";
import type { IndoorMapGeoJSON } from "~/types/geojson";
import { filterIndoorMapData } from "~/utils/indoor-floor-view";
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
  "indoor-map-room-edge-extrusion",
  "indoor-map-connector-extrusion",
  "indoor-map-fill-extrusion",
  "indoor-map-wall-extrusion",
  "indoor-map-area-extrusion",
  "indoor-map-wall-line",
  "indoor-map-vertical-fill",
  "indoor-map-vertical-hatch",
  "indoor-map-vertical-detail",
  "indoor-map-vertical-label",
];

interface IndoorMapLayersProps {
  cutawayRooms?: boolean;
  roomView?: "2d" | "3d";
  data: IndoorMapGeoJSON;
  floorContext?: IndoorMapGeoJSON;
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

export function IndoorMapLayers({
  data,
  floor,
  theme,
  cutawayRooms,
  floorContext,
  roomView,
}: IndoorMapLayersProps) {
  const { isLoaded, map } = useMap();
  const hospitalRoomView = Boolean(roomView);
  const sourceConnectorStyle = data.features.some((feature) =>
    Boolean(feature.properties.connector_style),
  );
  const hasFlatUnits =
    cutawayRooms ||
    data.features.some(
      (feature) =>
        feature.properties.feature_type === "unit" &&
        feature.properties.extrusion_height === 0,
    );
  const hoveredFeatureIdRef = useRef<number | string | null>(null);
  const filteredData = useMemo(
    () =>
      filterIndoorMapData(data, floor, cutawayRooms, roomView, floorContext),
    [data, floor, cutawayRooms, roomView, floorContext],
  );

  useEffect(() => {
    if (!isLoaded || !map) return;

    const colors = getIndoorColors(theme);
    const legacyIconSize = sourceConnectorStyle ? 1 : 0.8;
    const layers: LayerSpecification[] = [
      {
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          ["!=", ["get", "feature_type"], "floor_outline"],
          ["!=", ["get", "feature_type"], "room_edge"],
          ["!=", ["get", "connector_style"], "pointr"],
          ["!=", ["get", "connector_style"], "mappedin"],
        ],
        id: "indoor-map-fill",
        paint: {
          "fill-color": [
            "case",
            [
              "all",
              ["==", ["get", "feature_type"], "unit"],
              ["boolean", ["feature-state", "hover"], false],
            ],
            colors.unitHovered,
            ["coalesce", ["get", "fill"], colors.corridor],
          ],
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
          ["!=", ["get", "feature_type"], "room_edge"],
          ["!=", ["get", "connector_style"], "pointr"],
          ["!=", ["get", "connector_style"], "mappedin"],
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
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          [
            "any",
            ["==", ["get", "feature_type"], "unit"],
            [
              "all",
              ["==", ["get", "feature_type"], "vertical_connection"],
              ["==", ["get", "connector_style"], "mappedin"],
            ],
          ],
          ["!=", ["coalesce", ["get", "extrusion_height"], 2.5], 0],
        ],
        ...(hospitalRoomView && {
          filter: [
            "all",
            ["==", ["get", "feature_type"], "unit"],
            [">", ["get", "extrusion_height"], 0],
          ],
        }),
        id: "indoor-map-extrusion",
        paint: {
          "fill-extrusion-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            colors.unitHovered,
            ["coalesce", ["get", "fill"], colors.unit],
          ],
          "fill-extrusion-height": [
            "coalesce",
            ["get", "extrusion_height"],
            2.5,
          ],
          "fill-extrusion-base": ["coalesce", ["get", "extrusion_base"], 0],
          "fill-extrusion-opacity": 1,
        },
        source: INDOOR_SOURCE_ID,
        type: "fill-extrusion",
      },
      {
        id: "indoor-map-connector-extrusion",
        layout: { visibility: hospitalRoomView ? "visible" : "none" },
        type: "fill-extrusion",
        source: INDOOR_SOURCE_ID,
        filter: [
          "all",
          ["==", ["get", "connector_style"], "mappedin"],
          [">", ["get", "extrusion_height"], 0],
        ],
        paint: {
          "fill-extrusion-color": ["get", "fill"],
          "fill-extrusion-height": ["get", "extrusion_height"],
          "fill-extrusion-base": ["get", "extrusion_base"],
          "fill-extrusion-opacity": 0.6,
        },
      },
      {
        id: "indoor-map-room-edge-extrusion",
        type: "fill-extrusion",
        source: INDOOR_SOURCE_ID,
        filter: ["==", ["get", "feature_type"], "room_edge"],
        paint: {
          "fill-extrusion-color": ["get", "fill"],
          "fill-extrusion-height": ["get", "extrusion_height"],
          "fill-extrusion-base": ["get", "extrusion_base"],
        },
      },
      {
        filter: [
          "all",
          ["==", ["get", "feature_type"], "corridor"],
          ["!=", ["coalesce", ["get", "extrusion_height"], 0.2], 0],
        ],
        id: "indoor-map-fill-extrusion",
        paint: {
          "fill-extrusion-color": [
            "coalesce",
            ["get", "fill"],
            colors.corridor,
          ],
          "fill-extrusion-height": [
            "coalesce",
            ["get", "extrusion_height"],
            0.2,
          ],
          "fill-extrusion-base": ["coalesce", ["get", "extrusion_base"], 0],
          "fill-extrusion-opacity": 1,
        },
        source: INDOOR_SOURCE_ID,
        type: "fill-extrusion",
      },
      {
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["get", "feature_type"], "wall"],
        ],
        id: "indoor-map-wall-extrusion",
        paint: {
          "fill-extrusion-color": ["coalesce", ["get", "fill"], colors.wall],
          "fill-extrusion-height": [
            "coalesce",
            ["get", "extrusion_height"],
            0.75,
          ],
          "fill-extrusion-base": ["coalesce", ["get", "extrusion_base"], 0],
          "fill-extrusion-opacity": 1,
        },
        source: INDOOR_SOURCE_ID,
        type: "fill-extrusion",
      },
      {
        filter: [
          "all",
          ["==", ["get", "feature_type"], "area"],
          [">", ["coalesce", ["get", "extrusion_height"], 0], 0],
        ],
        id: "indoor-map-area-extrusion",
        paint: {
          "fill-extrusion-color": ["coalesce", ["get", "fill"], colors.wall],
          "fill-extrusion-height": [
            "+",
            ["coalesce", ["get", "extrusion_height"], 0],
            ["coalesce", ["get", "extrusion_base"], 0],
          ],
          "fill-extrusion-base": ["coalesce", ["get", "extrusion_base"], 0],
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
            "coalesce",
            ["get", "fill"],
            [
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
          ],
          "fill-opacity": ["coalesce", ["get", "fill-opacity"], 0.75],
        },
        source: INDOOR_SOURCE_ID,
        type: "fill",
      },
      {
        filter: [
          "all",
          ["==", ["get", "feature_type"], "vertical_connection"],
          ["!=", ["get", "connector_style"], "pointr"],
          ["!=", ["get", "connector_style"], "mappedin"],
        ],
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
        filter: [
          "all",
          ["==", ["get", "feature_type"], "vertical_connection"],
          ["!=", ["get", "view_context"], true],
        ],
        id: "indoor-map-vertical-label",
        minzoom: hospitalRoomView ? 18.2 : 0,
        layout: {
          "icon-allow-overlap": !sourceConnectorStyle,
          "icon-anchor": "bottom",
          "icon-image": [
            "match",
            ["get", "connection_type"],
            "stairs",
            hospitalRoomView ? "hospital-vc-stairs" : "vc-stairs",
            "escalator",
            "vc-escalator",
            "elevator",
            hospitalRoomView ? "hospital-vc-elevator" : "vc-elevator",
            hospitalRoomView ? "hospital-vc-stairs" : "vc-stairs",
          ],
          "icon-size": hospitalRoomView ? 0.65 : legacyIconSize,
          "text-field": ["coalesce", ["get", "display_label"], ["get", "name"]],
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
    if (hospitalRoomView) {
      for (const kind of ["stairs", "elevator"]) {
        const id = `hospital-vc-${kind}`;
        if (map.hasImage(id)) continue;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 80;
        const context = canvas.getContext("2d");
        if (!context) continue;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(40, 40, 39, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#00629d";
        context.beginPath();
        context.arc(40, 40, 32, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#ffffff";
        context.lineWidth = 4;
        context.lineJoin = "round";
        context.beginPath();
        if (kind === "stairs") {
          context.moveTo(20, 57);
          context.lineTo(31, 57);
          context.lineTo(31, 45);
          context.lineTo(43, 45);
          context.lineTo(43, 33);
          context.lineTo(58, 33);
        } else {
          context.strokeRect(22, 20, 36, 40);
          context.moveTo(32, 48);
          context.lineTo(32, 31);
          context.lineTo(27, 36);
          context.moveTo(32, 31);
          context.lineTo(37, 36);
          context.moveTo(48, 31);
          context.lineTo(48, 48);
          context.lineTo(43, 43);
          context.moveTo(48, 48);
          context.lineTo(53, 43);
        }
        context.stroke();
        map.addImage(id, context.getImageData(0, 0, 80, 80), { pixelRatio: 2 });
      }
    }
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

    const handleFlatUnitMouseMove = (event: MapLayerMouseEvent) => {
      const p = event.features?.[0]?.properties;
      if (p?.feature_type === "unit" && p.extrusion_height === 0) {
        handleMouseMove(event);
      } else {
        handleMouseLeave();
      }
    };

    map.on("mousemove", "indoor-map-extrusion", handleMouseMove);
    map.on("mouseleave", "indoor-map-extrusion", handleMouseLeave);
    if (hasFlatUnits) {
      map.on("mousemove", "indoor-map-fill", handleFlatUnitMouseMove);
      map.on("mouseleave", "indoor-map-fill", handleMouseLeave);
    }

    return () => {
      cancelled = true;
      map.off("mousemove", "indoor-map-extrusion", handleMouseMove);
      map.off("mouseleave", "indoor-map-extrusion", handleMouseLeave);
      if (hasFlatUnits) {
        map.off("mousemove", "indoor-map-fill", handleFlatUnitMouseMove);
        map.off("mouseleave", "indoor-map-fill", handleMouseLeave);
      }
      removeIndoorMapLayers(map);
      hoveredFeatureIdRef.current = null;
    };
  }, [
    isLoaded,
    map,
    theme,
    sourceConnectorStyle,
    hasFlatUnits,
    hospitalRoomView,
  ]);

  useEffect(() => {
    if (!isLoaded || !map) return;

    const source = map.getSource(INDOOR_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(filteredData);
  }, [filteredData, isLoaded, map]);

  return null;
}
