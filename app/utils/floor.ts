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

/**
 * Coerces a GeoJSON floor property (`floor`, `level_id`) to a number. Imported
 * data stores these as numbers, numeric strings or "null"; anything that is not
 * a finite number yields `null`.
 */
export function normalizeFloorValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : null;
}
