import { useEffect, useMemo } from "react";
import type {
  GeoJSONSource,
  FilterSpecification,
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
  hospitalStyle?: boolean;
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
  hospitalStyle = false,
): GeoJSON.FeatureCollection {
  return {
    ...data,
    features: data.features
      .filter((feature) => {
        if (feature.properties?.map_label === false) return false;
        const poiFloor =
          feature.properties?.display_floor ?? feature.properties?.floor;
        return (
          poiFloor === floor || poiFloor === null || poiFloor === undefined
        );
      })
      .map((feature) => {
        if (!hospitalStyle) return feature;
        const logo = feature.properties?.metadata?.logo;
        const mapIcon =
          typeof logo === "string" && logo.startsWith("/assets/bc-hospital/")
            ? `hospital-${logo.split("/").pop()}`
            : "";
        return {
          ...feature,
          properties: { ...feature.properties, map_icon: mapIcon },
        };
      }),
  };
}

export function PoisLayer({
  data,
  floor,
  theme,
  hospitalStyle = false,
}: PoisLayerProps) {
  const { isLoaded, map } = useMap();
  const filteredData = useMemo(
    () => filterPoisData(data, floor, hospitalStyle),
    [data, floor, hospitalStyle],
  );

  useEffect(() => {
    if (!isLoaded || !map) return;

    const colors = getPoiColors(theme);
    const layers: LayerSpecification[] = [
      {
        id: "point",
        ...(hospitalStyle && {
          filter: ["==", ["get", "map_icon"], ""] as FilterSpecification,
        }),
        minzoom: 16,
        paint: {
          "circle-color": hospitalStyle
            ? [
                "coalesce",
                ["get", "category_color", ["get", "metadata"]],
                colors.circle,
              ]
            : colors.circle,
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
          "text-size": hospitalStyle
            ? ["case", ["==", ["get", "type"], "building"], 18, 13]
            : 12,
          ...(hospitalStyle && {
            "icon-image": ["get", "map_icon"],
            "icon-size": 0.8,
            "icon-optional": true,
            "text-offset": [1.6, 0],
          }),
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
  }, [isLoaded, map, theme, hospitalStyle]);

  useEffect(() => {
    if (!isLoaded || !map) return;

    const source = map.getSource(POIS_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(filteredData);
  }, [filteredData, isLoaded, map]);

  useEffect(() => {
    if (!map || !isLoaded || !hospitalStyle) return;
    let cancelled = false;
    const logos = new Map<string, string>();
    for (const feature of filteredData.features) {
      const icon = feature.properties?.map_icon;
      const logo = feature.properties?.metadata?.logo;
      if (icon && typeof logo === "string") logos.set(icon, logo);
    }
    void Promise.all(
      [...logos].map(async ([id, url]) => {
        if (map.hasImage(id)) return;
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          if (cancelled) return;
          const canvas = document.createElement("canvas");
          canvas.width = 80;
          canvas.height = 80;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.fillStyle = "#ffffff";
          context.beginPath();
          context.arc(40, 40, 39, 0, Math.PI * 2);
          context.fill();
          context.drawImage(image, 18, 18, 44, 44);
          if (!map.hasImage(id))
            map.addImage(id, context.getImageData(0, 0, 80, 80), {
              pixelRatio: 2,
            });
        } catch {
          /* Keep the destination label when an optional logo is unavailable. */
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [filteredData, map, isLoaded, hospitalStyle]);

  return null;
}
