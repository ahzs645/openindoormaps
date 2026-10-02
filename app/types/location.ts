import type { LucideIcon } from "lucide-react";
import type { FloorNames } from "~/utils/floor";
import type { RouteTiming } from "~/utils/route-summary";

export interface TopLocation {
  name: string;
  icon: LucideIcon;
  colors: string;
}

export interface VenueCategory {
  id: string;
  name: string;
  children?: string[];
  color?: string;
  iconFromDefaultList?: string;
}

export interface VenueFloorStack {
  id: string;
  name: string;
  shortName: string;
  defaultFloor: number;
  floors: {
    id: string;
    level: number;
    name: string;
    shortName: string;
    bounds: number[];
  }[];
}

export interface LocationConfig {
  name: string;
  slug: string;
  totemPoiName: string;
  routeTiming?: RouteTiming;
  ui?: {
    desktopPanelPlacement?: "overlay" | "sidebar";
    desktopPanelWidth?: number;
    hospitalStyle?: boolean;
  };
  mapConfig: {
    center: [number, number];
    defaultFloor?: number;
    zoom: number;
    mobileZoom: number;
    bearing: number;
    pitch: number;
    showBasemap3dBuildings?: boolean;
    /** Reveal nested room polygons without raised department surfaces. */
    cutawayRooms?: boolean;
    roomViewControl?: boolean;
    visibleFloors?: number[];
    /** Venue floor names keyed by floor number, e.g. `{ 0: "Ground Floor" }`. */
    floorNames?: FloorNames;
  };
  data: {
    indoorMap: GeoJSON.FeatureCollection;
    indoorRoutes: GeoJSON.FeatureCollection;
    pois: GeoJSON.FeatureCollection;
    topLocations: TopLocation[];
    categories?: VenueCategory[];
    floorStacks?: VenueFloorStack[];
    floorContext?: GeoJSON.FeatureCollection;
  };
}
