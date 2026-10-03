import { useEffect, useMemo, useState } from "react";
import config from "~/config";
import useFloorStore from "~/stores/floor-store";
import DiscoveryPanel from "./discovery-panel/discovery-panel";
import { BuildingFloorSelector } from "./map/building-floor-selector";
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
import { Basemap3dBuildingsLayer } from "./map/basemap-3d-buildings-layer";
import { getAvailableFloors, IndoorMapLayers } from "./map/indoor-map-layers";
import { MapLogoControl } from "./map/map-logo-control";
import { MapSectionLayout } from "./map/map-section-layout";
import { RoomViewControl, type RoomView } from "./map/room-view-control";
import { PoisLayer } from "./map/pois-layer";
import VenueModelsLayer, { type VenueModel } from "./map/venue-models-layer";

const GALLERIA_MODELS: VenueModel[] = [
  {
    url: `${import.meta.env.BASE_URL}models/vendor-reference-models/new_escalator.glb`,
    lngLat: [-0.126_849_5, 51.507_424_6],
    lengthMeters: 8,
  },
];

function isSmallViewport() {
  return typeof globalThis !== "undefined" && globalThis.innerWidth < 640;
}

interface MapComponentProps {
  location: LocationConfig;
}

export default function MapComponent({ location }: MapComponentProps) {
  const [routePreview, setRoutePreview] = useState(false);
  const [theme] = useTheme();
  const [roomView, setRoomView] = useState<RoomView>("3d");
  const [showDesktopSidebar, setShowDesktopSidebar] = useState(true);
  const { currentFloor, setCurrentFloor } = useFloorStore();
  const desktopPanelPlacement = location.ui?.desktopPanelPlacement ?? "overlay";
  const desktopPanelWidth = location.ui?.desktopPanelWidth ?? 376;
  const indoorMapData = location.data.indoorMap as IndoorMapGeoJSON;
  const availableFloors = useMemo(() => {
    const floors = getAvailableFloors(indoorMapData);
    const visibleFloors = location.mapConfig.visibleFloors;
    if (!visibleFloors?.length) return floors;

    const visibleFloorSet = new Set(visibleFloors);
    return floors.filter((floor) => visibleFloorSet.has(floor));
  }, [indoorMapData, location.mapConfig.visibleFloors]);
  const mapOptions = useMemo(
    () => ({
      attributionControl: {
        compact: true,
      },
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

    const defaultFloor = location.mapConfig.defaultFloor;
    if (defaultFloor !== undefined && availableFloors.includes(defaultFloor)) {
      setCurrentFloor(defaultFloor);
      return;
    }

    if (availableFloors.includes(0)) {
      setCurrentFloor(0);
      return;
    }

    setCurrentFloor(availableFloors[0] ?? 0);
  }, [
    availableFloors,
    currentFloor,
    location.mapConfig.defaultFloor,
    setCurrentFloor,
  ]);

  return (
    <MapProvider
      key={location.slug}
      options={mapOptions}
      styles={config.mapStyles}
    >
      <MapSectionLayout
        desktopPanelPlacement={desktopPanelPlacement}
        compactOverlay={location.ui?.hospitalStyle}
        routePreview={routePreview}
        desktopSidebarWidth={desktopPanelWidth}
        showDesktopSidebar={showDesktopSidebar}
        sidebar={
          <DiscoveryPanel
            location={location}
            onNavigationActiveChange={setRoutePreview}
          />
        }
        onToggleDesktopSidebar={() =>
          setShowDesktopSidebar((currentValue) => !currentValue)
        }
      >
        <MapCanvas>
          <Basemap3dBuildingsLayer
            enabled={Boolean(location.mapConfig.showBasemap3dBuildings)}
          />
          <IndoorMapLayers
            data={indoorMapData}
            floorContext={
              location.data.floorContext as IndoorMapGeoJSON | undefined
            }
            floor={currentFloor}
            theme={theme as Theme}
            cutawayRooms={location.mapConfig.cutawayRooms}
            roomView={location.mapConfig.roomViewControl ? roomView : undefined}
          />
          <PoisLayer
            hospitalStyle={location.ui?.hospitalStyle}
            data={location.data.pois as GeoJSON.FeatureCollection}
            floor={currentFloor}
            theme={theme as Theme}
          />
          {location.slug === "galleria" && (
            <VenueModelsLayer id="venue-3d-models" models={GALLERIA_MODELS} />
          )}
          <MapControls
            className={routePreview ? "hidden md:flex" : undefined}
          />
          <MapInspectControl />
          <MapLogoControl />
          <div
            className={
              routePreview
                ? "absolute right-3 top-3 z-20 hidden flex-col items-end gap-2 md:flex"
                : "absolute right-3 top-3 z-20 flex flex-col items-end gap-2"
            }
          >
            {location.data.floorStacks ? (
              <BuildingFloorSelector stacks={location.data.floorStacks} />
            ) : (
              <>
                <FloorSelector
                  availableFloors={availableFloors}
                  floorNames={location.mapConfig.floorNames}
                />
                <FloorUpDownControl availableFloors={availableFloors} />
              </>
            )}
            {location.mapConfig.roomViewControl && (
              <RoomViewControl
                view={roomView}
                onChange={setRoomView}
                pitch={location.mapConfig.pitch}
              />
            )}
          </div>
        </MapCanvas>
      </MapSectionLayout>
    </MapProvider>
  );
}
