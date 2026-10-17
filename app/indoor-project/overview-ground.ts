import { overviewPhysicalMaterial } from "./overview-physical-material";
import polygonClipping, {
  type MultiPolygon as ClipMultiPolygon,
} from "polygon-clipping";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "./contract";
import type { PreparedFloor } from "./prepared-floor";
import type { NativeExploreResult } from "./native-explore";
import { geographicPoint } from "./routing";
import { mapDrawingFeatures } from "./map-drawing-features";

const bounds = (parts: ClipMultiPolygon) => {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of parts)
    for (const ring of polygon)
      for (const p of ring) {
        box[0] = Math.min(box[0], p[0]);
        box[1] = Math.min(box[1], p[1]);
        box[2] = Math.max(box[2], p[0]);
        box[3] = Math.max(box[3], p[1]);
      }
  return box;
};
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const boxParts = (b: number[]): ClipMultiPolygon => [
  [
    [
      [b[0], b[1]],
      [b[2], b[1]],
      [b[2], b[3]],
      [b[0], b[3]],
      [b[0], b[1]],
    ],
  ],
];

/** Grey backing for the spaces occupied by hidden architectural detail. Reuse
 * only already prepared native slabs and checked native area drawings.
 * Original material is paint, never a new floor or navigation surface.
 * This drawing never changes the prepared source or navigation geometry. */
export function overviewGround(
  data: IndoorDataset,
  ground: FeatureCollection,
  materials?: FeatureCollection<MultiPolygon>,
): FeatureCollection<MultiPolygon> {
  const exclusions =
    data.indoorExclusions?.sourceModelSha256 === data.source.modelSha256
      ? data.indoorExclusions.areas
      : [];
  const features: FeatureCollection<MultiPolygon>["features"] = [];
  const contexts = new Map<
    number,
    { coverage: Map<string, number[]>; masks: ClipMultiPolygon }
  >();
  const origin = geographicPoint(data, data.alignment.originFeet);
  const x = geographicPoint(data, [
    data.alignment.originFeet[0] + 3,
    data.alignment.originFeet[1],
  ]);
  const y = geographicPoint(data, [
    data.alignment.originFeet[0],
    data.alignment.originFeet[1] + 3,
  ]);
  const padding = origin.map((v, i) => Math.abs(x[i] - v) + Math.abs(y[i] - v));
  for (const feature of mapDrawingFeatures(ground).features) {
    const nativeArea =
      typeof feature.properties?.nativeRegionId === "string" &&
      data.nativeIndoorEnvelopes?.sourceModelSha256 === data.source.modelSha256;
    if (
      (!(
        feature.properties?.nativeFloor === true &&
        feature.properties?.nativePhysical === true
      ) &&
        !nativeArea) ||
      !["Polygon", "MultiPolygon"].includes(feature.geometry.type)
    )
      continue;
    const parts =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : (feature.geometry as MultiPolygon).coordinates;
    const masks = exclusions
      .filter((area) => area.levelId === feature.properties?.levelId)
      .flatMap((area) => area.partsFeet)
      .map((part) =>
        part.map((ring) =>
          [...ring, ring[0]].map((point) => geographicPoint(data, point)),
        ),
      );
    try {
      const coordinates =
        masks.length > 0
          ? polygonClipping.difference(parts as ClipMultiPolygon, ...masks)
          : parts;
      if (coordinates.length > 0)
        features.push({
          type: "Feature",
          properties: { levelId: feature.properties?.levelId },
          geometry: { type: "MultiPolygon", coordinates },
        });
      const levelId = Number(feature.properties?.levelId);
      const context = contexts.get(levelId) ?? {
        coverage: new Map<string, number[]>(),
        masks,
      };
      if (coordinates.length > 0) {
        const id = String(
          feature.properties?.nativeRegionId ??
            feature.properties?.nativeFloorId ??
            features.length,
        );
        const b = bounds(coordinates as ClipMultiPolygon),
          previous = context.coverage.get(id);
        context.coverage.set(
          id,
          previous
            ? [
                Math.min(previous[0], b[0]),
                Math.min(previous[1], b[1]),
                Math.max(previous[2], b[2]),
                Math.max(previous[3], b[3]),
              ]
            : b,
        );
      }
      contexts.set(levelId, context);
    } catch {
      // A failed display cut leaves the existing exact face drawings visible.
      // Never use an uncut fallback across a reviewed exclusion.
    }
  }
  // Some enclosure carriers omit the material-width gaps themselves. Add only
  // original native material beside checked floor drawings. This also covers
  // physical offset slabs that do not share their room level's elevation.
  if (materials) {
    const groups = new Map<
      string,
      { levelId: number; parts: ClipMultiPolygon; window: boolean }
    >();
    for (const f of materials.features) {
      const levelId = Number(f.properties?.levelId);
      if (
        !contexts.has(levelId) ||
        f.properties?.nativePhysical !== true ||
        f.properties.approximate === true
      )
        continue;
      const key = `${levelId}:${f.properties.overviewWindow ? "window:" : ""}${f.properties.nativeElementId}`;
      const group = groups.get(key) ?? {
        levelId,
        parts: [],
        window: f.properties.overviewWindow === true,
      };
      group.parts.push(...(f.geometry.coordinates as ClipMultiPolygon));
      groups.set(key, group);
    }
    for (const [levelId, context] of contexts) {
      const boxes = [...context.coverage.values()].sort(
        (a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]),
      );
      const retained: number[][] = [];
      for (const b of boxes)
        if (
          !retained.some(
            (a) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3],
          )
        )
          retained.push(b);
      const coverage = retained.map((b) => {
        const box = [
          b[0] - padding[0],
          b[1] - padding[1],
          b[2] + padding[0],
          b[3] + padding[1],
        ];
        return { parts: boxParts(box), box };
      });
      for (const group of groups.values()) {
        if (group.levelId !== levelId) continue;
        const b = bounds(group.parts);
        const scope = coverage
          .filter((f) => overlaps(b, f.box))
          .flatMap((f) => f.parts);
        if (scope.length === 0) continue;
        try {
          let coordinates = polygonClipping.intersection(group.parts, scope);
          if (context.masks.length > 0)
            coordinates = polygonClipping.difference(
              coordinates,
              context.masks,
            );
          if (coordinates.length > 0)
            features.push({
              type: "Feature",
              properties: {
                levelId,
                overviewMaterial: true,
                ...(group.window ? { overviewWindow: true } : {}),
              },
              geometry: { type: "MultiPolygon", coordinates },
            });
        } catch {
          // Drawing only: retain the checked floor instead of broadening a mask.
        }
      }
    }
  }
  return { type: "FeatureCollection", features };
}

