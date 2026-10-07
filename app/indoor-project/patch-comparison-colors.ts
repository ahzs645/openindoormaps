import type { PinComparisonResult } from "./pin-comparison";

const palette = [
  "#56b4e9",
  "#e69f00",
  "#009e73",
  "#cc79a7",
  "#f0e442",
  "#0072b2",
  "#d55e00",
  "#8e7cc3",
];
/** One color per actual connected region, never one invented polygon per label. */
export function coloredComparisonRegions(
  result: PinComparisonResult,
  after: boolean,
) {
  const before =
    result.currentRegions ?? (result.current ? [result.current] : []);
  const updated =
    result.updatedRegions ?? (result.updated ? [result.updated] : []);
  const identity = (r: (typeof before)[number]) =>
    [...r.roomKeys].sort()[0] ?? r.id;
  const identities = [...new Set([...before, ...updated].map(identity))].sort();
  return (after ? updated : before).map((region) => {
    const index = identities.indexOf(identity(region));
    return {
      region,
      color: palette[index] ?? `hsl(${(index * 137.508) % 360}, 65%, 55%)`,
    };
  });
}
