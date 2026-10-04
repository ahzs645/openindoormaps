import { visitorRoomSurfaces } from "./visitor-room-surfaces";
import { stableWallGeometry } from "./stable-wall-geometry";
import { precisionWallLayer } from "./precision-wall-layer";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  LngLatBounds,
  type GeoJSONSource,
  type MapMouseEvent,
  type PaddingOptions,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import { geographicPoint, type ProjectRoute } from "./routing";
import { hospitalFollowPadding } from "~/utils/hospital-follow-padding";
import { EXPOSED_WALL_HEIGHT_METRES } from "./display-geometry";
import type { PreparedFloor } from "./prepared-floor";
import { usePreparedFloor } from "./use-prepared-floor";
import type { SourceConnectorReview } from "./connector-review";
import {
  projectConnectorMarkers,
  sourceModelConnectorMarkers,
} from "./connector-markers";
import { connectorMarkerLayer } from "./connector-marker-layer";
import {
  HALLWAY_COLOR,
  RESTRICTED_AREA_COLOR,
  isRestrictedArea,
  isHallway,
  isPassThroughPlace,
} from "./display-passages";
import { lowerFloorLayer } from "./lower-floor-layer";
import { descendingStairLayer } from "./descending-stair-layer";
import { nativeRampLayer } from "./ramp-layer";
import { roofLabelLayer } from "./roof-label-layer";
import {
  visitorRoomLabels,
  visitorLabelOpacityExpression,
  visitorLabelTextExpression,
  visitorLabelPaddingExpression,
} from "./visitor-labels";
import type { LabelSettings } from "./label-settings";
import { ROOM_BLOCK_HEIGHT_METRES } from "./display-geometry";
import {
  ROOM_DETAIL_ZOOM,
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
} from "./zoom-presentation";

