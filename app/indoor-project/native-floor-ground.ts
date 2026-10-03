import polygonClipping from "polygon-clipping";
import type { Feature, MultiPolygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";

type Rings = [number, number][][];
/** Native slab material is the neutral ground under room blocks and native
 * walls. Source contours are place identities, never a substitute for a floor.
 * Preserve every native aperture and each disconnected slab component. */
export function nativeFloorGround(
  data: IndoorDataset,
  levelIds: readonly number[],
  building: string,
): Feature<MultiPolygon>[] {
  const support = data.walkingSupport;
  if (support?.sourceModelSha256 !== data.source.modelSha256) return [];
  const records = data.records.filter(
    (r) =>
      levelIds.includes(r.levelId) &&
      (building === "all" || r.building === building),
  );
  const elevations = [...new Set(records.map((r) => r.elevationFeet))];
  if (records.length === 0) return [];
  const points = records.flatMap((r) => r.ringsFeet.flat());
  const box: Rings = [
    [
      [
        Math.min(...points.map((p) => p[0])) - 3,
        Math.min(...points.map((p) => p[1])) - 3,
      ],
      [
        Math.max(...points.map((p) => p[0])) + 3,
        Math.min(...points.map((p) => p[1])) - 3,
      ],
      [
        Math.max(...points.map((p) => p[0])) + 3,
        Math.max(...points.map((p) => p[1])) + 3,
      ],
      [
        Math.min(...points.map((p) => p[0])) - 3,
        Math.max(...points.map((p) => p[1])) + 3,
      ],
    ],
  ];
  return support.floors.flatMap((floor) => {
    if (!elevations.some((z) => Math.abs(z - floor.elevationFeet) < 0.15))
      return [];
    let parts = floor.partsFeet ?? [floor.ringsFeet];
    try {
      if (building !== "all") parts = polygonClipping.intersection(parts, box);
    } catch {
      return [];
    }
    if (parts.length === 0) return [];
    const levelId = records.reduce(
      (best, r) =>
        Math.abs(r.elevationFeet - floor.elevationFeet) <
        Math.abs(best.elevationFeet - floor.elevationFeet)
          ? r
          : best,
      records[0],
    ).levelId;
    return [
      {
        type: "Feature" as const,
        id: `native-floor:${floor.nativeElementId}`,
        properties: {
          nativeFloor: true,
          nativeFloorId: floor.nativeElementId,
          levelId,
          elevationFeet: floor.elevationFeet,
          color: "#faf9f5",
          circulation: false,
          walkable: true,
          boundarySource: "native-floor-material",
        },
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: parts.map((rings) =>
            rings.map((ring) =>
              [...ring, ring[0]].map((p) => geographicPoint(data, p)),
            ),
          ),
        },
      },
    ];
  });
}
