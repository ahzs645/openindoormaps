import { useEffect } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import type { PinComparisonMode, PinComparisonResult } from "./pin-comparison";
import { coloredComparisonRegions } from "./patch-comparison-colors";
import { geographicPoint } from "./routing";
export function PinComparisonLayer({
  data,
  result,
  mode,
  showCurrent,
}: {
  data: IndoorDataset;
  result: PinComparisonResult;
  mode: PinComparisonMode;
  showCurrent: boolean;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.addSource("pin-comparison", {
      type: "geojson",
      maxzoom: 23,
      tolerance: 0,
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "pin-comparison-fill",
      type: "fill",
      source: "pin-comparison",
      filter: ["in", ["get", "kind"], ["literal", ["selection", "patch"]]],
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "kind"], "patch"],
          "#d12482",
          ["get", "color"],
        ],
        "fill-opacity": ["case", ["==", ["get", "kind"], "patch"], 0.9, 0.4],
        "fill-antialias": false,
      },
    });
    map.addLayer({
      id: "pin-comparison-outline",
      type: "line",
      source: "pin-comparison",
      filter: ["in", ["get", "kind"], ["literal", ["outline", "patch"]]],
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "kind"], "patch"],
          "#d12482",
          ["get", "color"],
        ],
        "line-width": ["case", ["==", ["get", "kind"], "patch"], 4, 2],
      },
    });
    map.addLayer({
      id: "pin-comparison-current",
      type: "line",
      source: "pin-comparison",
      filter: ["==", ["get", "kind"], "current"],
      paint: {
        "line-color": "#bd6c15",
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
    });
    return () => {
      if (!map.getStyle()) return;
      for (const id of [
        "pin-comparison-current",
        "pin-comparison-outline",
        "pin-comparison-fill",
      ])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("pin-comparison")) map.removeSource("pin-comparison");
    };
  }, [map, isLoaded]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    const polygon = (
      rings: [number, number][][],
      kind: string,
      color = "#bd6c15",
    ) => ({
      type: "Feature" as const,
      properties: { kind, color },
      geometry: {
        type: "Polygon" as const,
        coordinates: rings.map((r) =>
          [...r, r[0]].map((p) => geographicPoint(data, p)),
        ),
      },
    });
    const features = [];
    if (mode === "current-selection" || mode === "updated-selection") {
      for (const { region, color } of coloredComparisonRegions(
        result,
        mode === "updated-selection",
      )) {
        features.push(
          ...region.displayPartsFeet.map((r) => polygon(r, "selection", color)),
        );
        features.push(polygon(region.ringsFeet, "outline", color));
      }
    }
    if (showCurrent && result.current && mode !== "current-selection")
      features.push(polygon(result.current.ringsFeet, "current"));
    if (mode === "patch" || mode === "updated-selection")
      features.push(
        ...result.patches.map((p) => polygon(p.ringsFeet, "patch")),
      );
    (map.getSource("pin-comparison") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });
  }, [map, isLoaded, data, result, mode, showCurrent]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    const points = (
      result.currentRegions ?? (result.current ? [result.current] : [])
    )
      .flatMap((r) => r.ringsFeet[0])
      .map((p) => geographicPoint(data, p));
    if (!points.length) return;
    map.fitBounds(
      [
        [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
        ],
        [
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      ],
      { padding: 44, maxZoom: 22, duration: 250 },
    );
  }, [map, isLoaded, data, result]);
  return null;
}
