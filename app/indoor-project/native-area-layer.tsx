import { useEffect, useMemo } from "react";
import {
  type GeoJSONSource,
  type MapMouseEvent,
  Marker,
  LngLatBounds,
} from "maplibre-gl";
import { useMap } from "~/components/map/map";
import { geographicPoint } from "./routing";
import { nativeEditPoint } from "./map-edits";
import {
  pointInNativeArea,
  type NativeAreaResult,
  type NativeAreaDecision,
} from "./native-area-review";
import type { IndoorDataset } from "./contract";
import type { FeatureCollection, Polygon } from "geojson";
export function NativeAreaLayer({
  data,
  result,
  selected,
  decisions,
  onSelect,
  showHallways,
  drawing,
  draft,
  onPoint,
  interactive = true,
}: {
  data: IndoorDataset;
  result?: NativeAreaResult;
  selected: string[];
  decisions: NativeAreaDecision[];
  onSelect: (id: string, additive: boolean) => void;
  showHallways: boolean;
  drawing?: "wall" | "outdoor" | "partition";
  draft: [number, number][];
  onPoint: (point: [number, number]) => void;
  interactive?: boolean;
}) {
  const { map, isLoaded } = useMap();
  const features = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: "FeatureCollection",
      features:
        result?.regions.flatMap((r) => {
          const decision = [...decisions]
            .reverse()
            .find(
              (d) =>
                d.geometrySha256 === result.geometrySha256 &&
                d.regionIds.includes(r.id),
            );
          return (r.displayPartsFeet ?? [r.ringsFeet]).map((part) => ({
            type: "Feature" as const,
            properties: {
              id: r.id,
              selected: selected.includes(r.id),
              color:
                decision?.kind === "hallway"
                  ? "#a9d5df"
                  : decision?.kind === "staff" ||
                      decision?.kind === "off-limits"
                    ? "#b8a7c9"
                    : decision?.kind === "room"
                      ? "#ffe1a1"
                      : "#58aab8",
            },
            geometry: {
              type: "Polygon" as const,
              coordinates: part.map((ring) =>
                [...ring, ring[0]].map((p) => geographicPoint(data, p)),
              ),
            },
          }));
        }) ?? [],
    }),
    [data, result, selected, decisions],
  );
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.addSource("native-area-regions", {
      type: "geojson",
      data: features,
      maxzoom: 23,
      tolerance: 0,
    });
    map.addSource("native-area-outlines", {
      type: "geojson",
      maxzoom: 23,
      tolerance: 0,
      data: { type: "FeatureCollection", features: [] },
    });
    map.addSource("native-existing-hallways", {
      type: "geojson",
      maxzoom: 23,
      tolerance: 0,
      data: { type: "FeatureCollection", features: [] },
    });
    map.addSource("native-area-draft", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addSource("native-area-partitions", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      maxzoom: 23,
      tolerance: 0,
    });
    map.addLayer({
      id: "native-area-draft-line",
      type: "line",
      source: "native-area-draft",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#ce257a", "line-width": 4 },
    });
    map.addLayer({
      id: "native-area-draft-point",
      type: "circle",
      source: "native-area-draft",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": "#ce257a",
        "circle-radius": 5,
        "circle-stroke-color": "white",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "native-area-region-fill",
      type: "fill",
      source: "native-area-regions",
      paint: {
        "fill-color": [
          "case",
          ["get", "selected"],
          ["get", "color"],
          "#e8edef",
        ],
        "fill-opacity": ["case", ["get", "selected"], 0.6, 0.025],
        "fill-antialias": false,
      },
    });
    map.addLayer({
      id: "native-existing-hallways-fill",
      type: "fill",
      source: "native-existing-hallways",
      paint: {
        "fill-color": "#a4d5ec",
        "fill-opacity": 0.85,
        "fill-antialias": false,
      },
    });
    map.addLayer({
      id: "native-area-region-outline",
      type: "line",
      source: "native-area-outlines",
      paint: {
        "line-color": ["case", ["get", "selected"], "#f58a16", "#287b8a"],
        "line-width": ["case", ["get", "selected"], 3, 0.7],
      },
    });
    map.addLayer({
      id: "native-area-partition-lines",
      type: "line",
      source: "native-area-partitions",
      paint: {
        "line-color": ["case", ["get", "preview"], "#d32791", "#8055bc"],
        "line-width": 3,
        "line-dasharray": [2, 1.5],
      },
    });
    for (const id of ["project-review-pin-dot", "project-review-pin-label"])
      if (map.getLayer(id)) map.moveLayer(id);
    return () => {
      if (!map.getStyle()) return;
      for (const id of [
        "native-area-draft-line",
        "native-area-draft-point",
        "native-area-partition-lines",
        "native-area-region-outline",
        "native-area-region-fill",
        "native-existing-hallways-fill",
      ])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("native-area-regions"))
        map.removeSource("native-area-regions");
      if (map.getSource("native-area-outlines"))
        map.removeSource("native-area-outlines");
      if (map.getSource("native-existing-hallways"))
        map.removeSource("native-existing-hallways");
      if (map.getSource("native-area-draft"))
        map.removeSource("native-area-draft");
      if (map.getSource("native-area-partitions"))
        map.removeSource("native-area-partitions");
    };
    // Layer lifetime belongs to the mounted map; geometry changes update data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    (map.getSource("native-area-partitions") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: (data.reviewedAreaPartitions?.partitions ?? [])
        .filter((p) => p.levelId === result?.levelId &&
          result.logicalPartitionIds?.includes(p.id))
        .map((p) => ({
          type: "Feature" as const,
          properties: {id:p.id, preview: result?.options?.previewPartitionIds?.includes(p.id) ?? false},
          geometry: {
            type: "LineString" as const,
            coordinates: (p.closed ? [...p.pointsFeet,p.pointsFeet[0]] : p.pointsFeet)
              .map((point) => geographicPoint(data,point)),
          },
        })),
    });
  }, [map,isLoaded,data,result]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    const points = draft.map((p) => geographicPoint(data, p));
    (map.getSource("native-area-draft") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [
        ...points.map((p) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: p },
        })),
        ...(points.length > 1
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "LineString" as const,
                  coordinates:
                    drawing === "outdoor" && points.length > 2
                      ? [...points, points[0]]
                      : points,
                },
              },
            ]
          : []),
      ],
    });
  }, [map, isLoaded, data, draft, drawing]);
  useEffect(() => {
    if (map && isLoaded)
      (
        map.getSource("native-area-regions") as GeoJSONSource | undefined
      )?.setData(features);
    if (map && isLoaded)
      (
        map.getSource("native-area-outlines") as GeoJSONSource | undefined
      )?.setData({
        type: "FeatureCollection",
        features:
          result?.regions.map((r) => ({
            type: "Feature",
            properties: { id: r.id, selected: selected.includes(r.id) },
            geometry: {
              type: "Polygon",
              coordinates: r.ringsFeet.map((ring) =>
                [...ring, ring[0]].map((p) => geographicPoint(data, p)),
              ),
            },
          })) ?? [],
      });
  }, [map, isLoaded, features]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    (
      map.getSource("native-existing-hallways") as GeoJSONSource | undefined
    )?.setData({
      type: "FeatureCollection",
      features: showHallways
        ? (result?.hallwayPartsFeet ?? []).map((part) => ({
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: part.map((ring) =>
                [...ring, ring[0]].map((p) => geographicPoint(data, p)),
              ),
            },
          }))
        : [],
    });
  }, [map, isLoaded, data, result, showHallways]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    let raising = false;
    const raise = () => {
      if (raising) return;
      const layers = map.getStyle()?.layers ?? [];
      if (
        layers.at(-1)?.id !== (map.getLayer("native-connection-preview-line") ? "native-connection-preview-line" : "native-area-draft-point") &&
        map.getLayer("native-area-region-outline")
      ) {
        raising = true;
        try {
          map.moveLayer("native-area-region-fill");
          map.moveLayer("native-existing-hallways-fill");
          map.moveLayer("native-area-region-outline");
          map.moveLayer("native-area-partition-lines");
          map.moveLayer("native-area-draft-line");
          map.moveLayer("native-area-draft-point");
          for (const id of ["native-connection-preview-fill", "native-connection-preview-line"])
            if (map.getLayer(id)) map.moveLayer(id);
        } finally {
          raising = false;
        }
      }
    };
    map.on("styledata", raise);
    raise();
    return () => {
      map.off("styledata", raise);
    };
  }, [map, isLoaded]);
  useEffect(() => {
    if (!map || !isLoaded || !result || !selected.length) return;
    const bounds = new LngLatBounds();
    for (const region of result.regions.filter((r) => selected.includes(r.id)))
      for (const p of region.ringsFeet[0])
        bounds.extend(geographicPoint(data, p));
    if (!bounds.isEmpty())
      map.fitBounds(bounds, {
        padding: 35,
        maxZoom: 21,
        pitch: 0,
        duration: 350,
      });
  }, [map, isLoaded, result, selected, data]);
  useEffect(() => {
    if (!map || !isLoaded || (!result && !drawing)) return;
    const pick = (e: MapMouseEvent) => {
      if (!interactive) return;
      if ((e.originalEvent.target as HTMLElement)?.closest("button,a,input"))
        return;
      if (
        map.getLayer("project-review-pin-dot") &&
        map.queryRenderedFeatures(e.point, {
          layers: ["project-review-pin-dot"],
        }).length
      )
        return;
      const point = nativeEditPoint(data, [e.lngLat.lng, e.lngLat.lat]);
      if (drawing) {
        onPoint(point);
        return;
      }
      const region = result?.regions.find((r) =>
        pointInNativeArea(point, r.ringsFeet),
      );
      if (region) onSelect(region.id, !!e.originalEvent.shiftKey);
    };
    map.on("click", pick);
    const markers = decisions
      .filter(
        (d) =>
          result &&
          d.levelId === result.levelId &&
          d.geometrySha256 === result.geometrySha256,
      )
      .flatMap((d) => {
        const region = result?.regions.find((r) => r.id === d.regionIds[0]);
        if (!region) return [];
        const points = region.ringsFeet[0];
        // Label at a real polygon vertex inset toward a contained room label is
        // unnecessary: existing place labels remain; this decision label marks
        // the boundary itself and never creates a routable arrival.
        const element = document.createElement("span");
        element.className = "native-area-label";
        element.textContent = `${d.label} · ${d.status}`;
        return [
          new Marker({ element, anchor: "bottom-left" })
            .setLngLat(geographicPoint(data, points[0]))
            .addTo(map),
        ];
      });
    return () => {
      map.off("click", pick);
      markers.forEach((m) => m.remove());
    };
  }, [
    map,
    isLoaded,
    data,
    result,
    decisions,
    onSelect,
    drawing,
    onPoint,
    interactive,
  ]);
  return null;
}
