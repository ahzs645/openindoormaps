import type { IndoorDataset } from "./contract";
import {
  floorPresentation,
  type FloorPresentationOptions,
} from "./floor-presentation";
import { sourceStairAreaKeys } from "./source-stairs";
import { stairPlaceGround } from "./stair-place-ground";
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
  const presentation = floorPresentation(data, levelIds, building, options);
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
  const areas =
    !options.review && options.simplifyGeometry
      ? presentation.simpleAreas
      : presentation.display.areas;
  const rooms =
    !options.review && options.simplifyGeometry
      ? presentation.simpleRooms
      : presentation.display.roomBlocks;
  const roomBlocks = {
    ...rooms,
    features: rooms.features.filter(
      (f) => !nativeStairKeys.includes(String(f.properties?.key)),
    ),
  };
  const physicalGround = stairPlaceGround(data, areas);
  const nativeStairs = stairsAboveDisplayedGround(
    unoccluded,
    physicalGround,
    options.relativeHeights ?? false,
  );
  return {
    presentation,
    nativeStairKeys,
    physicalGround,
    nativeStairs,
    stairCutAreas: stairFloorApertures(
      physicalGround,
      nativeStairs,
      options.relativeHeights ?? false,
    ),
    stairCutRooms: stairFloorApertures(
      roomBlocks,
      nativeStairs,
      options.relativeHeights ?? false,
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
};
export type FloorPreparationResponse =
  | { requestId: number; value: PreparedFloor }
  | { requestId: number; error: string };
