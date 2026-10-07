import type { IndoorDataset } from "./contract";

/** Keep the campus datum while isolating a reviewed room's native storey. */
export function sourceModelSection(
  data: IndoorDataset,
  levelIds: number[],
  sectionLevelId?: number,
  fullContext = false,
) {
  const floorElevations = data.records
    .filter((r) => levelIds.includes(r.levelId))
    .map((r) => r.elevationFeet);
  const datum = Math.min(...floorElevations);
  // Keep registration and the selected floor's datum even when revealing
  // enclosure above/below the floor. Null limits mean no material clipping.
  if (fullContext) return { datum, lo: null, hi: null };
  const reviewedElevations = data.records
    .filter((r) =>
      sectionLevelId === undefined
        ? levelIds.includes(r.levelId)
        : levelIds.includes(r.levelId) && r.levelId === sectionLevelId,
    )
    .map((r) => r.elevationFeet);
  const elevations = reviewedElevations.length
    ? reviewedElevations
    : floorElevations;
  return {
    datum,
    lo: Math.min(...elevations) - 0.8,
    hi: Math.max(...elevations) + 4,
  };
}
