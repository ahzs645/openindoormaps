import type { LucideIcon } from "lucide-react";

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
  };
  data: {
    indoorMap: GeoJSON.FeatureCollection;
    indoorRoutes: GeoJSON.FeatureCollection;
    pois: GeoJSON.FeatureCollection;
    topLocations: TopLocation[];
  };
}
