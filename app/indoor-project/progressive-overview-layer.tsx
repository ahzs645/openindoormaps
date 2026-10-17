import { useEffect, useMemo } from "react";
import { useMap } from "~/components/map/map";
import { mapReady } from "~/components/map/map-ready";
import type { ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type {
  ProgressiveOverview,
  ProgressiveShell,
} from "./progressive-delivery";
import { precisionWallLayer } from "./precision-wall-layer";
import { HALLWAY_COLOR, OVERVIEW_SOLID_COLOR } from "./display-passages";
import { ROOM_DETAIL_START, ROOM_DETAIL_END } from "./zoom-presentation";

const multi = (
  geometry: FeatureCollection,
): FeatureCollection<MultiPolygon> => ({
  type: "FeatureCollection",
  features: geometry.features.flatMap((f) =>
    f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"
      ? [
          {
            ...f,
            geometry:
              f.geometry.type === "MultiPolygon"
                ? f.geometry
                : {
                    type: "MultiPolygon" as const,
                    coordinates: [f.geometry.coordinates],
                  },
          },
        ]
      : [],
  ),
});

export function ProgressiveOverviewLayer({
  overview,
  origin,
  revealRooms = false,
  shell,
}: {
  overview: ProgressiveOverview;
  origin: [number, number];
  revealRooms?: boolean;
  shell?: ProgressiveShell;
}) {
  const { map, isLoaded } = useMap();
  const roomLabels = useMemo<FeatureCollection>(() => {
    const keys = new Set(
      overview.geometry.features.flatMap(
        (feature) => feature.properties?.roomKeys ?? [],
      ),
    );
    return {
      type: "FeatureCollection",
      features: (shell?.records ?? []).flatMap((record) =>
        keys.has(record.key) && record.geographic && !record.stair
          ? [
              {
                type: "Feature" as const,
                properties: {
                  key: record.key,
                  name: record.number || record.name,
                },
                geometry: {
                  type: "Point" as const,
                  coordinates: record.geographic,
                },
              },
            ]
          : [],
      ),
    };
  }, [overview, shell]);
  useEffect(() => {
    if (!mapReady(map, isLoaded)) return;
    const ids: string[] = [];
    for (const [name, geometry] of [
      ["ground", overview.ground],
      ["floor", overview.floor],
    ] as const) {
      const id = `visitor-overview-${name}`;
      map.addSource(id, {
        type: "geojson",
        data: geometry,
        tolerance: 0,
        maxzoom: 22,
      });
      map.addLayer({
        id,
        type: "fill",
        source: id,
        paint: { "fill-color": OVERVIEW_SOLID_COLOR, "fill-antialias": false },
      });
      ids.push(id);
    }
    // Reuse the ordinary viewer's matching-tint edge coverage beneath the
    // local precision mesh. Both passes retain the same original rings/holes.
    const tintId = "visitor-overview-tint";
    const lowTint: ExpressionSpecification = [
      "case",
      ["==", ["get", "circulation"], true],
      HALLWAY_COLOR,
      OVERVIEW_SOLID_COLOR,
    ];
    const tint: ExpressionSpecification = revealRooms
      ? [
          "interpolate",
          ["linear"],
          ["zoom"],
          ROOM_DETAIL_START,
          lowTint,
          ROOM_DETAIL_END,
          ["coalesce", ["get", "color"], OVERVIEW_SOLID_COLOR],
        ]
      : lowTint;
    map.addSource(tintId, {
      type: "geojson",
      data: overview.geometry,
      tolerance: 0,
      maxzoom: 22,
    });
    map.addLayer({
      id: tintId,
      type: "fill",
      source: tintId,
      paint: {
        "fill-color": tint,
        "fill-antialias": true,
        "fill-outline-color": tint,
      },
    });
    ids.push(tintId);
    const id = "visitor-overview-precision";
    map.addLayer(
      precisionWallLayer(multi(overview.geometry), origin, {
        id,
        overview: true,
        overviewTint: true,
        overviewLocked: true,
        featureColors: revealRooms,
        revealRoomsWithZoom: revealRooms,
      }),
    );
    const labelId = "visitor-overview-labels";
    map.addSource(labelId, {
      type: "geojson",
      data: overview.labels,
      tolerance: 0,
    });
    map.addLayer({
      id: labelId,
      type: "symbol",
      source: labelId,
      layout: {
        "text-field": ["coalesce", ["get", "name"], ""],
        "text-font": ["Noto Sans Regular"],
        "text-size": 14,
      },
      paint: {
        "text-opacity": revealRooms
          ? [
              "interpolate",
              ["linear"],
              ["zoom"],
              ROOM_DETAIL_START,
              1,
              ROOM_DETAIL_END,
              0,
            ]
          : 1,
        "text-color": "#4a585e",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
      },
    });
    ids.push(labelId);
    if (revealRooms && roomLabels.features.length) {
      const previewId = "visitor-room-preview-labels";
      map.addSource(previewId, {
        type: "geojson",
        data: roomLabels,
        tolerance: 0,
      });
      map.addLayer({
        id: previewId,
        minzoom: ROOM_DETAIL_START,
        type: "symbol",
        source: previewId,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: {
          "text-color": "#4a585e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROOM_DETAIL_START,
            0,
            ROOM_DETAIL_END,
            1,
          ],
        },
      });
      ids.push(previewId);
    }
    return () => {
      if (!map.getStyle()) return;
      if (map.getLayer(id)) map.removeLayer(id);
      for (const source of ids.reverse()) {
        if (map.getLayer(source)) map.removeLayer(source);
        if (map.getSource(source)) map.removeSource(source);
      }
    };
  }, [map, isLoaded, overview, origin, revealRooms, roomLabels]);
  return null;
}
