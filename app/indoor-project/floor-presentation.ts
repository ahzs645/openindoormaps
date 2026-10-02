import type { IndoorDataset } from "./contract";
import { projectDisplayGeometry } from "./display-geometry";
import { visitorWallGeometry } from "./visitor-wall-geometry";
import {
  compactWallDetails,
  simpleRoomGeometry,
  simpleWallGeometry,
} from "./simple-wall-geometry";
import {
  buildingOverviewGeometry,
  buildingOverviewLabels,
} from "./zoom-presentation";
import { projectStairDisplay } from "./stair-display";
import { withoutPlatformWalls } from "./platform-walls";
import { relativeHeightGeometry } from "./relative-heights";
import { physicalWallCopies } from "./physical-walls";
import { rampFloorApertures } from "./ramp-floor-apertures";

export type FloorPresentationOptions = {
  relativeHeights?: boolean;
  showPillars: boolean;
  showPassThroughPlaces: boolean;
  showVestibuleDoors: boolean;
  showStructures: boolean;
};

function buildFloorPresentation(
  data: IndoorDataset,
  levelIds: number[],
  building: string,
  options: FloorPresentationOptions,
) {
  const display = projectDisplayGeometry(
    data,
    levelIds,
    building,
    "",
    options.showPillars,
    true,
    options.showPassThroughPlaces,
    options.showVestibuleDoors,
    options.relativeHeights ? physicalWallCopies(data, levelIds) : undefined,
  );
  const visitorWalls = visitorWallGeometry(
    data,
    display.exposedWalls,
    display.records,
  );
  const details = compactWallDetails(data, display.records);
  const result = {
    display,
    visitorWalls,
    simpleWalls: simpleWallGeometry(
      data,
      options.showStructures ? display.exposedWalls : visitorWalls,
      details,
    ),
    simpleRooms: simpleRoomGeometry(data, display.roomBlocks, details),
    simpleAreas: simpleRoomGeometry(data, display.areas, details),
    overviewGeometry: buildingOverviewGeometry(data, display.records),
    overviewLabels: buildingOverviewLabels(data, display.records),
    nativeStairs: projectStairDisplay(
      data,
      levelIds,
      building,
      options.relativeHeights,
    ),
  };
  if (!options.relativeHeights) return result;
  return {
    ...result,
    display: {
      ...display,
      areas: rampFloorApertures(
        data,
        levelIds,
        relativeHeightGeometry(data, levelIds, display.areas, "floor"),
      ),
      walls: relativeHeightGeometry(
        data,
        levelIds,
        withoutPlatformWalls(data, display.walls),
        "wall",
      ),
      exposedWalls: relativeHeightGeometry(
        data,
        levelIds,
        withoutPlatformWalls(data, display.exposedWalls),
        "wall",
      ),
      roomBlocks: rampFloorApertures(
        data,
        levelIds,
        relativeHeightGeometry(data, levelIds, display.roomBlocks, "room"),
      ),
      doorFootprints: relativeHeightGeometry(
        data,
        levelIds,
        display.doorFootprints,
        "door",
      ),
      labels: relativeHeightGeometry(data, levelIds, display.labels, "label"),
      lowerRooms: relativeHeightGeometry(
        data,
        levelIds,
        display.lowerRooms,
        "lower",
      ),
      lowerWalls: relativeHeightGeometry(
        data,
        levelIds,
        display.lowerWalls,
        "lower",
      ),
      lowerOpenings: relativeHeightGeometry(
        data,
        levelIds,
        display.lowerOpenings,
        "opening",
      ),
    },
    visitorWalls: relativeHeightGeometry(
      data,
      levelIds,
      withoutPlatformWalls(data, result.visitorWalls),
      "wall",
    ),
    simpleWalls: relativeHeightGeometry(
      data,
      levelIds,
      withoutPlatformWalls(data, result.simpleWalls),
      "wall",
    ),
    simpleRooms: rampFloorApertures(
      data,
      levelIds,
      relativeHeightGeometry(data, levelIds, result.simpleRooms, "room"),
    ),
    simpleAreas: rampFloorApertures(
      data,
      levelIds,
      relativeHeightGeometry(data, levelIds, result.simpleAreas, "floor"),
    ),
  };
}

/** Only immutable presentation data is shared. Project edits/imports replace the
 * dataset, so they get a fresh cache; selection, routes and label preferences
 * stay outside it. Limit retained floor/settings combinations for large models.
 * Three.js layers remain owned and disposed by the map, never by this cache. */
export function createFloorPresentationCache(capacity = 12) {
  const datasets = new WeakMap<
    IndoorDataset,
    Map<string, ReturnType<typeof buildFloorPresentation>>
  >();
  return (
    data: IndoorDataset,
    levelIds: number[],
    building: string,
    options: FloorPresentationOptions,
  ) => {
    const levels = [...new Set(levelIds)].sort((a, b) => a - b);
    const key = JSON.stringify([
      levels,
      building,
      options.relativeHeights ?? false,
      options.showPillars,
      options.showPassThroughPlaces,
      options.showVestibuleDoors,
      options.showStructures,
    ]);
    let floors = datasets.get(data);
    if (!floors) {
      floors = new Map();
      datasets.set(data, floors);
    }
    const cached = floors.get(key);
    if (cached) {
      floors.delete(key);
      floors.set(key, cached);
      return cached;
    }
    const presentation = buildFloorPresentation(
      data,
      levels,
      building,
      options,
    );
    floors.set(key, presentation);
    if (floors.size > capacity) floors.delete(floors.keys().next().value!);
    return presentation;
  };
}

export const floorPresentation = createFloorPresentationCache();
export type FloorPresentation = ReturnType<typeof floorPresentation>;
