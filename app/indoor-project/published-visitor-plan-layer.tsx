import { useEffect, useMemo, useRef } from "react";
import type {
  ExpressionSpecification,
  CustomLayerInterface,
  LayerSpecification,
  MapMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import { useMap } from "~/components/map/map";
import { mapReady } from "~/components/map/map-ready";
import type { PublishedVisitorPlan } from "./published-visitor-plan-types";
import {
  HALLWAY_COLOR,
  OVERVIEW_SOLID_COLOR,
  RESTRICTED_AREA_COLOR,
} from "./display-passages";
import {
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
  WALL_DETAIL_START,
  WALL_DETAIL_END,
} from "./zoom-presentation";
import { visitorLabelPaddingExpression } from "./visitor-labels";
import { publishedVisitorPlanLabelStyle } from "./published-visitor-plan-labels";
import { DEFAULT_LABEL_SETTINGS } from "./label-settings";
import { precisionWallLayer } from "./precision-wall-layer";
import { nativeStairZoomStyle } from "./native-stair-style";
import { connectorMarkerLayer } from "./connector-marker-layer";
import {
  VISITOR_BOUNDARY,
  VISITOR_WALL_FILL,
  visitorBoundaryWidth,
  visitorRoomPaintExpression,
} from "./visitor-map-style";

export const VISITOR_PLAN_CONNECTORS_LAYER_ID = "project-connector-markers";

const nativeKeys = [
  "fills",
  "overview",
  "outlines",
  "partitions",
  "walls",
] as const;
const sourceCollections = (
  plan: PublishedVisitorPlan,
): [string, FeatureCollection][] => [
  ...Object.entries(plan.layers)
    .filter(([key]) => key !== "connectors")
    .map(([key, value]): [string, FeatureCollection] => [
      `visitor-plan-${key}`,
      value,
    ]),
  ...(plan.native
    ? nativeKeys.map((key): [string, FeatureCollection] => [
        `visitor-plan-native-${key}`,
        plan.native![key],
      ])
    : []),
];

/** Counts the actual checked paint collections; no source geometry is rebuilt. */
export const visitorPlanSourceFeatureCounts = (
  plan: PublishedVisitorPlan,
): Record<string, number> =>
  Object.fromEntries(
    sourceCollections(plan).map(([id, value]) => [id, value.features.length]),
  );

const fade = (
  start: number,
  end: number,
  value: number | ExpressionSpecification = 1,
): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  start,
  0,
  end,
  value,
];
const lowTint: ExpressionSpecification = [
  "case",
  ["==", ["get", "circulation"], true],
  HALLWAY_COLOR,
  OVERVIEW_SOLID_COLOR,
];
const byColor = visitorRoomPaintExpression;

/** Display-only geographic paint and picking. The caller supplies an admitted,
 * hash-checked plan; this component grants no geometry or access authority. */
