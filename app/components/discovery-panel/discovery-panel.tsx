import { useCallback, useEffect, useState } from "react";

import { useMap } from "~/components/map/map";
import config from "~/config";
import useDirections from "~/hooks/use-directions";
import { useIndoorGeocoder } from "~/hooks/use-indoor-geocder";
import { POI } from "~/types/poi";
import DiscoveryView from "./discovery-view";
import LocationDetail from "./location-detail";
import NavigationView from "./navigation-view";
import { buildPoiMap } from "~/utils/poi-map";
import { MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import type { LocationConfig } from "~/types/location";

type UIMode = "discovery" | "detail" | "navigation";

interface DiscoveryPanelProps {
  location: LocationConfig;
}

export default function DiscoveryPanel({ location }: DiscoveryPanelProps) {
  const { isLoaded, map } = useMap();
  const [mode, setMode] = useState<UIMode>("discovery");
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [pendingDeparture, setPendingDeparture] = useState<
    string | undefined
  >();
  const { indoorDirections } = useDirections();
  const indoorGeocoder = useIndoorGeocoder(location);
  const poiMap = buildPoiMap(location);

  useEffect(() => {
    if (!indoorDirections) return;
    indoorDirections.loadMapData(location.data.indoorRoutes);
  }, [indoorDirections, location.data.indoorRoutes]);

  const navigateToPOI = useCallback(
    (coordinates: GeoJSON.Position) => {
      map?.flyTo({
        center: coordinates as [number, number],
        zoom: 20,
        duration: 1300,
      });
    },
    [map],
  );

  function handleSelectPOI(poi: POI) {
    setSelectedPOI(poi);
    setMode("detail");
    navigateToPOI(poi.coordinates);
  }

  function handleBackClick() {
    setMode("discovery");
    setSelectedPOI(null);
    setPendingDeparture(undefined);
    indoorDirections?.clear();
  }

  useEffect(() => {
    if (!indoorDirections) return;
    if (typeof globalThis === "undefined") return;

    const handleMessage = (event: MessageEvent) => {
      const allowed = config.allowedMessageOrigins;
      if (allowed.length > 0 && !allowed.includes(event.origin)) return;

      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "oim:route-to") return;

      const productName = data.productName;
      if (typeof productName !== "string" || !productName) return;

      try {
        const destinationPoi = indoorGeocoder.indoorGeocodeInput(productName);
        if (!destinationPoi) {
          console.warn(`[oim] product not found: ${productName}`);
          return;
        }

        setSelectedPOI(destinationPoi);
        setPendingDeparture(location.totemPoiName);
        setMode("navigation");
      } catch (error) {
        console.error("[oim] failed to handle route-to message:", error);
      }
    };

    globalThis.addEventListener("message", handleMessage);
    return () => globalThis.removeEventListener("message", handleMessage);
  }, [indoorDirections, indoorGeocoder, location.totemPoiName]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const currentWindow = globalThis.window;
    if (currentWindow.parent === currentWindow) return;

    const notifyReady = () => {
      currentWindow.parent.postMessage({ type: "oim:ready" }, "*");
    };

    notifyReady();
  }, [isLoaded, map]);

  useEffect(() => {
    const handleMapClick = (
      event: MapMouseEvent & {
        features?: MapGeoJSONFeature[];
      },
    ) => {
      const { features } = event;
      if (!features?.length) return;

      const clickedFeature = features[0];
      const unitId = Number(clickedFeature.id);
      const relatedPOIs = poiMap.get(unitId);

      if (relatedPOIs && relatedPOIs[0]) {
        const firstPOI = relatedPOIs[0];

        //TODO: find cleaner way to convert GeoJSON.Feature to POI
        const poi: POI = {
          id: firstPOI.properties?.id as number,
          name: firstPOI.properties?.name as string,
          coordinates: firstPOI.geometry.coordinates,
        };
        setSelectedPOI(poi);
        if (mode === "discovery" || mode === "detail") {
          navigateToPOI(poi.coordinates);
          if (mode === "discovery") {
            setMode("detail");
          }
        }
      }
    };

    map?.on("click", "indoor-map-extrusion", handleMapClick);
    return () => {
      map?.off("click", "indoor-map-extrusion", handleMapClick);
    };
  }, [map, mode, navigateToPOI, poiMap]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === "discovery" && (
          <DiscoveryView
            indoorGeocoder={indoorGeocoder}
            onSelectPOI={handleSelectPOI}
            topLocations={location.data.topLocations}
          />
        )}
        {mode === "detail" && selectedPOI && (
          <LocationDetail
            selectedPOI={selectedPOI}
            handleDirectionsClick={() => setMode("navigation")}
            handleBackClick={handleBackClick}
          />
        )}
        {mode === "navigation" && (
          <NavigationView
            handleBackClick={handleBackClick}
            selectedPOI={selectedPOI}
            indoorGeocoder={indoorGeocoder}
            indoorDirections={indoorDirections}
            initialDeparture={pendingDeparture}
          />
        )}
      </div>
    </div>
  );
}
