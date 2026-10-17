import type { Feature } from "geojson";
import type { PreparedDisplayPayload } from "./prepared-display-assets";
import type {
  ProgressiveManifest,
  ProgressiveScope,
  ProgressiveOverview,
} from "./progressive-delivery";
import { PUBLISHED_CIRCULATION_PAINT_REVIEW } from "./published-circulation-paint-reviews";
import { consistentOverviewCirculation } from "./overview-circulation-paint";

type Review = {
  format: string;
  datasetSha256: string;
  engineSha256: string;
  revisionSha256: string;
  preparedLogicalSha256: string;
  scopeId: string;
  additionalScopes?: readonly {
    scopeId: string;
    preparedLogicalSha256: string;
  }[];
  decisions: readonly {
    nativeRegionId: string;
    levelId: number;
    roomKeys: readonly string[];
    color: string;
  }[];
};
function matchesReview(
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  review: Review,
) {
  return (
    review.format === "openindoormaps-published-circulation-paint-v1" &&
    review.datasetSha256 === manifest.provenance.datasetSha256 &&
    review.engineSha256 === manifest.provenance.enginePreparationSha256 &&
    review.revisionSha256 === manifest.revisionSha256 &&
    [review, ...(review.additionalScopes ?? [])].some(
      (approved) =>
        approved.scopeId === scope.id &&
        approved.preparedLogicalSha256 ===
          scope.display.descriptor.logicalJsonSha256,
    )
  );
}

/** Decorate the already verified small overview as well as the full floor.
 * Do not change the stored asset, its binding, or any geometry. */
export function applyPublishedOverviewCirculationPaint(
  input: ProgressiveOverview,
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  review: Review = PUBLISHED_CIRCULATION_PAINT_REVIEW,
): ProgressiveOverview {
  const consistent = consistentOverviewCirculation(input.geometry);
  if (!matchesReview(manifest, scope, review))
    return consistent === input.geometry
      ? input
      : { ...input, geometry: consistent };
  const decisions = new Map(review.decisions.map((d) => [d.nativeRegionId, d]));
  let changed = consistent !== input.geometry;
  const features = consistent.features.map((feature) => {
    const p = feature.properties,
      d = decisions.get(p?.nativeRegionId);
    if (!d) return feature;
    if (
      p?.levelId !== d.levelId ||
      JSON.stringify(p.roomKeys) !== JSON.stringify(d.roomKeys)
    )
      throw new Error(
        "Overview circulation review no longer matches its native face.",
      );
    changed = true;
    return {
      ...feature,
      properties: { ...p, color: d.color, circulation: true },
    };
  });
  return changed ? { ...input, geometry: { ...consistent, features } } : input;
}
/** A separately recorded display review follows exact current prepared faces.
 * Change only paint properties. Boundaries, room associations, original exact
 * topology, slopes, heights, portals, permissions and source data stay intact. */
export function applyPublishedCirculationPaint(
  value: PreparedDisplayPayload,
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  review: Review = PUBLISHED_CIRCULATION_PAINT_REVIEW,
): PreparedDisplayPayload {
  const overview = consistentOverviewCirculation(value.nativeFaces.overview);
  const geometry = consistentOverviewCirculation(
    value.preparedFloor.presentation.overviewGeometry,
  );
  if (
    overview !== value.nativeFaces.overview ||
    geometry !== value.preparedFloor.presentation.overviewGeometry
  )
    value = {
      ...value,
      nativeFaces: { ...value.nativeFaces, overview },
      preparedFloor: {
        ...value.preparedFloor,
        presentation: {
          ...value.preparedFloor.presentation,
          overviewGeometry: geometry,
        },
      },
    };
  if (!matchesReview(manifest, scope, review)) return value;
  const regions = new Map(value.nativeFaces.regions.map((r) => [r.id, r]));
  const colors = new Map<string, string>();
  for (const decision of review.decisions) {
    const region = regions.get(decision.nativeRegionId);
    if (
      !region ||
      region.levelId !== decision.levelId ||
      JSON.stringify(region.roomKeys) !== JSON.stringify(decision.roomKeys)
    )
      throw new Error(
        "Circulation paint review no longer matches its native face.",
      );
    colors.set(region.id, decision.color);
  }
  const memo = new WeakMap<object, unknown>();
  const paint = <T extends object>(input: T): T => {
    const prior = memo.get(input);
    if (prior) return prior as T;
    let changed = false;
    const out = Object.fromEntries(
      Object.entries(input).map(([key, item]) => {
        if (
          item &&
          typeof item === "object" &&
          item.type === "FeatureCollection" &&
          Array.isArray(item.features)
        ) {
          let edits = false;
          const features = item.features.map((feature: Feature) => {
            const color = colors.get(feature.properties?.nativeRegionId);
            if (!color) return feature;
            edits = true;
            return {
              ...feature,
              properties: { ...feature.properties, color, circulation: true },
            };
          });
          if (edits) {
            changed = true;
            return [key, { ...item, features }];
          }
        } else if (
          (key === "presentation" || key === "display") &&
          item &&
          typeof item === "object"
        ) {
          const next = paint(item);
          if (next !== item) {
            changed = true;
            return [key, next];
          }
        }
        return [key, item];
      }),
    );
    const result = changed ? (out as T) : input;
    memo.set(input, result);
    return result;
  };
  return {
    nativeFaces: paint(value.nativeFaces),
    preparedFloor: paint(value.preparedFloor),
  };
}
