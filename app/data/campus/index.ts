import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const campus: LocationConfig = {
  name: "Campus (synthetic multi-building demo)",
  slug: "campus",
  totemPoiName: "Main Quad",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [-0.1645, 51.507_25],
    defaultFloor: 0,
    zoom: 17.2,
    mobileZoom: 16.6,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: false,
    visibleFloors: [0, 1, 2, 3],
    floorNames: { 0: "Ground Floor", 1: "Level 2", 2: "Level 3", 3: "Level 4" },
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default campus;