const collection = <T extends Geometry>(
  features: Feature<T>[],
): FeatureCollection<T> => ({
  type: "FeatureCollection",
  features,
});
function PreparedProjectMapLayers({
  prepared,
  basemapVisibility,
  data,
  levelIds,
  building,
  circulationOnly,
  network,
  roomThree,
  nativeModel = false,
  relativeHeights = false,
  showPassThroughPlaces,
  showStructures,
  simplifyGeometry,
  labelSettings,
  connectorReview,
  review,
  route,
  selected,
  onPick,
  pickEnabled = true,
  onFitReady,
  geometryOpacity = 1,
  labelsVisible = true,
  basemapVisible = true,
}: {
  prepared: PreparedFloor;
  basemapVisibility: MutableRefObject<Map<string, string>>;
  data: IndoorDataset;
  geometryOpacity?: number;
  labelsVisible?: boolean;
  basemapVisible?: boolean;
  levelIds: number[];
  building: string;
  circulationOnly: boolean;
  network: boolean;
  roomThree: boolean;
  nativeModel?: boolean;
  relativeHeights?: boolean;
  showPillars: boolean;
  showPassThroughPlaces: boolean;
  showVestibuleDoors: boolean;
  showStructures: boolean;
  simplifyGeometry: boolean;
  labelSettings: LabelSettings;
  connectorReview?: SourceConnectorReview;
  review: boolean;
  route: ProjectRoute | null;
  selected: string;
  pickEnabled?: boolean;
  onPick: (kind: "area" | "edge", id: string) => void;
  onFitReady: (fit: (includeSelection?: boolean) => void) => void;
}) {
  const { map, isLoaded } = useMap();
  const uploadedSources = useRef(
    new Map<string, { source: GeoJSONSource; value: FeatureCollection }>(),
  );
  const {
    display,
    visitorWalls,
    simpleWalls,
    simpleRooms,
    simpleAreas,
    simpleDoors,
    overviewGeometry,
    overviewLabels,
  } = prepared.presentation;
  const visitorLabels = useMemo(
    () => ({
      ...display.labels,
      features: [
        ...overviewLabels.features.map((f) => ({
          ...f,
          properties: { ...f.properties, maxZoom: labelSettings.roomZoom - 1 },
        })),
        ...visitorRoomLabels(
          display.labels,
          display.records,
          selected,
          labelSettings,
        ).features,
      ],
    }),
    [display, overviewLabels, selected, labelSettings],
  );
  const connectorMarkers = useMemo(() => {
    const markers = projectConnectorMarkers(
      data,
      levelIds,
      building,
      connectorReview,
      relativeHeights || nativeModel,
    );
    return nativeModel || relativeHeights
      ? sourceModelConnectorMarkers(data, markers, levelIds)
      : markers;
  }, [data, levelIds, building, connectorReview, nativeModel, relativeHeights]);
  const { nativeStairKeys, physicalGround, nativeStairs } = prepared;
  const layers = useMemo(() => {
    const {
      records,
      areas,
      walls,
      roomBlocks,
      exposedWalls,
      doorFootprints,
      doorMarkers,
      lowerRooms,
      labels,
    } = display;
    const keys = new Set(records.map((r) => r.key));
    const edges = data.edges.filter(
      (e) =>
        e.roomKeys.some((k) => keys.has(k)) &&
        (e.kind === "stairs" ||
          e.kind === "local-steps" ||
          e.kind === "ramp" ||
          e.kind === "elevator" ||
          e.kind === "escalator" ||
          e.pointsFeet.every((p) =>
            levelIds.some(
              (id) =>
                data.nativeLevels.find((l) => l.id === id) &&
                Math.abs(
                  data.nativeLevels.find((l) => l.id === id)!.elevationFeet -
                    p[2],
                ) < 5,
            ),
          )),
    );
    const lines = collection(
      edges
        .filter((e) => e.kind === "walk")
        .map((e) => ({
          type: "Feature",
          properties: { id: e.id },
          geometry: {
            type: "LineString",
            coordinates: e.pointsFeet.map((p) => geographicPoint(data, p)),
          },
        })),
    );
    const portals = collection([
      ...doorMarkers.features,
      ...edges
        .filter((e) => e.kind !== "walk" && !(data.doors && e.kind === "door"))
        .map((e) => ({
          type: "Feature" as const,
          properties: { id: e.id, kind: e.kind, enabled: e.enabled },
          geometry: {
            type: "Point" as const,
            coordinates: geographicPoint(
              data,
              e.pointsFeet[Math.floor(e.pointsFeet.length / 2)],
            ),
          },
        })),
    ]);
    const routeLines = collection(
      (route?.paths ?? [])
        .filter((path) => path.levelIds.some((id) => levelIds.includes(id)))
        .filter(
          (path) =>
            !relativeHeights &&
            (!(roomThree || nativeModel) ||
              !path.edgeIds.some((id) =>
                route?.edges.some(
                  (e) =>
                    e.id === id &&
                    data.rampDisplay?.ramps.some(
                      (r) => r.nativeElementId === e.nativeElementId,
                    ),
                ),
              )),
        )
        .map((path, i) => ({
          type: "Feature",
          properties: { id: `route:${i}`, centered: path.centered },
          geometry: {
            type: "LineString",
            coordinates: path.pointsFeet.map((p) => geographicPoint(data, p)),
          },
        })),
    );
    return {
      areas: !review && simplifyGeometry ? simpleAreas : areas,
      walls,
      roomBlocks: collection(
        (!review && simplifyGeometry
          ? simpleRooms
          : roomBlocks
        ).features.filter(
          (f) =>
            !nativeStairKeys.includes(String(f.properties?.key)) &&
            !prepared.stairSurroundKeys.includes(String(f.properties?.key)),
        ),
      ),
      exposedWalls: stableWallGeometry(
        review
          ? exposedWalls
          : simplifyGeometry
            ? simpleWalls
            : showStructures
              ? exposedWalls
              : visitorWalls,
      ),
      lines,
      portals,
      routeLines,
      records,
      doorFootprints:
        !review && simplifyGeometry ? simpleDoors : doorFootprints,
      lowerRooms,
      labels: review ? labels : visitorLabels,
    };
  }, [
    data,
    levelIds,
    route,
    display,
    review,
    showStructures,
    visitorWalls,
    simplifyGeometry,
    simpleWalls,
    simpleRooms,
    simpleAreas,
    simpleDoors,
    visitorLabels,
    nativeStairKeys,
    prepared.stairSurroundKeys,
    roomThree,
    nativeModel,
    relativeHeights,
  ]);
  const stairCutAreas = useMemo(
    () =>
      visitorRoomSurfaces(
        roomThree ? prepared.stairCutAreas : physicalGround,
        review,
      ),
    [roomThree, prepared.stairCutAreas, physicalGround, review],
  );
  const selectionOnlyKeys = [
    ...new Set([
      ...nativeStairKeys,
      ...prepared.stairSurroundKeys,
      ...layers.areas.features
        .filter((f) => f.properties?.boundaryReviewRequired === true)
        .map((f) => String(f.properties?.key)),
    ]),
  ];
  const stairCutRooms = roomThree
    ? prepared.stairCutRooms
    : {
        ...layers.roomBlocks,
        features: [
          ...layers.roomBlocks.features,
          ...prepared.assumedRoomBlocks.features,
        ],
      };
  useEffect(() => {
    if (!map || !isLoaded) return;
    const overviewSource = map.getSource("project-overview") as
      | GeoJSONSource
      | undefined;
    if (overviewSource) {
      const uploaded = uploadedSources.current.get("project-overview");
      if (
        uploaded?.source !== overviewSource ||
        uploaded.value !== overviewGeometry
      )
        overviewSource.setData(overviewGeometry);
    } else
      map.addSource("project-overview", {
        type: "geojson",
        data: overviewGeometry,
        tolerance: 0,
        maxzoom: 22,
      });
    uploadedSources.current.set("project-overview", {
      source: map.getSource("project-overview") as GeoJSONSource,
      value: overviewGeometry,
    });
    const sources = [
        "project-areas",
        "project-walls",
        "project-network",
        "project-portals",
        "project-route",
        "project-doors",
        "project-lower-rooms",
        "project-labels",
        "project-room-blocks",
        "project-exposed-walls",
        "project-native-stairs",
        "project-selection-areas",
      ],
      ids = [
        "project-room-fill",
        "project-area-outline",
        "project-wall-fill",
        "project-network-line",
        "project-route-line",
        "project-portal-circle",
        "project-label",
      ];
    // Build aperture data once, rather than repeating both polygon cuts for
    // every source. Unchanged sources need no worker upload on selection changes.
    const values = [
      stairCutAreas,
      layers.walls,
      layers.lines,
      layers.portals,
      layers.routeLines,
      layers.doorFootprints,
      layers.lowerRooms,
      layers.labels,
      stairCutRooms,
      layers.exposedWalls,
      nativeStairs,
      prepared.selectionAreas,
    ];
    for (const [i, id] of sources.entries()) {
      const value = values[i];
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (source) {
        const uploaded = uploadedSources.current.get(id);
        if (uploaded?.source !== source || uploaded.value !== value)
          source.setData(value);
      } else
        map.addSource(id, {
          type: "geojson",
          data: value,
          maxzoom: 22,
          tolerance: 0,
        });
      uploadedSources.current.set(id, {
        source: map.getSource(id) as GeoJSONSource,
        value,
      });
    }
    if (!map.getLayer("project-stair-place-hit"))
      map.addLayer({
        id: "project-stair-place-hit",
        type: "fill",
        source: "project-selection-areas",
        filter: ["in", ["get", "key"], ["literal", selectionOnlyKeys]],
        paint: { "fill-opacity": 0 },
      });
    map.setFilter("project-stair-place-hit", [
      "in",
      ["get", "key"],
      ["literal", selectionOnlyKeys],
    ]);
    map.setLayerZoomRange(
      "project-stair-place-hit",
      review ? 0 : ROOM_DETAIL_START,
      24,
    );
    if (!map.getLayer(ids[0])) {
      map.addLayer({
        id: "project-lower-fill",
        type: "fill",
        source: sources[6],
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.85 },
      });
      map.addLayer({
        id: "project-lower-outline",
        type: "line",
        source: sources[6],
        paint: { "line-color": "#b5bdc3", "line-width": 0.7 },
      });
      map.addLayer({
        id: ids[0],
        type: "fill",
        source: sources[0],
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 1,
        },
      });
      map.addLayer({
        id: "project-relative-floors",
        type: "fill-extrusion",
        source: sources[0],
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-base": ["coalesce", ["get", "base"], 0],
          "fill-extrusion-height": ["coalesce", ["get", "floorTop"], 0.025],
          "fill-extrusion-opacity": 1,
        },
      });
      map.addLayer({
        id: ids[1],
        type: "line",
        source: sources[0],
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "selected"], true],
            "#f08e22",
            "#d6d7d7",
          ],
          "line-width": ["case", ["==", ["get", "selected"], true], 2, 0.6],
        },
      });
      map.addLayer({
        id: ids[2],
        type: "fill",
        source: sources[1],
        paint: { "fill-color": "#deded9", "fill-opacity": 1 },
      });
      map.addLayer({
        id: "project-block-fill",
        type: "fill",
        source: sources[8],
        paint: { "fill-color": ["get", "color"] },
      });
      map.addLayer({
        id: "project-block-outline",
        type: "line",
        source: sources[8],
        paint: { "line-color": "#d9d9d6", "line-width": 0.45 },
      });
      map.addLayer({
        id: "project-exposed-wall-fill",
        type: "fill",
        source: sources[9],
        paint: { "fill-color": "#deded9" },
      });
      map.addLayer({
        id: "project-room-boxes",
        type: "fill-extrusion",
        source: sources[8],
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-opacity": 1,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "project-wall-boxes",
        type: "fill-extrusion",
        source: sources[9],
        paint: {
          "fill-extrusion-color": [
            "case",
            ["==", ["get", "approximate"], true],
            "#e0cbb0",
            "#deded9",
          ],
          "fill-extrusion-height": EXPOSED_WALL_HEIGHT_METRES,
          "fill-extrusion-opacity": 1,
        },
      });
      map.addLayer({
        id: "project-door-fill",
        type: "fill",
        source: sources[5],
        paint: { "fill-color": ["get", "color"] },
      });
      map.addLayer({
        id: "project-door-boxes",
        type: "fill-extrusion",
        source: sources[5],
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": 0.015,
          "fill-extrusion-opacity": 1,
        },
      });
      map.addLayer({
        id: ids[3],
        type: "line",
        source: sources[2],
        paint: {
          "line-color": "#338d83",
          "line-opacity": 0.4,
          "line-width": 1,
        },
      });
      map.addLayer({
        id: ids[4],
        type: "line",
        source: sources[4],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#39b4f7", "line-width": 5 },
      });
      map.addLayer({
        id: ids[5],
        type: "circle",
        source: sources[3],
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "review"], true],
            "#f59a25",
            ["==", ["get", "enabled"], false],
            "#9b9b9b",
            ["==", ["get", "kind"], "elevator"],
            "#169dc7",
            ["==", ["get", "kind"], "escalator"],
            "#f39b38",
            ["in", ["get", "kind"], ["literal", ["stairs", "local-steps"]]],
            "#8055bb",
            "#35afe3",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            16,
            1.5,
            20,
            3,
          ],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "project-connector-label",
        type: "symbol",
        source: sources[3],
        minzoom: 19,
        filter: [
          "in",
          ["get", "kind"],
          [
            "literal",
            ["stairs", "local-steps", "ramp", "elevator", "escalator"],
          ],
        ],
        layout: {
          "text-field": [
            "match",
            ["get", "kind"],
            "elevator",
            "Elevator",
            "escalator",
            "Escalator",
            "ramp",
            "Ramp",
            "Stairs",
          ],
          "text-size": 10,
          "text-offset": [0, 1.2],
          "text-font": ["Noto Sans Regular"],
        },
        paint: {
          "text-color": "#586064",
          "text-halo-color": "#fff",
          "text-halo-width": 1,
        },
      });
      map.addLayer({
        id: ids[6],
        type: "symbol",
        source: sources[7],
        minzoom: 0,
        layout: {
          "text-field": ["get", "name"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            18,
            ["case", ["get", "landmark"], 14, 10],
            21,
            ["case", ["get", "landmark"], 17, 12],
          ],
          "symbol-sort-key": ["get", "priority"],
          "text-max-width": 10,
          "text-font": ["Noto Sans Regular"],
        },
        paint: {
          "text-color": "#586064",
          "text-halo-color": "#fff",
          "text-halo-width": 1,
        },
      });
    }
    if (!map.getLayer("project-flat-selection-fill")) {
      // Unfinished rooms have no visitor block to recolour. Highlight only the
      // corrected floor mask, leaving the native walls and door apertures intact.
      map.addLayer(
        {
          id: "project-flat-selection-fill",
          type: "fill",
          source: "project-selection-areas",
          paint: { "fill-color": "#ffe09d" },
        },
        "project-exposed-wall-fill",
      );
      map.addLayer(
        {
          id: "project-flat-selection-surface",
          type: "fill-extrusion",
          source: "project-selection-areas",
          paint: {
            "fill-extrusion-color": "#ffe09d",
            "fill-extrusion-base": ["coalesce", ["get", "floorTop"], 0.025],
            "fill-extrusion-height": [
              "+",
              ["coalesce", ["get", "floorTop"], 0.025],
              0.002,
            ],
            "fill-extrusion-opacity": 1,
            "fill-extrusion-vertical-gradient": false,
          },
        },
        "project-wall-boxes",
      );
    }
    for (const id of [
      "project-flat-selection-fill",
      "project-flat-selection-surface",
    ]) {
      map.setFilter(id, [
        "all",
        ["==", ["get", "floorMaskSource"], "partial-native-wall-faces"],
        ["==", ["get", "key"], selected],
      ]);
      map.setLayerZoomRange(id, review ? 0 : ROOM_DETAIL_START, 24);
      map.setLayoutProperty(
        id,
        "visibility",
        id.endsWith("surface") === roomThree ? "visible" : "none",
      );
    }
    if (!map.getLayer("project-native-stair-fill")) {
      // Native projections take precedence over approximate overlapping source
      // areas when picked, but never expand a routing polygon.
      map.addLayer(
        {
          id: "project-native-stair-fill",
          type: "fill",
          source: "project-native-stairs",
          filter: ["!=", ["get", "overhead"], true],
          paint: { "fill-color": ["get", "color"] },
        },
        map.getLayer("project-network-line")
          ? "project-network-line"
          : undefined,
      );
      map.addLayer(
        {
          id: "project-native-stair-boxes",
          type: "fill-extrusion",
          source: "project-native-stairs",
          filter: ["!=", ["get", "descending"], true],
          paint: {
            "fill-extrusion-color": ["get", "color"],
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "displayBase"],
            "fill-extrusion-opacity": 1,
          },
        },
        map.getLayer("project-network-line")
          ? "project-network-line"
          : undefined,
      );
      map.addLayer(
        {
          id: "project-native-stair-outline",
          type: "line",
          source: "project-native-stairs",
          filter: ["==", ["get", "overhead"], true],
          paint: {
            "line-color": "#adbcca",
            "line-width": 0.65,
            "line-dasharray": [3, 2],
          },
        },
        map.getLayer("project-network-line")
          ? "project-network-line"
          : undefined,
      );
    }
    map.setLayoutProperty(
      "project-native-stair-fill",
      "visibility",
      roomThree ? "none" : "visible",
    );
    map.setLayoutProperty(
      "project-native-stair-boxes",
      "visibility",
      roomThree ? "visible" : "none",
    );
    map.setLayoutProperty(
      "project-native-stair-outline",
      "visibility",
      roomThree ? "none" : "visible",
    );
    if (map.getLayer("project-connector-markers"))
      map.removeLayer("project-connector-markers");
    if (!map.getLayer("project-overview-fill"))
      map.addLayer(
        {
          id: "project-overview-fill",
          type: "fill",
          source: "project-overview",
          maxzoom: ROOM_DETAIL_END,
          paint: {
            "fill-color": ["get", "color"],
            "fill-antialias": false,
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              ROOM_DETAIL_START,
              1,
              ROOM_DETAIL_END,
              0,
            ],
          },
        },
        "project-room-fill",
      );
    map.setLayoutProperty(
      "project-overview-fill",
      "visibility",
      review ? "none" : "visible",
    );
    for (const id of [
      "project-room-fill",
      "project-area-outline",
      "project-block-fill",
      "project-block-outline",
      "project-room-boxes",
      "project-wall-boxes",
      "project-wall-fill",
      "project-exposed-wall-fill",
      "project-door-fill",
      "project-door-boxes",
      "project-native-stair-fill",
      "project-native-stair-boxes",
      "project-native-stair-outline",
      "project-lower-fill",
      "project-lower-outline",
    ])
      if (map.getLayer(id))
        map.setLayerZoomRange(id, review ? 0 : ROOM_DETAIL_START, 24);
    map.addLayer(
      connectorMarkerLayer(
        connectorMarkers,
        roomThree || nativeModel,
        (kind, id) => {
          if (pickEnabled) onPick(kind, id);
        },
        relativeHeights,
      ),
    );
    map.setLayoutProperty("project-connector-label", "visibility", "none");
    if (map.getLayer("project-roof-labels"))
      map.removeLayer("project-roof-labels");
    if (roomThree && !circulationOnly)
      map.addLayer(
        roofLabelLayer(
          layers.labels,
          ROOM_BLOCK_HEIGHT_METRES + 0.03,
          !review,
          labelSettings,
          relativeHeights,
        ),
      );
    map.setPaintProperty(
      "project-label",
      "text-opacity",
      review
        ? [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROOM_DETAIL_START - 1,
            ["case", ["==", ["get", "minZoom"], 0], 1, 0],
            ROOM_DETAIL_START,
            ["case", ["<", ["get", "minZoom"], ROOM_DETAIL_ZOOM], 1, 0],
            ROOM_DETAIL_END,
            ["case", [">", ["get", "maxZoom"], ROOM_DETAIL_ZOOM], 1, 0],
          ]
        : visitorLabelOpacityExpression(),
    );
    map.setLayoutProperty(
      "project-label",
      "text-field",
      review ? ["get", "name"] : visitorLabelTextExpression(),
    );
    map.setLayoutProperty(
      "project-label",
      "text-padding",
      review ? 3 : visitorLabelPaddingExpression(labelSettings),
    );
    for (const [id, property, full] of [
      ["project-relative-floors", "fill-extrusion-opacity", 1],
      ["project-room-fill", "fill-opacity", 1],
      ["project-block-fill", "fill-opacity", 1],
      ["project-exposed-wall-fill", "fill-opacity", 1],
      ["project-room-boxes", "fill-extrusion-opacity", 1],
      ["project-wall-boxes", "fill-extrusion-opacity", 1],
      ["project-door-fill", "fill-opacity", 1],
      ["project-door-boxes", "fill-extrusion-opacity", 1],
      ["project-native-stair-fill", "fill-opacity", 0.92],
      ["project-native-stair-boxes", "fill-extrusion-opacity", 1],
      ["project-native-stair-outline", "line-opacity", 1],
      ["project-flat-selection-fill", "fill-opacity", 1],
      ["project-flat-selection-surface", "fill-extrusion-opacity", 1],
      ["project-lower-fill", "fill-opacity", 0.9],
      ["project-lower-outline", "line-opacity", 0.4],
    ] as const) {
      if (map.getLayer(id))
        map.setPaintProperty(
          id,
          property,
          review
            ? full
            : [
                "interpolate",
                ["linear"],
                ["zoom"],
                ROOM_DETAIL_START,
                0,
                ROOM_DETAIL_END,
                full,
              ],
        );
    }
    map.setLayoutProperty(
      "project-label",
      "visibility",
      roomThree ? "none" : "visible",
    );
    if (map.getLayer("project-lower-depth"))
      map.removeLayer("project-lower-depth");
    if (map.getLayer("project-descending-stairs"))
      map.removeLayer("project-descending-stairs");
    if (map.getLayer("project-native-ramps"))
      map.removeLayer("project-native-ramps");
    if (map.getLayer("project-precision-walls"))
      map.removeLayer("project-precision-walls");
    if (roomThree && !review && !nativeModel)
      map.addLayer(
        precisionWallLayer(
          layers.exposedWalls,
          data.alignment.originGeographic,
        ),
        "project-network-line",
      );
    if (data.rampDisplay?.ramps.length || (relativeHeights && route))
      map.addLayer(
        nativeRampLayer(
          data,
          levelIds,
          building,
          roomThree,
          review,
          route,
          nativeModel,
          relativeHeights,
        ),
        "project-network-line",
      );
    if (
      roomThree &&
      !circulationOnly &&
      nativeStairs.features.some(
        (f) => f.properties?.descending || f.properties?.endpointRisers?.length,
      )
    )
      map.addLayer(
        descendingStairLayer(
          nativeStairs,
          data.alignment.originGeographic,
          review,
        ),
        "project-network-line",
      );
    if (roomThree && !circulationOnly && display.lowerRooms.features.length > 0)
      map.addLayer(
        lowerFloorLayer(
          display.lowerRooms,
          display.lowerWalls,
          display.lowerOpenings,
          data.alignment.originGeographic,
          "project-lower-depth",
          true,
          true,
          relativeHeights,
        ),
        "project-room-fill",
      );
    map.setLayoutProperty(
      "project-relative-floors",
      "visibility",
      roomThree ? "visible" : "none",
    );
    // A 2D fill paints colour but has no physical depth. Both 3D views need an
    // opaque ground surface so descending steps cannot show through in perspective.
    map.setPaintProperty(
      "project-relative-floors",
      "fill-extrusion-base",
      relativeHeights ? ["coalesce", ["get", "base"], 0] : 0,
    );
    map.setPaintProperty(
      "project-relative-floors",
      "fill-extrusion-height",
      relativeHeights
        ? ["coalesce", ["get", "floorTop"], 0.025]
        : ["case", ["==", ["get", "nativeFloor"], true], 0.005, 0.025],
    );
    map.setFilter(
      "project-relative-floors",
      circulationOnly ? ["==", ["get", "circulation"], true] : null,
    );
    for (const id of [
      "project-room-fill",
      "project-area-outline",
      "project-block-outline",
    ])
      map.setLayoutProperty(
        id,
        "visibility",
        relativeHeights ? "none" : "visible",
      );
    for (const id of [
      "project-room-boxes",
      "project-wall-boxes",
      "project-door-boxes",
    ])
      map.setPaintProperty(
        id,
        "fill-extrusion-base",
        relativeHeights ? ["get", "base"] : 0,
      );
    map.setPaintProperty(
      "project-door-boxes",
      "fill-extrusion-base",
      relativeHeights
        ? ["get", "base"]
        : ["coalesce", ["get", "displayDoorBase"], 0],
    );
    map.setPaintProperty(
      "project-door-boxes",
      "fill-extrusion-height",
      relativeHeights
        ? ["get", "height"]
        : ["coalesce", ["get", "displayDoorHeight"], 0.015],
    );
    for (const id of ["project-lower-fill", "project-lower-outline"])
      map.setLayoutProperty(id, "visibility", roomThree ? "none" : "visible");
    for (const id of ["project-room-boxes", "project-wall-boxes"])
      map.setLayoutProperty(
        id,
        "visibility",
        roomThree && (id !== "project-wall-boxes" || review || nativeModel)
          ? "visible"
          : "none",
      );
    map.setFilter(
      "project-area-outline",
      review
        ? null
        : simplifyGeometry
          ? ["==", ["get", "key"], "__review_only"]
          : ["==", ["get", "circulation"], false],
    );
    // Circulation remains navigable and searchable, but is quiet map background.
    map.setPaintProperty(
      "project-room-fill",
      "fill-color",
      review
        ? ["get", "color"]
        : [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROOM_DETAIL_START,
            [
              "case",
              ["==", ["get", "circulation"], true],
              "#bfd1cd",
              "#8d9395",
            ],
            ROOM_DETAIL_END,
            [
              "case",
              ["==", ["get", "nativeFloor"], true],
              "#faf9f5",
              ["==", ["get", "access"], "staff"],
              RESTRICTED_AREA_COLOR,
              ["==", ["get", "circulation"], true],
              HALLWAY_COLOR,
              ["get", "color"],
            ],
          ],
    );
    map.setPaintProperty(
      "project-relative-floors",
      "fill-extrusion-color",
      map.getPaintProperty("project-room-fill", "fill-color"),
    );
    for (const id of ["project-block-fill", "project-room-boxes"])
      map.setPaintProperty(
        id,
        id === "project-room-boxes" ? "fill-extrusion-color" : "fill-color",
        review
          ? ["get", "color"]
          : [
              "interpolate",
              ["linear"],
              ["zoom"],
              ROOM_DETAIL_START,
              "#8d9395",
              ROOM_DETAIL_END,
              ["get", "color"],
            ],
      );
    map.setPaintProperty(
      "project-room-boxes",
      "fill-extrusion-height",
      review
        ? ["get", "height"]
        : [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROOM_DETAIL_START,
            relativeHeights ? ["get", "base"] : 0,
            ROOM_DETAIL_END,
            ["get", "height"],
          ],
    );
    map.setPaintProperty(
      "project-wall-boxes",
      "fill-extrusion-height",
      review
        ? relativeHeights
          ? ["get", "height"]
          : EXPOSED_WALL_HEIGHT_METRES
        : [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROOM_DETAIL_START,
            relativeHeights ? ["get", "base"] : 0,
            ROOM_DETAIL_END,
            relativeHeights ? ["get", "height"] : EXPOSED_WALL_HEIGHT_METRES,
          ],
    );
    for (const id of ["project-area-outline", "project-block-outline"])
      map.setPaintProperty(
        id,
        "line-opacity",
        review
          ? 1
          : [
              "interpolate",
              ["linear"],
              ["zoom"],
              ROOM_DETAIL_START,
              0,
              ROOM_DETAIL_END,
              1,
            ],
      );
    map.setLayoutProperty(
      "project-wall-fill",
      "visibility",
      review && !roomThree ? "visible" : "none",
    );
    map.setLayoutProperty(
      "project-exposed-wall-fill",
      "visibility",
      !review && !roomThree ? "visible" : "none",
    );
    // Both visitor views use the same prepared block footprint. Review exposes
    // architectural interiors and native entrance metadata separately.
    for (const id of ["project-block-fill", "project-block-outline"])
      map.setLayoutProperty(
        id,
        "visibility",
        !review && !roomThree && !circulationOnly ? "visible" : "none",
      );
    map.setLayoutProperty(
      "project-door-fill",
      "visibility",
      relativeHeights ? "none" : "visible",
    );
    for (const [id, property] of [
      ["project-door-fill", "fill-color"],
      ["project-door-boxes", "fill-extrusion-color"],
    ] as const)
      map.setPaintProperty(id, property, review ? ["get", "color"] : "#d7e2e5");
    map.setLayoutProperty(
      "project-door-boxes",
      "visibility",
      roomThree ? "visible" : "none",
    );
    map.setFilter(
      ids[5],
      review ? null : ["==", ["get", "kind"], "__review_only"],
    );
    map.setFilter(
      "project-room-boxes",
      circulationOnly ? ["==", ["get", "height"], 0] : null,
    );
    map.setFilter(ids[0], [
      "all",
      [
        "!",
        ["in", ["get", "key"], ["literal", roomThree ? [] : nativeStairKeys]],
      ],
      circulationOnly
        ? [
            "all",
            ["==", ["get", "circulation"], true],
            ["!=", ["get", "openDrop"], true],
          ]
        : ["!=", ["get", "openDrop"], true],
    ]);
    map.setLayoutProperty(ids[3], "visibility", network ? "visible" : "none");
    const pick = (event: MapMouseEvent) => {
      if (
        !pickEnabled ||
        (map.getLayer("project-annotation-fill") &&
          map.queryRenderedFeatures(event.point, {
            layers: ["project-annotation-fill"],
          }).length > 0)
      )
        return;
      const features = map.queryRenderedFeatures(event.point, {
        layers: [
          "project-native-stair-fill",
          "project-native-stair-boxes",
          ids[5],
          "project-door-fill",
          "project-door-boxes",
          "project-room-boxes",
          "project-flat-selection-fill",
          "project-flat-selection-surface",
          "project-relative-floors",
          "project-block-fill",
          ids[1],
          ids[0],
          "project-stair-place-hit",
        ],
      });
      const hit =
        features.find((f) => f.layer.id.startsWith("project-native-stair-")) ??
        // Physical slab ground is decorative. It must not swallow the
        // selection footprint of an unresolved room beneath its surface.
        features.find((f) => f.properties?.key || f.properties?.id);
      if (!hit) return;
      if (hit.properties?.id) onPick("edge", String(hit.properties.id));
      else if (hit.properties?.key) {
        const record = data.records.find(
          (r) => r.key === String(hit.properties?.key),
        );
        if (
          !review &&
          record &&
          !isRestrictedArea(record) &&
          ((isHallway(record) &&
            !hit.layer.id.startsWith("project-native-stair-")) ||
            (!showPassThroughPlaces && isPassThroughPlace(record)))
        )
          return;
        onPick("area", String(hit.properties.key));
      }
    };
    map.on("click", pick);
    onFitReady((includeSelection = true) => {
      const bounds = new LngLatBounds();
      const chosen = includeSelection
        ? layers.records.find((r) => r.key === selected)
        : undefined;
      for (const r of chosen ? [chosen] : layers.records)
        for (const p of r.ringsFeet[0]) bounds.extend(geographicPoint(data, p));
      if (chosen)
        for (const f of nativeStairs.features.filter(
          (f) => f.properties?.key === chosen.key,
        ))
          for (const p of f.geometry.coordinates[0])
            bounds.extend(p as [number, number]);
      if (!bounds.isEmpty())
        map.fitBounds(bounds, {
          padding: chosen
            ? review
              ? 40
              : hospitalFollowPadding(map.getContainer())
            : 55,
          maxZoom: chosen ? 21 : 20,
          pitch: roomThree ? 55 : 0,
          duration: 650,
        });
    });
    return () => {
      map.off("click", pick);
      if (map.getLayer("project-connector-markers"))
        map.removeLayer("project-connector-markers");
      if (map.getLayer("project-roof-labels"))
        map.removeLayer("project-roof-labels");
      if (map.getLayer("project-lower-depth"))
        map.removeLayer("project-lower-depth");
      if (map.getLayer("project-descending-stairs"))
        map.removeLayer("project-descending-stairs");
      if (map.getLayer("project-native-ramps"))
        map.removeLayer("project-native-ramps");
      if (map.getLayer("project-precision-walls"))
        map.removeLayer("project-precision-walls");
    };
  }, [
    map,
    isLoaded,
    layers,
    stairCutAreas,
    stairCutRooms,
    display,
    connectorMarkers,
    nativeStairs,
    nativeStairKeys,
    overviewGeometry,
    data,
    levelIds,
    building,
    circulationOnly,
    network,
    simplifyGeometry,
    roomThree,
    nativeModel,
    relativeHeights,
    route,
    review,
    showPassThroughPlaces,
    onPick,
    pickEnabled,
    onFitReady,
    selected,
    labelSettings,
  ]);
  useEffect(() => {
    if (!map || !isLoaded || !map.getLayer("project-room-boxes")) return;
    const selectedStairKeys =
      data.stairDisplay?.sourceModelSha256 === data.source.modelSha256
        ? data.stairDisplay.flights
            .filter(
              (f) =>
                f.roomKey === selected &&
                data.records.some(
                  (r) =>
                    r.key === f.roomKey &&
                    f.sourceGeometryKey ===
                      JSON.stringify([r.levelId, r.elevationFeet, r.ringsFeet]),
                ),
            )
            .map((f) => `source-stair:${f.stairElementId}`)
        : [];
    for (const [id, property] of [
      ["project-relative-floors", "fill-extrusion-color"],
      ["project-room-fill", "fill-color"],
      ["project-block-fill", "fill-color"],
      ["project-room-boxes", "fill-extrusion-color"],
      ["project-native-stair-fill", "fill-color"],
      ["project-native-stair-boxes", "fill-extrusion-color"],
    ]) {
      const isArea =
        id === "project-room-fill" || id === "project-relative-floors";
      const selectionMatch = id.startsWith("project-native-stair-")
        ? ["in", ["get", "key"], ["literal", [selected, ...selectedStairKeys]]]
        : ["==", ["get", "key"], selected];
      const detail =
        !review && isArea
          ? [
              "case",
              ["==", ["get", "nativeFloor"], true],
              "#faf9f5",
              ["==", ["get", "access"], "staff"],
              RESTRICTED_AREA_COLOR,
              ["==", ["get", "circulation"], true],
              HALLWAY_COLOR,
              selectionMatch,
              "#ffe09d",
              ["get", "color"],
            ]
          : [
              "case",
              ["==", ["get", "nativeFloor"], true],
              "#faf9f5",
              ["==", ["get", "access"], "staff"],
              RESTRICTED_AREA_COLOR,
              selectionMatch,
              "#ffe09d",
              ["get", "color"],
            ];
      const overview = isArea
        ? [
            "case",
            ["==", ["get", "nativeFloor"], true],
            "#faf9f5",
            ["==", ["get", "circulation"], true],
            "#bfd1cd",
            "#8d9395",
          ]
        : "#8d9395";
      map.setPaintProperty(
        id,
        property,
        review
          ? detail
          : [
              "interpolate",
              ["linear"],
              ["zoom"],
              ROOM_DETAIL_START,
              overview,
              ROOM_DETAIL_END,
              detail,
            ],
      );
    }
    for (const id of ["project-area-outline", "project-block-outline"]) {
      map.setPaintProperty(id, "line-color", [
        "case",
        ["==", ["get", "key"], selected],
        "#f08e22",
        "#d6d7d7",
      ]);
      map.setPaintProperty(id, "line-width", [
        "case",
        ["==", ["get", "key"], selected],
        2,
        0.6,
      ]);
    }
  }, [map, isLoaded, selected, layers, review, data]);
  useEffect(() => {
    if (!map || !isLoaded || !map.getLayer("project-room-fill")) return;
    for (const [id, property, full] of [
      ["project-relative-floors", "fill-extrusion-opacity", 1],
      ["project-room-fill", "fill-opacity", 1],
      ["project-block-fill", "fill-opacity", 1],
      ["project-exposed-wall-fill", "fill-opacity", 1],
      ["project-wall-fill", "fill-opacity", 1],
      ["project-room-boxes", "fill-extrusion-opacity", 1],
      ["project-wall-boxes", "fill-extrusion-opacity", 1],
      ["project-door-fill", "fill-opacity", 1],
      ["project-door-boxes", "fill-extrusion-opacity", 1],
      ["project-native-stair-fill", "fill-opacity", 0.92],
      ["project-native-stair-boxes", "fill-extrusion-opacity", 1],
      ["project-native-stair-outline", "line-opacity", 1],
      ["project-flat-selection-fill", "fill-opacity", 1],
      ["project-flat-selection-surface", "fill-extrusion-opacity", 1],
      ["project-area-outline", "line-opacity", 1],
      ["project-block-outline", "line-opacity", 1],
      ["project-lower-fill", "fill-opacity", 0.9],
      ["project-lower-outline", "line-opacity", 0.4],
    ] as const)
      if (map.getLayer(id))
        map.setPaintProperty(
          id,
          property,
          review
            ? full * geometryOpacity
            : [
                "interpolate",
                ["linear"],
                ["zoom"],
                ROOM_DETAIL_START,
                0,
                ROOM_DETAIL_END,
                full * geometryOpacity,
              ],
        );
    map.setPaintProperty("project-overview-fill", "fill-opacity", [
      "interpolate",
      ["linear"],
      ["zoom"],
      ROOM_DETAIL_START,
      geometryOpacity,
      ROOM_DETAIL_END,
      0,
    ]);
    map.setLayoutProperty(
      "project-label",
      "visibility",
      labelsVisible && !roomThree ? "visible" : "none",
    );
    map
      .getContainer()
      .classList.toggle("project-hide-source-labels", !labelsVisible);
    for (const layer of map.getStyle().layers) {
      if (layer.id.startsWith("project-")) continue;
      if (!basemapVisibility.current.has(layer.id))
        basemapVisibility.current.set(
          layer.id,
          String(map.getLayoutProperty(layer.id, "visibility") ?? "visible"),
        );
      map.setLayoutProperty(
        layer.id,
        "visibility",
        basemapVisible ? basemapVisibility.current.get(layer.id) : "none",
      );
    }
  }, [
    map,
    isLoaded,
    geometryOpacity,
    labelsVisible,
    basemapVisible,
    layers,
    review,
    roomThree,
  ]);
  return null;
}

