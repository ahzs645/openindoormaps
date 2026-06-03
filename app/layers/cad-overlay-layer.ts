import { CustomLayerInterface, Map } from "maplibre-gl";
import { normalizeFloorValue } from "~/utils/floor-utils";

type OverlayCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry>;

export default class CadOverlayLayer implements CustomLayerInterface {
  id: string = "cad-overlay";
  type = "custom" as const;
  private map: Map | null = null;
  private overlay: OverlayCollection;
  private theme;

  constructor(overlay: OverlayCollection, theme: string = "light") {
    this.overlay = overlay;
    this.theme = theme;
  }

  render = () => {
    // GeoJSON source rendering is handled by MapLibre.
  };

  setFloorLevel(level: number) {
    if (!this.map) return;

    const source = this.map.getSource("cad-overlay") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const filteredFeatures = this.overlay.features.filter((feature) => {
      const floor = normalizeFloorValue(feature.properties?.level_id);
      return floor === null || floor === level;
    });

    source.setData({
      type: "FeatureCollection",
      features: filteredFeatures,
    });
  }

  onAdd?(map: Map): void {
    this.map = map;

    const colors =
      this.theme === "dark"
        ? {
            wall: "#94a3b8",
            room: "#cbd5e1",
            corridor: "#fde68a",
            stairs: "#93c5fd",
            elevator: "#fca5a5",
            door: "#6ee7b7",
            window: "#60a5fa",
            route: "#f59e0b",
            unknown: "#64748b",
          }
        : {
            wall: "#6b7280",
            room: "#9ca3af",
            corridor: "#d97706",
            stairs: "#2563eb",
            elevator: "#b45309",
            door: "#0f766e",
            window: "#2563eb",
            route: "#b45309",
            unknown: "#94a3b8",
          };

    map.addSource("cad-overlay", {
      type: "geojson",
      data: this.overlay,
    });

    const colorExpression = [
      "match",
      ["get", "cad_feature_type"],
      "wall",
      colors.wall,
      "room",
      colors.room,
      "corridor",
      colors.corridor,
      "stairs",
      colors.stairs,
      "elevator",
      colors.elevator,
      "door",
      colors.door,
      "window",
      colors.window,
      "route",
      colors.route,
      colors.unknown,
    ] as unknown as maplibregl.ExpressionSpecification;

    map.addLayer({
      id: "cad-overlay-polygons",
      type: "line",
      source: "cad-overlay",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": colorExpression,
        "line-width": 1.1,
        "line-opacity": this.theme === "dark" ? 0.65 : 0.55,
      },
    });

    map.addLayer({
      id: "cad-overlay-lines",
      type: "line",
      source: "cad-overlay",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": colorExpression,
        "line-width": [
          "case",
          ["==", ["get", "cad_feature_type"], "wall"],
          1.2,
          ["==", ["get", "cad_feature_type"], "door"],
          1.8,
          ["==", ["get", "cad_feature_type"], "window"],
          1.5,
          1,
        ],
        "line-opacity": this.theme === "dark" ? 0.7 : 0.6,
      },
    });
  }
}
