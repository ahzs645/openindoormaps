/** Consistent visitor names; native IDs, elevations and grouped levels stay intact. */
export function floorDisplayName(name: string) {
  const number = name.match(/^(?:campus\s+)?floor\s+(\d+)$/i)?.[1];
  if (number === undefined) return name;
  return Number(number) === 0 ? "Basement" : `Floor ${Number(number)}`;
}
