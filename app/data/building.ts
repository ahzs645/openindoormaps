import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import generatedBuilding from "../../generated/unbc-layout-aware/building.bundle.json";
import demoBuilding from "~/mock/building.json";
import { normalizeFloorValue } from "~/utils/floor-utils";

type LngLat = [number, number];
type Bounds = [LngLat, LngLat];
type OutlineFeature = GeoJSON.Feature<GeoJSON.Polygon>;

interface RoomAnchor {
  coordinates: LngLat;
  floor: number;
  name: string;
  roomUse: string | null;
  type: string;
}

export interface AppBuildingBundle {
  id: number;
  name: string;
  description: string;
  address: string;
  location: {
    latitude: number;
    longitude: number;
  };
  levels?: number[];
  indoor_map: GeoJSON.FeatureCollection;
  indoor_routes: GeoJSON.FeatureCollection;
  pois: GeoJSON.FeatureCollection<GeoJSON.Point>;
  cad_overlay?: GeoJSON.FeatureCollection | null;
  cad_layouts?: Array<{
    id: string;
    name: string;
    building_code?: string | null;
    building_name?: string | null;
    floors?: number[];
    layout_zone?: string | null;
    is_overview?: boolean;
  }> | null;
  campus_reference?: GeoJSON.FeatureCollection<GeoJSON.Polygon> | null;
}

export const buildingSource =
  import.meta.env.VITE_BUILDING_SOURCE === "demo" ? "demo" : "generated";

const rawBuilding = (
  buildingSource === "demo" ? demoBuilding : generatedBuilding
) as AppBuildingBundle;

export const referenceOutline =
  buildingSource === "generated"
    ? ((rawBuilding.campus_reference as GeoJSON.FeatureCollection<GeoJSON.Polygon> | null) ??
      null)
    : null;

function collectCoordinates(value: unknown, coordinates: LngLat[]) {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    coordinates.push([value[0], value[1]]);
    return;
  }

  value.forEach((item) => collectCoordinates(item, coordinates));
}

function collectFeatureCoordinates(
  geometry: GeoJSON.Geometry | null | undefined,
  coordinates: LngLat[],
) {
  if (!geometry) {
    return;
  }

  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((item) =>
      collectFeatureCoordinates(item, coordinates),
    );
    return;
  }

  collectCoordinates(geometry.coordinates, coordinates);
}

function computeFeatureCollectionBounds(
  collection: GeoJSON.FeatureCollection | null | undefined,
): Bounds | null {
  const coordinates: LngLat[] = [];

  collection?.features.forEach((feature) => {
    collectFeatureCoordinates(feature.geometry, coordinates);
  });

  if (coordinates.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  coordinates.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

function computeBundleBounds(bundle: AppBuildingBundle): Bounds | null {
  const bounds = [
    computeFeatureCollectionBounds(bundle.indoor_map),
    computeFeatureCollectionBounds(bundle.indoor_routes),
    computeFeatureCollectionBounds(bundle.pois),
    computeFeatureCollectionBounds(bundle.cad_overlay),
  ].filter((value): value is Bounds => value !== null);

  if (bounds.length === 0) {
    return null;
  }

  const mergedBounds = [...bounds[0]] as Bounds;

  bounds.slice(1).forEach((current) => {
    mergedBounds[0][0] = Math.min(mergedBounds[0][0], current[0][0]);
    mergedBounds[0][1] = Math.min(mergedBounds[0][1], current[0][1]);
    mergedBounds[1][0] = Math.max(mergedBounds[1][0], current[1][0]);
    mergedBounds[1][1] = Math.max(mergedBounds[1][1], current[1][1]);
  });

  return mergedBounds;
}

function createPointFeature(
  coordinates: LngLat,
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates,
    },
    properties: {},
  };
}

