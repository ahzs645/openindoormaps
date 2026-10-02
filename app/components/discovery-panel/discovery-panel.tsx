import { useCallback, useEffect, useMemo, useState } from "react";

import { useMap } from "~/components/map/map";
import config from "~/config";
import useDirections from "~/hooks/use-directions";
import { useIndoorGeocoder } from "~/hooks/use-indoor-geocder";
import useFloorStore from "~/stores/floor-store";
import { POI } from "~/types/poi";
import HospitalDiscoveryView from "./hospital-discovery-view";
import DiscoveryView from "./discovery-view";
import LocationDetail from "./location-detail";
import NavigationView, { type RouteState } from "./navigation-view";
import { buildPoiMap } from "~/utils/poi-map";
import {
  buildDeepLinkUrl,
  readDeepLink,
  syncDeepLink,
} from "~/utils/deep-link";
import { findPoiById, poiFromFeature } from "~/utils/poi";
import { MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import type { LocationConfig } from "~/types/location";

type UIMode = "discovery" | "detail" | "navigation";

interface DiscoveryPanelProps {
  location: LocationConfig;
  onNavigationActiveChange?: (active: boolean) => void;
}

export default function DiscoveryPanel({
  location,
  onNavigationActiveChange,
}: DiscoveryPanelProps) {
  const { isLoaded, map } = useMap();
  const [routePreview, setRoutePreview] = useState(false);
  const handlePresentationChange = useCallback(
    (active: boolean) => {
      setRoutePreview(active);
      onNavigationActiveChange?.(active);
    },
    [onNavigationActiveChange],
  );
  const [discoveryCategory, setDiscoveryCategory] = useState<string | null>(
    null,
  );
  const [mode, setMode] = useState<UIMode>("discovery");
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [pendingDeparture, setPendingDeparture] = useState<
    string | undefined
  >();
  const [pendingDeparturePOI, setPendingDeparturePOI] = useState<POI | null>(
    null,
  );
  const [pendingAccessible, setPendingAccessible] = useState(false);
  const [routesReady, setRoutesReady] = useState(false);
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);
  const { indoorDirections } = useDirections(
    Boolean(location.ui?.hospitalStyle),
  );
  const indoorGeocoder = useIndoorGeocoder(location);
  const poiMap = useMemo(() => buildPoiMap(location), [location]);
  const currentFloor = useFloorStore((state) => state.currentFloor);
  const setCurrentFloor = useFloorStore((state) => state.setCurrentFloor);
  const setCurrentBuildingId = useFloorStore(
    (state) => state.setCurrentBuildingId,
  );
  const floorNames = location.mapConfig.floorNames;

  useEffect(() => {
    indoorDirections?.setFloor(currentFloor);
  }, [indoorDirections, currentFloor]);

  // Clicking an "Up to …" / "From …" connector marker switches floor.
  useEffect(() => {
    indoorDirections?.onTransitionClick(setCurrentFloor);
    return () => indoorDirections?.onTransitionClick(null);
  }, [indoorDirections, setCurrentFloor]);

  useEffect(() => {
    if (!indoorDirections) {
      setRoutesReady(false);
      return;
    }
    indoorDirections.loadMapData(location.data.indoorRoutes);
    indoorDirections.setLevelNames(floorNames);
    setRoutesReady(true);
  }, [indoorDirections, location.data.indoorRoutes, floorNames]);

  const navigateToPOI = useCallback(
    (coordinates: GeoJSON.Position, zoom = 20) => {
      map?.flyTo({
        center: coordinates as [number, number],
        zoom,
        duration: 1300,
      });
    },
    [map],
  );

  const handleSelectPOI = useCallback(
    (poi: POI) => {
      if (location.ui?.hospitalStyle)
        setCurrentBuildingId(poi.buildingId ?? null);
      setSelectedPOI(poi);
      setMode("detail");
      const displayFloor = poi.metadata?.display_floor ?? poi.floor;
      if (displayFloor !== undefined) setCurrentFloor(displayFloor);
      navigateToPOI(poi.coordinates, poi.type === "building" ? 17 : 20);
    },
    [
      navigateToPOI,
      setCurrentFloor,
      setCurrentBuildingId,
      location.ui?.hospitalStyle,
    ],
  );

  function handleBackClick() {
    setDiscoveryCategory(null);
    setMode("discovery");
    setSelectedPOI(null);
    setPendingDeparture(undefined);
    setPendingDeparturePOI(null);
    setPendingAccessible(false);
    indoorDirections?.clear();
  }

  // Apply ?poi= / ?from=&to= / ?floor= once the map and route graph are ready.
  useEffect(() => {
    if (deepLinkApplied || !map || !isLoaded || !routesReady) return;
    setDeepLinkApplied(true);

    const link = readDeepLink(globalThis.location.search);
    const pois = location.data.pois;
    if (link.to !== undefined) {
      const destination = findPoiById(pois, link.to);
      if (destination) {
        setSelectedPOI(destination);
        setPendingDeparturePOI(
          link.from === undefined ? null : findPoiById(pois, link.from),
        );
        setPendingAccessible(Boolean(link.accessible));
        setMode("navigation");
        return;
      }
    }
    if (link.poi !== undefined) {
      const poi = findPoiById(pois, link.poi);
      if (poi) {
        handleSelectPOI(poi);
        return;
      }
    }
    if (link.floor !== undefined) setCurrentFloor(link.floor);
  }, [
    deepLinkApplied,
    handleSelectPOI,
    isLoaded,
    location.data.pois,
    map,
    routesReady,
    setCurrentFloor,
  ]);

  // Keep the address bar shareable: it always reflects the open card.
  useEffect(() => {
    if (!deepLinkApplied) return;
    if (mode === "detail" && selectedPOI) syncDeepLink({ poi: selectedPOI.id });
    if (mode === "discovery") syncDeepLink({});
  }, [deepLinkApplied, mode, selectedPOI]);

  const handleRouteChange = useCallback((route: RouteState) => {
    syncDeepLink({
      from: route.from?.id,
      to: route.to?.id,
      accessible: route.accessible,
    });
  }, []);

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
      const unitId = Number(
        clickedFeature.properties.source_unit_id ?? clickedFeature.id,
      );
      const relatedPOIs = poiMap.get(unitId);

      if (relatedPOIs && relatedPOIs[0]) {
        const firstPOI = relatedPOIs[0];

        const poi = poiFromFeature(firstPOI);
        if (
          clickedFeature.properties.view_context &&
          (mode === "discovery" || mode === "detail")
        ) {
          handleSelectPOI(poi);
          return;
        }
        setSelectedPOI(poi);
        if (mode === "discovery" || mode === "detail") {
          navigateToPOI(poi.coordinates);
          if (mode === "discovery") {
            setMode("detail");
          }
        }
      }
    };

    const handleFlatUnitClick = (
      event: MapMouseEvent & { features?: MapGeoJSONFeature[] },
    ) => {
      const p = event.features?.[0]?.properties;
      if (p?.feature_type === "unit" && p.extrusion_height === 0) {
        handleMapClick(event);
      }
    };

    const handlePoiClick = (
      event: MapMouseEvent & { features?: MapGeoJSONFeature[] },
    ) => {
      const id = event.features?.[0]?.properties?.id;
      const poi =
        id === undefined ? null : findPoiById(location.data.pois, Number(id));
      if (poi) handleSelectPOI(poi);
    };
    if (location.ui?.hospitalStyle) {
      map?.on("click", "point-label", handlePoiClick);
      map?.on("click", "point", handlePoiClick);
    }
    map?.on("click", "indoor-map-extrusion", handleMapClick);
    map?.on("click", "indoor-map-fill", handleFlatUnitClick);
    return () => {
      if (location.ui?.hospitalStyle) {
        map?.off("click", "point-label", handlePoiClick);
        map?.off("click", "point", handlePoiClick);
      }
      map?.off("click", "indoor-map-extrusion", handleMapClick);
      map?.off("click", "indoor-map-fill", handleFlatUnitClick);
    };
  }, [
    map,
    mode,
    navigateToPOI,
    poiMap,
    handleSelectPOI,
    location.data.pois,
    location.ui?.hospitalStyle,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className={
          routePreview
            ? "min-h-0 flex-1 overflow-hidden p-4"
            : "min-h-0 flex-1 overflow-y-auto p-4"
        }
      >
        {mode === "discovery" && location.ui?.hospitalStyle && (
          <HospitalDiscoveryView
            location={location}
            initialCategory={discoveryCategory}
            indoorGeocoder={indoorGeocoder}
            onSelectPOI={handleSelectPOI}
          />
        )}
        {mode === "discovery" && !location.ui?.hospitalStyle && (
          <DiscoveryView
            indoorGeocoder={indoorGeocoder}
            onSelectPOI={handleSelectPOI}
            topLocations={location.data.topLocations}
            floorNames={floorNames}
          />
        )}
        {mode === "detail" && selectedPOI && (
          <LocationDetail
            key={selectedPOI.id}
            selectedPOI={selectedPOI}
            hospitalStyle={location.ui?.hospitalStyle}
            onSelectCategory={(category) => {
              setDiscoveryCategory(category);
              setMode("discovery");
            }}
            floorNames={floorNames}
            shareUrl={buildDeepLinkUrl({ poi: selectedPOI.id })}
            handleDirectionsClick={() => setMode("navigation")}
            handleBackClick={handleBackClick}
          />
        )}
        {mode === "navigation" && (
          <NavigationView
            onPresentationChange={handlePresentationChange}
            floorStacks={location.data.floorStacks}
            handleBackClick={handleBackClick}
            selectedPOI={selectedPOI}
            indoorGeocoder={indoorGeocoder}
            indoorDirections={routesReady ? indoorDirections : null}
            initialDeparture={pendingDeparture}
            initialDeparturePOI={pendingDeparturePOI}
            initialAccessible={pendingAccessible}
            routeTiming={location.routeTiming}
            hospitalStyle={location.ui?.hospitalStyle}
            floorNames={floorNames}
            onRouteChange={handleRouteChange}
          />
        )}
      </div>
    </div>
  );
}
