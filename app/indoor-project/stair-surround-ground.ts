import pc from "polygon-clipping";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";

/** Stair places identify a destination, not floor material. In the visitor
 * map, paint only a supported wall enclosure intersected with the native slab.
 * Otherwise let the continuous neutral native floor show through. Preserve
 * source contours separately for picking/review, and never infer headroom or
 * access from the presence of a floor underneath a flight. */
export function stairSurroundGround(
  data: IndoorDataset,
  areas: FeatureCollection<Polygon | MultiPolygon>,
): FeatureCollection<Polygon | MultiPolygon> {
  const support = data.walkingSupport;
  if (support?.sourceModelSha256 !== data.source.modelSha256) return areas;
  const records = new Map(data.records.map((r) => [r.key, r]));
  const bounds = (rings: number[][][]) => {
    const points = rings.flat();
    return [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ];
  };
  const overlap = (a: number[], b: number[]) =>
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  return {
    ...areas,
    features: areas.features.flatMap((area) => {
      // A shared native circulation cell can have a stair place as its semantic
      // owner. Keep the whole cell; its geometry is already physical material.
      if (area.properties?.nativeCellId) return [area];
      const record = records.get(String(area.properties?.key));
      if (!record?.stair || area.properties?.openDrop) return [area];
      // These footprints were recovered from native wall faces. Registered
      // drawing enclosures and raw place contours are still review evidence.
      if (
        ![
          "prepared-native-walls",
          "prepared-native-mesh-walls",
          "prepared-revit-finish-face",
          "native-walls",
        ].includes(String(area.properties?.boundarySource))
      )
        return [];
      const box = bounds(record.ringsFeet);
      const floors = support.floors.filter(
        (f) =>
          Math.abs(f.elevationFeet - record.elevationFeet) < 0.15 &&
          overlap(box, bounds((f.partsFeet ?? [f.ringsFeet]).flat())),
      );
      if (floors.length === 0) return [];
      const parts =
        area.geometry.type === "Polygon"
          ? [area.geometry.coordinates]
          : area.geometry.coordinates;
      const origin = parts[0]?.[0]?.[0];
      if (!origin) return [];
      const local = (p: number[]) =>
        [
          Math.round((p[0] - origin[0]) * 1e10),
          Math.round((p[1] - origin[1]) * 1e10),
        ] as [number, number];
      try {
        const slabs = floors.flatMap((f) =>
          (f.partsFeet ?? [f.ringsFeet]).map((rings) =>
            rings.map((ring) =>
              ring.map((p) => local(geographicPoint(data, p))),
            ),
          ),
        );
        const material = pc.union(slabs[0], ...slabs.slice(1));
        let result = pc.intersection(
          parts.map((p) => p.map((r) => r.map(local))),
          material,
        );
        const walls = data.walls.filter(
          (w) =>
            w.levelId === record.levelId &&
            !w.approximate &&
            w.kind === "wall" &&
            overlap(box, bounds(w.ringsFeet)),
        );
        if (walls.length > 0)
          result = pc.difference(
            result,
            ...walls.map((w) =>
              w.ringsFeet.map((r) =>
                r.map((p) => local(geographicPoint(data, p))),
              ),
            ),
          );
        if (result.length === 0) return [];
        const coordinates = result.map((p) =>
          p.map((r) =>
            r.map((q) => [q[0] / 1e10 + origin[0], q[1] / 1e10 + origin[1]]),
          ),
        );
        return [
          {
            ...area,
            properties: {
              ...area.properties,
              color: "#d7e2e5",
              groundEvidence: "native-stair-surround",
              groundSlabIds: floors.map((f) => f.nativeElementId),
              displayOnly: true,
            },
            geometry: {
              type: "MultiPolygon" as const,
              coordinates,
            },
          },
        ];
      } catch {
        // A failed display proof must not put the source outline over a well.
        return [];
      }
    }),
  };
}
