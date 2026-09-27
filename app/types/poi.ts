/**
 * Simplified POI type derived from GeoJSON Feature.
 *
 * While POIs are stored as GeoJSON Features for MapLibre layer rendering
 *
 * This flattened structure is used for:
 * - Geocoding operations (translating POI to coordinates) because MiniSearch requires flat objects
 * - Discovery panel state management
 *
 * Use this type instead of GeoJSON.Feature when working with search and UI components.
 */

export interface POI {
  id: number;
  name: string;
  coordinates: GeoJSON.Position;
  floor?: number;
  type?: string;
  metadata?: POIMetadata;
}

/** Weekly hours keyed by English day name; absent days are closed. */
export type WeeklyHours = Partial<Record<string, [string, string][]>>;

/**
 * Optional location-card content. Field names follow the vendor ports
 * (docs/viewer-data-models.md): Pointr supplies openHours/rating/priceLevel/
 * buttons, Mappedin supplies openHours/phone/social/status.
 */
export interface POIMetadata {
  category?: string;
  description?: string;
  logo?: string;
  images?: string[];
  tags?: string[];
  keywords?: string[];
  /** Structured weekly hours, e.g. `{ Monday: [["09:00", "20:00"]] }`. */
  openHours?: WeeklyHours;
  /** Free text (`"Mon-Sat: 10am - 9pm"`) or range map (`{ "mon-sun": "09:00-21:00" }`). */
  openingHours?: string | Record<string, string>;
  phone?: string;
  link?: string;
  social?: Record<string, string>;
  rating?: number;
  numberOfRatings?: number;
  priceLevel?: string;
  status?: string;
  buttons?: {
    name: string;
    action: "tel" | "href" | "mailto";
    intent: string;
  }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