type ProjectMapLayersProps = Omit<
  Parameters<typeof PreparedProjectMapLayers>[0],
  "prepared" | "basemapVisibility"
>;
const floorSources = [
  "project-overview",
  "project-areas",
  "project-walls",
  "project-network",
  "project-portals",
  "project-route",
  "project-doors",
  "project-lower-rooms",
  "project-labels",
  "project-room-blocks",
  "project-exposed-walls",
  "project-native-stairs",
  "project-selection-areas",
];
const emptyFloor = collection<Geometry>([]);

export function ProjectMapLayers(props: ProjectMapLayersProps) {
  const { map, isLoaded } = useMap();
  // Basemap visibility belongs to the mounted map, not a transient floor child.
  const basemapVisibility = useRef(new Map<string, string>());
  const { value, error, retry } = usePreparedFloor(
    props.data,
    props.levelIds,
    props.building,
    {
      relativeHeights: props.relativeHeights,
      showPillars: props.showPillars,
      showPassThroughPlaces: props.showPassThroughPlaces,
      showVestibuleDoors: props.showVestibuleDoors,
      showStructures: props.showStructures,
      review: props.review,
      simplifyGeometry: props.simplifyGeometry,
    },
  );
  useEffect(() => {
    if (!map || !isLoaded || value) return;
    // The selected level must never display or accept clicks on an old level.
    // The prepared child removes its custom layers and click handler on unmount.
    for (const id of floorSources) {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      source?.setData(emptyFloor);
    }
  }, [map, isLoaded, value]);
  if (value)
    return (
      <PreparedProjectMapLayers
        {...props}
        prepared={value}
        basemapVisibility={basemapVisibility}
      />
    );
  const floor = props.data.floors.find((f) =>
    props.levelIds.some((id) => f.levelIds.includes(id)),
  );
  return (
    <div className="project-floor-preparation" data-testid="floor-preparation">
      {error ? (
        <div role="alert">
          <strong>Couldn’t prepare this floor</strong>
          <p>{error}</p>
          <button onClick={retry}>Try again</button>
        </div>
      ) : (
        <div
          role="progressbar"
          aria-label={`Preparing ${floor?.name ?? "floor"}`}
        >
          <span className="project-floor-spinner" aria-hidden="true" />
          <strong>Preparing {floor?.name ?? "floor"}…</strong>
        </div>
      )}
    </div>
  );
}

