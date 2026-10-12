import { floorDiagnostic, floorDiagnosticsEnabled } from "./floor-diagnostics";
import { geoJsonStatistics } from "./geojson-statistics";
import {
  mapSourceFeatures,
  NATIVE_EXPLORE_PROPERTIES,
} from "./map-source-properties";
import { useNativeExactHits } from "./use-native-exact-hits";
import { mapDrawingFeatures } from "./map-drawing-features";
import { projectPlaceDisplayName } from "./visitor-metadata";
import { useEffect, useMemo, useState } from "react";
import {
  LngLatBounds,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { useMap } from "~/components/map/map";
import type { IndoorDataset } from "./contract";
import { nativeEditPoint } from "./map-edits";
import { pointInNativeArea } from "./native-area-review";
import {
  filterNativeExplorePlaces,
  nativeExploreControlHit,
  nativeExplorePlaces,
  nativeExplorePickRegions,
  type NativeExploreResult,
} from "./native-explore";
import { startNativeExploreTrace } from "./native-explore-client";
import { FloorMemoryCache } from "./floor-memory-cache";
import {
  ROOM_DETAIL_START,
  ROOM_DETAIL_END,
  WALL_DETAIL_START,
  WALL_DETAIL_END,
} from "./zoom-presentation";
import { HALLWAY_COLOR, OVERVIEW_SOLID_COLOR } from "./display-passages";
import { isVisitorHallway } from "./place-discovery";
import {
  nativeExploreSelectionIds,
  nativeExploreSelectionFeatures,
  nativeExploreIdentityLocation,
} from "./native-explore-selection";
import { geographicPoint } from "./routing";
import { fitProjectPlaceBounds } from "./place-camera";
import {
  nativeMixedHallwayIssues,
  nativeMixedHallwayFeatures,
} from "./native-mixed-hallway-review";

// Retain one immutable dataset's complete results within both count/byte
// budgets; pending walls and cancelled workers never populate this cache.
let nativeExploreCacheData: IndoorDataset | undefined;
let nativeExploreCacheConsumers = 0;
const nativeExploreCache = new FloorMemoryCache<string, NativeExploreResult>(5);
const empty = { type: "FeatureCollection" as const, features: [] };
const sources = [
  "native-explore-fill",
  "native-explore-outline",
  "native-explore-partitions",
  "native-explore-overview",
  "native-explore-material",
  "native-explore-mixed-hallways",
  "native-explore-mixed-hallway-perimeters",
];
const layers = [
  "native-explore-floor",
  "native-explore-edges",
  "native-explore-selection",
  "native-explore-boundaries",
  "native-explore-overview-floor",
  "native-explore-material-fill",
  "native-explore-mixed-hallway-fill",
  "native-explore-mixed-hallway-line",
];
export function NativeExploreLayer({
  data,
  levelIds,
  building,
  selected,
  onPick,
  onFitReady,
  fitRequest = 0,
  usePreparedDisplay = false,
  preparedDisplay,
  preparedDisplayError,
  onRetryPreparedDisplay,
}: {
  onRetryPreparedDisplay?: () => void;
  usePreparedDisplay?: boolean;
  preparedDisplay?: NativeExploreResult;
  preparedDisplayError?: string;
  data: IndoorDataset;
  levelIds: number[];
  building: string;
  selected: string;
  onPick: (key: string) => void;
  onFitReady?: (fit: (includeSelection?: boolean) => void) => void;
  /** Explicit search requests also locate a repeated selection after panning. */
  fitRequest?: number;
}) {
  const { map, isLoaded } = useMap();
  const [state, setState] = useState<{
    data: IndoorDataset;
    scope: string;
    result?: NativeExploreResult;
    error?: string;
    complete?: boolean;
  }>();
  const [picked, setPicked] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeLimit, setPlaceLimit] = useState(20);
  const [showMixedHallways, setShowMixedHallways] = useState(false);
  const [mixedHallwayId, setMixedHallwayId] = useState("all");
  const scope = `${building}:${levelIds.join(",")}`;
  const current =
    state?.data === data && state.scope === scope ? state : undefined;
  const result = current?.result;
  const mixedHallwayIssues = useMemo(
    () => (result ? nativeMixedHallwayIssues(data, result) : []),
    [data, result],
  );
  const mixedHallwayIds = useMemo(
    () =>
      showMixedHallways
        ? mixedHallwayIssues
            .filter(
              (issue) =>
                mixedHallwayId === "all" || issue.id === mixedHallwayId,
            )
            .map((issue) => issue.id)
        : [],
    [showMixedHallways, mixedHallwayIssues, mixedHallwayId],
  );
  const mixedHallway = mixedHallwayIssues.find(
    (issue) => issue.id === mixedHallwayId,
  );
  useEffect(() => setMixedHallwayId("all"), [data, scope]);
  const exactScopes = useMemo(
    () =>
      result?.exactTopologies?.map((entry) => ({
        sourceModelSha256: data.source.modelSha256,
        sourceGeometryKey: entry.geometrySha256,
        topology: entry.topology,
        faceIds: result.regions
          .filter((r) => r.levelId === entry.levelId)
          .map((r) => r.exactFaceId!),
      })),
    [data.source.modelSha256, result?.exactTopologies, result?.regions],
  );
  const exactHits = useNativeExactHits(exactScopes);
  useEffect(() => {
    nativeExploreCacheConsumers++;
    return () => {
      if (--nativeExploreCacheConsumers === 0) {
        nativeExploreCache.clear();
        nativeExploreCacheData = undefined;
      }
    };
  }, []);
  useEffect(() => {
    setState(undefined);
    setPicked([]);
    if (usePreparedDisplay) {
      if (preparedDisplay || preparedDisplayError)
        setState({
          data,
          scope,
          result: preparedDisplay,
          error: preparedDisplayError,
          complete: true,
        });
      return;
    }
    if (nativeExploreCacheData !== data) {
      nativeExploreCache.clear();
      nativeExploreCacheData = data;
    }
    const cached = nativeExploreCache.get(scope);
    if (cached) {
      setState({ data, scope, result: cached });
      return;
    }
    let floorResult: NativeExploreResult | undefined;
    return startNativeExploreTrace(
      { data, levelIds, building },
      () =>
        new Worker(new URL("native-explore.worker.ts", import.meta.url), {
          type: "module",
        }),
      (response) => {
        floorResult =
          response.result ??
          (response.walls && floorResult
            ? { ...floorResult, walls: response.walls }
            : floorResult);
        const update = { ...response, result: floorResult };
        if (update.result && update.complete !== false && !update.error) {
          if (nativeExploreCacheData === data)
            nativeExploreCache.set(
              scope,
              update.result,
              response.memoryCostBytes,
            );
        }
        setState({ data, scope, ...update });
      },
    );
    // Scope includes every level and building; dataset identity invalidates imports/edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data,
    scope,
    retry,
    usePreparedDisplay,
    preparedDisplay,
    preparedDisplayError,
  ]);
  const selectedRegions = useMemo(
    () => (result ? nativeExploreSelectionIds(result, selected, picked) : []),
    [result, picked, selected],
  );
  useEffect(() => setPicked([]), [selected]);
  useEffect(() => {
    if (!map || !isLoaded || !result || !onFitReady) return;
    onFitReady((includeSelection = true) => {
      const chosen =
        includeSelection && selected
          ? nativeExploreSelectionFeatures(result, selected)
          : [];
      const bounds = new LngLatBounds();
      const identity =
        includeSelection && selected && !chosen.length
          ? nativeExploreIdentityLocation(data, selected, levelIds, building)
          : undefined;
      if (identity) {
        // Locate an unmatched identity without rendering or approving its old
        // footprint. The explicit native trace remains the displayed geometry.
        for (const point of identity)
          bounds.extend(geographicPoint(data, point));
      } else {
        for (const feature of chosen.length ? chosen : result.outlines.features)
          for (const point of feature.geometry.coordinates[0])
            bounds.extend(point as [number, number]);
      }
      if (!bounds.isEmpty())
        fitProjectPlaceBounds(map, bounds, {
          maxZoom: chosen.length || identity ? 21 : 20,
          pitch: 0,
          duration: 650,
        });
    });
  }, [
    map,
    isLoaded,
    result,
    exactHits,
    onFitReady,
    selected,
    data,
    levelIds,
    building,
    fitRequest,
  ]);
  const regions = result?.regions.filter((r) => picked.includes(r.id)) ?? [];
  const region = regions[0];
  const places = [
    ...new Map(
      regions
        .flatMap((r) => nativeExplorePlaces(data, r, building))
        .filter((r) => !isVisitorHallway(r))
        .map((r) => [r.key, r]),
    ).values(),
  ];
  const matchingPlaces = filterNativeExplorePlaces(places, placeQuery, data);
  useEffect(() => {
    setPlaceQuery("");
    setPlaceLimit(20);
  }, [picked]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    for (const id of sources)
      map.addSource(id, {
        type: "geojson",
        data: empty,
        tolerance: 0,
        maxzoom: 23,
      });
    const before = ["project-route-line", "project-label"].find((id) =>
      map.getLayer(id),
    );
    map.addLayer(
      {
        id: layers[0],
        type: "fill",
        source: sources[0],
        minzoom: ROOM_DETAIL_START,
        paint: {
          "fill-color": ["get", "color"],
          // Native faces supply the overview too; only their type tint changes.
          "fill-opacity": 1,
          "fill-antialias": false,
        },
      },
      before,
    );
    map.addLayer(
      {
        id: layers[4],
        type: "fill",
        source: sources[3],
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "circulation"], true],
            HALLWAY_COLOR,
            OVERVIEW_SOLID_COLOR,
          ],
          "fill-opacity": 1,
          "fill-antialias": false,
        },
      },
      before,
    );
    map.addLayer(
      {
        id: layers[5],
        type: "fill",
        source: sources[4],
        minzoom: WALL_DETAIL_START,
        paint: {
          "fill-color": "#d6d7d7",
          "fill-antialias": false,
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            WALL_DETAIL_START,
            0,
            WALL_DETAIL_END,
            1,
          ],
        },
      },
      before,
    );
    // Keep exact native polygons under the detail triangles at every zoom.
    // Tile quantization may collapse a slender display triangle; it must not
    // expose a false white opening through an otherwise complete floor face.
    map.moveLayer(layers[4], layers[0]);
    map.addLayer(
      {
        id: layers[1],
        type: "line",
        source: sources[1],
        paint: {
          "line-color": "#d6d7d7",
          "line-width": 0.6,
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            WALL_DETAIL_START,
            0,
            WALL_DETAIL_END,
            1,
          ],
        },
      },
      before,
    );
    map.addLayer(
      {
        id: layers[2],
        type: "line",
        source: sources[1],
        filter: ["==", ["get", "nativeRegionId"], ""],
        minzoom: WALL_DETAIL_START,
        paint: { "line-color": "#f58a16", "line-width": 3 },
      },
      before,
    );
    map.addLayer(
      {
        id: layers[3],
        type: "line",
        minzoom: WALL_DETAIL_START,
        source: sources[2],
        paint: {
          "line-color": "#8055bc",
          "line-width": 2,
          "line-dasharray": [2, 1.5],
        },
      },
      before,
    );
    map.addLayer(
      {
        id: layers[6],
        type: "fill",
        source: sources[5],
        paint: {
          "fill-color": "#c026a8",
          "fill-opacity": 0.28,
          "fill-antialias": false,
        },
      },
      before,
    );
    map.addLayer(
      {
        id: layers[7],
        type: "line",
        source: sources[6],
        paint: {
          "line-color": "#9d1588",
          "line-width": 2,
          "line-opacity": 0.9,
        },
      },
      before,
    );
    // Keep named-place labels, connector markers and route paths above floor tint.
    for (const layer of map.getStyle().layers ?? []) {
      if (
        layer.id === "project-label" ||
        /^project.*(?:route|portal|connector|entrance)/.test(layer.id)
      )
        map.moveLayer(layer.id);
    }
    return () => {
      if (!map.getStyle()) return;
      for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of sources) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, isLoaded]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    // The grey overview is backing for wall-width seams, not a cover over the
    // indoor native circulation tint when the prepared layer finishes later.
    if (map.getLayer("project-overview-fill") && map.getLayer(layers[0]))
      map.moveLayer("project-overview-fill", layers[4]);
    for (const id of [layers[0], layers[4]])
      if (map.getLayer(id))
        map.setPaintProperty(id, "fill-color", [
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
            ["==", ["get", "restricted"], true],
            ["get", "color"],
            ["==", ["get", "circulation"], true],
            ["get", "color"],
            ["in", ["get", "nativeRegionId"], ["literal", selectedRegions]],
            "#ffe09d",
            ["get", "color"],
          ],
        ]);
    if (map.getLayer(layers[2]))
      map.setFilter(layers[2], [
        "in",
        ["get", "nativeRegionId"],
        ["literal", selectedRegions],
      ]);
  }, [map, isLoaded, result, selectedRegions]);
  // Whole-floor geometry is uploaded once per result, never per selection:
  // each setData re-sends and re-indexes the collection in MapLibre's worker.
  // Selection only changes the paint/filter expressions above.
  useEffect(() => {
    if (!map || !isLoaded) return;
    [
      result?.fills,
      result?.outlines,
      result?.partitions,
      result?.overview,
      result?.walls,
    ].forEach((value, i) => {
      // Only the properties these layers read (see NATIVE_EXPLORE_PROPERTIES).
      const drawing = mapSourceFeatures(
        mapDrawingFeatures(value ?? empty),
        NATIVE_EXPLORE_PROPERTIES,
      );
      if (floorDiagnosticsEnabled())
        floorDiagnostic("source:upload", {
          id: sources[i],
          ...geoJsonStatistics(drawing),
        });
      (map.getSource(sources[i]) as GeoJSONSource | undefined)?.setData(
        drawing,
      );
    });
  }, [map, isLoaded, result]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    (map.getSource(sources[5]) as GeoJSONSource | undefined)?.setData(
      nativeMixedHallwayFeatures(result, mixedHallwayIds),
    );
    (map.getSource(sources[6]) as GeoJSONSource | undefined)?.setData(
      nativeMixedHallwayFeatures(result, mixedHallwayIds, "outlines"),
    );
  }, [map, isLoaded, result, mixedHallwayIds]);
  const focusMixedHallway = (id: string) => {
    setMixedHallwayId(id);
    if (!result || id === "all") return;
    const bounds = new LngLatBounds();
    for (const feature of nativeMixedHallwayFeatures(result, [id]).features)
      for (const point of feature.geometry.coordinates[0])
        bounds.extend(point as [number, number]);
    if (map && !bounds.isEmpty())
      fitProjectPlaceBounds(map, bounds, {
        maxZoom: 21,
        pitch: 0,
        duration: 650,
      });
  };
  useEffect(() => {
    if (!map || !isLoaded || !result) return;
    let active = true,
      clickSequence = 0;
    const click = async (event: MapMouseEvent) => {
      const request = ++clickSequence;
      // Keep route/connector controls and markers' own click handling intact.
      const hitLayers = map
        .queryRenderedFeatures(event.point)
        .filter((f) => nativeExploreControlHit(f.layer.id));
      if (hitLayers.length) return;
      const point = nativeEditPoint(data, [event.lngLat.lng, event.lngLat.lat]);
      const exactIds = exactHits.enabled
        ? new Set(await exactHits.hit(point))
        : undefined;
      if (!active || request !== clickSequence) return;
      const hits = nativeExplorePickRegions(
        data,
        result.regions.filter((r) =>
          exactIds
            ? exactIds.has(r.exactFaceId!)
            : pointInNativeArea(point, r.ringsFeet),
        ),
        point,
        building,
      );
      // Native levels can overlap in a campus view. Always offer named places,
      // rather than selecting a large merged component as a new destination.
      if (!hits.length) {
        setPicked([]);
        return;
      }
      setPicked(hits.map((r) => r.id));
      const choices = [
        ...new Map(
          hits
            .flatMap((r) => nativeExplorePlaces(data, r, building))
            .filter((r) => !isVisitorHallway(r))
            .map((r) => [r.key, r]),
        ).values(),
      ];
      if (choices.length === 1) onPick(choices[0].key);
    };
    map.on("click", click);
    return () => {
      active = false;
      map.off("click", click);
    };
  }, [map, isLoaded, result, data, building, selected, onPick, exactHits]);
  return (
    <aside
      className="project-native-explore-status"
      aria-label="Native floor map"
    >
      {result && !!mixedHallwayIssues.length && (
        <div className="project-mixed-hallway-review">
          <button
            className="project-mixed-hallway-toggle"
            aria-pressed={showMixedHallways}
            onClick={() => setShowMixedHallways((shown) => !shown)}
          >
            {showMixedHallways ? "Hide" : "Highlight"} mixed hallways ·{" "}
            {mixedHallwayIssues.length}
          </button>
          {showMixedHallways && (
            <>
              <p>
                Magenta marks connected native areas containing circulation and
                room or staff labels. It is an issue overlay, not an applied
                repair.
              </p>
              <label>
                Mixed hallway area
                <select
                  value={mixedHallwayId}
                  onChange={(event) => focusMixedHallway(event.target.value)}
                >
                  <option value="all">All mixed hallway areas</option>
                  {mixedHallwayIssues.map((issue) => (
                    <option key={issue.id} value={issue.id}>
                      {issue.hallways[0].number ||
                        `Building ${issue.hallways[0].building}`}{" "}
                      · {issue.hallways[0].name} ·{" "}
                      {issue.hallways.length + issue.otherPlaces.length} places
                      · #{issue.levelId}
                    </option>
                  ))}
                </select>
              </label>
              {mixedHallway && (
                <>
                  <p>
                    {mixedHallway.hallways.length} circulation labels ·{" "}
                    {mixedHallway.otherPlaces.length} other place labels ·{" "}
                    {mixedHallway.staffCount} staff labels.
                  </p>
                  <details>
                    <summary>Labels in this connected area</summary>
                    <ul>
                      {[
                        ...mixedHallway.hallways,
                        ...mixedHallway.otherPlaces,
                      ].map((room) => (
                        <li key={room.key}>
                          {room.number || `Building ${room.building}`} ·{" "}
                          {projectPlaceDisplayName(data, room)}
                          {room.access === "staff" ? " · Staff" : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </>
          )}
        </div>
      )}
      <details open={!!region || !current || !!current.error}>
        <summary>
          {current?.error
            ? result
              ? "Native wall detail unavailable"
              : "Native floor map unavailable"
            : !result
              ? "Loading native floor map…"
              : `Native floor map · ${result.regions.length} areas${result.warningCount ? ` · ${result.warningCount} warnings` : ""}`}
        </summary>
        {!current && (
          <p role="status">
            Loading this floor’s saved native outlines. Projects without a saved
            map trace walls and measured thresholds in the background.
          </p>
        )}
        {current?.complete === false && result && (
          <p role="status">Native floor ready. Loading wall detail…</p>
        )}
        {current?.error && (
          <>
            <p role="alert">
              {current.error}{" "}
              {result
                ? "The verified native floor remains visible. Retry to load its wall detail."
                : "Native floor geometry is hidden until the trace succeeds. Retry or open Native areas to review the source evidence."}
            </p>
            <button
              onClick={() =>
                usePreparedDisplay
                  ? onRetryPreparedDisplay?.()
                  : setRetry((n) => n + 1)
              }
            >
              Retry native floor map
            </button>
          </>
        )}
        {result && (
          <>
            <p>
              Native inside faces and floor openings. Dashed lines mark applied
              area boundaries. Door closures define areas; directions keep their
              physical door connections over the supported native floor.
            </p>
            <p>
              Names and room types use the old outlines as metadata hints. Green
              hallways and vestibules follow native faces. Unnamed enclosed
              areas appear grey. Areas without enclosure evidence stay hidden.
              Shared faces remain shared; their color does not establish
              separate rooms or public access. Hallways remain non-selectable.
            </p>
            {result.regions.some(
              (r) => (r.enclosureReviewAreaSquareFeet ?? 0) > 0.01,
            ) && (
              <p>
                {
                  result.regions.filter(
                    (r) => (r.enclosureReviewAreaSquareFeet ?? 0) > 0.01,
                  ).length
                }{" "}
                shared slabs still have unverified outer extents awaiting
                enclosure review. Their visible edges use native source
                evidence.
              </p>
            )}
            {result.regions.some((r) =>
              r.associations?.some((a) => a.method === "seed-fallback"),
            ) && (
              <p>
                Some names still use their original label position because no
                majority match was established; those associations need review.
              </p>
            )}
            {region && (
              <>
                <p>
                  Native level{regions.length > 1 ? "s" : ""} #
                  {[...new Set(regions.map((r) => r.levelId))].join(" / #")} ·{" "}
                  {places.length} named places in this connected area
                </p>
                {regions.some(
                  (r) => (r.enclosureReviewAreaSquareFeet ?? 0) > 0.01,
                ) && (
                  <p>
                    This area has an outer presentation edge awaiting enclosure
                    review; it is not a complete native enclosure.
                  </p>
                )}
                {places.length > 1 && (
                  <p>
                    Choose a named place. Shared outlines do not combine
                    destinations.
                  </p>
                )}
                {places.length > 1 && (
                  <label>
                    Find a named place in this area
                    <input
                      type="search"
                      value={placeQuery}
                      onChange={(event) => {
                        setPlaceQuery(event.target.value);
                        setPlaceLimit(20);
                      }}
                      placeholder="Room number, name or native level"
                    />
                  </label>
                )}
                <div className="project-native-explore-places">
                  {matchingPlaces.slice(0, placeLimit).map((r) => (
                    <button
                      key={r.key}
                      aria-pressed={selected === r.key}
                      onClick={() => onPick(r.key)}
                    >
                      {r.number} · {projectPlaceDisplayName(data, r)}
                      {regions.length > 1 ? ` · #${r.levelId}` : ""}
                    </button>
                  ))}
                </div>
                {!!places.length && !matchingPlaces.length && (
                  <p>No matching named places.</p>
                )}
                {matchingPlaces.length > placeLimit && (
                  <button onClick={() => setPlaceLimit((n) => n + 20)}>
                    Show more named places · {placeLimit} of{" "}
                    {matchingPlaces.length}
                  </button>
                )}
                {!places.length && <p>No named destination in this area.</p>}
                <button onClick={() => setPicked([])}>
                  Close native area places
                </button>
              </>
            )}
            {levelIds.some((id) => !result.levelIds.includes(id)) && (
              <p>
                Areas without a verified native trace stay hidden in this view.
              </p>
            )}
            {!!result.warnings.length && (
              <details>
                <summary>
                  Native evidence warnings · {result.warningCount}
                </summary>
                {result.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </details>
            )}
          </>
        )}
      </details>
    </aside>
  );
}
