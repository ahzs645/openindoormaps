import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const unbc: LocationConfig = {
  name: "UNBC IFC Import",
  slug: "unbc",
  totemPoiName: "Floor 1 overview",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [-122.808_231, 53.885_731],
    defaultFloor: 1,
    zoom: 18,
    mobileZoom: 17,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: true,
    visibleFloors: [1, 2, 3, 4, 5, 6],
    // IFC storey numbers are the building's own floor numbers.
    floorNames: Object.fromEntries(
      [0, 0.5, 1, 1.25, 1.5, 2, 3, 3.5, 4, 4.5, 5, 6].map((floor) => [
        floor,
        `Floor ${floor}`,
      ]),
    ),
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default unbc;
