import type { IndoorDataset } from "./contract";
import type { PreparedFloor } from "./prepared-floor";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { overviewGround } from "./overview-ground";
import { projectStrictOverviewFloor } from "./overview-floor-projection";

/** Worker-only backing for supported thresholds omitted from the native area
 * paint. nativeFloorGround already intersected these physical pieces with the
 * certified indoor envelope; stairCutAreas retains its ramp and stair cuts.
 * Never reconstruct the backing from raw walkingSupport slabs. Retain these
 * prepared holes and apply the current reviewed exclusions.
 * This sits beneath native area tint; it is never a new navigation surface. */
export function prepareOverviewFloor(
  data: IndoorDataset,
  prepared: PreparedFloor,
): FeatureCollection<MultiPolygon> {
  if (
    data.nativeIndoorEnvelopes &&
    data.nativeIndoorEnvelopes.sourceModelSha256 !== data.source.modelSha256
  )
    return { type: "FeatureCollection", features: [] };
  if (data.nativeIndoorEnvelopes)
    return projectStrictOverviewFloor(data, prepared, data.source.modelSha256)
      .floor;
  return overviewGround(data, {
    ...prepared.stairCutAreas,
    features: prepared.stairCutAreas.features.filter(
      (feature) =>
        feature.properties?.nativeFloor === true &&
        feature.properties?.nativePhysical === true,
    ),
  });
}
