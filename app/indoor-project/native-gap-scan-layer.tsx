import { useEffect } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import type { GapScanPreview } from "./native-gap-scan";
import { geographicPoint } from "./routing";
export function NativeGapScanLayer({ data, preview }: { data: IndoorDataset; preview: GapScanPreview }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.addSource("native-connection-preview", { type: "geojson", tolerance: 0, maxzoom: 23, data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "native-connection-preview-fill", type: "fill", source: "native-connection-preview", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["case", ["==", ["get", "side"], 0], "#e4ae43", "#7c73d0"], "fill-opacity": 0.45, "fill-antialias": false } });
    map.addLayer({ id: "native-connection-preview-line", type: "line", source: "native-connection-preview", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#cf2477", "line-width": 5 } });
    // Keep this temporary overlay above the native selection without moving its
    // persistent layer stack or affecting picking / source geometry.
    return () => {
      if (!map.getStyle()) return;
      for (const id of ["native-connection-preview-line", "native-connection-preview-fill"]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("native-connection-preview")) map.removeSource("native-connection-preview");
    };
  }, [map, isLoaded]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    (map.getSource("native-connection-preview") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [
      ...preview.cuts.map(ends => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: ends.map(p => geographicPoint(data, p)) } })),
      ...(preview.displayParts ?? preview.parts.map((ringsFeet, side) => ({ ringsFeet, side }))).map(({ ringsFeet: rings, side }) => ({ type: "Feature" as const, properties: { side }, geometry: { type: "Polygon" as const, coordinates: rings.map(r => [...r, r[0]].map(p => geographicPoint(data, p))) } })),
    ] });
  }, [map, isLoaded, data, preview]);
  return null;
}
