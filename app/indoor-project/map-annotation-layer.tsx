import { useEffect } from "react";
import { Marker, type MapMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import {
  nativeEditPoint,
  shapePoints,
  type EditPoint,
  type MapAnnotation,
} from "./map-edits";

import { editorSymbolSvg } from "./editor-symbols";
import { labelOpacityAtZoom } from "./zoom-presentation";
export type AnnotationTool =
  | "select"
  | "label"
  | "area"
  | "move"
  | "vertex"
  | "rectangle"
  | "circle"
  | "line"
  | "measure"
  | "location";
export function MapAnnotationLayer({
  data,
  annotations,
  levelIds,
  editing,
  tool,
  selectedId,
  draft,
  onPick,
  onPoint,
  opacity = 1,
}: {
  data: IndoorDataset;
  opacity?: number;
  annotations: MapAnnotation[];
  levelIds: number[];
  editing: boolean;
  tool: AnnotationTool;
  selectedId: string;
  draft: EditPoint[];
  onPick: (id: string) => void;
  onPoint: (point: EditPoint) => void;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    map
      .getContainer()
      .classList.toggle(
        "project-placing-annotation",
        editing && tool !== "select",
      );
    const visible = annotations.filter((item) =>
      levelIds.includes(item.levelId),
    );
    const features: Feature<Geometry>[] = visible
      .filter((item) => item.kind !== "label")
      .map((item) => ({
        type: "Feature",
        properties: {
          id: item.id,
          color: item.color,
          selected: selectedId === item.id && editing,
        },
        geometry:
          item.kind === "line"
            ? {
                type: "LineString",
                coordinates: item.pointsFeet.map((p) =>
                  geographicPoint(data, p),
                ),
              }
            : {
                type: "Polygon",
                coordinates: [
                  [...item.pointsFeet, item.pointsFeet[0]].map((p) =>
                    geographicPoint(data, p),
                  ),
                ],
              },
      }));
    if (editing && draft.length > 0)
      features.push({
        type: "Feature",
        properties: { color: "#007d8a", selected: true },
        geometry: {
          type: "LineString",
          coordinates: shapePoints(tool, draft).map((p) =>
            geographicPoint(data, p),
          ),
        },
      });
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features,
    };
    map.addSource("project-annotations", { type: "geojson", data: collection });
    map.addLayer({
      id: "project-annotation-fill",
      type: "fill",
      source: "project-annotations",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 * opacity },
    });
    map.addLayer({
      id: "project-annotation-line",
      type: "line",
      source: "project-annotations",
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["case", ["get", "selected"], 3, 1.5],
        "line-opacity": opacity,
      },
    });
    const markers: Marker[] = [];
    const labelMarkers: Marker[] = [];
    for (const item of visible) {
      const isLocation = item.id.startsWith("location:");
      const element = document.createElement(
        editing || isLocation ? "button" : "div",
      );
      element.className = "project-annotation-label";
      const icon = document.createElement("span");
      icon.innerHTML = editorSymbolSvg(item.symbol);
      const text = document.createElement("span");
      text.textContent = item.text;
      if (item.shape === "measure") {
        const feet = item.pointsFeet
          .slice(1)
          .reduce(
            (sum, p, i) =>
              sum +
              Math.hypot(
                p[0] - item.pointsFeet[i][0],
                p[1] - item.pointsFeet[i][1],
              ),
            0,
          );
        text.textContent += ` · ${(feet * data.alignment.horizontalMetresPerFoot).toFixed(2)} m / ${feet.toFixed(1)} ft`;
      }
      const content = document.createElement("span");
      content.className = "project-annotation-content";
      content.style.transform = `rotate(${item.rotation ?? 0}deg)`;
      content.append(icon, text);
      element.append(content);
      element.dataset.annotationId = item.id;
      element.style.color = item.color;
      element.style.fontSize = `${item.fontSize}px`;
      element.title = item.notes || item.text;
      if (editing || isLocation) {
        element.setAttribute(
          "aria-label",
          `${editing ? "Edit annotation" : "View location"}: ${item.text}`,
        );
        element.setAttribute("aria-pressed", String(selectedId === item.id));
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          onPick(item.id);
        });
      } else element.style.pointerEvents = "none";
      if (editing && tool !== "select") element.style.pointerEvents = "none";
      const marker = new Marker({ element })
        .setLngLat(geographicPoint(data, item.pointsFeet[0]))
        .addTo(map);
      markers.push(marker);
      labelMarkers.push(marker);
    }
    if (editing)
      for (const [index, p] of draft.entries()) {
        const element = document.createElement("div");
        element.className = "project-annotation-corner";
        element.textContent = String(index + 1);
        element.style.pointerEvents = "none";
        markers.push(
          new Marker({ element })
            .setLngLat(geographicPoint(data, p))
            .addTo(map),
        );
      }
    const fadeLabels = () => {
      const alpha = opacity * (editing ? 1 : labelOpacityAtZoom(map.getZoom()));
      for (const marker of labelMarkers) {
        marker.setOpacity(alpha, alpha);
        marker.getElement().style.visibility = alpha > 0 ? "visible" : "hidden";
      }
    };
    fadeLabels();
    map.on("zoom", fadeLabels);
    const click = (event: MapMouseEvent) => {
      if (!editing) return;
      if (tool === "select") {
        const hit = map.queryRenderedFeatures(event.point, {
          layers: ["project-annotation-fill", "project-annotation-line"],
        })[0];
        if (hit?.properties?.id) onPick(String(hit.properties.id));
      } else {
        onPoint(nativeEditPoint(data, [event.lngLat.lng, event.lngLat.lat]));
      }
    };
    map.on("click", click);
    if (editing && tool !== "select")
      map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", click);
      map.off("zoom", fadeLabels);
      map.getCanvas().style.cursor = "";
      map.getContainer().classList.remove("project-placing-annotation");
      for (const marker of markers) marker.remove();
      if (!map.getStyle()) return;
      for (const id of ["project-annotation-line", "project-annotation-fill"])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("project-annotations"))
        map.removeSource("project-annotations");
    };
  }, [
    map,
    isLoaded,
    data,
    annotations,
    levelIds,
    editing,
    tool,
    selectedId,
    draft,
    onPick,
    onPoint,
    opacity,
  ]);
  return null;
}
