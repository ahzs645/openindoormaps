import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const eatonCentre: LocationConfig = {
  name: "CF Toronto Eaton Centre (Mappedin)",
  slug: "eaton-centre",
  totemPoiName: "Guest Services",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [-79.3822, 43.653_74],
    defaultFloor: 0,
    zoom: 17.2,
    mobileZoom: 16.4,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: false,
    visibleFloors: [-2, -1, 0, 1, 2],
    // Mappedin's own floor names; elevation 0 is "Level 2" (street level).
    floorNames: {
      [-2]: "Urban Eatery",
      [-1]: "Level 1",
      0: "Level 2",
      1: "Level 3",
      2: "Level 4",
    },
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default eatonCentre;
