import type { IndoorDataset } from "./contract";
import { floorHeightDatum } from "./relative-heights";

/** Choose one visible slice of each physical wall footprint. Native identities
 * distinguish genuine adjacent walls; geometry alone never collapses them. */
export function physicalWallCopies(data: IndoorDataset, levelIds: number[]) {
  const visible = data.walls.filter((w) => levelIds.includes(w.levelId));
  if (!data.wallDisplay) return new Set(visible);
  const native = new Map(
    data.wallDisplay.elements.map((w) => [w.nativeElementId, w]),
  );
  const heights = new Map(
    data.nativeLevels.map((l) => [l.id, l.elevationFeet]),
  );
  const datum = floorHeightDatum(data, levelIds);
  const groups = new Map<string, typeof visible>();
  for (const w of visible) {
    const key = `${w.nativeElementId}:${JSON.stringify(w.ringsFeet)}`;
    const group = groups.get(key) ?? [];
    group.push(w);
    groups.set(key, group);
  }
  const selected = new Set<IndoorDataset["walls"][number]>();
  for (const copies of groups.values()) {
    const source = native.get(copies[0].nativeElementId);
    if (!source) {
      for (const w of copies) selected.add(w);
      continue;
    }
    const target = Math.max(source.baseElevationFeet, datum);
    const owner =
      copies.find((w) => w.levelId === source.levelId) ??
      [...copies].sort(
        (a, b) =>
          Math.abs((heights.get(a.levelId) ?? datum) - target) -
            Math.abs((heights.get(b.levelId) ?? datum) - target) ||
          a.levelId - b.levelId,
      )[0];
    selected.add(owner);
  }
  return selected;
}
