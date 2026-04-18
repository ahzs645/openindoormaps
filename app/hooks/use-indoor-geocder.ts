import { useRef } from "react";
import { IndoorGeocoder, POIFeature } from "~/utils/indoor-geocoder";
import type { LocationConfig } from "~/types/location";

export function useIndoorGeocoder(location: LocationConfig) {
  const geocoderRef = useRef<IndoorGeocoder | null>(null);

  if (!geocoderRef.current) {
    geocoderRef.current = new IndoorGeocoder(
      location.data.pois.features as POIFeature[],
    );
  }

  return geocoderRef.current;
}
