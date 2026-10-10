import { preparedFloorNativeDisplay } from "./floor-display-worker-bridge";
import type { NativeExploreResult } from "./native-explore";
import { nativeExploreLabels } from "./native-explore-labels";
import { nativeSurfacePerimeters } from "./native-surface-perimeters";
import { mapDrawingFeatures } from "./map-drawing-features";
import { nativeStairZoomStyle } from "./native-stair-style";
import { visitorRoomSurfaces } from "./visitor-room-surfaces";
import { isVisitorHallway } from "./place-discovery";
import { stableWallGeometry } from "./stable-wall-geometry";
import { precisionWallLayer } from "./precision-wall-layer";
import {
  floorDiagnostic,
  floorDiagnosticsEnabled,
  timeFloorStage,
} from "./floor-diagnostics";
import {
  preparedDisplayStatus,
  shortEngine,
  warnStalePreparedDisplay,
} from "./prepared-display-status";
import { geoJsonStatistics } from "./geojson-statistics";
import {
  largeIndoorProject,
  shouldRecreateMapForScope,
} from "./heavy-worker-schedule";
import {
  emptyPreparedFloorSources,
  removePreparedCustomLayers,
} from "./prepared-layer-lifetime";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  LngLatBounds,
  type GeoJSONSource,
  type MapMouseEvent,
  type PaddingOptions,
  type ExpressionSpecification,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMap, useMapRecreate } from "~/components/map/map";
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
  OVERVIEW_SOLID_COLOR,
  RESTRICTED_AREA_COLOR,
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
  WALL_DETAIL_START,
  WALL_DETAIL_END,
} from "./zoom-presentation";

