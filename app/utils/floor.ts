export type FloorNames = Partial<Record<number, string>>;

/**
 * Human-readable floor name: the venue's own name when the location config
 * provides one (`mapConfig.floorNames`), otherwise "Level 1" for floor 0 and
 * "Level B1" for floor -1 (matching the floor stack's L1/B1 badges).
 */
export function formatFloorName(
  floor: number | null | undefined,
  floorNames?: FloorNames,
): string {
  if (floor === null || floor === undefined) return "another level";
  const named = floorNames?.[floor];
  if (named) return named;
  return floor < 0 ? `Level B${Math.abs(floor)}` : `Level ${floor + 1}`;
}
