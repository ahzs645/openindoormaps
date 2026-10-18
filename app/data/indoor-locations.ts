import { createLocationLoader } from "./location-loader";

/** Optional dedicated indoor-project hosting: SITE_DEMOS=indoor npm run build:pages.
 * Prepared projects load through their own routes; no venue datasets are bundled. */
export const locationCatalog: { slug: string; name: string }[] = [];
export const loadLocation = createLocationLoader({});
