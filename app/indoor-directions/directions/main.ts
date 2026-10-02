import Graph from "../pathfinding/graph";
import PathFinder from "../pathfinding/pathfinder";
import {
  MapLibreGlDirectionsConfiguration,
  PathfindingOptions,
  RouteEdgeMetadata,
  RouteInstruction,
} from "../types";
import {
  IndoorDirectionsEvented,
  IndoorDirectionsRoutingEvent,
  IndoorDirectionsWaypointEvent,
} from "./events";
import {
  buildConfiguration,
  buildPoint,
  buildRouteLines,
  buildSnaplines,
} from "./utils";
import { formatFloorName, type FloorNames } from "~/utils/floor";
import { WALKING_SPEED } from "~/utils/route-summary";

type TurnKind = NonNullable<RouteInstruction["turnKind"]>;

/** Path simplification tolerance (m) before turns are measured. */
const TURN_SIMPLIFY_METERS = 1.5;
/** Turns whose leg is shorter than this (m) fold into the previous step. */
const MIN_TURN_LEG_METERS = 3;

/**
 * Ramer–Douglas–Peucker over lng/lat (local metres): indices of the points
 * that carry the shape, so small zig-zags in a walking graph do not each
 * become a "turn" step.
 */
function significantPoints(
  points: GeoJSON.Position[],
  toleranceMeters: number,
): Set<number> {
  const keep = new Set<number>([0, points.length - 1]);
  if (points.length < 3) return keep;
  const lat = (points[0][1] * Math.PI) / 180;
  const xy = points.map(([lng, lt]) => [
    lng * 111_320 * Math.cos(lat),
    lt * 110_540,
  ]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = xy[start];
    const [bx, by] = xy[end];
    const length = Math.hypot(bx - ax, by - ay);
    let farthest = -1;
    let maxDistance = toleranceMeters;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = xy[i];
      const distance =
        length === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep.add(farthest);
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return keep;
}

/**
 * Heading change (degrees, signed) -> turn kind, after Situm's indications:
 * small wobbles are ignored, then slight turns, turns and U-turns.
 */
function classifyTurn(degrees: number): TurnKind | null {
  const angle = Math.abs(degrees);
  if (angle < 30) return null;
  if (angle < 60) return "slight";
  if (angle < 150) return "turn";
  return "around";
}

function formatTurn(kind: TurnKind, direction: "left" | "right"): string {
  if (kind === "around") return "Turn around";
  if (kind === "slight") return `Turn slightly ${direction}`;
  return `Turn ${direction}`;
}

/** A connector marker; `target_level` is the floor a click switches to. */
function transitionMarker(
  networkType: string,
  coordinates: GeoJSON.Position,
  level: number,
  target: number,
  label: string,
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: {
      type: "TRANSITION",
      network_type: networkType,
      level_id: level,
      target_level: target,
      label,
    },
  };
}

export default class IndoorDirections extends IndoorDirectionsEvented {
  declare protected readonly map: maplibregl.Map;
  private readonly pathFinder: PathFinder;

  protected readonly configuration: MapLibreGlDirectionsConfiguration;

  protected buildPoint = buildPoint;
  protected buildSnaplines = buildSnaplines;
  protected buildRouteLines = buildRouteLines;

  protected _waypoints: GeoJSON.Feature<GeoJSON.Point>[] = [];
  protected snappoints: GeoJSON.Feature<GeoJSON.Point>[] = [];
  protected routelines: GeoJSON.Feature<GeoJSON.LineString>[][] = [];
  private coordMap: Map<string, Set<GeoJSON.Position[]>> = new Map();
  private maxSnapDistanceMeters = Infinity;
  private waypointTargets: {
    position: GeoJSON.Position;
    vertex: GeoJSON.Position;
    level: number | null;
  }[] = [];
  private pathfindingOptions: PathfindingOptions = {};
  private levelNames: FloorNames | undefined;
  private transitionMarkers: GeoJSON.Feature<GeoJSON.Point>[] = [];
  private previewPoint: GeoJSON.Feature<GeoJSON.Point> | null = null;
  private instructionLine: GeoJSON.Feature<GeoJSON.LineString> | null = null;
  private instructionPoint: GeoJSON.Feature<GeoJSON.Point> | null = null;
  private routePath: GeoJSON.Position[] = [];
  private previewToken = 0;
  private transitionClickHandler: ((level: number) => void) | null = null;
  private graph: Graph = new Graph();
  private instructions: RouteInstruction[] = [];
  private currentFloor: number | null = null;
  private vertexLevels: Map<string, Set<number | null>> = new Map();
  private waypointLevels: (number | null)[] = [];
  /** Origin/destination names for "Start at X" / "Arrive at Y" steps. */
  private waypointNames: (string | null)[] = [];

  constructor(
    map: maplibregl.Map,
    configuration?: Partial<MapLibreGlDirectionsConfiguration>,
  ) {
    super(map);
    this.map = map;

    this.configuration = buildConfiguration(configuration);
    this.pathFinder = new PathFinder();

    this.init();
  }

