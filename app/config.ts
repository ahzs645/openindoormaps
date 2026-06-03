import type { MapOptions } from "maplibre-gl";
import {
  buildingCenter,
  buildingMaxBounds,
  buildingSource,
} from "~/data/building";

const isMobile =
  typeof globalThis === "undefined" ? false : globalThis.innerWidth < 640;

const demoMaxBounds = [
  [3.098_579_765_873_666, 45.753_206_988_746_97],
  [3.120_672_060_142_396_7, 45.764_883_726_343_584],
] as const;

const usesGeneratedBuilding = buildingSource === "generated";
const defaultZoom = isMobile ? 17 : 18.5;
const generatedZoom = isMobile ? 14.8 : 15.2;
const mapZoom = usesGeneratedBuilding ? generatedZoom : defaultZoom;
const mapBearing = usesGeneratedBuilding ? 0 : 60;
const mapPitch = usesGeneratedBuilding ? 0 : 40;

const config = {
  geoCodingApi: "https://nominatim.openstreetmap.org",
  routingApi: "https://router.project-osrm.org/route/v1",
  mapConfig: {
    center: buildingCenter,
    zoom: mapZoom,
    bearing: mapBearing,
    pitch: mapPitch,
    maxBounds: buildingMaxBounds ?? demoMaxBounds,
  } as MapOptions,
  mapStyles: {
    light: "https://tiles.openfreemap.org/styles/bright",
    dark: "/styles/dark/style.json",
  },
};

export default config;
