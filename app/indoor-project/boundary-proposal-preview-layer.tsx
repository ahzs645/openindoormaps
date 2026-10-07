import type { PinComparisonResult } from "./pin-comparison";
import { coloredComparisonRegions } from "./patch-comparison-colors";
import { useEffect, useMemo } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import type { GeoJSONSource } from "maplibre-gl";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import type { NativeAreaResult } from "./native-area-review";
import type {
  BoundaryPatchPreviewPlan,
  ProposalDisplayPreviewPlan,
} from "./enclosure-proposals";
import { geographicPoint } from "./routing";

/** Temporary boundary comparison. Never supplies visitor blocks or route data. */
export function BoundaryProposalPreviewLayer({
  data,
  plan,
  result,
  displayPlan,
  comparison,
  after = true,
}: {
  data: IndoorDataset;
  plan?: BoundaryPatchPreviewPlan;
  displayPlan?: ProposalDisplayPreviewPlan;
  result?: NativeAreaResult;
  comparison?: PinComparisonResult;
  after?: boolean;
}) {
  const { map, isLoaded } = useMap();
  const features = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: "FeatureCollection",
      features: [
        ...(comparison
          ? coloredComparisonRegions(comparison, after).flatMap(
              ({ region: r, color }) => [
                ...r.displayPartsFeet.map((rings) => ({
                  type: "Feature" as const,
                  properties: {
                    kind: "region",
                    color,
                    labels: r.roomKeys.length,
                  },
                  geometry: {
                    type: "Polygon" as const,
                    coordinates: rings.map((ring) =>
                      [...ring, ring[0]].map((p) => geographicPoint(data, p)),
                    ),
                  },
                })),
                {
                  type: "Feature" as const,
                  properties: { kind: "outline", color },
                  geometry: {
                    type: "Polygon" as const,
                    coordinates: r.ringsFeet.map((ring) =>
                      [...ring, ring[0]].map((p) => geographicPoint(data, p)),
                    ),
                  },
                },
              ],
            )
          : (result?.regions
              .filter((r) => plan && r.roomKeys.includes(plan.roomKey))
              .flatMap((r) =>
                (r.displayPartsFeet ?? [r.ringsFeet]).map((rings) => ({
                  type: "Feature" as const,
                  properties: { kind: "region", labels: r.roomKeys.length },
                  geometry: {
                    type: "Polygon" as const,
                    coordinates: rings.map((ring) =>
                      [...ring, ring[0]].map((p) => geographicPoint(data, p)),
                    ),
                  },
                })),
              ) ?? [])),
        ...(plan && after
          ? (plan.patches ?? [plan.patch]).map((patch) => ({
              type: "Feature" as const,
              properties: { kind: "patch" },
              geometry: {
                type: "Polygon" as const,
                coordinates: patch.ringsFeet.map((ring) =>
                  [...ring, ring[0]].map((p) => geographicPoint(data, p)),
                ),
              },
            }))
          : []),
        ...(displayPlan?.partsFeet.map((rings) => ({
          type: "Feature" as const,
          properties: {
            kind:
              displayPlan.nativeRegion?.previewPurpose ===
              "boundary-investigation"
                ? "investigation"
                : "walkway",
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: rings.map((ring) =>
              [...ring, ring[0]].map((p) => geographicPoint(data, p)),
            ),
          },
        })) ?? []),
      ],
    }),
    [data, plan, result, displayPlan, comparison, after],
  );
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.addSource("boundary-proposal-preview", {
      type: "geojson",
      data: features,
      tolerance: 0,
      maxzoom: 23,
    });
    map.addLayer({
      id: "boundary-proposal-preview-fill",
      filter: ["!=", ["get", "kind"], "outline"],
      type: "fill",
      source: "boundary-proposal-preview",
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "kind"], "patch"],
          "#d92583",
          ["==", ["get", "kind"], "investigation"],
          "#edab45",
          ["==", ["get", "kind"], "walkway"],
          "#80c2df",
          ["coalesce", ["get", "color"], "#68c5b5"],
        ],
        "fill-opacity": [
          "case",
          ["==", ["get", "kind"], "patch"],
          0.9,
          ["==", ["get", "kind"], "walkway"],
          0.75,
          0.35,
        ],
        "fill-antialias": false,
      },
    });
    map.addLayer({
      id: "boundary-proposal-preview-line",
      filter: comparison ? ["!=", ["get", "kind"], "region"] : undefined,
      type: "line",
      source: "boundary-proposal-preview",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "kind"], "patch"],
          "#d92583",
          ["==", ["get", "kind"], "investigation"],
          "#b66c07",
          ["==", ["get", "kind"], "walkway"],
          "#267b9c",
          ["coalesce", ["get", "color"], "#128779"],
        ],
        "line-width": 3,
      },
    });
    return () => {
      if (!map.getStyle()) return;
      for (const id of [
        "boundary-proposal-preview-line",
        "boundary-proposal-preview-fill",
      ])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("boundary-proposal-preview"))
        map.removeSource("boundary-proposal-preview");
    };
    // Data changes update the source without changing layer lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    (
      map.getSource("boundary-proposal-preview") as GeoJSONSource | undefined
    )?.setData(features);
    if (map.getLayer("boundary-proposal-preview-line"))
      map.setFilter(
        "boundary-proposal-preview-line",
        comparison ? ["!=", ["get", "kind"], "region"] : null,
      );
  }, [map, isLoaded, features, comparison]);
  useEffect(() => {
    if (!map || !isLoaded || displayPlan?.kind !== "native-enclosure-walkway")
      return;
    const points = displayPlan.partsFeet
      .flatMap((r) => r[0])
      .map((p) => geographicPoint(data, p));
    if (!points.length) return;
    map.fitBounds(
      [
        [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
        ],
        [
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      ],
      { padding: 44, maxZoom: 22, duration: 250 },
    );
  }, [map, isLoaded, displayPlan]);
  useEffect(() => {
    if (!map || !isLoaded || !comparison?.current) return;
    const points = comparison.current.ringsFeet[0].map((p) =>
      geographicPoint(data, p),
    );
    if (!points.length) return;
    map.fitBounds(
      [
        [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
        ],
        [
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      ],
      { padding: 44, maxZoom: 22, duration: 250 },
    );
  }, [map, isLoaded, data, comparison]);
  return null;
}
