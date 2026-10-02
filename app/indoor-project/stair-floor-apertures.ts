import polygonClipping from "polygon-clipping";
import type { FeatureCollection, Geometry, Polygon } from "geojson";

const box = (points: number[][]) => [
  Math.min(...points.map((p) => p[0])),
  Math.min(...points.map((p) => p[1])),
  Math.max(...points.map((p) => p[0])),
  Math.max(...points.map((p) => p[1])),
];

/** A stair footprint does not prove an opening. Only a surface already marked
 * as an open drop may be cut; solid ground must continue to cover lower steps. */
export function stairFloorApertures<T extends Geometry>(
  floors: FeatureCollection<T>,
  treads: FeatureCollection<Polygon>,
  relativeHeights = false,
): FeatureCollection<T> {
  const cuts = treads.features
    .filter((f) => relativeHeights || f.properties?.descending)
    .map((f) => ({
      levelId: f.properties?.levelId,
      top: Number(f.properties?.topMetres),
      coordinates: f.geometry.coordinates,
      box: box(f.geometry.coordinates.flat()),
    }));
  if (cuts.length === 0) return floors;
  // Clip on a local integer grid (about 0.01 mm), rather than nearly equal
  // longitude/latitude values. This avoids sweep-line failures at shared edges.
  const origin = cuts[0].coordinates[0][0];
  const local = (p: number[]) =>
    [
      Math.round((p[0] - origin[0]) * 1e10),
      Math.round((p[1] - origin[1]) * 1e10),
    ] as [number, number];
  const geographic = (p: number[]) => [
    p[0] / 1e10 + origin[0],
    p[1] / 1e10 + origin[1],
  ];

  return {
    ...floors,
    features: floors.features.map((f) => {
      if (f.geometry.type !== "MultiPolygon" || !f.properties?.openDrop)
        return f;
      const b = box(f.geometry.coordinates.flat().flat());
      const nearby = cuts.filter(
        ({ box: c, top }) =>
          (!relativeHeights || top <= Number(f.properties?.base) + 0.025) &&
          b[0] <= c[2] &&
          b[2] >= c[0] &&
          b[1] <= c[3] &&
          b[3] >= c[1],
      );
      if (nearby.length === 0) return f;
      try {
        const coordinates = polygonClipping.difference(
          f.geometry.coordinates.map((polygon) =>
            polygon.map((ring) => ring.map((p) => local(p))),
          ),
          ...nearby.map((c) =>
            c.coordinates.map((ring) => ring.map((p) => local(p))),
          ),
        );
        return {
          ...f,
          geometry: {
            ...f.geometry,
            coordinates: coordinates.map((polygon) =>
              polygon.map((ring) => ring.map((p) => geographic(p))),
            ),
          },
        };
      } catch {
        return f;
      }
    }),
  };
}
