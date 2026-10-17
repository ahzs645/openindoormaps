/** Export-only entry point. Its shared display-projection implementation stays
 * outside the unchanged preparation-engine graph. Decode/verify prepared
 * payloads and their matching dataset before calling this projection. */
export {
  projectStrictOverviewFloor,
  STRICT_OVERVIEW_FLOOR_PROJECTION_VERSION,
} from "../../app/indoor-project/overview-floor-projection.ts";
