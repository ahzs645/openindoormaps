import type { FeatureCollection, Geometry } from "geojson";
import type { IndoorDataset } from "./contract";

/** One physical wall, one extrusion.
 *
 * Native wall paint is a plan section cut 4 ft above each native level
 * (nativeMaterialPlanWalls / nativeMaterialPlanExactWalls). A wall that stands
 * through several split levels is therefore returned once per level cut, and
 * relativeHeightGeometry() then lifts each copy to that level's elevation.
 * In a combined campus-floor scope this stacks the same wall at 0, 1, 2 m ...
 *
 * This keeps, for every native element (and review patch), only the copy cut
 * at the level that physically carries it: the element's own source level
 * (wallDisplay.levelId, the rule physicalWallCopies already uses for legacy
 * walls) when that level draws it, otherwise the highest in-scope level whose
 * elevation is at or below the element's base elevation (its lowest in-scope
 * level when the base is below them all). Elements that appear at a single
 * level, synthetic/negative IDs, and elements with unknown base elevation and
 * source level pass through untouched. Display only: the dataset, routing walls,
 * the 2D native map and exports are never read back from this result. */
export const WALL_OWNER_TOLERANCE_FEET = 0.5;

type OwnerData = Pick<
  IndoorDataset,
  "nativeLevels" | "nativeMaterialSections" | "wallDisplay"
>;

/** Source base elevation of each native wall/column element in scope. The
 * original material sections carry it; the legacy wallDisplay census is the
 * fallback. Base is a property of the element, identical at every cut. */
export function nativeElementBaseElevations(
  data: OwnerData,
  levelIds: readonly number[],
): Map<number, number> {
  const scope = new Set(levelIds);
  const base = new Map<number, number>();
  const put = (id: number, z: number) => {
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(z)) return;
    const previous = base.get(id);
    if (previous === undefined || z < previous) base.set(id, z);
  };
  for (const row of data.nativeMaterialSections?.levels ?? [])
    if (scope.has(row.levelId))
      for (const section of row.sections)
        put(section.nativeElementId, section.baseElevationFeet);
  for (const element of data.wallDisplay?.elements ?? [])
    if (!base.has(element.nativeElementId))
      put(element.nativeElementId, element.baseElevationFeet);
  return base;
}

/** Owner level for one element among the in-scope levels that actually draw it. */
export function nativeWallOwnerLevel(
  candidates: readonly { levelId: number; elevationFeet: number }[],
  baseElevationFeet: number,
): number {
  const ordered = [...candidates].sort(
    (a, b) => a.elevationFeet - b.elevationFeet || a.levelId - b.levelId,
  );
  const carrying = ordered.filter(
    (c) => c.elevationFeet <= baseElevationFeet + WALL_OWNER_TOLERANCE_FEET,
  );
  return (carrying.at(-1) ?? ordered[0]).levelId;
}

export function singleExtrusionWalls<G extends Geometry>(
  data: OwnerData,
  levelIds: readonly number[],
  walls: FeatureCollection<G>,
): FeatureCollection<G> {
  if (new Set(levelIds).size < 2) return walls;
  const groupKey = (f: FeatureCollection<G>["features"][number]) => {
    const p = f.properties ?? {};
    const id = Number(p.nativeElementId);
    // Only strict native display paint is level-sectioned. Synthetic IDs
    // (provisional corner seals use negative numbers that repeat per level)
    // and legacy walls keep their existing behaviour.
    if (p.nativePhysical !== true || !Number.isSafeInteger(id) || id <= 0)
      return undefined;
    return `${id}|${p.reviewPatchId ?? ""}`;
  };
  const elevations = new Map(
    data.nativeLevels.map((l) => [l.id, l.elevationFeet]),
  );
  const levelsByKey = new Map<string, Set<number>>();
  for (const f of walls.features) {
    const key = groupKey(f),
      level = Number(f.properties?.levelId);
    if (key === undefined || !elevations.has(level)) continue;
    const levels = levelsByKey.get(key) ?? new Set<number>();
    levels.add(level);
    levelsByKey.set(key, levels);
  }
  if (![...levelsByKey.values()].some((levels) => levels.size > 1))
    return walls;
  const bases = nativeElementBaseElevations(data, levelIds);
  const sourceLevels = new Map(
    (data.wallDisplay?.elements ?? []).map((e) => [e.nativeElementId, e.levelId]),
  );
  const owners = new Map<string, number>();
  for (const [key, levels] of levelsByKey) {
    if (levels.size < 2) continue;
    const id = Number(key.split("|")[0]);
    const source = sourceLevels.get(id);
    if (source !== undefined && levels.has(source)) {
      owners.set(key, source);
      continue;
    }
    const base = bases.get(id);
    if (base === undefined) continue; // unknown source base: never guess
    owners.set(
      key,
      nativeWallOwnerLevel(
        [...levels].map((levelId) => ({
          levelId,
          elevationFeet: elevations.get(levelId)!,
        })),
        base,
      ),
    );
  }
  if (!owners.size) return walls;
  return {
    ...walls,
    features: walls.features.filter((f) => {
      const key = groupKey(f),
        owner = key === undefined ? undefined : owners.get(key);
      return owner === undefined || Number(f.properties?.levelId) === owner;
    }),
  };
}

/** Optional, separate decision (3D rooms only). Prepared native geometry always
 * carries relative-height base/top, but "3D rooms" paints its floors at 0 and
 * its room boxes from 0, so only the precision wall mesh and the flat selection
 * surface float at each level's offset. Rebase wall extrusions to the shared
 * ground in that mode; "3D relative heights" keeps the native offsets. */
export function groundedWalls<G extends Geometry>(
  walls: FeatureCollection<G>,
  heightMetres: number,
): FeatureCollection<G> {
  return {
    ...walls,
    features: walls.features.map((f) =>
      f.properties?.nativePhysical === true
        ? { ...f, properties: { ...f.properties, base: 0, height: heightMetres } }
        : f,
    ),
  };
}
