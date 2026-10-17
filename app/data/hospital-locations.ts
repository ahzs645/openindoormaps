import { createLocationLoader } from "./location-loader";

/** Optional hosting profile: retain the reference hospital without shipping
 * unrelated demo datasets alongside a complete hosted campus package. */
export const locationCatalog = [
  { slug: "bc-hospital", name: "BC Children’s and Women’s Hospital Campus" },
];
export const loadLocation = createLocationLoader({
  "bc-hospital": () => import("./bc-hospital"),
});
