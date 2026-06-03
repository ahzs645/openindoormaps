import MaplibreInspect from "@maplibre/maplibre-gl-inspect";
import "@maplibre/maplibre-gl-inspect/dist/maplibre-gl-inspect.css";
import maplibregl, { FullscreenControl, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef } from "react";
import config from "~/config";
import building, { buildingBounds, referenceOutline } from "~/data/building";
import CadOverlayLayer from "~/layers/cad-overlay-layer";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import POIsLayer from "~/layers/pois-layer";
import { IndoorMapGeoJSON } from "~/types/geojson";
import useFloorStore from "~/stores/floor-store";
import useMapStore from "~/stores/use-map-store";
import DiscoveryPanel from "./discovery-panel/discovery-panel";
import { FloorSelector } from "./floor-selector";
import { FloorUpDownControl } from "./floor-up-down-control";
import DemoBanner from "./demo-banner";
import OIMLogo from "../controls/oim-logo";
import { Theme, useTheme } from "remix-themes";
import "~/maplibre.css";

export default function MapComponent() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [theme] = useTheme();
  const currentFloor = useFloorStore((state) => state.currentFloor);

  const setMapInstance = useMapStore((state) => state.setMapInstance);
  const indoorMapLayer = useMemo(
    () =>
      new IndoorMapLayer(
        building.indoor_map as IndoorMapGeoJSON,
        theme as string,
      ),
    [theme],
  );
  const poisLayer = useMemo(
    () =>
      new POIsLayer(
        building.pois as GeoJSON.FeatureCollection<GeoJSON.Point>,
        theme as string,
      ),
    [theme],
  );
  const cadOverlayLayer = useMemo(
    () =>
      building.cad_overlay && building.cad_overlay.features.length > 0
        ? new CadOverlayLayer(
            building.cad_overlay as GeoJSON.FeatureCollection<GeoJSON.Geometry>,
            theme as string,
          )
        : null,
    [theme],
  );

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      ...config.mapConfig,
      style: config.mapStyles[theme as Theme],
      container: mapContainer.current,
    });
    setMapInstance(map);

    map.on("load", () => {
      try {
        if (referenceOutline) {
          const outlineAccent = theme === "dark" ? "#fbbf24" : "#b45309";
          map.addSource("reference-outline", {
            type: "geojson",
            data: referenceOutline,
          });
          map.addLayer({
            id: "reference-outline-fill",
            type: "fill",
            source: "reference-outline",
            paint: {
              "fill-color": outlineAccent,
              "fill-opacity": theme === "dark" ? 0.08 : 0.05,
            },
          });
        }

        map.addLayer(indoorMapLayer);
        if (cadOverlayLayer) {
          map.addLayer(cadOverlayLayer);
        }

        if (referenceOutline) {
          const outlineAccent = theme === "dark" ? "#fcd34d" : "#92400e";
          map.addLayer({
            id: "reference-outline-line",
            type: "line",
            source: "reference-outline",
            paint: {
              "line-color": outlineAccent,
              "line-width": 2,
              "line-dasharray": [2, 1.5],
            },
          });
        }

        map.addLayer(poisLayer);
        if (buildingBounds) {
          map.fitBounds(buildingBounds, {
            padding:
              typeof globalThis !== "undefined" && globalThis.innerWidth < 640
                ? 24
                : 64,
            duration: 0,
          });
        }
        const initialFloor = useFloorStore.getState().currentFloor;
        indoorMapLayer.setFloorLevel(initialFloor);
        cadOverlayLayer?.setFloorLevel(initialFloor);
        poisLayer.setFloorLevel(initialFloor);
      } catch (error) {
        console.error("Failed to initialize map layers:", error);
      }
    });

    map.addControl(new NavigationControl(), "bottom-right");
    map.addControl(new FullscreenControl(), "bottom-right");

    if (process.env.NODE_ENV === "development") {
      map.addControl(
        new MaplibreInspect({
          popup: new maplibregl.Popup({
            closeOnClick: false,
          }),
          blockHoverPopupOnClick: true,
        }),
        "bottom-right",
      );
    }

    map.addControl(new OIMLogo());

    return () => {
      map.remove();
    };
  }, [cadOverlayLayer, indoorMapLayer, poisLayer, setMapInstance, theme]);

  useEffect(() => {
    indoorMapLayer.setFloorLevel(currentFloor);
    cadOverlayLayer?.setFloorLevel(currentFloor);
    poisLayer.setFloorLevel(currentFloor);
  }, [cadOverlayLayer, currentFloor, indoorMapLayer, poisLayer]);

  return (
    <div className="flex size-full flex-col">
      <DiscoveryPanel />
      {process.env.NODE_ENV === "development" && (
        <>
          <FloorSelector />
          <FloorUpDownControl />
        </>
      )}

      <div ref={mapContainer} className="size-full" />
      <DemoBanner />
    </div>
  );
}
