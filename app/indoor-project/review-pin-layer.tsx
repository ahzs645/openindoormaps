import { useEffect, useMemo } from "react";
import type {
  CustomLayerInterface,
  GeoJSONSource,
  MapMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import { nativeEditPoint, type EditPoint } from "./map-edits";
import { projectRoofLabel } from "./roof-label-layer";
import { floorHeightDatum, surfaceElevationFeet } from "./relative-heights";
import type { ReviewPin } from "./review-pins";
export function ReviewPinLayer({
  data,
  pins,
  levelIds,
  visible,
  relativeHeights = false,
  placing,
  selected,
  onPlace,
  onSelect,
  onFitReady,
}: {
  data: IndoorDataset;
  pins: ReviewPin[];
  levelIds: number[];
  visible: boolean;
  relativeHeights?: boolean;
  placing: boolean;
  selected: string;
  onPlace: (point: EditPoint) => void;
  onSelect: (id: string) => void;
  onFitReady: (fit: () => void) => void;
}) {
  const { map, isLoaded } = useMap();
  const features = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: pins
        .filter((p) => levelIds.includes(p.levelId))
        .map((pin) => ({
          type: "Feature",
          properties: { id: pin.id, label: pin.label },
          geometry: {
            type: "Point",
            coordinates: geographicPoint(data, pin.pointFeet),
          },
        })),
    }),
    [data, pins, levelIds],
  );
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.addSource("project-review-pins", { type: "geojson", data: features });
    map.addLayer({
      id: "project-review-pin-dot",
      source: "project-review-pins",
      type: "circle",
      paint: {
        "circle-radius": 8,
        "circle-color": "#c026d3",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 3,
        "circle-pitch-alignment": "viewport",
      },
    });
    map.addLayer({
      id: "project-review-pin-label",
      source: "project-review-pins",
      type: "symbol",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-font": ["Noto Sans Regular"],
        "text-offset": [0, 1.7],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#a21caf",
        "text-halo-color": "#fff",
        "text-halo-width": 2,
      },
    });
    return () => {
      if (!map.getStyle()) return;
      for (const id of ["project-review-pin-label", "project-review-pin-dot"])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("project-review-pins"))
        map.removeSource("project-review-pins");
    };
  }, [map, isLoaded]);
  useEffect(() => {
    if (!map || !isLoaded || !map.getSource("project-review-pins")) return;
    (map.getSource("project-review-pins") as GeoJSONSource).setData(features);
    for (const id of ["project-review-pin-dot", "project-review-pin-label"])
      map.setLayoutProperty(
        id,
        "visibility",
        visible && !relativeHeights ? "visible" : "none",
      );
    map.setPaintProperty("project-review-pin-dot", "circle-radius", [
      "case",
      ["==", ["get", "id"], selected],
      11,
      8,
    ]);
    map.getContainer().classList.toggle("project-placing-review-pin", placing);
    if (placing) map.getCanvas().style.cursor = "crosshair";
    if (map.getLayer("project-relative-review-pins"))
      map.removeLayer("project-relative-review-pins");
    if (relativeHeights && visible) {
      const datum = floorHeightDatum(data, levelIds);
      let overlay: HTMLDivElement;
      const entries: {
        button: HTMLButtonElement;
        point: number[];
        height: number;
      }[] = [];
      const layer: CustomLayerInterface = {
        id: "project-relative-review-pins",
        type: "custom",
        renderingMode: "2d",
        onAdd() {
          overlay = document.createElement("div");
          Object.assign(overlay.style, {
            position: "absolute",
            inset: "0",
            pointerEvents: "none",
            overflow: "hidden",
            zIndex: "3",
          });
          map.getCanvasContainer().append(overlay);
          for (const pin of pins.filter((p) => levelIds.includes(p.levelId))) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "project-relative-review-pin";
            button.setAttribute("aria-label", pin.label);
            button.textContent = pin.label;
            button.dataset.selected = String(pin.id === selected);
            button.addEventListener("click", (event) => {
              event.stopPropagation();
              onSelect(pin.id);
            });
            overlay.append(button);
            entries.push({
              button,
              point: geographicPoint(data, pin.pointFeet),
              height:
                (surfaceElevationFeet(data, pin.levelId, pin.pointFeet) -
                  datum) *
                  data.alignment.verticalMetresPerFoot +
                0.12,
            });
          }
        },
        render(_, args) {
          for (const e of entries) {
            const p = projectRoofLabel(
              args.defaultProjectionData.mainMatrix,
              e.point[0],
              e.point[1],
              e.height,
              map.getCanvas().clientWidth,
              map.getCanvas().clientHeight,
            );
            e.button.style.display = p ? "block" : "none";
            if (p) {
              e.button.style.left = `${p.x}px`;
              e.button.style.top = `${p.y}px`;
            }
          }
        },
        onRemove() {
          overlay?.remove();
        },
      };
      map.addLayer(layer);
    }
    const click = (e: MapMouseEvent) => {
      if (!visible) return;
      if (placing) onPlace(nativeEditPoint(data, e.lngLat.toArray()));
      else {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ["project-review-pin-dot"],
        });
        if (hits[0]?.properties?.id) onSelect(String(hits[0].properties.id));
      }
    };
    map.on("click", click);
    const chosen = pins.find(
      (pin) => pin.id === selected && levelIds.includes(pin.levelId),
    );
    if (chosen)
      onFitReady(() =>
        map.jumpTo({
          center: geographicPoint(data, chosen.pointFeet),
          zoom: 22,
        }),
      );
    return () => {
      map.off("click", click);
      if (placing) map.getCanvas().style.cursor = "";
      map.getContainer().classList.remove("project-placing-review-pin");
      if (!map.getStyle()) return;
      if (map.getLayer("project-relative-review-pins"))
        map.removeLayer("project-relative-review-pins");
    };
  }, [
    map,
    isLoaded,
    features,
    visible,
    relativeHeights,
    placing,
    selected,
    onPlace,
    onSelect,
    data,
    pins,
    levelIds,
    onFitReady,
  ]);
  return null;
}