const collection = <T extends Geometry>(
  features: Feature<T>[],
): FeatureCollection<T> => ({
  type: "FeatureCollection",
  features,
});
/** Stable empty collection for sources hidden in the current mode. */
const HIDDEN_SOURCE: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
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
  showDoorLocations = false,
  simplifyGeometry,
  labelSettings,
  connectorReview,
  review,
  route,
  selected,
  onPick,
  pickEnabled = true,
  onFitReady,
  selectionPadding,
  geometryOpacity = 1,
  nativeFloorLevels = [],
  labelsVisible = true,
  basemapVisible = true,
}: {
  prepared: PreparedFloor;
  basemapVisibility: MutableRefObject<Map<string, string>>;
  data: IndoorDataset;
  geometryOpacity?: number;
  nativeFloorLevels?: number[];
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
  showDoorwayRecesses?: boolean;
  showDoorLocations?: boolean;
  simplifyGeometry: boolean;
  labelSettings: LabelSettings;
  connectorReview?: SourceConnectorReview;
  review: boolean;
  route: ProjectRoute | null;
  selected: string;
  pickEnabled?: boolean;
  onPick: (kind: "area" | "edge", id: string) => void;
  onFitReady: (fit: (includeSelection?: boolean) => void) => void;
  /** Review panels outside the canvas don't need visitor-overlay padding. */
  selectionPadding?: number;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    floorDiagnostic("layers:prepared-mount", { roomThree });
    return () => {
      floorDiagnostic("layers:prepared-unmount", { roomThree });
    };
    // Mount/unmount markers for one prepared result only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared]);
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
          nativeExploreLabels(data, display.labels, nativeFloorLevels),
          display.records,
          selected,
          labelSettings,
        ).features,
      ],
    }),
    [display, overviewLabels, selected, labelSettings, data, nativeFloorLevels],
  );
  const connectorMarkers = useMemo(() => {
    const markers = projectConnectorMarkers(
      data,
      levelIds,
      building,
      connectorReview,
      relativeHeights || nativeModel,
      !review && !nativeModel,
    );
    return nativeModel || relativeHeights
      ? sourceModelConnectorMarkers(data, markers, levelIds)
      : markers;
  }, [
    data,
    levelIds,
    building,
    connectorReview,
    nativeModel,
    relativeHeights,
    review,
  ]);
  const { nativeStairKeys, physicalGround, nativeStairs } = prepared;
  const windows = useMemo(
    () => ({ features: prepared.presentation.nativeWindows }),
    [prepared.presentation.nativeWindows],
  );
  // Stable per-floor glazing/frame inputs, so their precision meshes are reused
  // across selection, route and label changes instead of re-triangulated.
  const windowParts = useMemo(
    () =>
      ([true, false] as const).map((glass) => ({
        glass,
        walls: {
          type: "FeatureCollection" as const,
          features: windows.features.features.filter(
            (f) => (f.properties?.role === "glazing") === glass,
          ),
        },
      })),
    [windows],
  );
  // Whole-floor wall extrusion input. Kept out of the selection/label-driven
  // memo below so a click does not rebuild, re-upload or re-triangulate it.
  const exposedWalls = useMemo(() => {
    const planWalls =
      data.windowDisplay?.mode === "native" && !roomThree
        ? prepared.presentation.nativeWindowPlanWalls
        : undefined;
    return timeFloorStage(
      "layers:stable-wall-geometry",
      () =>
        stableWallGeometry(
          review
            ? (planWalls?.exposed ?? display.exposedWalls)
            : simplifyGeometry
              ? (planWalls?.simple ?? simpleWalls)
              : showStructures
                ? (planWalls?.exposed ?? display.exposedWalls)
                : (planWalls?.visitor ?? visitorWalls),
        ),
      (walls) => ({ features: walls.features.length }),
    );
  }, [
    data.windowDisplay?.mode,
    roomThree,
    prepared.presentation.nativeWindowPlanWalls,
    review,
    simplifyGeometry,
    showStructures,
    display.exposedWalls,
    simpleWalls,
    visitorWalls,
  ]);
  // Whole-floor collections that do not depend on selection, labels or the
  // route keep their identity, so a click does not re-send them to MapLibre.
  const staticLayers = useMemo(() => {
    const {
      records,
      areas,
      walls,
      roomBlocks,
      doorFootprints,
      doorMarkers,
      lowerRooms,
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
      exposedWalls,
      lines,
      portals,
      records,
      doorFootprints:
        !review && simplifyGeometry ? simpleDoors : doorFootprints,
      lowerRooms,
    };
  }, [
    data,
    levelIds,
    display,
    review,
    exposedWalls,
    simplifyGeometry,
    simpleRooms,
    simpleAreas,
    simpleDoors,
    nativeStairKeys,
    prepared.stairSurroundKeys,
  ]);
  const routeLines = useMemo(
    () =>
      collection(
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
      ),
    [route, levelIds, relativeHeights, roomThree, nativeModel, data],
  );
  const layers = useMemo(
    () => ({
      ...staticLayers,
      routeLines,
      labels: review ? display.labels : visitorLabels,
    }),
    [staticLayers, routeLines, review, display.labels, visitorLabels],
  );
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
  const stairCutRooms = useMemo(
    () =>
      roomThree
        ? prepared.stairCutRooms
        : {
            ...layers.roomBlocks,
            features: [
              ...layers.roomBlocks.features,
              ...prepared.assumedRoomBlocks.features,
            ],
          },
    [
      roomThree,
      prepared.stairCutRooms,
      prepared.assumedRoomBlocks,
      layers.roomBlocks,
    ],
  );
  const areaPerimeters = useMemo(
    () => nativeSurfacePerimeters(data, stairCutAreas),
    [data, stairCutAreas],
  );
  const roomPerimeters = useMemo(
    () => nativeSurfacePerimeters(data, stairCutRooms),
    [data, stairCutRooms],
  );
  useEffect(() => {
    if (!map || !isLoaded) return;
    const effectStarted = floorDiagnosticsEnabled() ? performance.now() : 0;
    let uploads = 0;
    const overviewSource = map.getSource("project-overview") as
      | GeoJSONSource
      | undefined;
    if (overviewSource) {
      const uploaded = uploadedSources.current.get("project-overview");
      if (
        uploaded?.source !== overviewSource ||
        uploaded.value !== overviewGeometry
      ) {
        uploads++;
        overviewSource.setData(mapDrawingFeatures(overviewGeometry));
      }
    } else
      map.addSource("project-overview", {
        type: "geojson",
        data: mapDrawingFeatures(overviewGeometry),
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
        "project-area-perimeters",
        "project-block-perimeters",
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
    // Sources whose every layer is hidden in this mode get an empty
    // collection (identical pixels); MapLibre's worker otherwise clones and
    // tiles the whole floor's walls for nothing. Visibility rules mirror the
    // setLayoutProperty calls below ("project-wall-fill" is review 2D only;
    // "project-exposed-wall-fill" visitor 2D without native material;
    // "project-wall-boxes" 3D review/source model).
    const wallsShown = review && !roomThree;
    const exposedWallsShown =
      (!review &&
        !roomThree &&
        !(nativeFloorLevels.length && data.nativeMaterialSections)) ||
      (roomThree && (review || nativeModel));
    const values = [
      stairCutAreas,
      wallsShown ? layers.walls : HIDDEN_SOURCE,
      layers.lines,
      layers.portals,
      layers.routeLines,
      layers.doorFootprints,
      layers.lowerRooms,
      layers.labels,
      stairCutRooms,
      exposedWallsShown ? layers.exposedWalls : HIDDEN_SOURCE,
      nativeStairs,
      prepared.selectionAreas,
      areaPerimeters,
      roomPerimeters,
    ];
    for (const [i, id] of sources.entries()) {
      const value = values[i];
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (source) {
        const uploaded = uploadedSources.current.get(id);
        if (uploaded?.source !== source || uploaded.value !== value) {
          uploads++;
          if (effectStarted)
            floorDiagnostic("source:upload", {
              id,
              ...geoJsonStatistics(mapDrawingFeatures(value)),
            });
          source.setData(mapDrawingFeatures(value));
        }
      } else {
        uploads++;
        if (effectStarted)
          floorDiagnostic("source:upload", {
            id,
            ...geoJsonStatistics(mapDrawingFeatures(value)),
          });
        map.addSource(id, {
          type: "geojson",
          data: mapDrawingFeatures(value),
          maxzoom: 22,
          tolerance: 0,
        });
      }
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
        source: "project-area-perimeters",
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
        source: "project-block-perimeters",
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
          maxzoom: WALL_DETAIL_END,
          paint: {
            "fill-color": ["get", "color"],
            "fill-antialias": false,
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              WALL_DETAIL_START,
              1,
              WALL_DETAIL_END,
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
    for (const id of [
      "project-native-window-glass",
      "project-native-window-frames",
    ])
      if (map.getLayer(id)) map.removeLayer(id);
    if (map.getLayer("project-precision-walls"))
      map.removeLayer("project-precision-walls");
    const layersStarted = effectStarted ? performance.now() : 0;
    if (roomThree && !review && !nativeModel)
      map.addLayer(
        precisionWallLayer(
          layers.exposedWalls,
          data.alignment.originGeographic,
        ),
        "project-network-line",
      );
    {
      // Re-send the window collection only when it changed (as for the
      // floor sources above), not on every selection or label change.
      const windowSource = map.getSource("project-native-windows") as
        | GeoJSONSource
        | undefined;
      const uploaded = uploadedSources.current.get("project-native-windows");
      if (!windowSource)
        map.addSource("project-native-windows", {
          type: "geojson",
          data: mapDrawingFeatures(windows.features),
          tolerance: 0,
          maxzoom: 22,
        });
      else if (
        uploaded?.source !== windowSource ||
        uploaded.value !== windows.features
      )
        windowSource.setData(mapDrawingFeatures(windows.features));
      if (effectStarted && uploaded?.value !== windows.features)
        floorDiagnostic("source:upload", {
          id: "project-native-windows",
          ...geoJsonStatistics(mapDrawingFeatures(windows.features)),
        });
      uploadedSources.current.set("project-native-windows", {
        source: map.getSource("project-native-windows") as GeoJSONSource,
        value: windows.features,
      });
    }
    if (!map.getLayer("project-native-window-plan"))
      map.addLayer(
        {
          id: "project-native-window-plan",
          type: "fill",
          source: "project-native-windows",
          filter: ["==", ["get", "atPlanCut"], true],
          paint: {
            "fill-color": ["get", "nativeWindowColor"],
            "fill-opacity": ["get", "opacity"],
          },
        },
        "project-network-line",
      );
    map.setLayerZoomRange("project-native-window-plan", WALL_DETAIL_START, 24);
    map.setLayoutProperty(
      "project-native-window-plan",
      "visibility",
      !roomThree &&
        !nativeModel &&
        !(nativeFloorLevels.length && data.nativeMaterialSections)
        ? "visible"
        : "none",
    );
    if (roomThree && !nativeModel)
      for (const { glass, walls } of windowParts) {
        if (walls.features.length)
          map.addLayer(
            precisionWallLayer(walls, data.alignment.originGeographic, {
              id: glass
                ? "project-native-window-glass"
                : "project-native-window-frames",
              windowOpacity: glass,
            }),
            "project-network-line",
          );
      }
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
    if (layersStarted)
      floorDiagnostic("layers:custom-3d", {
        roomThree,
        ms: performance.now() - layersStarted,
      });
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
              HALLWAY_COLOR,
              OVERVIEW_SOLID_COLOR,
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
              OVERVIEW_SOLID_COLOR,
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
      !review &&
        !roomThree &&
        !(nativeFloorLevels.length && data.nativeMaterialSections)
        ? "visible"
        : "none",
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
    for (const id of ["project-door-fill", "project-door-boxes"])
      map.setFilter(id, ["!=", ["get", "roomDisplayFilled"], true]);
    map.setLayoutProperty(
      "project-door-boxes",
      "visibility",
      roomThree ? "visible" : "none",
    );
    map.setFilter(
      ids[5],
      review
        ? null
        : ["==", ["get", "kind"], showDoorLocations ? "door" : "__review_only"],
    );
    map.setFilter(
      "project-room-boxes",
      circulationOnly ? ["==", ["get", "height"], 0] : null,
    );
    map.setFilter(ids[0], [
      "all",
      [
        "any",
        [
          "!",
          ["in", ["get", "key"], ["literal", roomThree ? [] : nativeStairKeys]],
        ],
        ["has", "nativeCellId"],
        ["has", "groundEvidence"],
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
    // Selection paint belongs to the same synchronization pass as base paint.
    // An unrelated UI render can refresh layers without changing the selection.
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
            HALLWAY_COLOR,
            OVERVIEW_SOLID_COLOR,
          ]
        : OVERVIEW_SOLID_COLOR;
      map.setPaintProperty(
        id,
        property,
        nativeFloorLevels.length && id.startsWith("project-native-stair-")
          ? nativeStairZoomStyle(
              nativeFloorLevels,
              // These are measured native treads/landings, not stair room
              // outlines. Keep their visitor green, even when selected.
              ["get", "color"],
              overview as ExpressionSpecification,
              detail as ExpressionSpecification,
              review,
            )
          : review
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
    map.setPaintProperty(
      "project-native-stair-outline",
      "line-color",
      nativeFloorLevels.length
        ? [
            "case",
            ["in", ["get", "levelId"], ["literal", nativeFloorLevels]],
            HALLWAY_COLOR,
            "#adbcca",
          ]
        : "#adbcca",
    );
    if (nativeFloorLevels.length)
      map.setLayerZoomRange("project-native-stair-fill", 0, 24);
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
      const preparedHit = (f: (typeof features)[number]) =>
        !nativeFloorLevels.includes(
          data.records.find((r) => r.key === f.properties?.key)?.levelId ??
            Number(f.properties?.levelId),
        );
      const hit =
        features.find(
          // Actual native treads and landings retain their source assembly
          // controls. Hidden registered stair room outlines do not.
          (f) => f.layer.id.startsWith("project-native-stair-"),
        ) ??
        // Physical slab ground is decorative. It must not swallow the
        // selection footprint of an unresolved room beneath its surface.
        features.find(
          (f) => (f.properties?.key || f.properties?.id) && preparedHit(f),
        );
      if (!hit) return;
      if (hit.properties?.id) onPick("edge", String(hit.properties.id));
      else if (hit.properties?.key) {
        const record = data.records.find(
          (r) => r.key === String(hit.properties?.key),
        );
        if (
          !review &&
          record &&
          ((isVisitorHallway(record) &&
            !hit.layer.id.startsWith("project-native-stair-")) ||
            (!showPassThroughPlaces && isPassThroughPlace(record)))
        )
          return;
        onPick("area", String(hit.properties.key));
      }
    };
    map.on("click", pick);
    // The native layer registers its fit only after the current scoped trace
    // is ready. Do not center a search on prepared/hidden source footprints.
    if (!nativeFloorLevels.length)
      onFitReady((includeSelection = true) => {
        const bounds = new LngLatBounds();
        const chosen = includeSelection
          ? (layers.records.find((r) => r.key === selected) ??
            data.records.find(
              (r) =>
                r.key === selected &&
                levelIds.includes(r.levelId) &&
                (building === "all" || r.building === building),
            ))
          : undefined;
        if (data.nativeIndoorEnvelopes) {
          const physical = prepared.selectionAreas.features.filter(
            (f) =>
              !chosen ||
              f.properties?.key === chosen.key ||
              f.properties?.roomKeys?.includes(chosen.key),
          );
          for (const f of physical)
            for (const polygon of f.geometry.coordinates)
              for (const ring of polygon)
                for (const point of ring)
                  bounds.extend(point as [number, number]);
        } else
          for (const r of chosen ? [chosen] : layers.records)
            for (const p of r.ringsFeet[0])
              bounds.extend(geographicPoint(data, p));
        if (chosen)
          for (const f of nativeStairs.features.filter(
            (f) => f.properties?.key === chosen.key,
          ))
            for (const p of f.geometry.coordinates[0])
              bounds.extend(p as [number, number]);
        if (!bounds.isEmpty())
          map.fitBounds(bounds, {
            padding: chosen
              ? (selectionPadding ??
                (review ? 40 : hospitalFollowPadding(map.getContainer())))
              : 55,
            maxZoom: chosen ? 21 : 20,
            pitch: roomThree || nativeModel ? 55 : 0,
            duration: 650,
          });
      });
    if (effectStarted)
      floorDiagnostic("layers:effect", {
        roomThree,
        uploads,
        ms: performance.now() - effectStarted,
      });
    return () => {
      map.off("click", pick);
      // The parent map may already be removed during route navigation or Clear
      // map. MapLibre's getLayer throws once its style has been disposed.
      // Every custom (three.js) layer this effect can add is removed, including
      // window glass/frames, so a loading or unmounted floor keeps no meshes.
      removePreparedCustomLayers(map);
    };
  }, [
    windows,
    windowParts,
    map,
    isLoaded,
    layers,
    stairCutAreas,
    stairCutRooms,
    display,
    connectorMarkers,
    areaPerimeters,
    roomPerimeters,
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
    showDoorLocations,
    onPick,
    pickEnabled,
    nativeFloorLevels,
    onFitReady,
    selectionPadding,
    selected,
    labelSettings,
  ]);
  useEffect(() => {
    if (!map || !isLoaded || !map.getLayer("project-room-fill")) return;
    const nativeKeys = data.records
      .filter((r) => nativeFloorLevels.includes(r.levelId))
      .map((r) => r.key);
    // Overview envelopes deliberately round gaps; they cannot cover an exact
    // native trace. Keep one only when that building still needs a fallback.
    const nativeBuildings = [
      ...new Set(layers.records.map((r) => r.building)),
    ].filter((building) =>
      layers.records
        .filter((r) => r.building === building)
        .every((r) => nativeFloorLevels.includes(r.levelId)),
    );
    const nativeOpacity = (
      opacity: number,
    ): number | ExpressionSpecification =>
      nativeFloorLevels.length
        ? [
            "case",
            [
              "any",
              ["in", ["get", "key"], ["literal", nativeKeys]],
              ["in", ["get", "levelId"], ["literal", nativeFloorLevels]],
            ],
            0,
            opacity,
          ]
        : opacity;
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
          property === "fill-extrusion-opacity" &&
            nativeFloorLevels.length &&
            [
              "project-relative-floors",
              "project-flat-selection-surface",
            ].includes(id)
            ? 0
            : (() => {
                const opacity = [
                  "project-room-fill",
                  "project-block-fill",
                  "project-area-outline",
                  "project-block-outline",
                  "project-lower-fill",
                  "project-lower-outline",
                  "project-flat-selection-fill",
                ].includes(id)
                  ? nativeOpacity(full * geometryOpacity)
                  : full * geometryOpacity;
                return id === "project-native-stair-fill" &&
                  nativeFloorLevels.length
                  ? nativeStairZoomStyle(
                      nativeFloorLevels,
                      full * geometryOpacity,
                      0,
                      opacity,
                      review,
                    )
                  : review
                    ? opacity
                    : ([
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        ROOM_DETAIL_START,
                        0,
                        ROOM_DETAIL_END,
                        opacity,
                      ] as ExpressionSpecification);
              })(),
        );
    // Architectural seams stay absent at overview zooms, including selected
    // outlines. Review retains full detail at any zoom.
    if (!review) {
      for (const [id, property, full] of [
        ["project-area-outline", "line-opacity", 1],
        ["project-block-outline", "line-opacity", 1],
        ["project-wall-fill", "fill-opacity", 1],
        ["project-exposed-wall-fill", "fill-opacity", 1],
        ["project-wall-boxes", "fill-extrusion-opacity", 1],
        ["project-door-fill", "fill-opacity", 1],
        ["project-door-boxes", "fill-extrusion-opacity", 1],
        ["project-native-stair-outline", "line-opacity", 1],
        ["project-lower-outline", "line-opacity", 0.4],
      ] as const) {
        if (!map.getLayer(id)) continue;
        map.setLayerZoomRange(id, WALL_DETAIL_START, 24);
        map.setPaintProperty(id, property, [
          "interpolate",
          ["linear"],
          ["zoom"],
          WALL_DETAIL_START,
          0,
          WALL_DETAIL_END,
          ["project-area-outline", "project-block-outline"].includes(id)
            ? nativeOpacity(full * geometryOpacity)
            : full * geometryOpacity,
        ]);
      }
    }
    map.setPaintProperty(
      "project-overview-fill",
      "fill-opacity",
      nativeFloorLevels.length &&
        levelIds.every((id) => nativeFloorLevels.includes(id))
        ? 0
        : [
            "interpolate",
            ["linear"],
            ["zoom"],
            WALL_DETAIL_START,
            [
              "case",
              [
                "all",
                ["in", ["get", "building"], ["literal", nativeBuildings]],
              ],
              0,
              geometryOpacity,
            ],
            WALL_DETAIL_END,
            0,
          ],
    );
    // Prepared floor layers may finish after the native worker and insert this
    // backing above it again. Keep grey seam coverage beneath both native fills.
    if (map.getLayer("native-explore-floor"))
      map.moveLayer(
        "project-overview-fill",
        map.getLayer("native-explore-overview-floor")
          ? "native-explore-overview-floor"
          : "native-explore-floor",
      );
    map.setLayoutProperty(
      "project-label",
      "visibility",
      labelsVisible && !roomThree ? "visible" : "none",
    );
    map
      .getContainer()
      .classList.toggle("project-hide-source-labels", !labelsVisible);
    for (const layer of map.getStyle().layers) {
      if (
        layer.id.startsWith("project-") ||
        layer.id.startsWith("native-explore-")
      )
        continue;
      if (!basemapVisibility.current.has(layer.id))
        basemapVisibility.current.set(
          layer.id,
          String(map.getLayoutProperty(layer.id, "visibility") ?? "visible"),
        );
      map.setLayoutProperty(
        layer.id,
        "visibility",
        basemapVisible &&
          !(
            !review &&
            nativeFloorLevels.length > 0 &&
            layer.type === "fill" &&
            "source-layer" in layer &&
            ["landcover", "landuse", "park", "water"].includes(
              layer["source-layer"] ?? "",
            )
          )
          ? basemapVisibility.current.get(layer.id)
          : "none",
      );
    }
  }, [
    map,
    isLoaded,
    geometryOpacity,
    nativeFloorLevels,
    data,
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
> & {
  onNativeDisplay?: (snapshot: {
    data: IndoorDataset;
    levelIds: number[];
    building: string;
    result?: NativeExploreResult;
    error?: string;
    retry: () => void;
  }) => void;
};
const emptyFloor = collection<Geometry>([]);

export function ProjectMapLayers(props: ProjectMapLayersProps) {
  const { map, isLoaded } = useMap();
  // Basemap visibility belongs to the mounted map, not a transient floor child.
  const basemapVisibility = useRef(new Map<string, string>());
  const needsNativeDisplay = (props.nativeFloorLevels?.length ?? 0) > 0;
  const preparationOptions = {
    relativeHeights: props.relativeHeights,
    showPillars: props.showPillars,
    showPassThroughPlaces: props.showPassThroughPlaces,
    showVestibuleDoors: props.showVestibuleDoors,
    showStructures: props.showStructures,
    showDoorwayRecesses: props.showDoorwayRecesses,
    review: props.review,
    simplifyGeometry: props.simplifyGeometry,
  };
  const { value, error, retry } = usePreparedFloor(
    props.data,
    props.levelIds,
    props.building,
    preparationOptions,
    // Only the 2D native floor map renders the native area display. Other
    // views get the same prepared floor without cloning that carrier.
    { nativeDisplay: needsNativeDisplay },
  );
  const displayScope = props.levelIds.join(",");
  // Large projects: a scope/mode switch recreates the map behind the loading
  // overlay, so MapLibre's tile workers release the previous floor's GeoJSON
  // (measured at 2.1–2.9 GB in one worker) before the next floor decodes.
  // Camera, selection, floor, mode and all React state are kept.
  const recreateMap = useMapRecreate();
  const shownScope = useRef<string>();
  const scopeKey = `${props.building}|${displayScope}|${props.roomThree}`;
  useEffect(() => {
    if (value) {
      shownScope.current = scopeKey;
      return;
    }
    if (
      shouldRecreateMapForScope(
        shownScope.current,
        scopeKey,
        !value && !error,
        largeIndoorProject(props.data),
      ) &&
      recreateMap?.()
    ) {
      shownScope.current = undefined;
      floorDiagnostic("map:recreated-for-scope", {
        levels: props.levelIds.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, error, scopeKey, recreateMap]);
  useEffect(() => {
    const nativeDisplay = preparedFloorNativeDisplay(value);
    props.onNativeDisplay?.({
      data: props.data,
      levelIds: props.levelIds,
      building: props.building,
      result: nativeDisplay,
      retry,
      error:
        error ??
        (value &&
        needsNativeDisplay &&
        props.data.nativeIndoorEnvelopes &&
        !nativeDisplay
          ? "The prepared floor did not include its native area display. Retry floor preparation."
          : undefined),
    });
    // Scope is the complete level inventory; original array references vary independently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.onNativeDisplay,
    props.data,
    props.building,
    displayScope,
    value,
    error,
    retry,
    needsNativeDisplay,
  ]);
  useEffect(() => {
    if (!map || !isLoaded || value) return;
    // The selected level must never display or accept clicks on an old level.
    // The prepared child removes its custom layers and click handler on unmount.
    emptyPreparedFloorSources(map, emptyFloor);
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
  // Scalar archive lookup only; the worker still verifies everything.
  const saved = preparedDisplayStatus(
    props.data,
    props.levelIds,
    props.building,
    preparationOptions,
  );
  warnStalePreparedDisplay(saved);
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
          {saved.state === "stale-engine" && (
            <p data-testid="floor-preparation-live">
              Saved floor displays in this project were prepared by another app
              version (display engine {shortEngine(saved.assetEngine)}, this app{" "}
              {shortEngine(saved.runtimeEngine)}), so this floor is being
              prepared live. This can take several minutes.
            </p>
          )}
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
