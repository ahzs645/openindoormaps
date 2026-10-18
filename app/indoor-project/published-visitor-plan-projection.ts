/** A drawing transport projection of a complete normally verified floor.
 * It cannot become a routing/source dataset. Coordinates, holes and owners are
 * copied exactly; only the existing tile transport removes preparation fields. */
import type {
  ProgressiveManifest,
  ProgressiveScope,
  ProgressiveShell,
  ProgressivePresentationContext,
} from "./progressive-delivery";
import type { PreparedDisplayPayload } from "./prepared-display-assets";
import type { PublishedVisitorPlan } from "./published-visitor-plan-types";
import { mapDrawingFeatures } from "./map-drawing-features";
import { visitorRoomSurfaces } from "./visitor-room-surfaces";
import { publishedVisitorPlanLabels } from "./published-visitor-plan-labels";
import {
  mapSourceFeatures,
  NATIVE_EXPLORE_PROPERTIES,
} from "./map-source-properties";
export function projectPublishedVisitorPlan(
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  display: PreparedDisplayPayload,
  context: ProgressivePresentationContext,
  displayFlags: ProgressiveShell["display"],
): PublishedVisitorPlan {
  const floor = display.preparedFloor,
    presentation = floor.presentation;
  const excluded = new Set([
    ...floor.nativeStairKeys,
    ...floor.stairSurroundKeys,
  ]);
  const rooms = {
    ...presentation.display.roomBlocks,
    features: [
      ...presentation.display.roomBlocks.features.filter(
        (f) => !excluded.has(String(f.properties?.key)),
      ),
      ...floor.assumedRoomBlocks.features,
    ],
  };
  const nativeLevels =
    display.nativeFaces.regions.length > 0 ? scope.levelIds : [];
  const nativeKeys = new Set(
    presentation.display.records
      .filter((r) => nativeLevels.includes(r.levelId))
      .map((r) => r.key),
  );
  // Exact existing nativeOpacity predicate: these generic features are
  // completely transparent in the current ordinary native 2D component.
  const visibleGeneric = <
    T extends { features: { properties: Record<string, unknown> | null }[] },
  >(
    collection: T,
  ): T => ({
    ...collection,
    features: collection.features.filter(
      (f) =>
        !nativeKeys.has(String(f.properties?.key)) &&
        !nativeLevels.includes(Number(f.properties?.levelId)),
    ),
  });
  const layers = {
    areas: visibleGeneric(visitorRoomSurfaces(floor.physicalGround, false)),
    rooms: visibleGeneric(rooms),
    walls:
      nativeLevels.length > 0 && displayFlags.nativeMaterialSections
        ? { type: "FeatureCollection" as const, features: [] }
        : ((displayFlags.windowMode === "native"
            ? presentation.nativeWindowPlanWalls?.visitor
            : undefined) ?? presentation.visitorWalls),
    doors: presentation.display.doorFootprints,
    stairs: floor.nativeStairs,
    windows: {
      ...presentation.nativeWindows,
      features: presentation.nativeWindows.features.filter(
        (f) => f.properties?.atPlanCut === true,
      ),
    },
    labels: publishedVisitorPlanLabels(
      context.visitorLabels,
      presentation.display.records,
      presentation.overviewLabels,
      presentation.display.labels,
    ),
    portals: context.portals,
    selection: visibleGeneric(floor.selectionAreas),
  };
  return {
    format: "openindoormaps-visitor-plan-v1",
    version: 1,
    revisionSha256: manifest.revisionSha256,
    engineSha256: scope.display.descriptor.binding.enginePreparationSha256,
    datasetSha256: manifest.provenance.datasetSha256,
    scopeId: scope.id,
    levelIds: [...scope.levelIds],
    bindingSha256: scope.display.descriptor.bindingSha256,
    pooledJsonSha256: scope.display.descriptor.pooledJsonSha256,
    display: { ...displayFlags },
    layers: Object.fromEntries(
      Object.entries(layers).map(([key, value]) => [
        key,
        mapDrawingFeatures(value),
      ]),
    ) as PublishedVisitorPlan["layers"],
    ...(display.nativeFaces.regions.length > 0
      ? {
          native: {
            ...Object.fromEntries(
              (
                [
                  "fills",
                  "overview",
                  "outlines",
                  "partitions",
                  "walls",
                ] as const
              ).map((key) => [
                key,
                mapSourceFeatures(
                  mapDrawingFeatures(
                    display.nativeFaces[key] ?? {
                      type: "FeatureCollection",
                      features: [],
                    },
                  ),
                  NATIVE_EXPLORE_PROPERTIES,
                ),
              ]),
            ),
            regions: display.nativeFaces.regions.map(
              ({ id, levelId, roomKeys }) => ({
                id,
                levelId,
                roomKeys: [...roomKeys],
              }),
            ),
          } as NonNullable<PublishedVisitorPlan["native"]>,
        }
      : {}),
  };
}
