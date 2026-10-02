import type { CustomLayerInterface, Map } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import {
  projectRoofLabel,
  roofLabelCollides,
  type LabelBox,
} from "./roof-label-layer";
import {
  zoomFade,
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
} from "./zoom-presentation";
import { connectorSvg, type ConnectorKind } from "./connector-markers";
export function connectorMarkerLayer(
  markers: FeatureCollection<Point>,
  three: boolean,
  onPick: (kind: "area" | "edge", id: string) => void,
  preserveHeight = false,
): CustomLayerInterface {
  let overlay: HTMLDivElement, map: Map;
  let entries: {
    button: HTMLButtonElement;
    coordinates: number[];
    height: number;
  }[] = [];
  return {
    id: "project-connector-markers",
    type: "custom",
    renderingMode: "2d",
    onAdd(instance) {
      map = instance;
      overlay = document.createElement("div");
      overlay.dataset.testid = "project-connector-markers";
      Object.assign(overlay.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: "2",
      });
      map.getCanvasContainer().append(overlay);
      entries = markers.features.map((f) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "project-connector-marker";
        const label = String(f.properties?.name);
        button.setAttribute("aria-label", label);
        button.title =
          label + (f.properties?.review ? " · entrance needs review" : "");
        button.dataset.review = String(!!f.properties?.review);
        button.dataset.kind = String(f.properties?.kind);
        button.dataset.roomKey = String(f.properties?.key ?? "");
        button.dataset.stairElementId = String(
          f.properties?.stairElementId ?? "",
        );
        button.dataset.edgeId = String(f.properties?.id ?? "");
        button.dataset.nativeElementId = String(
          f.properties?.nativeElementId ?? "",
        );
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${connectorSvg(f.properties?.kind as ConnectorKind)}</svg>`;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onPick(
            f.properties?.key ? "area" : "edge",
            String(f.properties?.key ?? f.properties?.id),
          );
        });
        overlay.append(button);
        return {
          button,
          coordinates: f.geometry.coordinates,
          height: three ? Number(f.properties?.heightMetres ?? 0.65) : 0.03,
        };
      });
    },
    render(_, args) {
      if (!overlay) return;
      const width = map.getCanvas().clientWidth,
        height = map.getCanvas().clientHeight;
      const accepted: LabelBox[] = [];
      const size = Math.max(22, Math.min(30, 22 + (map.getZoom() - 18) * 3));
      for (const e of entries) {
        const p =
          map.getZoom() > 17.5
            ? projectRoofLabel(
                args.defaultProjectionData.mainMatrix,
                e.coordinates[0],
                e.coordinates[1],
                e.height *
                  (preserveHeight
                    ? 1
                    : zoomFade(
                        map.getZoom(),
                        ROOM_DETAIL_START,
                        ROOM_DETAIL_END,
                      )),
                width,
                height,
              )
            : undefined;
        const box = p
          ? {
              left: p.x - size / 2,
              top: p.y - size / 2,
              right: p.x + size / 2,
              bottom: p.y + size / 2,
            }
          : undefined;
        if (!p || !box || roofLabelCollides(box, accepted)) {
          e.button.style.display = "none";
          continue;
        }
        accepted.push(box);
        Object.assign(e.button.style, {
          display: "grid",
          opacity: String(zoomFade(map.getZoom(), 17.5, 18.5)),
          pointerEvents: map.getZoom() < 17.8 ? "none" : "auto",
          left: `${p.x}px`,
          top: `${p.y}px`,
          width: `${size}px`,
          height: `${size}px`,
        });
      }
    },
    onRemove() {
      overlay?.remove();
      entries = [];
    },
  };
}
