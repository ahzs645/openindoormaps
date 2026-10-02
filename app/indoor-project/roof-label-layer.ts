import maplibregl, { type CustomLayerInterface } from "maplibre-gl";
const { MercatorCoordinate } = maplibregl;
import type { FeatureCollection, Point } from "geojson";
import { labelOpacityAtZoom, ROOM_DETAIL_ZOOM } from "./zoom-presentation";
import { visitorLabelPadding, visitorLabelBudget } from "./visitor-labels";
import { DEFAULT_LABEL_SETTINGS, type LabelSettings } from "./label-settings";

export type RoofLabel = {
  key: string;
  name: string;
  longitude: number;
  latitude: number;
  landmark: boolean;
  heightMetres: number;
  minZoom: number;
  maxZoom: number;
  compactName: string;
  fullNameZoom: number;
  priority: number;
  selected: boolean;
};
export type LabelBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
/** Project presentation altitude through the supported custom-layer matrix.
 * Never move graph nodes or alter saved room/arrival coordinates. */
export function projectRoofLabel(
  matrix: ArrayLike<number>,
  longitude: number,
  latitude: number,
  heightMetres: number,
  width: number,
  height: number,
) {
  const p = MercatorCoordinate.fromLngLat([longitude, latitude], heightMetres);
  const w = matrix[3] * p.x + matrix[7] * p.y + matrix[11] * p.z + matrix[15];
  if (!Number.isFinite(w) || w <= 0) return;
  const x =
    (matrix[0] * p.x + matrix[4] * p.y + matrix[8] * p.z + matrix[12]) / w;
  const y =
    (matrix[1] * p.x + matrix[5] * p.y + matrix[9] * p.z + matrix[13]) / w;
  const z =
    (matrix[2] * p.x + matrix[6] * p.y + matrix[10] * p.z + matrix[14]) / w;
  if (
    ![x, y, z].every(Number.isFinite) ||
    z < -1 ||
    z > 1 ||
    x < -1.2 ||
    x > 1.2 ||
    y < -1.2 ||
    y > 1.2
  )
    return;
  return { x: ((x + 1) * width) / 2, y: ((1 - y) * height) / 2 };
}
export const roofLabelCollides = (box: LabelBox, accepted: LabelBox[]) =>
  accepted.some(
    (other) =>
      box.left < other.right &&
      box.right > other.left &&
      box.top < other.bottom &&
      box.bottom > other.top,
  );

/** MapLibre 5.23 ground symbols are depth-tested and disappear inside extruded
 * rooms. Screen-facing DOM billboards project actual room-roof altitude using
 * the custom-layer camera, with deterministic landmark-first collision culling. */