function closeRing(points: LngLat[]): LngLat[] {
  if (points.length === 0) {
    return points;
  }

  const [firstX, firstY] = points[0];
  const [lastX, lastY] = points.at(-1) ?? points[0];
  if (firstX === lastX && firstY === lastY) {
    return points;
  }

  return [...points, points[0]];
}

function createPolygonFeature(
  id: number,
  coordinates: LngLat[],
  properties: GeoJSON.GeoJsonProperties,
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    id,
    geometry: {
      type: "Polygon",
      coordinates: [closeRing(coordinates)],
    },
    properties,
  };
}

function polygonArea(points: LngLat[]): number {
  const ring = closeRing(points);
  if (ring.length < 4) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area / 2);
}

function computeMedian(values: number[], fallback: number): number {
  if (values.length === 0) {
    return fallback;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  return sortedValues[Math.floor(sortedValues.length / 2)] ?? fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function nextSyntheticFeatureId(bundle: AppBuildingBundle): number {
  let nextId = 1;
  const collections = [bundle.indoor_map, bundle.indoor_routes, bundle.pois];

  collections.forEach((collection) => {
    collection.features.forEach((feature) => {
      const numericId =
        typeof feature.id === "number"
          ? feature.id
          : Number.parseInt(String(feature.id ?? ""), 10);

      if (Number.isFinite(numericId)) {
        nextId = Math.max(nextId, numericId + 1);
      }
    });
  });

  return nextId;
}

function pointInsideOutline(point: LngLat, outline: OutlineFeature): boolean {
  return booleanPointInPolygon(createPointFeature(point), outline);
}

function movePointInsideOutline(
  candidate: LngLat,
  anchor: LngLat,
  outline: OutlineFeature,
): LngLat {
  if (pointInsideOutline(candidate, outline)) {
    return candidate;
  }

  let insidePoint = anchor;
  let outsidePoint = candidate;

  for (let iteration = 0; iteration < 18; iteration += 1) {
    const midpoint: LngLat = [
      (insidePoint[0] + outsidePoint[0]) / 2,
      (insidePoint[1] + outsidePoint[1]) / 2,
    ];

    if (pointInsideOutline(midpoint, outline)) {
      insidePoint = midpoint;
    } else {
      outsidePoint = midpoint;
    }
  }

  return insidePoint;
}

function keepCellInsideOutline(
  corners: LngLat[],
  anchor: LngLat,
  outline: OutlineFeature,
): LngLat[] {
  const adjustedCorners = corners.map((corner) =>
    movePointInsideOutline(corner, anchor, outline),
  );

  for (let pass = 0; pass < 4; pass += 1) {
    let allMidpointsInside = true;

    for (let index = 0; index < adjustedCorners.length; index += 1) {
      const nextIndex = (index + 1) % adjustedCorners.length;
      const midpoint: LngLat = [
        (adjustedCorners[index][0] + adjustedCorners[nextIndex][0]) / 2,
        (adjustedCorners[index][1] + adjustedCorners[nextIndex][1]) / 2,
      ];

      if (pointInsideOutline(midpoint, outline)) {
        continue;
      }

      allMidpointsInside = false;
      adjustedCorners[index] = [
        (adjustedCorners[index][0] + anchor[0]) / 2,
        (adjustedCorners[index][1] + anchor[1]) / 2,
      ];
      adjustedCorners[nextIndex] = [
        (adjustedCorners[nextIndex][0] + anchor[0]) / 2,
        (adjustedCorners[nextIndex][1] + anchor[1]) / 2,
      ];
    }

    if (allMidpointsInside) {
      break;
    }
  }

  return adjustedCorners;
}

function collectVisibleRoomAnchors(
  pois: GeoJSON.FeatureCollection<GeoJSON.Point>,
): RoomAnchor[] {
  const anchors: RoomAnchor[] = [];

  pois.features.forEach((feature) => {
    const floor = normalizeFloorValue(feature.properties?.floor);
    if (floor === null) {
      return;
    }

    anchors.push({
      coordinates: feature.geometry.coordinates as LngLat,
      floor,
      name: String(feature.properties?.name ?? `Room ${feature.id}`),
      roomUse:
        typeof feature.properties?.metadata?.room_use === "string"
          ? feature.properties.metadata.room_use
          : null,
      type: String(feature.properties?.type ?? "unit"),
    });
  });

  return anchors;
}

function anchorInsideExistingPolygon(
  anchor: RoomAnchor,
  existingPolygons: GeoJSON.Feature<GeoJSON.Polygon>[],
): boolean {
  return existingPolygons.some((feature) => {
    const level = normalizeFloorValue(feature.properties?.level_id);
    if (level !== null && level !== anchor.floor) {
      return false;
    }

    return booleanPointInPolygon(
      createPointFeature(anchor.coordinates),
      feature as GeoJSON.Feature<GeoJSON.Polygon>,
    );
  });
}

function buildSyntheticFloorPlanFeatures(
  bundle: AppBuildingBundle,
  outline?: OutlineFeature,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const anchors = collectVisibleRoomAnchors(bundle.pois);
  if (anchors.length === 0) {
    return [];
  }

  const existingPolygonFeatures = bundle.indoor_map.features.filter(
    (
      feature,
    ): feature is GeoJSON.Feature<GeoJSON.Polygon, GeoJSON.GeoJsonProperties> =>
      feature.geometry?.type === "Polygon",
  );

  const syntheticBounds =
    computeFeatureCollectionBounds(bundle.pois) ??
    computeFeatureCollectionBounds(bundle.indoor_map);
  if (!syntheticBounds) {
    return [];
  }

  const syntheticWidth = syntheticBounds[1][0] - syntheticBounds[0][0];
  const syntheticHeight = syntheticBounds[1][1] - syntheticBounds[0][1];
  const rowTolerance = syntheticHeight / 500;
  const columnTolerance = syntheticWidth / 260;
  const fallbackWidth = syntheticWidth / 34;
  const fallbackHeight = syntheticHeight / 28;
  const anchorsByFloor = new Map<number, RoomAnchor[]>();

  anchors.forEach((anchor) => {
    if (anchorInsideExistingPolygon(anchor, existingPolygonFeatures)) {
      return;
    }

    const floorAnchors = anchorsByFloor.get(anchor.floor) ?? [];
    floorAnchors.push(anchor);
    anchorsByFloor.set(anchor.floor, floorAnchors);
  });

  let nextId = nextSyntheticFeatureId(bundle);
  const syntheticFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  anchorsByFloor.forEach((floorAnchors, floor) => {
    const nearestHorizontalGaps: number[] = [];
    const nearestVerticalGaps: number[] = [];

    floorAnchors.forEach((anchor) => {
      let horizontalGap = Number.POSITIVE_INFINITY;
      let verticalGap = Number.POSITIVE_INFINITY;

      floorAnchors.forEach((candidate) => {
        if (candidate === anchor) {
          return;
        }

        const dx = Math.abs(candidate.coordinates[0] - anchor.coordinates[0]);
        const dy = Math.abs(candidate.coordinates[1] - anchor.coordinates[1]);

        if (dy <= rowTolerance && dx > 0) {
          horizontalGap = Math.min(horizontalGap, dx);
        }

        if (dx <= columnTolerance && dy > 0) {
          verticalGap = Math.min(verticalGap, dy);
        }
      });

      if (Number.isFinite(horizontalGap)) {
        nearestHorizontalGaps.push(horizontalGap);
      }

      if (Number.isFinite(verticalGap)) {
        nearestVerticalGaps.push(verticalGap);
      }
    });

    const typicalWidth = computeMedian(nearestHorizontalGaps, fallbackWidth);
    const typicalHeight = computeMedian(nearestVerticalGaps, fallbackHeight);

    floorAnchors.forEach((anchor) => {
      const leftNeighbors: number[] = [];
      const rightNeighbors: number[] = [];
      const upperNeighbors: number[] = [];
      const lowerNeighbors: number[] = [];

      floorAnchors.forEach((candidate) => {
        if (candidate === anchor) {
          return;
        }

        const dx = candidate.coordinates[0] - anchor.coordinates[0];
        const dy = candidate.coordinates[1] - anchor.coordinates[1];

        if (Math.abs(dy) <= rowTolerance) {
          if (dx < 0) {
            leftNeighbors.push(Math.abs(dx));
          } else if (dx > 0) {
            rightNeighbors.push(dx);
          }
        }

        if (Math.abs(dx) <= columnTolerance) {
          if (dy < 0) {
            lowerNeighbors.push(Math.abs(dy));
          } else if (dy > 0) {
            upperNeighbors.push(dy);
          }
        }
      });

      const leftGap = Math.min(...leftNeighbors, typicalWidth);
      const rightGap = Math.min(...rightNeighbors, typicalWidth);
      const lowerGap = Math.min(...lowerNeighbors, typicalHeight);
      const upperGap = Math.min(...upperNeighbors, typicalHeight);

      const halfWidthLeft = clamp(
        leftGap * 0.46,
        typicalWidth * 0.34,
        typicalWidth * 0.9,
      );
      const halfWidthRight = clamp(
        rightGap * 0.46,
        typicalWidth * 0.34,
        typicalWidth * 0.9,
      );
      const halfHeightLower = clamp(
        lowerGap * 0.46,
        typicalHeight * 0.34,
        typicalHeight * 0.95,
      );
      const halfHeightUpper = clamp(
        upperGap * 0.46,
        typicalHeight * 0.34,
        typicalHeight * 0.95,
      );

      const baseCorners: LngLat[] = [
        [
          anchor.coordinates[0] - halfWidthLeft,
          anchor.coordinates[1] - halfHeightLower,
        ],
        [
          anchor.coordinates[0] + halfWidthRight,
          anchor.coordinates[1] - halfHeightLower,
        ],
        [
          anchor.coordinates[0] + halfWidthRight,
          anchor.coordinates[1] + halfHeightUpper,
        ],
        [
          anchor.coordinates[0] - halfWidthLeft,
          anchor.coordinates[1] + halfHeightUpper,
        ],
      ];

      const clippedCorners = outline
        ? keepCellInsideOutline(baseCorners, anchor.coordinates, outline)
        : baseCorners;
      const area = polygonArea(clippedCorners);

      if (area <= 0) {
        return;
      }

      syntheticFeatures.push(
        createPolygonFeature(nextId, clippedCorners, {
          name: anchor.name,
          alt_name: anchor.roomUse,
          category: anchor.roomUse ?? anchor.type,
          restriction: null,
          accessibility: null,
          display_point: JSON.stringify(anchor.coordinates),
          feature_type: anchor.type === "unit" ? "unit" : anchor.type,
          level_id: floor,
          show: "true",
          area,
          room_number: anchor.name,
          room_use: anchor.roomUse,
          synthetic_proxy: true,
          source_layer: "generated-room-cell",
          source_entity: "POI_CELL",
        }),
      );

      nextId += 1;
    });
  });

  return syntheticFeatures;
}

function countRichIndoorPolygons(bundle: AppBuildingBundle): number {
  return bundle.indoor_map.features.filter((feature) => {
    if (feature.geometry?.type !== "Polygon") {
      return false;
    }

    return ["unit", "corridor", "stairs", "elevator"].includes(
      String(feature.properties?.feature_type ?? ""),
    );
  }).length;
}

const richIndoorPolygonCount = countRichIndoorPolygons(rawBuilding);
const syntheticFloorPlanFeatures =
  richIndoorPolygonCount >= 200
    ? []
    : buildSyntheticFloorPlanFeatures(rawBuilding);
const indoorMapFeatures = [
  ...rawBuilding.indoor_map.features,
  ...syntheticFloorPlanFeatures,
];

const building = {
  ...rawBuilding,
  indoor_map: {
    ...rawBuilding.indoor_map,
    features: indoorMapFeatures,
  },
  cad_overlay:
    rawBuilding.cad_overlay ??
    ({
      type: "FeatureCollection",
      features: [],
    } as GeoJSON.FeatureCollection),
  pois: rawBuilding.pois,
} as AppBuildingBundle;

function collectFloors(bundle: AppBuildingBundle): number[] {
  const floors = new Set<number>();

  bundle.indoor_map.features.forEach((feature) => {
    const normalized = normalizeFloorValue(feature.properties?.level_id);
    if (normalized !== null) {
      floors.add(normalized);
    }
  });

  bundle.pois.features.forEach((feature) => {
    const normalized = normalizeFloorValue(feature.properties?.floor);
    if (normalized !== null) {
      floors.add(normalized);
    }
  });

  bundle.cad_overlay?.features.forEach((feature) => {
    const normalized = normalizeFloorValue(feature.properties?.level_id);
    if (normalized !== null) {
      floors.add(normalized);
    }
  });

  return [...floors].sort((first, second) => first - second);
}

function resolveDefaultFloor(
  bundle: AppBuildingBundle,
  floors: number[],
): number {
  if (floors.length === 0) {
    return 0;
  }

  const floorWeights = new Map<number, number>();

  bundle.indoor_map.features.forEach((feature) => {
    const floor = normalizeFloorValue(feature.properties?.level_id);
    if (floor === null) {
      return;
    }

    const currentWeight = floorWeights.get(floor) ?? 0;
    floorWeights.set(floor, currentWeight + 2);
  });

  bundle.pois.features.forEach((feature) => {
    const floor = normalizeFloorValue(feature.properties?.floor);
    if (floor === null) {
      return;
    }

    const currentWeight = floorWeights.get(floor) ?? 0;
    floorWeights.set(floor, currentWeight + 1);
  });

  let selectedFloor = floors[0];
  let selectedWeight = floorWeights.get(selectedFloor) ?? 0;

  floors.forEach((floor) => {
    const weight = floorWeights.get(floor) ?? 0;
    if (weight > selectedWeight) {
      selectedFloor = floor;
      selectedWeight = weight;
    }
  });

  return selectedFloor;
}

function padBounds(bounds: Bounds, ratio = 0.08): Bounds {
  const [[minX, minY], [maxX, maxY]] = bounds;
  const paddingX = Math.max((maxX - minX) * ratio, 0.0005);
  const paddingY = Math.max((maxY - minY) * ratio, 0.0005);

  return [
    [minX - paddingX, minY - paddingY],
    [maxX + paddingX, maxY + paddingY],
  ];
}

const referenceOutlineBounds = computeFeatureCollectionBounds(referenceOutline);
const fullDatasetBounds = computeBundleBounds(building);
const indoorGeometryBounds = computeFeatureCollectionBounds(
  building.indoor_map,
);
const maxBoundsBase = fullDatasetBounds ?? referenceOutlineBounds;
const maxBoundsPaddingRatio = buildingSource === "generated" ? 1.75 : 0.08;

export const buildingBounds =
  indoorGeometryBounds ?? fullDatasetBounds ?? referenceOutlineBounds;
export const buildingMaxBounds = maxBoundsBase
  ? padBounds(maxBoundsBase, maxBoundsPaddingRatio)
  : undefined;
export const buildingCenter: LngLat = buildingBounds
  ? [
      (buildingBounds[0][0] + buildingBounds[1][0]) / 2,
      (buildingBounds[0][1] + buildingBounds[1][1]) / 2,
    ]
  : [building.location.longitude, building.location.latitude];
export const availableFloors = collectFloors(building);
export const defaultFloor = resolveDefaultFloor(building, availableFloors);
export const usesSyntheticFloorPlan = syntheticFloorPlanFeatures.length > 0;
export const hasRecoveredFloorPlan = richIndoorPolygonCount >= 200;

export default building;
