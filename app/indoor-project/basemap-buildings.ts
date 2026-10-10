import * as DMath from "./deterministic-math";
import polygonClipping from "polygon-clipping";
import { convertFilter } from "@maplibre/maplibre-gl-style-spec";
import type { Feature, FeatureCollection, Geometry, Polygon } from "geojson";
import type { FilterSpecification, LayerSpecification } from "maplibre-gl";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import type { EditPoint } from "./map-edits";

export type BasemapBuildingSettings = {
  mode: "show" | "hide" | "campus" | "areas";
  marginMetres: number;
  areas: { id: string; name: string; pointsFeet: EditPoint[] }[];
};
export const defaultBasemapBuildings: BasemapBuildingSettings = {
  mode: "show",
  marginMetres: 15,
  areas: [],
};

export type BasemapAreaShape = "rectangle" | "polygon";

/** Keep a simple polygon: crossed edges and repeated corners make the chosen
 * exclusion region ambiguous. Coordinates remain in the source model's feet. */
export function validateBasemapExclusionPolygon(points: EditPoint[]) {
  if (points.length < 3)
    throw new Error("Add at least three corners to finish the polygon.");
  const cross = (a: EditPoint, b: EditPoint, c: EditPoint) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (DMath.hypot(a[0] - b[0], a[1] - b[1]) < 0.001)
      throw new Error(
        "Polygon corners must be distinct. Undo the last point to adjust it.",
      );
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
          Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
        Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
          Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
      )
        throw new Error(
          "Polygon edges cannot cross or touch. Undo the last point to adjust it.",
        );
    }
  }
  const twiceArea = points.reduce((total, p, i) => {
    const q = points[(i + 1) % points.length];
    return total + cross(points[0], p, q);
  }, 0);
  if (Math.abs(twiceArea) < 0.01)
    throw new Error("Basemap exclusion area is too small.");
}

export function validateBasemapBuildings(
  value: unknown,
): asserts value is BasemapBuildingSettings {
  const s = value as BasemapBuildingSettings | undefined;
  if (
    !s ||
    !["show", "hide", "campus", "areas"].includes(s.mode) ||
    !Number.isFinite(s.marginMetres) ||
    s.marginMetres < 0 ||
    s.marginMetres > 100 ||
    !Array.isArray(s.areas) ||
    s.areas.length > 50
  )
    throw new Error("Invalid basemap building settings.");
  const ids = new Set<string>();
  for (const area of s.areas) {
    if (
      !area ||
      typeof area.id !== "string" ||
      !area.id ||
      area.id.length > 100 ||
      ids.has(area.id) ||
      typeof area.name !== "string" ||
      !area.name.trim() ||
      area.name.length > 100 ||
      !Array.isArray(area.pointsFeet) ||
      area.pointsFeet.length < 3 ||
      area.pointsFeet.length > 100 ||
      area.pointsFeet.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          p.some(
            (n) =>
              typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e8,
          ),
      )
    )
      throw new Error("Invalid basemap exclusion area.");
    validateBasemapExclusionPolygon(area.pointsFeet);
    ids.add(area.id);
  }
}

const bounds = (points: number[][]) => {
  const result = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    result[0] = Math.min(result[0], x);
    result[1] = Math.min(result[1], y);
    result[2] = Math.max(result[2], x);
    result[3] = Math.max(result[3], y);
  }
  return result;
};
const overlap = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const close = (ring: number[][]) => [...ring, ring[0]];

/** Campus coverage uses every source floor, independent of the selected level. */
export function basemapExclusionAreas(
  data: IndoorDataset,
  settings: BasemapBuildingSettings,
): FeatureCollection<Polygon> {
  let rings: EditPoint[][] = [];
  if (settings.mode === "areas")
    rings = settings.areas.map((a) => a.pointsFeet);
  if (settings.mode === "campus") {
    const buildings = new Map<string, EditPoint[]>();
    for (const room of data.records) {
      const points = buildings.get(room.building) ?? [];
      points.push(...room.ringsFeet.flat());
      buildings.set(room.building, points);
    }
    const margin =
      settings.marginMetres / data.alignment.horizontalMetresPerFoot;
    rings = [...buildings.values()]
      .filter((points) => points.length)
      .map((points) => {
        const [minX, minY, maxX, maxY] = bounds(points);
        return [
          [minX - margin, minY - margin],
          [maxX + margin, minY - margin],
          [maxX + margin, maxY + margin],
          [minX - margin, maxY + margin],
        ];
      });
  }
  return {
    type: "FeatureCollection",
    features: rings.map((ring) => ({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          close(ring).map((p) => geographicPoint(data, p as EditPoint)),
        ],
      },
    })),
  };
}

export function isBasemapBuildingLayer(layer: LayerSpecification): boolean {
  return (
    !layer.id.startsWith("project-") &&
    "source-layer" in layer &&
    layer["source-layer"] === "building"
  );
}
export function basemapBuildingIdentity(
  feature: Feature,
): string | number | undefined {
  const id = feature.properties?.osm_id ?? feature.id;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}

/** Hide the whole building when it intersects a mask, including tile fragments.
 * MapLibre's `within` operator does not support polygon features. */
export function excludedBasemapBuildingIds(
  features: Feature<Geometry>[],
  areas: FeatureCollection<Polygon>,
): (string | number)[] {
  const masks = areas.features.map((f) => ({
    rings: f.geometry.coordinates,
    box: bounds(f.geometry.coordinates.flat()),
  }));
  const ids = new Set<string | number>();
  for (const feature of features) {
    const id = basemapBuildingIdentity(feature);
    if (id === undefined || ids.has(id)) continue;
    const parts =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.type === "MultiPolygon"
          ? feature.geometry.coordinates
          : [];
    if (
      parts.some((part) => {
        const box = bounds(part.flat());
        return masks.some((mask) => {
          if (!overlap(box, mask.box)) return false;
          try {
            return (
              polygonClipping.intersection(
                part as EditPoint[][],
                mask.rings as EditPoint[][],
              ).length > 0
            );
          } catch {
            return false;
          }
        });
      })
    )
      ids.add(id);
  }
  return [...ids];
}

export function basemapBuildingFilter(
  original: FilterSpecification | undefined,
  mode: BasemapBuildingSettings["mode"],
  ids: (string | number)[],
): FilterSpecification | null {
  if (mode === "show" || (mode !== "hide" && ids.length === 0))
    return original ?? null;
  const exclude: FilterSpecification =
    mode === "hide"
      ? ["==", ["literal", 1], 0]
      : [
          "!",
          ["in", ["coalesce", ["get", "osm_id"], ["id"]], ["literal", ids]],
        ];
  return original
    ? (["all", convertFilter(original), exclude] as FilterSpecification)
    : exclude;
}
