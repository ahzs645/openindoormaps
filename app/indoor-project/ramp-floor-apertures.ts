import polygonClipping from "polygon-clipping";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { floorHeightDatum } from "./relative-heights";
import { geographicPoint } from "./routing";
import { nativeRationalOverlay } from "./native-rational-overlay";
import {
  nativeRenderExactParts,
  nativeRenderProperties,
} from "./native-render-parts";

const bounds = (p: number[][]) => [
  Math.min(...p.map((p) => p[0])),
  Math.min(...p.map((p) => p[1])),
  Math.max(...p.map((p) => p[0])),
  Math.max(...p.map((p) => p[1])),
];

/** Replace only the native ramp's actual footprint with its sloping surface.
 * Flat room/floor illustrations must not cap a descending or curved ramp. */
export function rampFloorApertures(
  data: IndoorDataset,
  levelIds: number[],
  floors: FeatureCollection<MultiPolygon>,
): FeatureCollection<MultiPolygon> {
  const datum = floorHeightDatum(data, levelIds),
    scale = data.alignment.verticalMetresPerFoot;
  const cuts = (data.rampDisplay?.ramps ?? [])
    .filter((r) => r.levelIds.some((id) => levelIds.includes(id)))
    .map((r) => ({
      min:
        (Math.min(
          ...(data.nativeIndoorEnvelopes
            ? r.trianglesFeet
            : (r.displayTrianglesFeet ?? r.trianglesFeet)
          )
            .flat()
            .map((p) => p[2]),
        ) -
          datum) *
        scale,
      max:
        (Math.max(
          ...(data.nativeIndoorEnvelopes
            ? r.trianglesFeet
            : (r.displayTrianglesFeet ?? r.trianglesFeet)
          )
            .flat()
            .map((p) => p[2]),
        ) -
          datum) *
        scale,
      rings: (data.nativeIndoorEnvelopes
        ? r.trianglesFeet
        : (r.displayTrianglesFeet ?? r.trianglesFeet)
      ).map((t) => [...t, t[0]].map((p) => geographicPoint(data, p))),
      nativeParts: (data.nativeIndoorEnvelopes
        ? r.trianglesFeet
        : (r.displayTrianglesFeet ?? r.trianglesFeet)
      ).map((t) => [t.map((p) => [p[0], p[1]] as [number, number])]),
    }))
    .map((c) => ({ ...c, box: bounds(c.rings.flat()) }));
  if (cuts.length === 0) return floors;
  return {
    ...floors,
    features: floors.features.map((f) => {
      const b = bounds(f.geometry.coordinates.flat().flat()),
        base = Number(f.properties?.base);
      const nearby = cuts.filter(
        (c) =>
          base >= c.min - 0.025 &&
          base <= c.max + 0.025 &&
          (data.nativeIndoorEnvelopes ||
            (b[0] <= c.box[2] &&
              b[2] >= c.box[0] &&
              b[1] <= c.box[3] &&
              b[3] >= c.box[1])),
      );
      if (nearby.length === 0) return f;
      if (data.nativeIndoorEnvelopes) {
        const source = nativeRenderExactParts(f.properties);
        if (!source)
          throw new Error(
            "Strict native ramp visibility lacks native drawing coordinates.",
          );
        const drawing = nativeRenderProperties(
          nativeRationalOverlay(
            "difference",
            source,
            ...nearby.flatMap((c) => c.nativeParts.map((part) => [part])),
          ),
        );
        return {
          ...f,
          properties: { ...f.properties, ...drawing },
          geometry: {
            ...f.geometry,
            coordinates: drawing.nativeDisplayPartsFeet.map((part) =>
              part.map((ring) =>
                [...ring, ring[0]].map((p) => geographicPoint(data, p)),
              ),
            ),
          },
        };
      }
      const origin = nearby[0].rings[0][0],
        scale = 1e10;
      const local = (p: number[]): [number, number] => [
        Math.round((p[0] - origin[0]) * scale),
        Math.round((p[1] - origin[1]) * scale),
      ];
      try {
        const coordinates = polygonClipping.difference(
          f.geometry.coordinates.map((p) =>
            p.map((r) => r.map((v) => local(v))),
          ),
          ...nearby.flatMap((c) =>
            c.rings.map((r) => [r.map((v) => local(v))]),
          ),
        );
        return {
          ...f,
          geometry: {
            ...f.geometry,
            coordinates: coordinates.map((p) =>
              p.map((r) =>
                r.map((v) => [
                  v[0] / scale + origin[0],
                  v[1] / scale + origin[1],
                ]),
              ),
            ),
          },
        };
      } catch {
        return f;
      }
    }),
  };
}
