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
    center: [-122.808231, 53.885731],
    defaultFloor: 1,
    zoom: 18,
    mobileZoom: 17,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: true,
    visibleFloors: [1, 2, 3, 4, 5, 6],
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default unbc;
