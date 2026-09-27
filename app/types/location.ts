import type { LucideIcon } from "lucide-react";
import type { FloorNames } from "~/utils/floor";

export interface TopLocation {
  name: string;
  icon: LucideIcon;
  colors: string;
}

export interface LocationConfig {
  name: string;
  slug: string;
  totemPoiName: string;
  ui?: {
    desktopPanelPlacement?: "overlay" | "sidebar";
    desktopPanelWidth?: number;
  };
  mapConfig: {
    center: [number, number];
    defaultFloor?: number;
    zoom: number;
    mobileZoom: number;
    bearing: number;
    pitch: number;
    showBasemap3dBuildings?: boolean;
    visibleFloors?: number[];
    /** Venue floor names keyed by floor number, e.g. `{ 0: "Ground Floor" }`. */
    floorNames?: FloorNames;
  };
  data: {
    indoorMap: GeoJSON.FeatureCollection;
    indoorRoutes: GeoJSON.FeatureCollection;
    pois: GeoJSON.FeatureCollection;
    topLocations: TopLocation[];
  };
}