export function PublishedVisitorPlanLayer({
  plan,
  selected,
  onPick,
  onUnavailableConnector,
}: {
  plan: PublishedVisitorPlan;
  selected: string;
  onPick: (keys: string[]) => void;
  onUnavailableConnector?: (message: string) => void;
}) {
  const { map, isLoaded } = useMap();
  const pick = useRef(onPick);
  const unavailableConnector = useRef(onUnavailableConnector);
  useEffect(() => {
    pick.current = onPick;
    unavailableConnector.current = onUnavailableConnector;
  }, [onPick, onUnavailableConnector]);
  const regions = useMemo(
    () =>
      new Map(plan.native?.regions.map((region) => [region.id, region]) ?? []),
    [plan],
  );
  const selectedRegions = useMemo(
    () =>
      [...regions.values()]
        .filter((region) => region.roomKeys.includes(selected))
        .map((region) => region.id),
    [regions, selected],
  );
  const labelStyle = useMemo(
    () => publishedVisitorPlanLabelStyle(selected),
    [selected],
  );
  useEffect(() => {
    if (!mapReady(map, isLoaded)) return;
    const sources = sourceCollections(plan);
    const ids: string[] = [];
    const before = map
      .getStyle()
      .layers?.find((layer) =>
        /(?:visitor|project).*(?:route|directions)/.test(layer.id),
      )?.id;
    const add = (layer: LayerSpecification | CustomLayerInterface) => {
      map.addLayer(layer, before);
      ids.push(layer.id);
    };
    for (const [id, data] of sources)
      map.addSource(id, { type: "geojson", data, tolerance: 0, maxzoom: 23 });
    const fill = (
      key: string,
      color: ExpressionSpecification | string,
      extra: Partial<Extract<LayerSpecification, { type: "fill" }>> = {},
    ) =>
      add({
        id: `visitor-plan-${key}-fill`,
        type: "fill",
        source: `visitor-plan-${key}`,
        paint: {
          "fill-color": color,
          "fill-opacity": fade(ROOM_DETAIL_START, ROOM_DETAIL_END),
          "fill-antialias": false,
        },
        ...extra,
      });
    const nativeOwners = [
      ...new Set(
        plan.native?.regions.flatMap((region) => region.roomKeys) ?? [],
      ),
    ];
    const genericOpacity: number | ExpressionSpecification = plan.native
      ? [
          "case",
          [
            "any",
            ["in", ["get", "levelId"], ["literal", plan.levelIds]],
            ["in", ["get", "key"], ["literal", nativeOwners]],
          ],
          0,
          1,
        ]
      : 1;
    const genericPaint = {
      "fill-color": byColor,
      "fill-opacity": fade(ROOM_DETAIL_START, ROOM_DETAIL_END, genericOpacity),
      "fill-antialias": false,
    } as const;
    fill("areas", byColor, {
      filter: ["!=", ["get", "openDrop"], true],
      paint: genericPaint,
    });
    fill("rooms", byColor, { paint: genericPaint });
    if (plan.native) {
      const nativeTint: ExpressionSpecification = [
        "interpolate",
        ["linear"],
        ["zoom"],
        ROOM_DETAIL_START,
        lowTint,
        ROOM_DETAIL_END,
        byColor,
      ];
      add({
        id: "visitor-plan-native-overview-fill",
        type: "fill",
        source: "visitor-plan-native-overview",
        paint: {
          "fill-color": nativeTint,
          "fill-outline-color": nativeTint,
          "fill-antialias": true,
        },
      });
      // Local mesh rendering matches the ordinary native viewer and preserves
      // every supplied ring/hole; the local origin is paint precision only.
      const mesh: FeatureCollection<MultiPolygon> = {
        type: "FeatureCollection",
        features: plan.native.overview.features.flatMap((feature) =>
          feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon"
            ? [
                {
                  ...feature,
                  geometry:
                    feature.geometry.type === "MultiPolygon"
                      ? feature.geometry
                      : {
                          type: "MultiPolygon" as const,
                          coordinates: [feature.geometry.coordinates],
                        },
                },
              ]
            : [],
        ),
      };
      const origin = mesh.features[0]?.geometry.coordinates[0]?.[0]?.[0];
      if (origin) {
        const id = "visitor-plan-native-overview-mesh";
        map.addLayer(
          precisionWallLayer(mesh, [origin[0], origin[1]], {
            id,
            overview: true,
            overviewTint: true,
          }),
          before,
        );
        ids.push(id);
      }
      add({
        id: "visitor-plan-native-fills-fill",
        type: "fill",
        source: "visitor-plan-native-fills",
        minzoom: ROOM_DETAIL_START,
        paint: { "fill-color": nativeTint, "fill-antialias": false },
      });
      add({
        id: "visitor-plan-native-walls-fill",
        type: "fill",
        source: "visitor-plan-native-walls",
        minzoom: WALL_DETAIL_START,
        paint: {
          "fill-color": VISITOR_WALL_FILL,
          "fill-antialias": false,
          "fill-opacity": fade(WALL_DETAIL_START, WALL_DETAIL_END),
        },
      });
      add({
        id: "visitor-plan-native-outlines-line",
        type: "line",
        source: "visitor-plan-native-outlines",
        paint: {
          "line-color": VISITOR_BOUNDARY,
          "line-width": visitorBoundaryWidth,
          "line-opacity": fade(WALL_DETAIL_START, WALL_DETAIL_END),
        },
      });
      add({
        id: "visitor-plan-native-selection-line",
        type: "line",
        source: "visitor-plan-native-outlines",
        minzoom: WALL_DETAIL_START,
        filter: ["==", ["get", "nativeRegionId"], ""],
        paint: { "line-color": "#f58a16", "line-width": 3 },
      });
      add({
        id: "visitor-plan-native-partitions-line",
        type: "line",
        source: "visitor-plan-native-partitions",
        minzoom: WALL_DETAIL_START,
        paint: {
          "line-color": "#8055bc",
          "line-width": 2,
          "line-dasharray": [2, 1.5],
        },
      });
    }
    if (!plan.native || !plan.display.nativeMaterialSections) {
      fill("walls", VISITOR_WALL_FILL, {
        minzoom: WALL_DETAIL_START,
        paint: {
          "fill-color": VISITOR_WALL_FILL,
          "fill-opacity": fade(WALL_DETAIL_START, WALL_DETAIL_END),
        },
      });
      fill("windows", ["get", "nativeWindowColor"], {
        minzoom: WALL_DETAIL_START,
        paint: {
          "fill-color": ["get", "nativeWindowColor"],
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            WALL_DETAIL_START,
            0,
            WALL_DETAIL_END,
            ["get", "opacity"],
          ],
        },
      });
    }
    fill("doors", "#d7e2e5", {
      filter: ["!=", ["get", "roomDisplayFilled"], true],
      minzoom: WALL_DETAIL_START,
      paint: {
        "fill-color": "#d7e2e5",
        "fill-opacity": fade(WALL_DETAIL_START, WALL_DETAIL_END),
      },
    });
    fill("stairs", byColor, {
      filter: ["!=", ["get", "overhead"], true],
      paint: {
        "fill-color": plan.native
          ? nativeStairZoomStyle(
              plan.levelIds,
              byColor,
              OVERVIEW_SOLID_COLOR,
              byColor,
              false,
            )
          : byColor,
        "fill-opacity": plan.native
          ? nativeStairZoomStyle(plan.levelIds, 0.92, 0, 0.92, false)
          : fade(ROOM_DETAIL_START, ROOM_DETAIL_END, 0.92),
      },
    });
    add({
      id: "visitor-plan-stairs-outline",
      type: "line",
      source: "visitor-plan-stairs",
      filter: ["==", ["get", "overhead"], true],
      paint: {
        "line-color": "#adbcca",
        "line-width": 0.65,
        "line-dasharray": [3, 2],
        "line-opacity": fade(WALL_DETAIL_START, WALL_DETAIL_END),
      },
    });
    add({
      id: "visitor-plan-selection-hit",
      type: "fill",
      source: "visitor-plan-selection",
      minzoom: ROOM_DETAIL_START,
      paint: { "fill-opacity": 0 },
    });
    add({
      id: "visitor-plan-labels-symbol",
      type: "symbol",
      source: "visitor-plan-labels",
      layout: {
        "text-field": publishedVisitorPlanLabelStyle("").textField,
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          18,
          ["case", ["==", ["get", "landmark"], true], 14, 10],
          21,
          ["case", ["==", ["get", "landmark"], true], 17, 12],
        ],
        "symbol-sort-key": publishedVisitorPlanLabelStyle("").sortKey,
        "text-max-width": 10,
        "text-font": ["Noto Sans Regular"],
        "text-padding": visitorLabelPaddingExpression(
          DEFAULT_LABEL_SETTINGS,
        ) as ExpressionSpecification,
      },
      paint: {
        "text-color": "#586064",
        "text-halo-color": "#fff",
        "text-halo-width": 1,
        "text-opacity": publishedVisitorPlanLabelStyle("").textOpacity,
      },
    });
    // Preserve the ordinary viewer's source markers and review state. These
    // display anchors never become arrivals or permissions to traverse.
    const connectors = connectorMarkerLayer(
      plan.layers.connectors as FeatureCollection<Point>,
      false,
      (kind, key) => {
        if (kind === "area") pick.current([key]);
        else
          unavailableConnector.current?.(
            "Directions are unavailable for this connection. Choose a nearby room or entrance.",
          );
      },
    );
    let connectorPainted!: () => void;
    let connectorFailed!: (error: unknown) => void;
    const whenReady = new Promise<void>((resolve, reject) => {
      connectorPainted = resolve;
      connectorFailed = reject;
    });
    // Map removal can precede the render-status subscription. Actual drawing
    // errors remain observable through whenReady without unhandled rejection.
    void whenReady.catch(() => {});
    const connectorLayer: CustomLayerInterface & { whenReady: Promise<void> } =
      {
        ...connectors,
        whenReady,
        render(gl, args) {
          try {
            connectors.render(gl, args);
            connectorPainted();
          } catch (error) {
            connectorFailed(error);
          }
        },
        onRemove(map, gl) {
          connectorPainted();
          connectors.onRemove?.(map, gl);
        },
      };
    add(connectorLayer);
    const clickable = [
      "visitor-plan-labels-symbol",
      "visitor-plan-stairs-fill",
      ...(plan.native
        ? [
            "visitor-plan-native-fills-fill",
            "visitor-plan-native-overview-fill",
          ]
        : [
            "visitor-plan-selection-hit",
            "visitor-plan-rooms-fill",
            "visitor-plan-areas-fill",
          ]),
    ];
    const click = (event: MapMouseEvent) => {
      if (
        map
          .queryRenderedFeatures(event.point)
          .some(
            (feature) =>
              !feature.layer.id.startsWith("visitor-plan-") &&
              /(?:route|connector|entrance)/.test(feature.layer.id),
          )
      )
        return;
      const features = map.queryRenderedFeatures(event.point, {
        layers: clickable,
      });
      // A label is an explicit identity. Otherwise retain every owner of every
      // overlapping displayed native region, including shared-place choices.
      const labels = features.filter(
        (feature) => feature.layer.id === "visitor-plan-labels-symbol",
      );
      const hits = labels.length > 0 ? labels : features;
      const keys = new Set<string>();
      for (const feature of hits) {
        if (
          feature.layer.id === "visitor-plan-labels-symbol" &&
          typeof feature.properties?.key === "string"
        ) {
          keys.add(feature.properties.key);
          continue;
        }
        const region = regions.get(
          String(feature.properties?.nativeRegionId ?? ""),
        );
        if (region) for (const key of region.roomKeys) keys.add(key);
        else if (typeof feature.properties?.key === "string")
          keys.add(feature.properties.key);
      }
      if (keys.size > 0) pick.current([...keys]);
    };
    map.on("click", click);
    return () => {
      map.off("click", click);
      if (!map.getStyle()) return;
      for (const id of ids.reverse()) if (map.getLayer(id)) map.removeLayer(id);
      for (const [id] of sources) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, isLoaded, plan, regions]);
  useEffect(() => {
    if (!mapReady(map, isLoaded)) return;
    if (map.getLayer("visitor-plan-labels-symbol")) {
      map.setLayoutProperty(
        "visitor-plan-labels-symbol",
        "text-field",
        labelStyle.textField,
      );
      map.setLayoutProperty(
        "visitor-plan-labels-symbol",
        "symbol-sort-key",
        labelStyle.sortKey,
      );
      map.setPaintProperty(
        "visitor-plan-labels-symbol",
        "text-opacity",
        labelStyle.textOpacity,
      );
    }
    const selection: ExpressionSpecification = ["==", ["get", "key"], selected];
    const detail: ExpressionSpecification = [
      "case",
      ["==", ["get", "access"], "staff"],
      RESTRICTED_AREA_COLOR,
      ["==", ["get", "circulation"], true],
      HALLWAY_COLOR,
      selection,
      "#ffe09d",
      byColor,
    ];
    for (const key of ["areas", "rooms"])
      if (map.getLayer(`visitor-plan-${key}-fill`))
        map.setPaintProperty(`visitor-plan-${key}-fill`, "fill-color", [
          "interpolate",
          ["linear"],
          ["zoom"],
          ROOM_DETAIL_START,
          lowTint,
          ROOM_DETAIL_END,
          detail,
        ]);
    const nativeDetail: ExpressionSpecification = [
      "case",
      ["==", ["get", "restricted"], true],
      byColor,
      ["==", ["get", "circulation"], true],
      byColor,
      ["in", ["get", "nativeRegionId"], ["literal", selectedRegions]],
      "#ffe09d",
      byColor,
    ];
    const nativeTint: ExpressionSpecification = [
      "interpolate",
      ["linear"],
      ["zoom"],
      ROOM_DETAIL_START,
      lowTint,
      ROOM_DETAIL_END,
      nativeDetail,
    ];
    for (const key of ["fills", "overview"])
      if (map.getLayer(`visitor-plan-native-${key}-fill`)) {
        map.setPaintProperty(
          `visitor-plan-native-${key}-fill`,
          "fill-color",
          nativeTint,
        );
        if (key === "overview")
          map.setPaintProperty(
            `visitor-plan-native-${key}-fill`,
            "fill-outline-color",
            nativeTint,
          );
      }
    if (map.getLayer("visitor-plan-native-selection-line"))
      map.setFilter("visitor-plan-native-selection-line", [
        "in",
        ["get", "nativeRegionId"],
        ["literal", selectedRegions],
      ]);
  }, [map, isLoaded, plan, selected, selectedRegions, labelStyle]);
  return null;
}
