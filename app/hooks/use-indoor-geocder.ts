import { useEffect, useRef } from "react";
import building from "~/data/building";
import { IndoorGeocoder, POIFeature } from "~/utils/indoor-geocoder";

export function useIndoorGeocoder() {
  const geocoderRef = useRef<IndoorGeocoder | null>(null);

  if (!geocoderRef.current) {
    geocoderRef.current = new IndoorGeocoder(
      building.pois.features as POIFeature[],
    );
  }

  useEffect(() => {
    // TODO: Implement data loading when API is ready
    // const loadData = async () => {
    //   if (geocoderRef.current) {
    //     await geocoderRef.current.loadData();
    //   }
    // };
    // loadData();
  }, []);

  return geocoderRef.current;
}
