import { useEffect, useMemo } from "react";
import {
  LngLatBounds,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import { relativeHeightGeometry } from "./relative-heights";
import { wallReviewFeatures } from "./wall-review";

export type WallCapture = () => Promise<{ png: Uint8Array; camera: unknown }>;
export function WallReviewLayer({
  data,
  levelIds,
  building,
  active,
  selected,
  three,
  relativeHeights = false,
  onPick,
  onCaptureReady,
  onFitReady,
}: {
  data: IndoorDataset;
  levelIds: number[];
  building: string;
  active: boolean;
  selected: string;
  three: boolean;
  relativeHeights?: boolean;
  onPick: (kind: "wall", id: string) => void;
  onCaptureReady: (capture: WallCapture) => void;
  onFitReady: (fit: () => void) => void;
}) {
  const { map, isLoaded } = useMap();
  const features = useMemo(() => {
    const walls = wallReviewFeatures(data, levelIds, building);
    return relativeHeights
      ? relativeHeightGeometry(data, levelIds, walls, "wall")
      : walls;
  }, [data, levelIds, building, relativeHeights]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.addSource("project-review-walls", {
      type: "geojson",
      data: features,
      maxzoom: 22,
      tolerance: 0,
    });
    map.addLayer({
      id: "project-review-wall-fill",
      type: "fill",
      source: "project-review-walls",
      paint: { "fill-color": "#da8424", "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: "project-review-wall-boxes",
      type: "fill-extrusion",
      source: "project-review-walls",
      paint: {
        "fill-extrusion-color": "#da8424",
        "fill-extrusion-height": 0.66,
        "fill-extrusion-opacity": 0.3,
      },
    });
    map.addLayer({
      id: "project-review-wall-outline",
      type: "line",
      source: "project-review-walls",
      paint: { "line-color": "#b26d20", "line-width": 1 },
    });
    onCaptureReady(
      () =>
        new Promise((resolve, reject) => {
          const timer = globalThis.setTimeout(() => {
            map.off("render", capture);
            reject(new Error("Map capture timed out. Try again."));
          }, 5000);
          const capture = () => {
            globalThis.clearTimeout(timer);
            try {
              const encoded = map
                .getCanvas()
                .toDataURL("image/png")
                .split(",")[1];
              resolve({
                png: Uint8Array.from(atob(encoded), (c) => c.codePointAt(0)!),
                camera: {
                  center: map.getCenter().toArray(),
                  zoom: map.getZoom(),
                  bearing: map.getBearing(),
                  pitch: map.getPitch(),
                  viewport: {
                    width: map.getCanvas().width,
                    height: map.getCanvas().height,
                  },
                },
              });
            } catch (error) {
              reject(error);
            }
          };
          map.once("render", capture);
          map.triggerRepaint();
        }),
    );
    return () => {
      for (const id of [
        "project-review-wall-outline",
        "project-review-wall-boxes",
        "project-review-wall-fill",
      ])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("project-review-walls"))
        map.removeSource("project-review-walls");
    };
  }, [map, isLoaded, onCaptureReady]);
  useEffect(() => {
    if (!map || !isLoaded || !map.getSource("project-review-walls")) return;
    (map.getSource("project-review-walls") as GeoJSONSource).setData(features);
    map.setPaintProperty(
      "project-review-wall-boxes",
      "fill-extrusion-base",
      relativeHeights ? ["get", "base"] : 0,
    );
    map.setPaintProperty(
      "project-review-wall-boxes",
      "fill-extrusion-height",
      relativeHeights ? ["+", ["get", "base"], 0.66] : 0.66,
    );
    for (const id of [
      "project-review-wall-fill",
      "project-review-wall-outline",
      "project-review-wall-boxes",
    ])
      map.setLayoutProperty(
        id,
        "visibility",
        active && (id !== "project-review-wall-boxes" || three)
          ? "visible"
          : "none",
      );
    // In 3D use a raised translucent footprint. Selection remains visible over room roofs.
    map.setPaintProperty(
      "project-review-wall-fill",
      "fill-opacity",
      three ? 0 : ["case", ["==", ["get", "key"], selected], 0.65, 0.12],
    );
    map.setPaintProperty("project-review-wall-boxes", "fill-extrusion-color", [
      "case",
      ["==", ["get", "key"], selected],
      "#ff7000",
      "#da8424",
    ]);
    map.setPaintProperty("project-review-wall-outline", "line-width", [
      "case",
      ["==", ["get", "key"], selected],
      4,
      0.7,
    ]);
    map.setPaintProperty("project-review-wall-outline", "line-color", [
      "case",
      ["==", ["get", "key"], selected],
      "#ff7000",
      "#b26d20",
    ]);
    if (active) map.getCanvas().style.cursor = "crosshair";
    const pick = (e: MapMouseEvent) => {
      if (!active) return;
      const hits = map.queryRenderedFeatures(
        [
          [e.point.x - 3, e.point.y - 3],
          [e.point.x + 3, e.point.y + 3],
        ],
        {
          layers: [
            three ? "project-review-wall-boxes" : "project-review-wall-fill",
          ],
        },
      );
      hits.sort(
        (a, b) =>
          Number(a.properties?.areaFeet2) - Number(b.properties?.areaFeet2),
      );
      if (hits[0]?.properties?.key)
        onPick("wall", String(hits[0].properties.key));
    };
    map.on("click", pick);
    if (active && selected)
      onFitReady(() => {
        const chosen = features.features.find(
          (f) => f.properties?.key === selected,
        );
        if (!chosen) return;
        const extent = new LngLatBounds();
        for (const p of chosen.geometry.coordinates.flat().flat())
          extent.extend(p as [number, number]);
        map.fitBounds(extent, {
          padding: 80,
          maxZoom: 22,
          pitch: three ? 55 : 0,
          duration: 600,
        });
      });
    return () => {
      map.off("click", pick);
      if (active) map.getCanvas().style.cursor = "";
    };
  }, [
    map,
    isLoaded,
    features,
    active,
    selected,
    three,
    relativeHeights,
    onPick,
    onFitReady,
  ]);
  return null;
}
