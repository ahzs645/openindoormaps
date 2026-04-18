import { useEffect, useMemo, useState } from "react";
import config from "~/config";
import useFloorStore from "~/stores/floor-store";
import DiscoveryPanel from "./discovery-panel/discovery-panel";
import { FloorSelector } from "./floor-selector";
import { FloorUpDownControl } from "./floor-up-down-control";
import { IndoorMapGeoJSON } from "~/types/geojson";
import { type Theme, useTheme } from "~/hooks/use-theme";
import type { LocationConfig } from "~/types/location";
import {
  MapCanvas,
  MapControls,
  MapInspectControl,
  MapProvider,
} from "./map/map";
import { getAvailableFloors, IndoorMapLayers } from "./map/indoor-map-layers";
import { MapSectionLayout } from "./map/map-section-layout";
import { PoisLayer } from "./map/pois-layer";

function isSmallViewport() {
  return typeof globalThis !== "undefined" && globalThis.innerWidth < 640;
}

interface MapComponentProps {
  location: LocationConfig;
}

export default function MapComponent({ location }: MapComponentProps) {
  const [theme] = useTheme();
  const [showDesktopSidebar, setShowDesktopSidebar] = useState(true);
  const { currentFloor, setCurrentFloor } = useFloorStore();
  const desktopPanelPlacement = location.ui?.desktopPanelPlacement ?? "overlay";
  const desktopPanelWidth = location.ui?.desktopPanelWidth ?? 376;
  const indoorMapData = location.data.indoorMap as IndoorMapGeoJSON;
  const availableFloors = useMemo(
    () => getAvailableFloors(indoorMapData),
    [indoorMapData],
  );
  const mapOptions = useMemo(
    () => ({
      attributionControl: false as const,
      bearing: location.mapConfig.bearing,
      center: location.mapConfig.center,
      pitch: location.mapConfig.pitch,
      zoom: isSmallViewport()
        ? location.mapConfig.mobileZoom
        : location.mapConfig.zoom,
    }),
    [location],
  );

  useEffect(() => {
    if (availableFloors.includes(currentFloor)) return;

    if (availableFloors.includes(0)) {
      setCurrentFloor(0);
      return;
    }

    setCurrentFloor(availableFloors[0] ?? 0);
  }, [availableFloors, currentFloor, setCurrentFloor]);

  return (
    <MapProvider
      key={location.slug}
      options={mapOptions}
      styles={config.mapStyles}
    >
      <MapSectionLayout
        desktopPanelPlacement={desktopPanelPlacement}
        desktopSidebarWidth={desktopPanelWidth}
        showDesktopSidebar={showDesktopSidebar}
        sidebar={<DiscoveryPanel location={location} />}
        onToggleDesktopSidebar={() =>
          setShowDesktopSidebar((currentValue) => !currentValue)
        }
      >
        <MapCanvas>
          <IndoorMapLayers
            data={indoorMapData}
            floor={currentFloor}
            theme={theme as Theme}
          />
          <PoisLayer
            data={location.data.pois as GeoJSON.FeatureCollection}
            theme={theme as Theme}
          />
          <MapControls />
          <MapInspectControl />
          <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
            <FloorSelector availableFloors={availableFloors} />
            <FloorUpDownControl availableFloors={availableFloors} />
          </div>
        </MapCanvas>
      </MapSectionLayout>
    </MapProvider>
  );
}
