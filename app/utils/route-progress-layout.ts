import type { RouteInstruction } from "../indoor-directions/types";

/** Keep successive floor-change controls distinct in a compact progress bar.
 * Walking dots interpolate between these milestones; the fill uses the same
 * positions, so selecting a floor never leaves its progress indicator behind. */
export function routeProgressPositions(
  instructions: Pick<RouteInstruction, "type">[],
  width: number,
): number[] {
  if (instructions.length < 2) return instructions.map(() => 0);
  const last = instructions.length - 1;
  const milestones = instructions.flatMap((step, index) =>
    index === 0 || index === last || step.type === "floor-change"
      ? [index]
      : [],
  );
  const minimum = Math.min(
    28 / Math.max(1, width),
    1 / (milestones.length - 1),
  );
  const positions = milestones.map((index) => index / last);
  for (let i = 1; i < positions.length; i++)
    positions[i] = Math.max(positions[i], positions[i - 1] + minimum);
  positions[positions.length - 1] = 1;
  for (let i = positions.length - 2; i >= 0; i--)
    positions[i] = Math.min(positions[i], positions[i + 1] - minimum);
  positions[0] = 0;
  const result = Array.from({ length: instructions.length }, () => 0);
  for (let i = 1; i < milestones.length; i++) {
    const from = milestones[i - 1],
      to = milestones[i];
    for (let step = from; step <= to; step++)
      result[step] =
        positions[i - 1] +
        (positions[i] - positions[i - 1]) * ((step - from) / (to - from));
  }
  return result;
}
