import type { FeatureCollection, Geometry } from "geojson";
import type { IndoorDataset } from "./contract";
import { EXPOSED_WALL_HEIGHT_METRES } from "./display-geometry";

/** One datum per campus floor, independent of building filters and selection.
 * Only display coordinates change; source geometry and navigation stay native. */
export function floorHeightDatum(
  data: IndoorDataset,
  levelIds: readonly number[],
) {
  const heights = data.records
    .filter((r) => levelIds.includes(r.levelId))
    .map((r) => r.elevationFeet)
    .filter((z) => Number.isFinite(z));
  if (heights.length === 0)
    heights.push(
      ...data.nativeLevels
        .filter((l) => levelIds.includes(l.id))
        .map((l) => l.elevationFeet),
    );
  return heights.length > 0 ? Math.min(...heights) : 0;
}

export function relativeHeightGeometry<T extends Geometry>(
  data: IndoorDataset,
  levelIds: readonly number[],
  geometry: FeatureCollection<T>,
  kind: "floor" | "room" | "wall" | "door" | "label" | "lower" | "opening",
): FeatureCollection<T> {
  const datum = floorHeightDatum(data, levelIds),
    scale = data.alignment.verticalMetresPerFoot;
  const records = new Map(data.records.map((r) => [r.key, r]));
  const doors =
    kind === "door" ? new Map(data.doors?.map((d) => [d.id, d])) : undefined;
  const levels = new Map(data.nativeLevels.map((l) => [l.id, l.elevationFeet]));
  return {
    ...geometry,
    features: geometry.features.map((f) => {
      const p = f.properties ?? {},
        record = records.get(String(p.key));
      const door = doors?.get(String(p.id));
      // Door thresholds use their connected graph's actual height when present.
      const doorZ =
        door && data.edges.find((e) => e.id === door.id)?.pointsFeet[0]?.[2];
      const levelId = record?.levelId ?? door?.levelId ?? Number(p.levelId);
      const z =
        record?.elevationFeet ??
        doorZ ??
        (p.nativeFloor === true ? Number(p.elevationFeet) : undefined) ??
        levels.get(levelId) ??
        datum;
      let base = (z - datum) * scale;
      if (kind === "lower") {
        const upper = records.get(String(p.upperKey));
        base =
          Number(p.baseMetres) +
          ((upper?.elevationFeet ?? datum) - datum) * scale;
      }
      if (kind === "opening") {
        const upper = records.get(String(p.upperKey));
        base = ((upper?.elevationFeet ?? datum) - datum) * scale;
      }
      let height = 0.025;
      if (kind === "room") height = Number(p.height ?? 0);
      if (kind === "wall") height = EXPOSED_WALL_HEIGHT_METRES;
      return {
        ...f,
        properties: {
          ...p,
          levelId,
          base,
          height: base + height,
          // Native slab ground sits beneath coloured place surfaces. Equal
          // tops cause depth fighting where the circulation overlay overlaps.
          floorTop: base + (p.nativeFloor === true ? 0.005 : 0.025),
          ...(kind === "label"
            ? { heightMetres: base + Number(p.heightMetres ?? 0.03) }
            : {}),
          ...(kind === "lower" || kind === "opening"
            ? { baseMetres: base }
            : {}),
        },
      };
    }),
  };
}

/** Review pins on a sloped ramp follow its measured triangular surface. */
export function surfaceElevationFeet(
  data: IndoorDataset,
  levelId: number,
  point: readonly number[],
) {
  for (const ramp of data.rampDisplay?.ramps ?? []) {
    if (!ramp.levelIds.includes(levelId)) continue;
    for (const [a, b, c] of ramp.trianglesFeet) {
      const determinant =
        (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(determinant) < 1e-10) continue;
      const u =
        ((b[1] - c[1]) * (point[0] - c[0]) +
          (c[0] - b[0]) * (point[1] - c[1])) /
        determinant;
      const v =
        ((c[1] - a[1]) * (point[0] - c[0]) +
          (a[0] - c[0]) * (point[1] - c[1])) /
        determinant;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7)
        return u * a[2] + v * b[2] + (1 - u - v) * c[2];
    }
  }
  return data.nativeLevels.find((l) => l.id === levelId)?.elevationFeet ?? 0;
}
