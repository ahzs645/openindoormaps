import type { IndoorDataset } from "./contract";
export type SourceStair = NonNullable<
  NonNullable<IndoorDataset["stairDisplay"]>["sourceFlights"]
>[number];
export const sourceStairId = (id: number) => `source-stair:${id}`;
export function sourceStairKind(stair: SourceStair) {
  if (stair.context === "tiered-seating") return "Tiered seating";
  if (stair.context === "outdoor") return "Outdoor stairs";
  return "Staircase";
}
/** A source stair area is a floor/landing selection, not a second solid flight. */
export function sourceStairAreaKeys(
  data: IndoorDataset,
  visibleIds: readonly number[],
  levels: readonly number[],
) {
  return (
    data.stairDisplay?.flights
      .filter(
        (f) =>
          !f.displayOnly &&
          visibleIds.includes(f.stairElementId) &&
          levels.includes(f.levelId) &&
          data.records.some(
            (r) =>
              r.key === f.roomKey &&
              r.stair &&
              f.sourceGeometryKey ===
                JSON.stringify([r.levelId, r.elevationFeet, r.ringsFeet]),
          ),
      )
      .map((f) => f.roomKey) ?? []
  );
}
export function sourceStairEdges(data: IndoorDataset, stair: SourceStair) {
  return data.edges.filter(
    (e) =>
      e.nativeElementId === stair.stairElementId &&
      (e.kind === "stairs" || e.kind === "local-steps"),
  );
}
export function sourceStairAnchor(
  data: IndoorDataset,
  stair: SourceStair,
  levels: readonly number[],
): [number, number, number] {
  const native = data.nativeLevels.filter(
    (l) => levels.includes(l.id) && stair.levelIds.includes(l.id),
  );
  const target =
    native.length > 0
      ? Math.min(...native.map((l) => l.elevationFeet))
      : stair.floorElevationFeet;
  const t = [...stair.treads].sort(
    (a, b) =>
      Math.abs(a.elevationFeet - target) - Math.abs(b.elevationFeet - target),
  )[0];
  const points = stair.treads
    .filter((s) => Math.abs(s.elevationFeet - t.elevationFeet) < 0.001)
    .flatMap((t) => t.ringFeet);
  const center: [number, number, number] = [0, 0, t.elevationFeet];
  for (const p of points) {
    center[0] += p[0] / points.length;
    center[1] += p[1] / points.length;
  }
  return center;
}
