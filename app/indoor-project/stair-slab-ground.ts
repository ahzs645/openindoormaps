import pc from "polygon-clipping";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import { HALLWAY_COLOR } from "./display-passages";

type Rings = [number, number][][];
const bounds = (rings: number[][][]) => {
  const points = rings.flat();
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
};
const overlaps = (a: number[], b: number[]) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const area = (parts: pc.MultiPolygon) =>
  parts.reduce(
    (sum, rings) =>
      sum +
      rings.reduce((sum, ring, hole) => {
        const origin = ring[0];
        const value =
          Math.abs(
            ring.reduce((total, p, i) => {
              const q = ring[(i + 1) % ring.length];
              return (
                total +
                (p[0] - origin[0]) * (q[1] - origin[1]) -
                (q[0] - origin[0]) * (p[1] - origin[1])
              );
            }, 0),
          ) / 2;
        return sum + (hole ? -value : value);
      }, 0),
    0,
  );

/** A native stair can start on a separate slab below its semantic stair room.
 * Tint only an isolated native component intersecting a measured starting run.
 * Retain the slab's exact perimeter and holes, subtract walls and other rooms,
 * and never expand a slab to a source place outline. The two-to-one size guard
 * prevents one stair from recolouring an entire campus plate. This is display
 * context only: it establishes neither headroom nor a new walking connection. */
export function stairSlabGround(
  data: IndoorDataset,
  nativeGround: Feature<MultiPolygon>[],
  treads: { features: Feature<Polygon>[] },
): Feature<MultiPolygon>[] {
  if (data.stairDisplay?.sourceModelSha256 !== data.source.modelSha256)
    return [];
  const flights = data.stairDisplay.sourceFlights ?? data.stairDisplay.flights;
  const visibleIds = new Set(
    treads.features.map((f) => Number(f.properties?.stairElementId)),
  );
  const features: Feature<MultiPolygon>[] = [];
  for (const floor of nativeGround) {
    const z = Number(floor.properties?.elevationFeet);
    const startingRuns = new Set(
      flights
        .filter((flight) => visibleIds.has(flight.stairElementId))
        .flatMap((flight) =>
          (flight.runs ?? [])
            .filter((run) => Math.abs(run.bottomElevationFeet - z) < 0.05)
            .map((run) => run.runElementId),
        ),
    );
    if (startingRuns.size === 0) continue;
    for (const [component, rings] of floor.geometry.coordinates.entries()) {
      const box = bounds(rings);
      const localSteps = treads.features.filter((t) =>
        overlaps(box, bounds(t.geometry.coordinates)),
      );
      if (
        !localSteps.some((t) =>
          startingRuns.has(Number(t.properties?.runElementId)),
        )
      )
        continue;
      const origin = rings[0][0];
      const local = (p: number[]): [number, number] => [
        Math.round((p[0] - origin[0]) * 1e10),
        Math.round((p[1] - origin[1]) * 1e10),
      ];
      try {
        const slab = rings.map((r) => r.map(local));
        const projections = localSteps.map((t) =>
          t.geometry.coordinates.map((r) => r.map(local)),
        );
        const run = pc.union(projections[0], ...projections.slice(1));
        if (
          area([slab]) > 2 * area(run) ||
          area(pc.intersection([slab], run)) < 1
        )
          continue;
        const masks: Rings[] = [
          ...data.walls
            .filter(
              (wall) =>
                wall.levelId === floor.properties?.levelId && !wall.approximate,
            )
            .map((wall) => wall.ringsFeet),
          ...data.records
            .filter(
              (record) =>
                Math.abs(record.elevationFeet - z) < 0.05 &&
                ((!record.stair && !record.circulation) ||
                  !record.walkable ||
                  record.access === "staff"),
            )
            .map((record) => record.ringsFeet),
        ];
        const localMasks = masks
          .map((mask) =>
            mask.map((r) => r.map((p) => geographicPoint(data, p))),
          )
          .filter((mask) => overlaps(box, bounds(mask)))
          .map((mask) => mask.map((r) => r.map(local)));
        const result =
          localMasks.length > 0 ? pc.difference([slab], ...localMasks) : [slab];
        if (result.length === 0) continue;
        features.push({
          ...floor,
          id: `stair-ground:${floor.properties?.nativeFloorId}:${component}`,
          properties: {
            ...floor.properties,
            nativeFloor: false,
            color: HALLWAY_COLOR,
            circulation: true,
            displayOnly: true,
            groundEvidence: "native-stair-starting-slab",
            stairRunIds: [
              ...new Set(
                localSteps
                  .map((step) => Number(step.properties?.runElementId))
                  .filter((id) => startingRuns.has(id)),
              ),
            ],
            floorTop: Number(floor.properties?.floorTop ?? 0.005) + 0.02,
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: result.map((p) =>
              p.map((r) =>
                r.map((q) => [
                  q[0] / 1e10 + origin[0],
                  q[1] / 1e10 + origin[1],
                ]),
              ),
            ),
          },
        });
      } catch {
        // Failed clipping leaves the neutral native slab and measured steps.
      }
    }
  }
  return features;
}
