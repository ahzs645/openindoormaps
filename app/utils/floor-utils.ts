export function normalizeFloorValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "null") {
      return null;
    }

    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return null;
}

export function formatFloorLabel(floor: number): string {
  const absoluteFloor = Math.abs(floor);
  let suffix = "th";

  if (!(absoluteFloor % 100 >= 11 && absoluteFloor % 100 <= 13)) {
    if (absoluteFloor % 10 === 1) {
      suffix = "st";
    } else if (absoluteFloor % 10 === 2) {
      suffix = "nd";
    } else if (absoluteFloor % 10 === 3) {
      suffix = "rd";
    }
  }

  if (floor === 0) {
    return "Ground Floor";
  }

  if (floor < 0) {
    return `Basement ${absoluteFloor}`;
  }

  return `${floor}${suffix} Floor`;
}
