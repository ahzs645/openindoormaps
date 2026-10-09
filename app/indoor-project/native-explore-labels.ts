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
            .filter((a) => a.method !== "seed-fallback" && a.labelPointFeet)
            .map((a) => [a.roomKey, a.labelPointFeet!] as const),
        ),
      ) ?? [],
  );
  const records = new Map(data.records.map((r) => [r.key, r]));
  const features = data.nativeIndoorEnvelopes
    ? labels.features.filter((f) => {
        const key = String(f.properties?.key),
          room = records.get(key);
        return !room || !readyLevels.includes(room.levelId) || points.has(key);
      })
    : labels.features;
  if (!points.size && features === labels.features) return labels;
  return {
    ...labels,
    features: features.map((f) => {
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