  protected init() {
    if (!this.map.getSource(this.configuration.sourceName)) {
      this.map.addSource(this.configuration.sourceName, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    this.configuration.layers.forEach((layer) => {
      if (!this.map.getLayer(layer.id)) {
        this.map.addLayer(layer);
      }
    });

    const verticalLayerId = `${this.configuration.sourceName}-routeline-vertical`;
    if (!this.map.getLayer(verticalLayerId)) {
      this.map.addLayer({
        id: verticalLayerId,
        type: "line",
        source: this.configuration.sourceName,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#3665ff",
          "line-dasharray": [1.5, 1.5],
          "line-opacity": 0.95,
          "line-width": [
            "interpolate",
            ["exponential", 1.5],
            ["zoom"],
            0,
            2,
            18,
            7,
          ],
        },
        filter: [
          "all",
          ["==", ["get", "route"], "SELECTED"],
          ["==", ["get", "segment_type"], "vertical"],
        ],
      });
    }

    for (const [layer, beforeId] of this.overlayLayers()) {
      if (!this.map.getLayer(layer.id)) {
        this.map.addLayer(
          layer,
          beforeId && this.map.getLayer(beforeId) ? beforeId : undefined,
        );
      }
    }
    this.map.on("click", this.transitionLayerId, this.handleTransitionClick);
    this.map.on("mouseenter", this.transitionLayerId, this.setPointerCursor);
    this.map.on("mouseleave", this.transitionLayerId, this.resetCursor);

    this.applyRoutelineFilters();
  }

  /** Symbol layer for "Up to …" / "From …" connector markers. */
  public get transitionLayerId() {
    return `${this.configuration.sourceName}-transition`;
  }

  private get ghostLayerId() {
    return `${this.configuration.sourceName}-routeline-ghost`;
  }

  private get previewLayerId() {
    return `${this.configuration.sourceName}-preview`;
  }

  private get instructionLayerId() {
    return `${this.configuration.sourceName}-instruction`;
  }

  /**
   * Layers added on top of the configured ones, with the layer each is
   * inserted before: the other-floor "ghost" route sits under the active
   * route, connector markers and the preview dot on top.
   */
  private overlayLayers(): [maplibregl.LayerSpecification, string?][] {
    const source = this.configuration.sourceName;
    return [
      [
        {
          id: this.ghostLayerId,
          type: "line",
          source,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#3665ff",
            "line-opacity": 0.35,
            "line-dasharray": [2, 2],
            "line-width": [
              "interpolate",
              ["exponential", 1.5],
              ["zoom"],
              0,
              1.5,
              18,
              4,
            ],
          },
          filter: ["==", ["get", "route"], "__none__"],
        },
        `${source}-routeline-casing`,
      ],
      [
        {
          id: this.instructionLayerId,
          type: "line",
          source,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#006db4",
            "line-width": 6,
          },
          filter: ["==", ["get", "type"], "INSTRUCTION"],
        },
      ],
      [
        {
          id: this.transitionLayerId,
          type: "symbol",
          source,
          layout: {
            "icon-allow-overlap": true,
            "icon-image": [
              "match",
              ["get", "network_type"],
              "escalator",
              "vc-escalator",
              "elevator",
              "vc-elevator",
              "vc-stairs",
            ],
            "icon-size": 0.9,
            "text-allow-overlap": true,
            "text-anchor": "left",
            "text-field": ["get", "label"],
            "text-font": ["Noto Sans Regular"],
            "text-offset": [1.2, 0],
            "text-size": 13,
          },
          paint: {
            "text-color": "#1e3a8a",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2,
          },
          filter: ["==", ["get", "type"], "TRANSITION"],
        },
      ],
      [
        {
          id: this.previewLayerId,
          type: "circle",
          source,
          paint: {
            "circle-color": "#ffffff",
            "circle-radius": 7,
            "circle-stroke-color": "#3665ff",
            "circle-stroke-width": 4,
          },
          filter: [
            "in",
            ["get", "type"],
            ["literal", ["PREVIEW", "STEP_FOCUS"]],
          ],
        },
      ],
    ];
  }

  private handleTransitionClick = (
    event: maplibregl.MapMouseEvent & {
      features?: maplibregl.MapGeoJSONFeature[];
    },
  ) => {
    const target = event.features?.[0]?.properties?.target_level;
    if (typeof target === "number") this.transitionClickHandler?.(target);
  };

  private setPointerCursor = () => {
    this.map.getCanvas().style.cursor = "pointer";
  };

  private resetCursor = () => {
    this.map.getCanvas().style.cursor = "";
  };

  /** Called with the target floor when a connector marker is clicked. */
  public onTransitionClick(handler: ((level: number) => void) | null) {
    this.transitionClickHandler = handler;
  }

  private applyRoutelineFilters() {
    const floor = this.currentFloor;
    if (this.map.getLayer(this.instructionLayerId)) {
      this.map.setFilter(this.instructionLayerId, [
        "all",
        ["==", ["get", "type"], "INSTRUCTION"],
        floor === null ? true : ["==", ["get", "level_id"], floor],
      ]);
    }
    if (this.map.getLayer(this.previewLayerId)) {
      this.map.setFilter(this.previewLayerId, [
        "any",
        ["==", ["get", "type"], "PREVIEW"],
        [
          "all",
          ["==", ["get", "type"], "STEP_FOCUS"],
          floor === null ? true : ["==", ["get", "level_id"], floor],
        ],
      ]);
    }
    const combined: maplibregl.FilterSpecification =
      floor === null
        ? [
            "all",
            ["==", ["get", "route"], "SELECTED"],
            ["!=", ["get", "segment_type"], "vertical"],
          ]
        : [
            "all",
            ["==", ["get", "route"], "SELECTED"],
            ["!=", ["get", "segment_type"], "vertical"],
            [
              "any",
              ["==", ["get", "level_id"], floor],
              ["==", ["get", "level_id"], null],
              ["!", ["has", "level_id"]],
            ],
          ];

    const routelineLayerIds = [
      `${this.configuration.sourceName}-routeline`,
      `${this.configuration.sourceName}-routeline-casing`,
    ];

    for (const layerId of routelineLayerIds) {
      if (!this.map.getLayer(layerId)) continue;
      this.map.setFilter(layerId, combined);
    }

    // Start/end markers and snaplines only on their own floor.
    const onFloor: maplibregl.FilterSpecification = [
      "any",
      ["==", ["get", "level_id"], floor],
      ["==", ["get", "level_id"], null],
      ["!", ["has", "level_id"]],
    ];
    const markerLayerIds = [
      "snapline",
      "snappoint-casing",
      "snappoint",
      "waypoint-casing",
      "waypoint",
    ].map((suffix) => `${this.configuration.sourceName}-${suffix}`);
    for (const layerId of markerLayerIds) {
      const original = this.configuration.layers.find(
        (layer) => layer.id === layerId,
      );
      if (!original || !("filter" in original) || !this.map.getLayer(layerId)) {
        continue;
      }
      this.map.setFilter(
        layerId,
        floor === null || !original.filter
          ? original.filter
          : [
              "all",
              original.filter as maplibregl.ExpressionSpecification,
              onFloor,
            ],
      );
    }

    // The rest of the route, on other floors, as a faint dashed line.
    if (this.map.getLayer(this.ghostLayerId)) {
      this.map.setFilter(
        this.ghostLayerId,
        floor === null
          ? ["==", ["get", "route"], "__none__"]
          : [
              "all",
              ["==", ["get", "route"], "SELECTED"],
              ["==", ["get", "segment_type"], "level"],
              ["!=", ["get", "level_id"], floor],
            ],
      );
    }
    if (this.map.getLayer(this.transitionLayerId)) {
      this.map.setFilter(this.transitionLayerId, [
        "all",
        ["==", ["get", "type"], "TRANSITION"],
        floor === null ? true : ["==", ["get", "level_id"], floor],
      ]);
    }

    // Dashed connector runs only on the floors they join.
    const verticalLayerId = `${this.configuration.sourceName}-routeline-vertical`;
    if (this.map.getLayer(verticalLayerId)) {
      const vertical: maplibregl.FilterSpecification = [
        "all",
        ["==", ["get", "route"], "SELECTED"],
        ["==", ["get", "segment_type"], "vertical"],
      ];
      this.map.setFilter(
        verticalLayerId,
        floor === null
          ? vertical
          : [
              ...vertical,
              [
                "any",
                ["==", ["get", "level_a"], floor],
                ["==", ["get", "level_b"], floor],
              ],
            ],
      );
    }
  }

  public setFloor(floor: number | null) {
    this.currentFloor = floor;
    this.applyRoutelineFilters();
  }

  protected get waypointsCoordinates(): [number, number][] {
    return this._waypoints.map((waypoint) => {
      return [
        waypoint.geometry.coordinates[0],
        waypoint.geometry.coordinates[1],
      ];
    });
  }

  protected get snappointsCoordinates(): [number, number][] {
    return this.snappoints.map((snappoint) => {
      return [
        snappoint.geometry.coordinates[0],
        snappoint.geometry.coordinates[1],
      ];
    });
  }

  public get routelinesCoordinates() {
    return this.routelines;
  }

  public get routeInstructions(): RouteInstruction[] {
    return this.instructions;
  }

  protected get snaplines() {
    return this.snappoints.length > 1
      ? this.buildSnaplines(
          this.waypointsCoordinates,
          this.snappointsCoordinates,
        )
      : [];
  }

  private calculateDistance(
    coord1: GeoJSON.Position,
    coord2: GeoJSON.Position,
  ) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private findNearestGraphPoint(
    point: GeoJSON.Position,
    coordMap: Map<string, Set<GeoJSON.Position[]>>,
    level: number | null = null,
  ): GeoJSON.Position | null {
    // Geometry-checked fixtures register destinations, including isolated
    // ones. Never snap an unreachable shop into a neighbouring corridor.
    const registered = this.waypointTargets.find(
      (target) =>
        target.level === level &&
        this.calculateDistance(point, target.position) * 1000 < 0.002,
    );
    if (registered) return registered.vertex;

    let nearest: GeoJSON.Position | null = null;
    let minDistance = this.maxSnapDistanceMeters / 1000;

    coordMap.forEach((_, coordStr) => {
      if (level !== null) {
        const levels = this.vertexLevels.get(coordStr);
        // Nodes that only belong to connectors (e.g. elevator stops) are
        // never valid start/end points on a known floor.
        if (levels && !levels.has(level)) return;
      }

      const coord = JSON.parse(coordStr);
      const distance = this.calculateDistance(point, coord);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = coord;
      }
    });

    return nearest;
  }

  private updateSnapPoints() {
    this.snappoints = this._waypoints.map((waypoint, index) => {
      const nearest = this.findNearestGraphPoint(
        waypoint.geometry.coordinates,
        this.coordMap,
        this.waypointLevels[index] ?? null,
      );

      const snappoint = this.buildPoint(
        (nearest as [number, number]) || waypoint.geometry.coordinates,
        "SNAPPOINT",
      );
      return {
        ...snappoint,
        properties: { ...snappoint.properties, valid_snap: nearest !== null },
      };
    });
  }

  private getRouteEdgeMetadata(
    feature: GeoJSON.Feature<GeoJSON.LineString>,
  ): RouteEdgeMetadata {
    const properties = feature.properties ?? {};
    const networkType =
      typeof properties.network_type === "string"
        ? properties.network_type.toLowerCase()
        : undefined;
    const inaccessibleNetworkTypes = new Set(["stairs", "escalator"]);

    return {
      access_type:
        typeof properties.access_type === "string"
          ? properties.access_type
          : null,
      building_id:
        typeof properties.building_id === "string" ||
        typeof properties.building_id === "number"
          ? String(properties.building_id)
          : null,
      building_name:
        typeof properties.building_name === "string"
          ? properties.building_name
          : null,
      direction:
        properties.direction === "forward" ||
        properties.direction === "backward"
          ? properties.direction
          : "both",
      from_level_id:
        typeof properties.from_level_id === "number"
          ? properties.from_level_id
          : null,
      is_accessible:
        typeof properties.is_accessible === "boolean"
          ? properties.is_accessible
          : !(networkType && inaccessibleNetworkTypes.has(networkType)),
      level_id:
        typeof properties.level_id === "number" ? properties.level_id : null,
      network_type: networkType ?? null,
      ride_time_seconds:
        typeof properties.ride_time_seconds === "number" &&
        Number.isFinite(properties.ride_time_seconds) &&
        properties.ride_time_seconds > 0
          ? properties.ride_time_seconds
          : null,
      to_level_id:
        typeof properties.to_level_id === "number"
          ? properties.to_level_id
          : null,
      vertical_connection_id:
        typeof properties.vertical_connection_id === "string" ||
        typeof properties.vertical_connection_id === "number"
          ? properties.vertical_connection_id
          : null,
    };
  }

  private getRouteSegmentWeight(
    feature: GeoJSON.Feature<GeoJSON.LineString>,
    from: GeoJSON.Position,
    to: GeoJSON.Position,
  ) {
    // Some captured graphs carry preference penalties rather than travel
    // times. Keep these separate so matching the source's path choice does
    // not turn an elevator penalty into a many-minute ETA.
    const routingCost = feature.properties?.routing_cost;
    if (
      typeof routingCost === "number" &&
      Number.isFinite(routingCost) &&
      routingCost >= 0
    ) {
      return routingCost / Math.max(feature.geometry.coordinates.length - 1, 1);
    }
    // Weights are seconds: `cost` is a travel time (stairs 60 s, escalator
    // 45 s, elevator 120 s) and walking is converted at the same speed the
    // route summary uses, so connector choice trades off against walking.
    const cost = feature.properties?.cost;
    const fixedRide = feature.properties?.ride_time_seconds;
    if (
      typeof cost === "number" &&
      Number.isFinite(cost) &&
      cost >= 0 &&
      (cost > 0 ||
        (typeof fixedRide === "number" &&
          Number.isFinite(fixedRide) &&
          fixedRide > 0))
    ) {
      const segmentCount = Math.max(feature.geometry.coordinates.length - 1, 1);
      return cost / segmentCount;
    }

    const preference = feature.properties?.routing_cost_factor;
    const factor =
      typeof preference === "number" &&
      Number.isFinite(preference) &&
      preference >= 1
        ? preference
        : 1;
    return ((this.calculateDistance(from, to) * 1000) / WALKING_SPEED) * factor;
  }

  public loadMapData(geoJson: GeoJSON.FeatureCollection) {
    const coordMap = new Map<string, Set<GeoJSON.Position[]>>();
    const graph = new Graph();

    this.coordMap = coordMap;
    this.vertexLevels = new Map();
    this.waypointTargets = [];
    const snapLimit = (
      geoJson as GeoJSON.FeatureCollection & {
        max_snap_distance_m?: number;
      }
    ).max_snap_distance_m;
    this.maxSnapDistanceMeters =
      typeof snapLimit === "number" &&
      Number.isFinite(snapLimit) &&
      snapLimit > 0
        ? snapLimit
        : Infinity;

    geoJson.features.forEach((feature) => {
      if (
        feature.geometry.type === "Point" &&
        feature.properties?.network_type === "destination"
      ) {
        const coordinate = feature.geometry.coordinates;
        const key = JSON.stringify(coordinate);
        const level =
          typeof feature.properties.level_id === "number"
            ? feature.properties.level_id
            : null;
        graph.addVertex(key);
        coordMap.set(key, coordMap.get(key) ?? new Set());
        this.vertexLevels.set(key, new Set([level]));
        const source = feature.properties.source_coordinate;
        if (
          Array.isArray(source) &&
          source.length >= 2 &&
          source.every((value: unknown) => typeof value === "number")
        ) {
          this.waypointTargets.push({
            position: source,
            vertex: coordinate,
            level,
          });
        }
      }
      if (feature.geometry.type === "LineString") {
        const coordinates = feature.geometry.coordinates;
        const levelId =
          typeof feature.properties?.level_id === "number"
            ? feature.properties.level_id
            : null;

        coordinates.forEach((coord) => {
          const key = JSON.stringify(coord);
          if (!coordMap.has(key)) {
            coordMap.set(key, new Set());
          }
          coordMap.get(key)?.add(coordinates);

          if (!this.vertexLevels.has(key)) {
            this.vertexLevels.set(key, new Set());
          }
          this.vertexLevels.get(key)?.add(levelId);
        });
      }
    });

    geoJson.features.forEach((feature) => {
      if (feature.geometry.type === "LineString") {
        const coordinates = feature.geometry.coordinates;
        const metadata = this.getRouteEdgeMetadata(
          feature as GeoJSON.Feature<GeoJSON.LineString>,
        );

        for (let i = 0; i < coordinates.length - 1; i++) {
          const from = JSON.stringify(coordinates[i]);
          const to = JSON.stringify(coordinates[i + 1]);

          const weight = this.getRouteSegmentWeight(
            feature as GeoJSON.Feature<GeoJSON.LineString>,
            coordinates[i],
            coordinates[i + 1],
          );

          // addEdge links both directions (honouring one-way `direction`);
          // lines sharing a vertex join through the shared coordinate key.
          graph.addEdge(from, to, weight, metadata);
        }
      }
    });

    this.graph = graph;
    this.pathFinder.setGraph(graph);
  }

  public setPathfindingOptions(options: PathfindingOptions) {
    this.pathfindingOptions = options;
  }

  /** Venue floor names used in floor-change instructions. */
  public setLevelNames(names: FloorNames | undefined) {
    this.levelNames = names;
  }
  /**
   * Replaces all the waypoints with the specified ones and re-fetches the routes.
   *
   * @param waypoints The coordinates at which the waypoints should be added
   */
  public setWaypoints(
    waypoints: [number, number][],
    levels: (number | null)[] = [],
    names: (string | null)[] = [],
  ) {
    // this.abortController?.abort();

    this.cancelPreview();
    this.clearInstructionFocus();
    this._waypoints = waypoints.map((coord) => buildPoint(coord, "WAYPOINT"));
    this.waypointLevels = levels;
    this.waypointNames = names;
    this.assignWaypointsCategories();

    const waypointEvent = new IndoorDirectionsWaypointEvent(
      "setwaypoints",
      undefined,
    );

    this.updateSnapPoints();

    this.fire(waypointEvent);

    this.draw();

    try {
      this.calculateDirections(waypointEvent);
    } catch (error) {
      console.error(error);
    }
  }

  protected calculateDirections(originalEvent: IndoorDirectionsWaypointEvent) {
    //this.abortController?.abort();

    const routes: GeoJSON.Position[] = [];

    if (this.snappoints.length >= 2) {
      this.fire(
        new IndoorDirectionsRoutingEvent("calculateroutesstart", originalEvent),
      );

      for (let i = 0; i < this.snappoints.length - 1; i++) {
        const start = this.snappoints[i].geometry.coordinates;
        const end = this.snappoints[i + 1].geometry.coordinates;

        let segmentRoute: GeoJSON.Position[];
        try {
          if (
            this.snappoints[i].properties?.valid_snap === false ||
            this.snappoints[i + 1].properties?.valid_snap === false
          ) {
            throw new Error(
              "No valid indoor routing point on the selected floor.",
            );
          }
          segmentRoute = this.pathFinder.dijkstra(
            start,
            end,
            this.pathfindingOptions,
          );
        } catch (error) {
          // No path: drop the previous route so callers (and the map) never
          // show a stale one, e.g. a stairs route after turning on
          // accessible-only.
          this.routePath = [];
          this.routelines = [];
          this.instructions = [];
          this.transitionMarkers = [];
          this.draw();
          throw error;
        }

        if (i === 0) {
          routes.push(...segmentRoute);
        } else {
          routes.push(...segmentRoute.slice(1));
        }
      }

      this.fire(
        new IndoorDirectionsRoutingEvent("calculateroutesend", originalEvent),
      );

      this.routePath = routes;
      this.routelines = [this.buildRoutelinesByLevel(routes)];
      const origin = this._waypoints[0]?.geometry.coordinates;
      const destination = this._waypoints.at(-1)?.geometry.coordinates;
      const firstSnap = this.snappoints[0]?.geometry.coordinates;
      const lastSnap = this.snappoints.at(-1)?.geometry.coordinates;
      this.instructions = this.buildInstructions(
        routes,
        origin && firstSnap
          ? this.calculateDistance(origin, firstSnap) * 1000
          : 0,
        destination && lastSnap
          ? this.calculateDistance(lastSnap, destination) * 1000
          : 0,
      );
      this.transitionMarkers = this.buildTransitionMarkers();
    } else {
      this.routePath = [];
      this.routelines = [];
      this.instructions = [];
      this.transitionMarkers = [];
    }

    this.draw();
  }

  private getSegmentMetadata(
    from: GeoJSON.Position,
    to: GeoJSON.Position,
  ): RouteEdgeMetadata | undefined {
    return this.graph.getEdgeBetween(JSON.stringify(from), JSON.stringify(to))
      ?.metadata;
  }

  private buildRoutelinesByLevel(routes: GeoJSON.Position[]) {
    if (routes.length < 2) return [];

    const runs: {
      coordinates: GeoJSON.Position[];
      level: number | null;
      connection?: string | number | null;
      origin?: number | null;
      target?: number | null;
    }[] = [];
    let walkLevel = this.waypointLevels[0] ?? null;

    for (let i = 0; i < routes.length - 1; i++) {
      const metadata = this.getSegmentMetadata(routes[i], routes[i + 1]);
      const level = metadata?.level_id ?? null;
      const connection = metadata?.vertical_connection_id ?? null;
      const ride =
        level === null
          ? this.rideLevels(
              {
                from: routes[i],
                to: routes[i + 1],
                fromLevel: metadata?.from_level_id ?? null,
                toLevel: metadata?.to_level_id ?? null,
                direction: metadata?.direction,
              },
              walkLevel,
            )
          : null;
      const previous = runs.at(-1);
      if (
        !previous ||
        level !== previous.level ||
        (level === null && connection !== previous.connection)
      ) {
        runs.push({
          coordinates: [routes[i]],
          level,
          connection,
          origin: ride?.origin,
          target: ride?.target,
        });
      }
      const run = runs.at(-1)!;
      run.coordinates.push(routes[i + 1]);
      if (ride) run.target = ride.target;
      walkLevel = ride?.target ?? level ?? walkLevel;
    }

    return runs.map((run, index) => {
      const [feature] = this.buildRouteLines(run.coordinates);
      feature.properties = {
        ...feature.properties,
        level_id: run.level,
        segment_type: run.level === null ? "vertical" : "level",
        // Floors a connector run joins, so its dashed line only shows there.
        ...(run.level === null && {
          level_a:
            run.origin ??
            runs[index - 1]?.level ??
            this.waypointLevels[0] ??
            null,
          level_b:
            run.target ??
            runs[index + 1]?.level ??
            this.waypointLevels.at(-1) ??
            null,
        }),
      };
      return feature;
    });
  }

  private calculateBearing(
    from: GeoJSON.Position,
    to: GeoJSON.Position,
  ): number {
    const dLon = to[0] - from[0];
    const dLat = to[1] - from[1];
    return (Math.atan2(dLon, dLat) * 180) / Math.PI;
  }

  private formatLevelLabel(level: number | null | undefined): string {
    return formatFloorName(level, this.levelNames);
  }

  /**
   * Whether a segment runs in the stored coordinate order of its line.
   * Vertical connectors are stored from `from_level_id` to `to_level_id`,
   * so this tells whether a ride goes from the lower or the upper end.
   */
  private runsAlongLine(
    from: GeoJSON.Position,
    to: GeoJSON.Position,
  ): boolean | null {
    const fromKey = JSON.stringify(from);
    const toKey = JSON.stringify(to);
    for (const line of this.coordMap.get(fromKey) ?? []) {
      const fromIndex = line.findIndex((c) => JSON.stringify(c) === fromKey);
      const toIndex = line.findIndex((c) => JSON.stringify(c) === toKey);
      if (fromIndex !== -1 && toIndex !== -1) return fromIndex < toIndex;
    }
    return null;
  }

  /** Boarding and arrival level of one vertical-connector hop. */
  private rideLevels(
    segment: {
      from: GeoJSON.Position;
      to: GeoJSON.Position;
      fromLevel: number | null;
      toLevel: number | null;
      direction?: RouteEdgeMetadata["direction"];
    },
    currentLevel: number | null,
  ): { origin: number | null; target: number | null } {
    // Opposite directed edges can share the same two coordinates. Their
    // metadata belongs to the selected edge, not the first stored line.
    let forward = this.runsAlongLine(segment.from, segment.to);
    if (segment.direction === "forward") forward = true;
    if (segment.direction === "backward") forward = false;
    if (forward === true) {
      return { origin: segment.fromLevel, target: segment.toLevel };
    }
    if (forward === false) {
      return { origin: segment.toLevel, target: segment.fromLevel };
    }
    // Unknown orientation: assume the ride leaves the current level.
    const leavesFromLevel = segment.fromLevel === currentLevel;
    return {
      origin: currentLevel,
      target:
        (leavesFromLevel ? segment.toLevel : segment.fromLevel) ?? currentLevel,
    };
  }

  /**
   * @param leadInMeters walk from the origin waypoint to its snap point
   * @param leadOutMeters walk from the last snap point to the destination
   */
  private buildInstructions(
    routes: GeoJSON.Position[],
    leadInMeters = 0,
    leadOutMeters = 0,
  ): RouteInstruction[] {
    if (routes.length < 2) return [];

    const segments = [];
    for (let i = 0; i < routes.length - 1; i++) {
      const from = routes[i];
      const to = routes[i + 1];
      const metadata = this.getSegmentMetadata(from, to);
      segments.push({
        from,
        to,
        metadata,
        distanceMeters: this.calculateDistance(from, to) * 1000,
        networkType: metadata?.network_type ?? "corridor",
        level: metadata?.level_id ?? null,
        fromLevel: metadata?.from_level_id ?? null,
        toLevel: metadata?.to_level_id ?? null,
        direction: metadata?.direction,
        connectionId: metadata?.vertical_connection_id ?? null,
        buildingId: metadata?.building_id ?? null,
        buildingName: metadata?.building_name ?? null,
      });
    }

    const startLevel = segments[0].level ?? this.waypointLevels[0] ?? null;
    const originName = this.waypointNames[0];
    const destinationName = this.waypointNames.at(-1);
    const instructions: RouteInstruction[] = [
      {
        type: "depart",
        message: originName ? `Start at ${originName}` : "Start your route",
        distanceMeters: 0,
        toLevel: startLevel,
        position: segments[0].from,
      },
    ];

    const verticalTypes = new Set(["stairs", "escalator", "elevator", "ramp"]);
    // Any edge between two different floors is ridden, not walked: e.g. a
    // door from a hillside path straight onto a building's second floor.
    const isVertical = (segment: {
      networkType: string;
      fromLevel: number | null;
      toLevel: number | null;
    }) =>
      verticalTypes.has(segment.networkType) ||
      (segment.fromLevel !== null &&
        segment.toLevel !== null &&
        segment.fromLevel !== segment.toLevel);
    // Turns are measured only at the shape points of each walking stretch
    // (vertex i is segments[i].from), between neighbouring shape points.
    const turnAt = new Map<number, { before: number; after: number }>();
    for (let start = 0; start < segments.length; ) {
      if (isVertical(segments[start])) {
        start++;
        continue;
      }
      let end = start;
      while (end + 1 < segments.length && !isVertical(segments[end + 1])) {
        end++;
      }
      const vertices = routes.slice(start, end + 2);
      const kept = [...significantPoints(vertices, TURN_SIMPLIFY_METERS)].sort(
        (a, b) => a - b,
      );
      for (let k = 1; k < kept.length - 1; k++) {
        turnAt.set(start + kept[k], {
          before: start + kept[k - 1],
          after: start + kept[k + 1],
        });
      }
      start = end + 1;
    }
    let walkDistance = leadInMeters;
    let walkLevel = startLevel;
    let walkStart: GeoJSON.Position = segments[0].from;
    let lastRide: {
      connectionId: string | number | null;
      type: string;
    } | null = null;
    // Building of the last walking segment, for "Exit X" / "Enter Y" steps.
    // `undefined` until the first walk, so the origin building isn't
    // announced as an entry.
    let walkBuilding: { id: string | null; name: string | null } | undefined;

    const flushWalk = () => {
      if (walkDistance < 0.5) return;
      const previous = instructions.at(-1);
      if (previous?.type === "turn" && previous.distanceMeters === 0) {
        // Situm-style: one step per turn, "Turn left and go ahead for 13 m".
        previous.distanceMeters = Math.round(walkDistance);
        previous.message = `${previous.message} and go ahead for ${previous.distanceMeters} m`;
        walkDistance = 0;
        lastRide = null;
        return;
      }
      instructions.push({
        type: "straight",
        message: `Continue for ${Math.round(walkDistance)} m`,
        distanceMeters: Math.round(walkDistance),
        toLevel: walkLevel,
        position: walkStart,
      });
      walkDistance = 0;
      lastRide = null;
    };

    for (const [i, segment] of segments.entries()) {
      if (isVertical(segment)) {
        flushWalk();
        const { origin, target } = this.rideLevels(segment, walkLevel);
        // Elevator boarding edges stay on one floor; only hops count.
        const changesLevel = segment.fromLevel !== segment.toLevel;

        const previous = instructions.at(-1);
        const continuesRide =
          previous?.type === "floor-change" &&
          lastRide !== null &&
          lastRide.type === segment.networkType &&
          lastRide.connectionId === segment.connectionId;

        if (continuesRide && previous) {
          // Consecutive hops in the same shaft are one ride ("Take the
          // elevator up 5 floors to Fifth Floor"), not one step per floor.
          previous.toLevel = target ?? walkLevel;
          previous.arrivalPosition = segment.to;
          previous.floorsTraversed =
            (previous.floorsTraversed ?? 0) + (changesLevel ? 1 : 0);
          previous.message = this.formatRideMessage(previous);
        } else {
          const instruction: RouteInstruction = {
            type: "floor-change",
            message: "",
            distanceMeters: 0,
            networkType: segment.networkType,
            fromLevel: origin ?? walkLevel,
            toLevel: target ?? walkLevel,
            position: segment.from,
            arrivalPosition: segment.to,
            floorsTraversed: changesLevel ? 1 : 0,
            ...(segment.metadata?.ride_time_seconds && {
              travelTimeSeconds: segment.metadata.ride_time_seconds,
            }),
          };
          instruction.message = this.formatRideMessage(instruction);
          instructions.push(instruction);
        }
        lastRide = {
          connectionId: segment.connectionId,
          type: segment.networkType,
        };
        walkLevel = target ?? walkLevel;
        continue;
      }

      if (walkBuilding && walkBuilding.id !== segment.buildingId) {
        flushWalk();
        const previous = instructions.at(-1);
        if (
          previous?.type === "floor-change" &&
          previous.networkType === "door"
        ) {
          // A door straight onto another floor: one step, "Enter Robinson
          // Hall (Floor 2)", rather than a door step then an enter step.
          previous.message = `${this.formatBuildingMessage(segment, walkBuilding.name)} (${this.formatLevelLabel(previous.toLevel)})`;
          previous.buildingName =
            segment.buildingId === null ? null : segment.buildingName;
          walkBuilding = { id: segment.buildingId, name: segment.buildingName };
        }
      }
      if (walkBuilding && walkBuilding.id !== segment.buildingId) {
        instructions.push({
          type: "building-change",
          message: this.formatBuildingMessage(segment, walkBuilding.name),
          distanceMeters: 0,
          networkType: segment.networkType,
          buildingName:
            segment.buildingId === null ? null : segment.buildingName,
          toLevel: walkLevel,
          position: segment.from,
        });
      }
      walkBuilding = { id: segment.buildingId, name: segment.buildingName };

      const shape = turnAt.get(i);
      if (shape) {
        const angleIn =
          this.calculateBearing(routes[shape.before], routes[i]) * -1;
        const angleOut = this.calculateBearing(routes[i], routes[shape.after]);
        let turn = angleOut + angleIn;
        while (turn > 180) turn -= 360;
        while (turn < -180) turn += 360;

        const turnKind = classifyTurn(turn);
        if (turnKind) {
          flushWalk();
          const turnDirection = turn > 0 ? "right" : "left";
          instructions.push({
            type: "turn",
            message: formatTurn(turnKind, turnDirection),
            distanceMeters: 0,
            turnDirection,
            turnKind,
            toLevel: walkLevel,
            position: segment.from,
          });
        }
      }

      if (walkDistance === 0) walkStart = segment.from;
      walkDistance += segment.distanceMeters;
    }

    if (walkDistance === 0) walkStart = segments.at(-1)?.to ?? walkStart;
    walkDistance += leadOutMeters;
    flushWalk();
    this.foldShortTurns(instructions);
    instructions.push({
      type: "arrive",
      message: destinationName
        ? `Arrive at ${destinationName}`
        : "Arrive at your destination",
      distanceMeters: 0,
      toLevel: walkLevel,
      position: segments.at(-1)?.to,
    });

    return instructions;
  }

  /**
   * Drops turns with a leg under {@link MIN_TURN_LEG_METERS} ("turn right
   * and go ahead for 2 m" before an elevator): their distance joins the
   * previous walking step, or becomes a plain "Continue" step.
   */
  private foldShortTurns(instructions: RouteInstruction[]) {
    for (let i = instructions.length - 1; i > 0; i--) {
      const step = instructions[i];
      if (step.type !== "turn" || step.distanceMeters >= MIN_TURN_LEG_METERS) {
        continue;
      }
      const previous = instructions[i - 1];
      if (previous.type === "straight" || previous.type === "turn") {
        previous.distanceMeters += step.distanceMeters;
        previous.message =
          previous.type === "straight"
            ? `Continue for ${previous.distanceMeters} m`
            : `${formatTurn(previous.turnKind ?? "turn", previous.turnDirection ?? "left")}${previous.distanceMeters > 0 ? ` and go ahead for ${previous.distanceMeters} m` : ""}`;
        instructions.splice(i, 1);
      } else if (step.distanceMeters >= 0.5) {
        instructions[i] = {
          type: "straight",
          message: `Continue for ${step.distanceMeters} m`,
          distanceMeters: step.distanceMeters,
          toLevel: step.toLevel,
          position: step.position,
        };
      } else {
        instructions.splice(i, 1);
      }
    }
  }

  /**
   * Entering a building, leaving one for the outdoors, or crossing a
   * building-less indoor link such as a skybridge or tunnel.
   */
  private formatBuildingMessage(
    segment: {
      buildingId: string | null;
      buildingName: string | null;
      networkType: string;
    },
    previousName: string | null,
  ): string {
    if (segment.buildingId !== null) {
      return `Enter ${segment.buildingName ?? "the building"}`;
    }
    if (segment.networkType === "outdoor") {
      return previousName ? `Exit ${previousName}` : "Head outside";
    }
    return `Take the ${segment.buildingName ?? segment.networkType}`;
  }

  private formatRideMessage(instruction: RouteInstruction): string {
    const floors = instruction.floorsTraversed ?? 1;
    const target = this.formatLevelLabel(instruction.toLevel);
    if (instruction.networkType === "door") {
      return `Go through the door to ${target}`;
    }
    const direction =
      (instruction.toLevel ?? 0) > (instruction.fromLevel ?? 0) ? "up" : "down";
    if (floors === 0 || instruction.toLevel === instruction.fromLevel) {
      return `Take the ${instruction.networkType} to ${target}`;
    }
    if (floors === 1) {
      return `Take the ${instruction.networkType} ${direction} to ${target}`;
    }
    return `Take the ${instruction.networkType} ${direction} ${floors} floors to ${target}`;
  }

  /**
   * Connector markers: where to board ("Up to 1st Floor") on the departure
   * floor and where the ride arrives ("From Ground Floor") on the next.
   */
  private buildTransitionMarkers(): GeoJSON.Feature<GeoJSON.Point>[] {
    const markers: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const instruction of this.instructions) {
      const { fromLevel, toLevel, position, arrivalPosition } = instruction;
      if (
        instruction.type !== "floor-change" ||
        typeof fromLevel !== "number" ||
        typeof toLevel !== "number" ||
        fromLevel === toLevel ||
        !position ||
        !arrivalPosition
      ) {
        continue;
      }
      const networkType = instruction.networkType ?? "stairs";
      const direction = toLevel > fromLevel ? "Up" : "Down";
      markers.push(
        transitionMarker(
          networkType,
          position,
          fromLevel,
          toLevel,
          `${direction} to ${this.formatLevelLabel(toLevel)}`,
        ),
        transitionMarker(
          networkType,
          arrivalPosition,
          toLevel,
          fromLevel,
          `From ${this.formatLevelLabel(fromLevel)}`,
        ),
      );
    }
    return markers;
  }

  /**
   * Animates a dot along the whole route, floor by floor. `onFloorChange`
   * is called before each floor's leg so the app can switch floors.
   * Resolves `true` when finished, `false` if cancelled.
   */
  public async previewRoute({
    onFloorChange,
    onInstructionChange,
    padding = 80,
  }: {
    onFloorChange?: (level: number) => void;
    onInstructionChange?: (index: number) => void;
    padding?: number | maplibregl.PaddingOptions;
  } = {}): Promise<boolean> {
    this.cancelPreview();
    this.clearInstructionFocus();
    const token = this.previewToken;
    const legs = (this.routelines[0] ?? [])
      .filter((feature) => feature.properties?.segment_type === "level")
      .map((feature) => ({
        coordinates: feature.geometry.coordinates,
        level: feature.properties?.level_id as number | null,
      }))
      .filter((leg) => leg.coordinates.length > 1);
    if (legs.length === 0) return false;

    const lengths = legs.map((leg) => this.pathLength(leg.coordinates));
    const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
    // The whole walk plays in 4-12 s whatever the route length (km * 40 s).
    const totalMs = Math.min(12_000, Math.max(4000, total * 40_000));

    // Instruction distances describe each outgoing walk. Their cumulative
    // starts line up with the animated path, including zero-distance turns
    // and rides. Keep the displayed step on the animation's actual floor.
    let walkedKm = 0;
    let activeInstruction = -1;
    const markers = this.instructions.map((instruction, index) => {
      const marker = {
        index,
        distance: walkedKm,
        level:
          instruction.type === "floor-change"
            ? instruction.fromLevel
            : instruction.toLevel,
      };
      walkedKm += instruction.distanceMeters / 1000;
      return marker;
    });
    let coveredKm = 0;
    function reportStep(distance: number, level: number | null) {
      const candidates = markers.filter(
        (marker) =>
          marker.distance <= distance + 0.001 &&
          (marker.level == null || marker.level === level),
      );
      const next = candidates.at(-1)?.index ?? 0;
      if (next !== activeInstruction) {
        activeInstruction = next;
        onInstructionChange?.(next);
      }
    }

    for (const [index, leg] of legs.entries()) {
      if (token !== this.previewToken) return false;
      if (typeof leg.level === "number") onFloorChange?.(leg.level);
      this.fitCoordinates(leg.coordinates, padding);
      reportStep(coveredKm, leg.level);
      await this.wait(700);
      const finished = await this.animateAlong(
        leg.coordinates,
        (lengths[index] / total) * totalMs,
        token,
        (progress) =>
          reportStep(coveredKm + lengths[index] * progress, leg.level),
      );
      if (!finished) return false;
      coveredKm += lengths[index];
    }
    await this.wait(600);
    if (token !== this.previewToken) return false;
    onInstructionChange?.(this.instructions.length - 1);
    this.previewPoint = null;
    this.draw();
    return true;
  }

  public cancelPreview() {
    this.previewToken += 1;
    if (this.previewPoint) {
      this.previewPoint = null;
      this.draw();
    }
  }

  /** Selected walking geometry, or arrival-floor context for a connector. */
  public setInstructionFocus(index: number, arrivalFloor = false) {
    const instruction = this.instructions[index];
    if (!instruction?.position || this.routePath.length === 0) return null;
    const level =
      instruction.type === "floor-change" && !arrivalFloor
        ? instruction.fromLevel
        : instruction.toLevel;
    const position =
      instruction.type === "floor-change" && arrivalFloor
        ? (instruction.arrivalPosition ?? instruction.position)
        : instruction.position;
    // Walk forward through instruction anchors so repeated positions never
    // select an earlier part of a route that revisits the same corridor.
    let cursor = 0;
    const anchors = this.instructions.map((step) => {
      const found = this.routePath.findIndex(
        (coordinate, pathIndex) =>
          pathIndex >= cursor &&
          JSON.stringify(coordinate) === JSON.stringify(step.position),
      );
      if (found !== -1) cursor = found;
      return cursor;
    });
    const start = anchors[index];
    const end =
      anchors.slice(index + 1).find((anchor) => anchor > start) ?? start;
    const walking = instruction.type !== "floor-change";
    const selected = walking ? this.routePath.slice(start, end + 1) : [];
    let coordinates = selected.length > 0 ? selected : [position];
    if (!walking) {
      // A connector step previews the route on the floor reached by the ride.
      // It should not zoom tightly onto the shaft or frame the vertical hop.
      const floorLegs = (this.routelines[0] ?? []).filter(
        (feature) =>
          feature.properties?.segment_type === "level" &&
          feature.properties.level_id === level,
      );
      const nearestLeg = floorLegs.sort(
        (a, b) =>
          Math.min(
            ...a.geometry.coordinates.map((c) =>
              this.calculateDistance(c, position),
            ),
          ) -
          Math.min(
            ...b.geometry.coordinates.map((c) =>
              this.calculateDistance(c, position),
            ),
          ),
      )[0];
      if (nearestLeg) coordinates = nearestLeg.geometry.coordinates;
    }
    this.instructionLine =
      selected.length > 1
        ? {
            type: "Feature",
            geometry: { type: "LineString", coordinates: selected },
            properties: { type: "INSTRUCTION", level_id: level },
          }
        : null;
    this.instructionPoint = {
      type: "Feature",
      geometry: { type: "Point", coordinates: position },
      properties: { type: "STEP_FOCUS", level_id: level },
    };
    // Style/layer reloads must not put the selected section underneath the
    // wider base route. Keep it immediately below the focus/preview marker.
    if (this.map.getLayer(this.instructionLayerId)) {
      this.map.moveLayer(
        this.instructionLayerId,
        this.map.getLayer(this.previewLayerId)
          ? this.previewLayerId
          : undefined,
      );
    }
    this.draw();
    return { level, coordinates };
  }

  public clearInstructionFocus() {
    this.instructionLine = null;
    this.instructionPoint = null;
    this.draw();
  }

  private wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private pathLength(coordinates: GeoJSON.Position[]) {
    let length = 0;
    for (let i = 1; i < coordinates.length; i++) {
      length += this.calculateDistance(coordinates[i - 1], coordinates[i]);
    }
    return length;
  }

  private fitCoordinates(
    coordinates: GeoJSON.Position[],
    padding: number | maplibregl.PaddingOptions,
  ) {
    const xs = coordinates.map((c) => c[0]);
    const ys = coordinates.map((c) => c[1]);
    this.map.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding, duration: 600, maxZoom: 20 },
    );
  }

  private animateAlong(
    coordinates: GeoJSON.Position[],
    durationMs: number,
    token: number,
    onProgress?: (progress: number) => void,
  ): Promise<boolean> {
    const cumulative = [0];
    for (let i = 1; i < coordinates.length; i++) {
      cumulative.push(
        cumulative[i - 1] +
          this.calculateDistance(coordinates[i - 1], coordinates[i]),
      );
    }
    const length = cumulative.at(-1) || 1;

    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now: number) => {
        if (token !== this.previewToken) {
          resolve(false);
          return;
        }
        const t = Math.min(1, (now - start) / Math.max(durationMs, 1));
        onProgress?.(t);
        const target = t * length;
        let i = 1;
        while (i < cumulative.length - 1 && cumulative[i] < target) i++;
        const span = cumulative[i] - cumulative[i - 1] || 1;
        const f = (target - cumulative[i - 1]) / span;
        const [ax, ay] = coordinates[i - 1];
        const [bx, by] = coordinates[i];
        this.previewPoint = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [ax + (bx - ax) * f, ay + (by - ay) * f],
          },
          properties: { type: "PREVIEW" },
        };
        this.draw();
        if (t < 1) requestAnimationFrame(frame);
        else resolve(true);
      };
      requestAnimationFrame(frame);
    });
  }

  /** Tags a per-waypoint feature with that waypoint's floor for filtering. */
  private withWaypointLevel<T extends GeoJSON.Feature>(
    feature: T,
    index: number,
  ): T {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        level_id: this.waypointLevels[index] ?? null,
      },
    };
  }

  protected draw() {
    const features = [
      ...this._waypoints.map((feature, i) =>
        this.withWaypointLevel(feature, i),
      ),
      ...this.snappoints.map((feature, i) =>
        this.withWaypointLevel(feature, i),
      ),
      ...this.snaplines.map((feature, i) => this.withWaypointLevel(feature, i)),
      ...this.routelines.flat(),
      ...this.transitionMarkers,
      ...(this.instructionLine ? [this.instructionLine] : []),
      ...(this.instructionPoint && !this.previewPoint
        ? [this.instructionPoint]
        : []),
      ...(this.previewPoint ? [this.previewPoint] : []),
    ];

    const geoJson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    if (this.map.getSource(this.configuration.sourceName)) {
      (
        this.map.getSource(
          this.configuration.sourceName,
        ) as maplibregl.GeoJSONSource
      ).setData(geoJson);
    }
  }

  protected assignWaypointsCategories() {
    this._waypoints.forEach((waypoint, index) => {
      let category;
      if (index === 0) {
        category = "ORIGIN";
      } else if (index === this._waypoints.length - 1) {
        category = "DESTINATION";
      } else {
        category = undefined;
      }

      if (waypoint.properties) {
        waypoint.properties.index = index;
        waypoint.properties.category = category;
      }
    });
  }

  /**
   * Clears the map from all the instance's traces: waypoints, snappoints, routes, etc.
   */
  clear() {
    this.cancelPreview();
    this.clearInstructionFocus();
    this.routePath = [];
    this._waypoints = [];
    this.snappoints = [];
    this.routelines = [];
    this.instructions = [];
    this.transitionMarkers = [];
    this.draw();
  }

  destroy() {
    this.cancelPreview();
    this.map.off("click", this.transitionLayerId, this.handleTransitionClick);
    this.map.off("mouseenter", this.transitionLayerId, this.setPointerCursor);
    this.map.off("mouseleave", this.transitionLayerId, this.resetCursor);
    try {
      for (const [layer] of this.overlayLayers()) {
        if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
      }
      for (const layer of [...this.configuration.layers].reverse()) {
        if (this.map.getLayer(layer.id)) {
          this.map.removeLayer(layer.id);
        }
      }

      const verticalLayerId = `${this.configuration.sourceName}-routeline-vertical`;
      if (this.map.getLayer(verticalLayerId)) {
        this.map.removeLayer(verticalLayerId);
      }

      if (this.map.getSource(this.configuration.sourceName)) {
        this.map.removeSource(this.configuration.sourceName);
      }
    } catch {
      // The map style may already be gone during style changes or unmount.
    }
  }
}
