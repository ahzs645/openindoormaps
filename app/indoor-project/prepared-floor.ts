import { generalizedRoomGeometry } from "./generalized-room-geometry";
import { nativeFloorGround } from "./native-floor-ground";
import { visitorRoomSurfaces } from "./visitor-room-surfaces";
import { relativeHeightGeometry } from "./relative-heights";
import { rampFloorApertures } from "./ramp-floor-apertures";
import {
  wallFaceFloorSurfaces,
  wallFaceRoomFloorMasks,
  wallFaceSelectionSurfaces,
} from "./wall-face-floor-masks";
import type { IndoorDataset } from "./contract";
import type { PreparedDisplayAssetRequest } from "./prepared-display-registry";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { ROOM_BLOCK_HEIGHT_METRES, roomDisplayColor } from "./display-geometry";
import { projectPlaceColor } from "./visitor-metadata";
import {
  floorPresentation,
  type FloorPresentationOptions,
} from "./floor-presentation";
import { sourceStairAreaKeys } from "./source-stairs";
import { stairPlaceGround } from "./stair-place-ground";
import { stairSurroundGround } from "./stair-surround-ground";
import { stairSlabGround } from "./stair-slab-ground";
import { stairsAboveDisplayedGround } from "./stair-ground-occlusion";
import { stairFloorApertures } from "./stair-floor-apertures";

export type FloorPreparationOptions = FloorPresentationOptions & {
  review: boolean;
  simplifyGeometry: boolean;
};

/** Pure preparation shared by the worker and geometry regression checks. Both
 * camera modes use these same footprints; no routes or source data are edited. */
export function prepareFloor(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  options: FloorPreparationOptions,
) {
  const physicalHeights =
    !!data.nativeIndoorEnvelopes || !!options.relativeHeights;
  const presentation = floorPresentation(data, levelIds, building, {
    ...options,
    visitorStairs: !options.review,
  });
  const unoccluded = presentation.nativeStairs;
  const places = new Set(data.records.filter((r) => r.stair).map((r) => r.key));
  const nativeStairKeys = [
    ...new Set([
      ...sourceStairAreaKeys(
        data,
        unoccluded.features.map((f) => Number(f.properties?.stairElementId)),
        levelIds,
      ),
      ...unoccluded.features
        .map((f) => String(f.properties?.key))
        .filter((key) => places.has(key)),
    ]),
  ];
  const stairSurroundKeys =
    !options.review &&
    data.walkingSupport?.sourceModelSha256 === data.source.modelSha256
      ? presentation.display.records.filter((r) => r.stair).map((r) => r.key)
      : [];
  const areas =
    !options.review && options.simplifyGeometry
      ? presentation.simpleAreas
      : presentation.display.areas;
  const rooms =
    !options.review && options.simplifyGeometry
      ? presentation.simpleRooms
      : presentation.display.roomBlocks;
  let roomBlocks = {
    ...rooms,
    features: rooms.features.filter(
      (f) =>
        !nativeStairKeys.includes(String(f.properties?.key)) &&
        !stairSurroundKeys.includes(String(f.properties?.key)),
    ),
  };
  const visitorAreas = visitorRoomSurfaces(areas, options.review);
  const floorMasks =
    options.review || data.nativeIndoorEnvelopes
      ? new Map()
      : wallFaceRoomFloorMasks(data, presentation.display.records);
  const selectionAreas = wallFaceSelectionSurfaces(
    data,
    presentation.display.areas,
    floorMasks,
  );
  const byKey = new Map(data.records.map((r) => [r.key, r]));
  let assumedRoomBlocks: FeatureCollection<MultiPolygon> = {
    ...roomBlocks,
    features: selectionAreas.features
      .filter(
        (f) =>
          f.properties?.floorMaskSource === "assumed-native-wall-enclosure",
      )
      .map((f) => {
        const record = byKey.get(String(f.properties?.key))!;
        return {
          ...f,
          properties: {
            ...f.properties,
            color:
              projectPlaceColor(data, record) ??
              roomDisplayColor(record, false),
            height: ROOM_BLOCK_HEIGHT_METRES,
            boundarySource: "assumed-native-wall-enclosure",
            displayOnly: true,
          },
        };
      }),
  };
  if (physicalHeights)
    assumedRoomBlocks = relativeHeightGeometry(
      data,
      levelIds,
      assumedRoomBlocks,
      "room",
    );
  roomBlocks = {
    ...roomBlocks,
    features: [...roomBlocks.features, ...assumedRoomBlocks.features],
  };
  const volumeKeys = new Set(
    assumedRoomBlocks.features.map((f) => String(f.properties?.key)),
  );
  const withRaisedLabels = {
    ...presentation,
    display: {
      ...presentation.display,
      labels: {
        ...presentation.display.labels,
        features: presentation.display.labels.features.map((f) =>
          volumeKeys.has(String(f.properties?.key))
            ? {
                ...f,
                properties: {
                  ...f.properties,
                  heightMetres:
                    Number(f.properties?.heightMetres ?? 0.03) +
                    ROOM_BLOCK_HEIGHT_METRES,
                },
              }
            : f,
        ),
      },
    },
  };
  const shownAreas = options.review
    ? visitorAreas
    : wallFaceFloorSurfaces(
        data,
        presentation.display.records,
        visitorAreas,
        floorMasks,
      );
  const nativeGround = nativeFloorGround(data, levelIds, building);
  const nativeSurfaces = physicalHeights
    ? rampFloorApertures(
        data,
        levelIds,
        relativeHeightGeometry(
          data,
          levelIds,
          {
            type: "FeatureCollection",
            features: nativeGround,
          },
          "floor",
        ),
      ).features
    : nativeGround;
  const sourceGround = {
    ...shownAreas,
    features: [
      ...nativeSurfaces,
      ...(options.review
        ? []
        : data.nativeIndoorEnvelopes
          ? []
          : stairSlabGround(data, nativeSurfaces, unoccluded)),
      ...shownAreas.features,
    ],
  };
  const physicalGround = data.nativeIndoorEnvelopes
    ? sourceGround
    : (options.review ? stairPlaceGround : stairSurroundGround)(
        data,
        sourceGround,
      );
  const nativeStairs = stairsAboveDisplayedGround(
    unoccluded,
    physicalGround,
    physicalHeights,
    data,
  );
  return {
    presentation: withRaisedLabels,
    assumedRoomBlocks,
    nativeStairKeys,
    stairSurroundKeys,
    selectionAreas:
      !options.review && options.simplifyGeometry
        ? generalizedRoomGeometry(data, selectionAreas)
        : selectionAreas,
    physicalGround,
    nativeStairs,
    stairCutAreas: stairFloorApertures(
      physicalGround,
      nativeStairs,
      physicalHeights,
      data,
    ),
    stairCutRooms: stairFloorApertures(
      roomBlocks,
      nativeStairs,
      physicalHeights,
      data,
    ),
  };
}
export type PreparedFloor = ReturnType<typeof prepareFloor>;
export type FloorPreparationRequest = {
  requestId: number;
  data?: IndoorDataset;
  levelIds: number[];
  building: string;
  options: FloorPreparationOptions;
  preparedDisplay?: PreparedDisplayAssetRequest;
};
export type FloorPreparationResponse =
  | { requestId: number; value: PreparedFloor; memoryCostBytes?: number }
  | { requestId: number; error: string };