/** Worker-only overview paint. The source geometry remains on the prepared
 * floor; the UI receives this small drawing without rebuilding native faces. */
export function prepareOverviewGround(
  data: IndoorDataset,
  prepared: PreparedFloor,
  walls?: NativeExploreResult["walls"],
) {
  const materials: FeatureCollection<MultiPolygon> = walls
    ? {
        type: "FeatureCollection",
        features: walls.features.map((f) => ({
          ...f,
          properties: { ...f.properties, nativePhysical: true },
          geometry: {
            type: "MultiPolygon",
            coordinates: [f.geometry.coordinates],
          },
        })),
      }
    : { ...prepared.presentation.display.exposedWalls };
  const ground = data.nativeIndoorEnvelopes
    ? prepared.presentation.overviewGeometry
    : prepared.stairCutAreas;
  const levelIds = [
    ...new Set(
      ground.features
        .map((feature) => Number(feature.properties?.levelId))
        .filter(Number.isFinite),
    ),
  ];
  const lowMaterial = overviewPhysicalMaterial(data, levelIds);
  if (lowMaterial.features.length > 0)
    materials.features = [...materials.features, ...lowMaterial.features];
  const detail = data.windowDisplay;
  if (detail?.sourceModelSha256 === data.source.modelSha256)
    materials.features = [
      ...materials.features,
      ...detail.elements.map((element) => ({
        type: "Feature" as const,
        properties: {
          levelId: element.levelId,
          nativeElementId: element.nativeElementId,
          nativePhysical: true,
          overviewWindow: true,
        },
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: [
            [
              [...element.footprintFeet, element.footprintFeet[0]].map(
                (point) => geographicPoint(data, point),
              ),
            ],
          ],
        },
      })),
    ];
  const drawing = overviewGround(data, ground, materials);
  // Floor tint remains owned by the native floor layers, including circulation.
  // Draw only material here so the flat mesh cannot cover hallway colours.
  return {
    ...drawing,
    features: drawing.features.filter(
      (f) => f.properties?.overviewMaterial === true,
    ),
  };
}
