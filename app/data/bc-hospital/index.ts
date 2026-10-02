import type { LocationConfig } from "~/types/location";
import { indoorMap, indoorRoutes, pois, floorContext } from "./location-data";
import floorStacks from "./floor-stacks.json";
import categories from "./categories.json";
import topLocations from "./top-locations";

const bcHospital: LocationConfig = {
  name: "BC Children’s and Women’s Hospital Campus",
  slug: "bc-hospital",
  totemPoiName: "Breast Health Clinic & Bone Density",
  // The captured demo estimates walking at 1.42 m/s, without elevator waits.
  routeTiming: {
    walkingSpeedMetersPerSecond: 1.42,
    includeTransitionTime: false,
  },
  ui: {
    desktopPanelPlacement: "overlay",
    desktopPanelWidth: 360,
    hospitalStyle: true,
  },
  mapConfig: {
    center: [-123.124_056, 49.244_457],
    defaultFloor: 0,
    zoom: 17.7,
    mobileZoom: 16,
    bearing: -45,
    pitch: 40,
    showBasemap3dBuildings: false,
    cutawayRooms: true,
    roomViewControl: true,
    visibleFloors: [-100, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
    floorNames: {
      [-100]: "Campus outdoors",
      [-2]: "Parking Garage (Teck)",
      [-1]: "Lower level / Parking",
      0: "Level 1",
      1: "Level 2",
      2: "Level 3",
      3: "Level 4",
      4: "Level 5",
      5: "Level 6",
      6: "Level 7",
      7: "Level 8",
    },
  },
  data: {
    indoorMap,
    indoorRoutes,
    pois,
    topLocations,
    categories,
    floorStacks,
    floorContext,
  },
};
export default bcHospital;
