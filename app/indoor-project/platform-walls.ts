import polygonClipping from "polygon-clipping";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";

const bounds = (p: number[][]) => [
  Math.min(...p.map((p) => p[0])),
  Math.min(...p.map((p) => p[1])),
  Math.max(...p.map((p) => p[0])),
  Math.max(...p.map((p) => p[1])),
];

/** Low platform walls are drawn from native faces in relative 3D, so remove
 * every flattened copy of those footprints from the ordinary wall extrusion. */
export function withoutPlatformWalls(
  data: IndoorDataset,
  walls: FeatureCollection<MultiPolygon>,
): FeatureCollection<MultiPolygon> {
  const ids = new Set(
    data.rampDisplay?.ramps.flatMap(
      (r) => r.platforms?.map((p) => p.nativeElementId) ?? [],
    ),
  );
  if (ids.size === 0) return walls;
  const unique = new Map(
    data.walls
      .filter((w) => ids.has(w.nativeElementId))
      .map((w) => [JSON.stringify(w.ringsFeet), w.ringsFeet]),
  );
  const masks = [...unique.values()].map((rings) =>
    rings.map((ring) =>
      [...ring, ring[0]].map((p) => geographicPoint(data, p)),
    ),
  );
  const indexed = masks.map((rings) => ({ rings, box: bounds(rings.flat()) }));
  return {
    ...walls,
    features: walls.features.map((f) => {
      const b = bounds(f.geometry.coordinates.flat().flat());
      const nearby = indexed.filter(
        ({ box: c }) =>
          b[0] <= c[2] && b[2] >= c[0] && b[1] <= c[3] && b[3] >= c[1],
      );
      if (nearby.length === 0) return f;
      try {
        // Clipping almost coincident longitude/latitude edges can fail. Use a
        // local integer grid so native walls and their merged copies agree.
        const origin = nearby[0].rings[0][0];
        const scale = 1e10;
        const local = (p: number[]): [number, number] => [
          Math.round((p[0] - origin[0]) * scale),
          Math.round((p[1] - origin[1]) * scale),
        ];
        const coordinates = polygonClipping
          .difference(
            f.geometry.coordinates.map((p) =>
              p.map((r) => r.map((v) => local(v))),
            ),
            ...nearby.map((m) => m.rings.map((r) => r.map((v) => local(v)))),
          )
          .map((p) =>
            p.map((r) =>
              r.map((v) => [
                origin[0] + v[0] / scale,
                origin[1] + v[1] / scale,
              ]),
            ),
          );
        return { ...f, geometry: { ...f.geometry, coordinates } };
      } catch {
        return f;
      }
    }),
  };
}
