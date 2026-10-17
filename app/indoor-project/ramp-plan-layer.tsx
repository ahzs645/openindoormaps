import { useEffect, useMemo } from "react";
import { useMap } from "~/components/map/map";
import { mapReady } from "~/components/map/map-ready";
import type { IndoorDataset } from "./contract";
import { nativeRampPlanDrawing, nativeRampPlanLayer } from "./ramp-plan";

export function RampPlanLayer({
  data,
  levelIds,
  building,
}: {
  data: IndoorDataset;
  levelIds: number[];
  building: string;
}) {
  const { map, isLoaded } = useMap();
  const drawing = useMemo(
    () => nativeRampPlanDrawing(data, levelIds, building),
    [data, levelIds, building],
  );
  useEffect(() => {
    if (!mapReady(map, isLoaded) || !drawing.features.length) return;
    const layer = nativeRampPlanLayer(drawing, data.alignment.originGeographic);
    const before = [
      "project-route-line",
      "project-label",
      "visitor-overview-labels",
    ].find((id) => map.getLayer(id));
    map.addLayer(layer, before);
    return () => {
      if (map.getStyle() && map.getLayer(layer.id)) map.removeLayer(layer.id);
    };
  }, [map, isLoaded, drawing, data.alignment.originGeographic]);
  return null;
}
