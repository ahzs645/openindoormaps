import { useEffect, useState } from "react";
import { useMap } from "~/components/map/map";
import IndoorDirections from "~/indoor-directions/directions/main";

function useDirections(hospitalStyle = false) {
  const { isLoaded, map } = useMap();
  const [indoorDirections, setIndoorDirections] =
    useState<IndoorDirections | null>(null);

  useEffect(() => {
    if (!map || !isLoaded) {
      setIndoorDirections(null);
      return;
    }

    const directions = new IndoorDirections(map, { linesScalingFactor: 0.9 });
    if (hospitalStyle) {
      for (const suffix of ["routeline", "routeline-casing"]) {
        const id = `maplibre-gl-indoor-directions-${suffix}`;
        if (map.getLayer(id)) {
          map.setPaintProperty(id, "line-color", "#35b6f8");
          map.setPaintProperty(
            id,
            "line-width",
            suffix === "routeline" ? 4 : 7,
          );
          map.setPaintProperty(
            id,
            "line-opacity",
            suffix === "routeline" ? 0.95 : 0.25,
          );
        }
      }
    }
    setIndoorDirections(directions);

    return () => {
      directions.destroy();
      setIndoorDirections(null);
    };
  }, [isLoaded, map, hospitalStyle]);

  return {
    indoorDirections,
  };
}

export default useDirections;
