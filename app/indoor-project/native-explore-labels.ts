import type { FeatureCollection, Point } from "geojson";
import type { IndoorDataset } from "./contract";
import { geographicPoint } from "./routing";
/** Only levels already validated and displayed by NativeExploreLayer may move
 * visitor labels. Label positions do not change destinations or arrival nodes. */
export function nativeExploreLabels(
  data: IndoorDataset,
  labels: FeatureCollection<Point>,
  readyLevels: number[],
) {
  const points = new Map(
    data.nativeExploreMapping?.levels
      .filter((l) => readyLevels.includes(l.levelId))
      .flatMap((l) =>
        l.regions.flatMap((r) =>
          (r.associations ?? [])
            .filter((a) => a.method === "majority-overlap" && a.labelPointFeet)
            .map((a) => [a.roomKey, a.labelPointFeet!] as const),
        ),
      ) ?? [],
  );
  if (!points.size) return labels;
  return {
    ...labels,
    features: labels.features.map((f) => {
      const p = points.get(String(f.properties?.key));
      return p
        ? {
            ...f,
            geometry: { ...f.geometry, coordinates: geographicPoint(data, p) },
          }
        : f;
    }),
  };
}