export function roofLabelLayer(
  labels: FeatureCollection<Point>,
  heightMetres: number,
  visitor = false,
  settings: LabelSettings = DEFAULT_LABEL_SETTINGS,
  preserveHeight = false,
): CustomLayerInterface {
  let overlay: HTMLDivElement | undefined;
  let mapWidth = 0,
    mapHeight = 0;
  let entries: {
    label: RoofLabel;
    element: HTMLDivElement;
    width: number;
    height: number;
    fontSize: number;
  }[] = [];
  let mapInstance:
    | Parameters<NonNullable<CustomLayerInterface["onAdd"]>>[0]
    | undefined;
  return {
    id: "project-roof-labels",
    type: "custom",
    renderingMode: "2d",
    onAdd(map) {
      mapInstance = map;
      overlay = document.createElement("div");
      overlay.dataset.testid = "project-3d-labels";
      overlay.setAttribute("aria-hidden", "true");
      Object.assign(overlay.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: "1",
      });
      map.getCanvasContainer().append(overlay);
      entries = labels.features
        .map((feature) => {
          const element = document.createElement("div");
          const label = {
            key: String(feature.properties?.key ?? ""),
            name: String(feature.properties?.name ?? ""),
            longitude: feature.geometry.coordinates[0],
            latitude: feature.geometry.coordinates[1],
            landmark: !!feature.properties?.landmark,
            minZoom: Number(feature.properties?.minZoom ?? ROOM_DETAIL_ZOOM),
            maxZoom: Number(feature.properties?.maxZoom ?? Infinity),
            compactName: String(
              feature.properties?.compactName ?? feature.properties?.name ?? "",
            ),
            fullNameZoom: Number(feature.properties?.fullNameZoom ?? 0),
            priority: Number(feature.properties?.priority ?? 1),
            selected: !!feature.properties?.selected,
            heightMetres: Number(
              feature.properties?.heightMetres ?? heightMetres,
            ),
          };
          element.textContent = label.name;
          element.dataset.roomKey = label.key;
          Object.assign(element.style, {
            position: "absolute",
            left: "0",
            top: "0",
            display: "none",
            maxWidth: "10em",
            whiteSpace: "pre-line",
            textAlign: "center",
            lineHeight: "1.15",
            fontFamily: '"Noto Sans", Arial, sans-serif',
            fontWeight: label.landmark ? "600" : "400",
            color: "#586064",
            textShadow:
              "-1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white, 1px 1px 0 white",
            transform: "translate(-50%, -50%)",
          });
          overlay!.append(element);
          return { label, element, width: 0, height: 0, fontSize: 0 };
        })
        .sort(
          (a, b) =>
            a.label.priority - b.label.priority ||
            a.label.key.localeCompare(b.label.key),
        );
    },
    render(_, args) {
      if (!overlay || !mapInstance) return;
      mapWidth = mapInstance.getCanvas().clientWidth;
      mapHeight = mapInstance.getCanvas().clientHeight;
      const zoom = mapInstance.getZoom();
      const mapRect = mapInstance.getCanvas().getBoundingClientRect();
      const controlScope =
        mapInstance.getContainer().closest(".project-map") ??
        mapInstance.getContainer();
      const accepted: LabelBox[] = [
        ...controlScope.querySelectorAll<HTMLElement>(
          '.project-map-toolbar > *, .maplibregl-ctrl, [data-testid="project-navigation"], [aria-label="Current direction"]',
        ),
      ]
        .filter((element) => element.offsetWidth && element.offsetHeight)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left - mapRect.left - 3,
            top: rect.top - mapRect.top - 3,
            right: rect.right - mapRect.left + 3,
            bottom: rect.bottom - mapRect.top + 3,
          };
        });
      const padding = visitor ? visitorLabelPadding(zoom, settings) : 3;
      const budget = visitor
        ? visitorLabelBudget(mapWidth, mapHeight, zoom, settings)
        : Infinity;
      let shown = 0;
      for (const entry of entries) {
        const { label, element } = entry;
        const opacity = labelOpacityAtZoom(zoom, label.minZoom, label.maxZoom);
        element.style.opacity = String(opacity);
        const point =
          opacity > 0
            ? projectRoofLabel(
                args.defaultProjectionData.mainMatrix,
                label.longitude,
                label.latitude,
                preserveHeight || label.minZoom === 0
                  ? label.heightMetres
                  : label.heightMetres * labelOpacityAtZoom(zoom),
                mapWidth,
                mapHeight,
              )
            : undefined;
        if (
          !point ||
          (shown >= budget && !label.selected && label.minZoom !== 0)
        ) {
          element.style.display = "none";
          continue;
        }
        const size = Math.min(
          label.landmark ? 17 : 12,
          (label.landmark ? 14 : 10) + Math.max(0, zoom - 18),
        );
        element.style.display = "block";
        const text =
          zoom >= label.fullNameZoom ? label.name : label.compactName;
        const changedText = element.textContent !== text;
        if (changedText) element.textContent = text;
        if (entry.fontSize !== size || changedText) {
          entry.fontSize = size;
          element.style.fontSize = `${size}px`;
          entry.width = element.offsetWidth;
          entry.height = element.offsetHeight;
        }
        const box = {
          left: point.x - entry.width / 2 - padding,
          top: point.y - entry.height / 2 - padding,
          right: point.x + entry.width / 2 + padding,
          bottom: point.y + entry.height / 2 + padding,
        };
        if (roofLabelCollides(box, accepted)) {
          element.style.display = "none";
          continue;
        }
        accepted.push(box);
        shown++;
        element.style.left = `${point.x}px`;
        element.style.top = `${point.y}px`;
      }
    },
    onRemove() {
      overlay?.remove();
      overlay = undefined;
      entries = [];
      mapInstance = undefined;
    },
  };
}
