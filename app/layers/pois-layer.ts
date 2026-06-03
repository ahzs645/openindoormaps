import { CustomLayerInterface, Map } from "maplibre-gl";
import { hasRecoveredFloorPlan, usesSyntheticFloorPlan } from "~/data/building";
import { normalizeFloorValue } from "~/utils/floor-utils";

type POIFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  GeoJSON.GeoJsonProperties
>;

export default class POIsLayer implements CustomLayerInterface {
  id: string = "pois";
  type = "custom" as const;
  private map: Map | null = null;
  private POIs: POIFeatureCollection;
  private theme;

  constructor(POIs: POIFeatureCollection, theme: string = "light") {
    this.POIs = POIs;
    this.theme = theme;
  }

  render = () => {
    // Rendering is handled by maplibre's internal renderer for geojson sources
  };

  setFloorLevel(level: number) {
    if (!this.map) return;

    const source = this.map.getSource("pois") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const filteredFeatures = this.POIs.features.filter((feature) => {
      const floor = normalizeFloorValue(feature.properties?.floor);
      return floor === null || floor === level;
    });

    source.setData({
      type: "FeatureCollection",
      features: filteredFeatures,
    });
  }

  onAdd?(map: Map): void {
    this.map = map;

    const lightColor = {
      text: "#404040",
      halo: "#ffffff",
      circle: "#695f58",
    };

    const darkColor = {
      text: "#ffffff",
      halo: "#404040",
      circle: "#9ca3af",
    };

    const color = this.theme === "light" ? lightColor : darkColor;
    let pointMinZoom = 16;
    let labelMinZoom = 16;

    if (usesSyntheticFloorPlan) {
      pointMinZoom = 22;
      labelMinZoom = 19;
    }

    if (hasRecoveredFloorPlan) {
      pointMinZoom = 24;
      labelMinZoom = 18;
    }

    map.addSource("pois", {
      type: "geojson",
      data: this.POIs,
    });

    map.addLayer({
      id: "point",
      type: "circle",
      source: "pois",
      minzoom: pointMinZoom,
      layout: {
        visibility: hasRecoveredFloorPlan ? "none" : "visible",
      },
      paint: {
        "circle-radius": 4,
        "circle-color": color.circle,
      },
    });

    map.addLayer({
      id: "point-label",
      type: "symbol",
      source: "pois",
      minzoom: labelMinZoom,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-offset": [0.8, 0],
        "text-anchor": "left",
        "text-max-width": 12,
      },
      paint: {
        "text-color": color.text,
        "text-halo-color": color.halo,
        "text-halo-width": 1.5,
      },
    });
  }
}
