import { useEffect, useState } from "react";
import { useMap } from "~/components/map/map";
import IndoorDirections from "~/indoor-directions/directions/main";

function useDirections() {
  const { isLoaded, map } = useMap();
  const [indoorDirections, setIndoorDirections] =
    useState<IndoorDirections | null>(null);

  useEffect(() => {
    if (!map || !isLoaded) {
      setIndoorDirections(null);
      return;
    }

    const directions = new IndoorDirections(map, { linesScalingFactor: 0.9 });
    setIndoorDirections(directions);

    return () => {
      directions.destroy();
      setIndoorDirections(null);
    };
  }, [isLoaded, map]);

  return {
    indoorDirections,
  };
}

export default useDirections;
