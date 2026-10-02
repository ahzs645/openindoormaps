import { useEffect, useMemo, useState, type ReactNode } from "react";
import config from "~/config";
import { type Theme, useTheme } from "~/hooks/use-theme";
import useFloorStore from "~/stores/floor-store";
import type { IndoorMapGeoJSON } from "~/types/geojson";
import type { LocationConfig } from "~/types/location";
import { Basemap3dBuildingsLayer } from "../map/basemap-3d-buildings-layer";
import { getAvailableFloors, IndoorMapLayers } from "../map/indoor-map-layers";
import { MapCanvas, MapInspectControl, MapProvider } from "../map/map";
import { RoomViewControl, type RoomView } from "../map/room-view-control";
import { PoisLayer } from "../map/pois-layer";
import VenueModelsLayer, { type VenueModel } from "../map/venue-models-layer";

const GALLERIA_MODELS: VenueModel[] = [
  {
    url: "/models/vendor-reference-models/new_escalator.glb",
    lngLat: [-0.126_849_5, 51.507_424_6],
    lengthMeters: 8,
  },
];

function isSmallViewport() {
  return typeof globalThis !== "undefined" && globalThis.innerWidth < 640;
}

interface NativeModeMapProps {
  location: LocationConfig;
  children: (ctx: { availableFloors: number[] }) => ReactNode;
}

export default function NativeModeMap({
  location,
  children,
}: NativeModeMapProps) {
  const [theme] = useTheme();
  const [roomView, setRoomView] = useState<RoomView>("3d");
  const { currentFloor, setCurrentFloor } = useFloorStore();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.slug]);

  return (
    <MapProvider
      key={`${location.slug}-native-mode`}
      options={mapOptions}
      styles={config.mapStyles}
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
        <MapInspectControl />
        {location.mapConfig.roomViewControl && (
          <div className="absolute right-3 top-28 z-20">
            <RoomViewControl
              view={roomView}
              onChange={setRoomView}
              pitch={location.mapConfig.pitch}
            />
          </div>
        )}
        {children({ availableFloors })}
      </MapCanvas>
    </MapProvider>
  );
}
