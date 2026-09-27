import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const mappedinMall: LocationConfig = {
  name: "Demo Mall (Mappedin demo venue)",
  slug: "mappedin-mall",
  totemPoiName: "Lululemon",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [-78.9447, 43.8614],
    defaultFloor: 0,
    zoom: 16,
    mobileZoom: 15,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: false,
    visibleFloors: [0, 1],
    floorNames: { 0: "Lower Level", 1: "Upper Level" },
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default mappedinMall;
