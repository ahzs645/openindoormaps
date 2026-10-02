import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const bowieState: LocationConfig = {
  name: "Bowie State University (Mappedin campus)",
  slug: "bowie-state",
  totemPoiName: "Student Center",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [-76.7598, 39.018_96],
    defaultFloor: 0,
    zoom: 16.4,
    mobileZoom: 15.6,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: false,
    visibleFloors: [-1, 0, 1, 2, 3],
    // Mappedin names each building's floors "Floor 0 (TML)" … "Floor 4
    // (CNSMN)"; elevation 0 is every building's Floor 1 and the campus.
    floorNames: {
      [-1]: "Floor 0 (Lower Level)",
      0: "Floor 1",
      1: "Floor 2",
      2: "Floor 3",
      3: "Floor 4",
    },
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default bowieState;
