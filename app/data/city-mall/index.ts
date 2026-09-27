import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const cityMall: LocationConfig = {
  name: "City Mall (Situm demo venue)",
  slug: "city-mall",
  totemPoiName: "Primark",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [-8.424_97, 43.352_13],
    defaultFloor: 0,
    zoom: 17,
    mobileZoom: 16,
    bearing: 0,
    pitch: 45,
    showBasemap3dBuildings: false,
    visibleFloors: [-1, 0, 1],
    floorNames: { [-1]: "Basement", 0: "Ground Floor", 1: "1st Floor" },
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default cityMall;
