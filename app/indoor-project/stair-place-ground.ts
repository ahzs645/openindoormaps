import polygonClipping from "polygon-clipping";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";

/** A selectable stair room describes a place, not a slab. Use the matching
 * native floor material (including its holes) for its painted ground. The
 * original place remains available separately for picking. Shared corridors
 * retain their ground: an overhead stair binding does not turn them into wells.
 */
export function stairPlaceGround(
  data: IndoorDataset,
  areas: FeatureCollection<Polygon | MultiPolygon>,
): FeatureCollection<Polygon | MultiPolygon> {
  if (data.stairDisplay?.sourceModelSha256 !== data.source.modelSha256)
    return areas;
  const records = new Map(data.records.map((r) => [r.key, r]));
  const flights = data.stairDisplay.flights;
  return {
    ...areas,
    features: areas.features.map((area) => {
      const record = records.get(String(area.properties?.key));
      if (!record?.stair || area.properties?.openDrop) return area;
      const matching = flights.filter(
        (f) =>
          f.roomKey === record.key &&
          f.levelId === record.levelId &&
          f.sourceGeometryKey ===
            JSON.stringify([
              record.levelId,
              record.elevationFeet,
              record.ringsFeet,
            ]),
      );
      const slabs = matching.flatMap((f) =>
        (f.floorOccluders ?? []).filter(
          (s) => Math.abs(s.elevationFeet - f.floorElevationFeet) < 0.15,
        ),
      );
      // Older packages without measured slab evidence keep their existing display.
      if (slabs.length === 0) return area;
      const parts =
        area.geometry.type === "Polygon"
          ? [area.geometry.coordinates]
          : area.geometry.coordinates;
      const origin = parts[0]?.[0]?.[0];
      if (!origin) return area;
      const scale = 1e10;
      const local = (p: number[]) =>
        [
          Math.round((p[0] - origin[0]) * scale),
          Math.round((p[1] - origin[1]) * scale),
        ] as [number, number];
      const unique = [
        ...new Map(slabs.map((s) => [s.nativeElementId, s])).values(),
      ];
      try {
        const slabPolygons = unique.map((s) =>
          s.ringsFeet.map((r) => r.map((p) => local(geographicPoint(data, p)))),
        );
        const solid = polygonClipping.union(
          slabPolygons[0],
          ...slabPolygons.slice(1),
        );
        const coordinates = polygonClipping.intersection(
          parts.map((p) => p.map((r) => r.map(local))),
          solid,
        );
        return {
          ...area,
          properties: {
            ...area.properties,
            groundEvidence: "native-stair-slab",
            groundSlabIds: unique.map((s) => s.nativeElementId),
          },
          geometry: {
            type: "MultiPolygon" as const,
            coordinates: coordinates.map((p) =>
              p.map((r) =>
                r.map((q) => [
                  q[0] / scale + origin[0],
                  q[1] / scale + origin[1],
                ]),
              ),
            ),
          },
        };
      } catch {
        // Do not invent an opening when source geometry cannot be reconciled.
        return area;
      }
    }),
  };
}
