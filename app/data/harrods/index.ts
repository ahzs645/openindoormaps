import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const harrods: LocationConfig = {
  name: "Harrods (Pointr demo venue)",
  slug: "harrods",
  totemPoiName: "Louis Vuitton",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [-0.1629, 51.4992],
    defaultFloor: 0,
    zoom: 16,
    mobileZoom: 15,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: false,
    visibleFloors: [-1, 0, 1, 2, 3, 4, 5, 6],
    floorNames: {
      [-1]: "Lower Ground",
      0: "Ground Floor",
      1: "First Floor",
      2: "Second Floor",
      3: "Third Floor",
      4: "Fourth Floor",
      5: "Fifth Floor",
      6: "Sixth Floor",
    },
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default harrods;
