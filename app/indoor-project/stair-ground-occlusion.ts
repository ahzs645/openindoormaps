import polygonClipping from "polygon-clipping";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";

/** The displayed ground is opaque, even where a recovered native slab has
 * different coverage. Clip steps below that ground; never cut a new stairwell
 * into it. Existing polygon holes remain real openings. Display geometry only. */
export function stairsAboveDisplayedGround(
  treads: FeatureCollection<Polygon>,
  floors: FeatureCollection<Polygon | MultiPolygon>,
  relativeHeights = false,
): FeatureCollection<Polygon> {
  const bounds = (rings: number[][][]) => {
    const points = rings.flat();
    return [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ];
  };
  const surfaces = floors.features
    .filter((f) => !f.properties?.openDrop)
    .map((f) => ({
      parts:
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates,
      height: relativeHeights ? Number(f.properties?.base ?? 0) : 0,
      box: bounds(
        f.geometry.type === "Polygon"
          ? f.geometry.coordinates
          : f.geometry.coordinates.flat(),
      ),
    }));
  return {
    ...treads,
    features: treads.features.flatMap((tread) => {
      const box = bounds(tread.geometry.coordinates),
        top = Number(tread.properties?.topMetres);
      const covers = surfaces.filter(
        (f) =>
          top < f.height - 0.003 &&
          box[0] <= f.box[2] &&
          box[2] >= f.box[0] &&
          box[1] <= f.box[3] &&
          box[3] >= f.box[1],
      );
      if (covers.length === 0) return [tread];
      const origin = tread.geometry.coordinates[0][0],
        scale = 1e10;
      const local = (rings: number[][][]) =>
        rings.map((r) =>
          r.map(
            (p) =>
              [
                Math.round((p[0] - origin[0]) * scale),
                Math.round((p[1] - origin[1]) * scale),
              ] as [number, number],
          ),
        );
      try {
        const visible = polygonClipping.difference(
          local(tread.geometry.coordinates),
          ...covers.flatMap((f) => f.parts.map(local)),
        );
        // Geographic rounding can leave microscopic edge slivers. They are not
        // visible tread surfaces and make tile triangulation unnecessarily costly.
        return visible
          .filter(
            (part) =>
              part.reduce(
                (sum, r, i) =>
                  sum +
                  ((i ? -1 : 1) *
                    Math.abs(
                      r.reduce((a, p, j) => {
                        const q = r[(j + 1) % r.length];
                        return a + p[0] * q[1] - q[0] * p[1];
                      }, 0),
                    )) /
                    2,
                0,
              ) > 1e6,
          )
          .map((part) => ({
            ...tread,
            geometry: {
              type: "Polygon" as const,
              coordinates: part.map((r) =>
                r.map((p) => [
                  p[0] / scale + origin[0],
                  p[1] / scale + origin[1],
                ]),
              ),
            },
          }));
      } catch {
        return []; // Do not show a below-ground tread when its clipping is unresolved.
      }
    }),
  };
}
