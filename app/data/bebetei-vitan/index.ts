import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois } from "./location-data";
import topLocations from "./top-locations";

const bebeteiVitan: LocationConfig = {
  name: "BebeTei Vitan",
  slug: "bebetei-vitan",
  totemPoiName: "J39",
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 376,
  },
  mapConfig: {
    center: [26.1401, 44.4195] as [number, number],
    zoom: 20,
    mobileZoom: 19,
    bearing: 0,
    pitch: 40,
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
  },
};

export default bebeteiVitan;
