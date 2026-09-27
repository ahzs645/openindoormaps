import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const galleria: LocationConfig = {
  name: "Galleria (synthetic demo)",
  slug: "galleria",
  totemPoiName: "Galleria Main Entrance",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [-0.126_877_3, 51.507_424_7],
    defaultFloor: 0,
    zoom: 18,
    mobileZoom: 17,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: false,
    visibleFloors: [0, 1],
    floorNames: { 0: "Level 1", 1: "Level 2" },
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default galleria;
