import type { FeatureCollection, Polygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
import { floorHeightDatum } from "./relative-heights";
import { visibleTreadPolygons } from "./stair-occlusion";

/** Full native tread projections. A selectable overhead flight is a stair
 * place, never permission to walk across its projected surface on this floor. */
export function projectStairDisplay(
  data: IndoorDataset,
  levelIds: readonly number[],
  building: string,
  relativeHeights = false,
): FeatureCollection<Polygon> {
  const datum = floorHeightDatum(data, levelIds);
  const records = new Map(data.records.map((r) => [r.key, r]));
  const features: FeatureCollection<Polygon>["features"] = [];
  if (data.stairDisplay?.sourceModelSha256 !== data.source.modelSha256)
    return { type: "FeatureCollection", features };
  const source = relativeHeights && data.stairDisplay.sourceFlights;
  const flights = source
    ? source
        .filter(
          (f) =>
            f.levelIds.some((id) => levelIds.includes(id)) &&
            (building === "all" || f.buildings.includes(building)),
        )
        .map((f) => {
          const binding = data.stairDisplay!.flights.find(
            (b) =>
              b.stairElementId === f.stairElementId &&
              levelIds.includes(b.levelId),
          );
          const levelId = f.levelIds
            .filter((id) => levelIds.includes(id))
            .sort(
              (a, b) =>
                Math.abs(
                  data.nativeLevels.find((l) => l.id === a)!.elevationFeet -
                    datum,
                ) -
                Math.abs(
                  data.nativeLevels.find((l) => l.id === b)!.elevationFeet -
                    datum,
                ),
            )[0];
          return {
            ...f,
            roomKey: `source-stair:${f.stairElementId}`,
            levelId,
            floorElevationFeet: data.nativeLevels.find((l) => l.id === levelId)!
              .elevationFeet,
            floorOccluders: binding?.floorOccluders,
          };
        })
    : data.stairDisplay.flights.filter((flight) => {
        const r = records.get(flight.roomKey);
        return (
          r?.walkable &&
          (r.stair || flight.displayOnly) &&
          levelIds.includes(r.levelId) &&
          (building === "all" || r.building === building) &&
          flight.sourceGeometryKey ===
            JSON.stringify([r.levelId, r.elevationFeet, r.ringsFeet])
        );
      });
  for (const flight of flights) {
    const runs = new Map(
      ("runs" in flight ? flight.runs : undefined)?.map((r) => [
        r.runElementId,
        r,
      ]),
    );
    for (const [i, t] of flight.treads.entries()) {
      const scale = data.alignment.verticalMetresPerFoot;
      const topMetres =
        (t.elevationFeet -
          (relativeHeights ? datum : flight.floorElevationFeet)) *
        scale;
      const baseMetres =
        topMetres - (t.thicknessFeet ?? 0.164_041_994_750_656_17) * scale;
      // A display riser joins only measured adjacent steps from this run.
      // Keep native thickness/base separately for export and inspection.
      const adjacent = flight.treads.filter(
        (other) =>
          other !== t &&
          other.runElementId === t.runElementId &&
          Math.abs(other.elevationFeet - t.elevationFeet) > 0.001 &&
          Math.abs(other.elevationFeet - t.elevationFeet) < 1 &&
          t.ringFeet.filter((p) =>
            other.ringFeet.some(
              (q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.03,
            ),
          ).length >= 2,
      );
      const lower = adjacent.filter(
        (other) => other.elevationFeet < t.elevationFeet,
      );
      let riseFeet = 0;
      if (lower.length > 0)
        riseFeet =
          t.elevationFeet -
          Math.max(...lower.map((other) => other.elevationFeet));
      else if (adjacent.length > 0)
        riseFeet = Math.min(
          ...adjacent.map((other) =>
            Math.abs(other.elevationFeet - t.elevationFeet),
          ),
        );
      if ("context" in flight && flight.context === "tiered-seating") {
        const elevations = [
          ...new Set(runTreadElevations(flight.treads, t.runElementId)),
        ].sort((a, b) => a - b);
        const row = elevations.indexOf(t.elevationFeet);
        riseFeet =
          t.elevationFeet -
          (row > 0
            ? elevations[row - 1]
            : (runs.get(t.runElementId)?.bottomElevationFeet ??
              t.elevationFeet));
      }
      const run = runs.get(t.runElementId),
        runTreads = flight.treads.filter(
          (s) => s.runElementId === t.runElementId,
        ),
        first = Math.min(...runTreads.map((s) => s.elevationFeet)),
        last = Math.max(...runTreads.map((s) => s.elevationFeet));
      const displayBaseMetres = Math.min(
        baseMetres,
        topMetres - riseFeet * scale,
        run?.beginWithRiser && Math.abs(t.elevationFeet - first) < 0.001
          ? (run.bottomElevationFeet - datum) * scale
          : Infinity,
      );
      // Revit run profiles use 3→0 at the bottom and 1→2 at the top.
      // Close terminal risers at their native height; do not move or widen a tread.
      const profile = [...t.ringFeet];
      let area = 0;
      for (const [j, p] of profile.entries()) {
        const q = profile[(j + 1) % profile.length];
        area += p[0] * q[1] - q[0] * p[1];
      }
      let color = i % 2 ? "#d4dde6" : "#c7d3df";
      if ("context" in flight && flight.context === "tiered-seating")
        color = i % 2 ? "#d6cebd" : "#c9c0ad";
      if (area < 0) profile.reverse();
      const endpointRisers: {
        a: number[];
        b: number[];
        bottom: number;
        top: number;
      }[] = [];
      if (
        run &&
        profile.length === 4 &&
        run.endWithRiser &&
        Math.abs(t.elevationFeet - last) < 0.001 &&
        run.topElevationFeet > t.elevationFeet + 0.001
      )
        endpointRisers.push({
          a: geographicPoint(data, profile[1]),
          b: geographicPoint(data, profile[2]),
          bottom: topMetres,
          top: (run.topElevationFeet - datum) * scale,
        });
      for (const polygon of visibleTreadPolygons(flight, t))
        features.push({
          type: "Feature",
          properties: {
            ...(source ? { id: flight.roomKey } : { key: flight.roomKey }),
            stairElementId: flight.stairElementId,
            runElementId: t.runElementId,
            topMetres,
            baseMetres,
            displayBaseMetres,
            endpointRisers: endpointRisers.filter((r) =>
              [r.a, r.b].every((p) =>
                polygon[0].some((q) => {
                  const g = geographicPoint(data, q);
                  return Math.hypot(g[0] - p[0], g[1] - p[1]) < 1e-9;
                }),
              ),
            ),
            displayBase: Math.max(0, displayBaseMetres),
            descending: topMetres <= 0,
            elevationFeet: t.elevationFeet,
            nativeFloorBound: flight.floorOccluders !== undefined,
            // Native elevation relative to the recovered slab, in MapLibre metres.
            // Suspended treads must not become columns occupying the room below.
            height: Math.max(0, topMetres),
            base: Math.max(0, baseMetres),
            levelId: flight.levelId,
            localDescending: t.elevationFeet <= flight.floorElevationFeet,
            // Plan cut: show the lower flight solid and the continuation overhead.
            overhead:
              (t.elevationFeet - flight.floorElevationFeet) * scale > 1.2,
            color,
          },
          geometry: {
            type: "Polygon",
            coordinates: polygon.map((ring) =>
              [...ring, ring[0]].map((p) => geographicPoint(data, p)),
            ),
          },
        });
    }
  }
  return { type: "FeatureCollection", features };
}

function runTreadElevations(
  treads: { runElementId: number; elevationFeet: number }[],
  id: number,
) {
  return treads
    .filter((t) => t.runElementId === id)
    .map((t) => t.elevationFeet);
}

/** Display-only shared-room bindings require the matching source review. */
export function validateSharedStairBinding(
  data: IndoorDataset,
  rooms: readonly { key: string; [key: string]: unknown }[],
) {
  for (const f of data.stairDisplay?.flights ?? []) {
    if (!f.displayOnly) continue;
    const ids = rooms.find(
      (r) => r.key === f.roomKey,
    )?.stairDisplayOnlyFlightIds;
    if (!Array.isArray(ids) || !ids.includes(f.stairElementId))
      throw new Error(
        "Shared-room native stair display has no matching source review.",
      );
  }
}
