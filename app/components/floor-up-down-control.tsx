import { NavigationControl } from "maplibre-gl";
import { useEffect } from "react";
import { availableFloors, defaultFloor } from "~/data/building";
import useFloorStore from "~/stores/floor-store";
import useMapStore from "~/stores/use-map-store";

export function FloorUpDownControl() {
  const map = useMapStore((state) => state.mapInstance);
  const { currentFloor, setCurrentFloor } = useFloorStore();

  useEffect(() => {
    if (!map || availableFloors.length === 0) {
      return;
    }

    const currentIndex = availableFloors.indexOf(currentFloor);
    const activeIndex =
      currentIndex === -1
        ? availableFloors.indexOf(defaultFloor)
        : currentIndex;

    const floorControl = new NavigationControl({
      showCompass: false,
      showZoom: false,
      visualizePitch: false,
    });

    map?.addControl(floorControl, "bottom-right");

    const upButton = document.createElement("button");
    upButton.className =
      "maplibregl-ctrl-icon maplibregl-ctrl-floor-up dark:text-black";
    upButton.innerHTML = "&#8593;"; // Up arrow
    upButton.addEventListener("click", () => {
      const nextFloor = availableFloors[activeIndex + 1];
      if (nextFloor !== undefined) {
        setCurrentFloor(nextFloor);
      }
    });

    const downButton = document.createElement("button");
    downButton.className =
      "maplibregl-ctrl-icon maplibregl-ctrl-floor-down dark:text-black";
    downButton.innerHTML = "&#8595;"; // Down arrow
    downButton.addEventListener("click", () => {
      const nextFloor = availableFloors[activeIndex - 1];
      if (nextFloor !== undefined) {
        setCurrentFloor(nextFloor);
      }
    });

    floorControl._container.append(upButton);
    floorControl._container.append(downButton);

    return () => {
      map?.removeControl(floorControl);
    };
  }, [currentFloor, map, setCurrentFloor]);

  return null;
}
