import type { IndoorDataset, IndoorRecord } from "./contract";
import type { NativeExploreResult } from "./native-explore";
import { isOverviewWalkway } from "./display-passages";
import { reviewedSeparatePlaceKeys } from "./reviewed-place-labels";

export type MixedHallwayIssue = {
  id: string;
  levelId: number;
  hallways: IndoorRecord[];
  otherPlaces: IndoorRecord[];
  staffCount: number;
};

/** Review classification only. Reuse the displayed native faces, including
 * holes; place annotations identify the conflict and never draw its boundary. */
export function nativeMixedHallwayIssues(
  data: IndoorDataset,
  result: NativeExploreResult,
): MixedHallwayIssue[] {
  const byKey = new Map(data.records.map((r) => [r.key, r]));
  const visible = new Set<string>();
  const green = new Set<string>();
  for (const feature of result.overview.features) {
    const id = feature.properties?.nativeRegionId;
    if (typeof id !== "string") continue;
    visible.add(id);
    if (feature.properties?.circulation === true) green.add(id);
  }
  return result.regions.flatMap((region) => {
    if (!visible.has(region.id) || green.has(region.id)) return [];
    // An owner-reviewed alias or retired label is not a place of its own.
    const places = reviewedSeparatePlaceKeys(data, region.roomKeys)
      .map((key) => byKey.get(key))
      .filter((room): room is IndoorRecord => !!room);
    const hallways = places.filter(isOverviewWalkway);
    const otherPlaces = places.filter((room) => !isOverviewWalkway(room));
    return hallways.length > 0 && otherPlaces.length > 0
      ? [
          {
            id: region.id,
            levelId: region.levelId,
            hallways,
            otherPlaces,
            staffCount: otherPlaces.filter((room) => room.access === "staff")
              .length,
          },
        ]
      : [];
  });
}

export function nativeMixedHallwayFeatures(
  result: NativeExploreResult | undefined,
  ids: readonly string[],
  kind: "overview" | "outlines" = "overview",
) {
  const selected = new Set(ids);
  return {
    type: "FeatureCollection" as const,
    features:
      result?.[kind].features.filter((feature) =>
        selected.has(String(feature.properties?.nativeRegionId)),
      ) ?? [],
  };
}