export function ProjectRouteFocus({
  data,
  route,
}: {
  data: IndoorDataset;
  route: ProjectRoute | null;
}) {
  const { map, isLoaded } = useMap();
  if (!route || !map || !isLoaded) return null;
  return (
    <button
      style={{ position: "absolute", top: 12, left: 12, zIndex: 2 }}
      onClick={() => {
        const bounds = new LngLatBounds();
        for (const path of route.paths)
          for (const point of path.pointsFeet)
            bounds.extend(geographicPoint(data, point));
        const container = map.getContainer();
        const panel = container.parentElement?.querySelector(
          '[data-testid="project-navigation"]',
        );
        let padding: number | PaddingOptions = 90;
        if (panel) {
          padding = hospitalFollowPadding(container);
          if (
            container.clientWidth < 768 &&
            !container.querySelector('[aria-label="Current direction"]')
          ) {
            const mapRect = container.getBoundingClientRect();
            const bottom =
              mapRect.bottom - panel.getBoundingClientRect().top + 24;
            const scale = Math.min(
              1,
              Math.max(0, mapRect.height - 100) / (bottom + 80),
            );
            padding = {
              top: 80 * scale,
              bottom: bottom * scale,
              left: 32,
              right: 32,
            };
          }
        }
        if (!bounds.isEmpty())
          map.fitBounds(bounds, {
            padding,
            maxZoom: 21,
            pitch: map.getPitch(),
            bearing: map.getBearing(),
            duration: 600,
          });
      }}
    >
      Fit route
    </button>
  );
}
