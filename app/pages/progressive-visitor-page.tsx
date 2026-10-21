import { ProgressiveOverviewLayer as OverviewLayers } from "~/indoor-project/progressive-overview-layer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LngLatBounds,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import {
  MapCanvas,
  MapControls,
  MapProvider,
  useMap,
} from "~/components/map/map";
import { mapReady } from "~/components/map/map-ready";
import {
  ProgressiveVisitorClient,
  type VisitorOfflineProgress,
  type VisitorScopeView,
} from "~/indoor-project/progressive-visitor-client";
import { VisitorRenderStatus } from "~/indoor-project/visitor-render-status";
import {
  loadPublishedVisitorPlan,
  publishedVisitorPlanReceipt,
  type PublishedVisitorPlan,
} from "~/indoor-project/published-visitor-plan";
import { isVisitorHallway } from "~/indoor-project/place-discovery";
import { HospitalInstructionIcon } from "~/components/discovery-panel/hospital-route-preview";
import {
  progressiveInstructionPreview,
  progressivePlaceContext,
  progressivePlaceLabel,
  progressivePlaceScope,
  progressivePlaceSearchMatches,
} from "./progressive-instruction-preview";
import { PublishedVisitorPlanLayer } from "~/indoor-project/published-visitor-plan-layer";
import { emptyPreparedFloorSources } from "~/indoor-project/prepared-layer-lifetime";
import { prepareVisitorOfflineShell } from "~/indoor-project/visitor-offline-shell-client";
import {
  heavyWorkerSchedule,
  heavyWorkerName,
  trackedHeavyWorker,
  floorPreparationReady,
  routeRequestReady,
} from "~/indoor-project/heavy-worker-schedule";
import { ProgressiveRouteClient } from "~/indoor-project/progressive-route-client";
import { projectRouteLinkUrl } from "~/indoor-project/route-link";
import { routeSearch } from "~/utils/deep-link";
import {
  sameRoutePlace,
  visitorEndpointUnavailableReason,
  visitorRouteFailureMessage,
} from "~/indoor-project/visitor-route-state";
import { PreparedProjectMapLayers } from "~/indoor-project/map-layers";
import { nativeRampLayer } from "~/indoor-project/ramp-layer";
import { NativeExploreLayer } from "~/indoor-project/native-explore-layer";
import { registerVerifiedPreparedDisplay } from "~/indoor-project/floor-display-worker-bridge";
import { DEFAULT_LABEL_SETTINGS } from "~/indoor-project/label-settings";
import {
  loadBuildingOverview,
  saveBuildingOverview,
} from "~/indoor-project/building-overview";
import { ROOM_DETAIL_START } from "~/indoor-project/zoom-presentation";
import { geographicPoint, type ProjectRoute } from "~/indoor-project/routing";
import type { IndoorDataset } from "~/indoor-project/contract";
import type {
  ProgressiveOverview,
  ProgressiveShell,
} from "~/indoor-project/progressive-delivery";
import type { ProgressiveRouteSummary } from "~/indoor-project/progressive-route-summary";
import type { ProjectStep } from "~/indoor-project/navigation-steps";
import "./indoor-project.css";
import "./progressive-visitor.css";

const emptyStyle: StyleSpecification = {
  version: 8,
  glyphs: `${import.meta.env.BASE_URL}glyphs/{fontstack}/{range}.pbf`,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f4f3ef" },
    },
  ],
};
const blankStyles = { light: emptyStyle, dark: emptyStyle };
const streetStyles = {
  light: "https://tiles.openfreemap.org/styles/bright",
  dark: "https://tiles.openfreemap.org/styles/bright",
};
const noop = () => {};
type PlanState = {
  scopeKey: string;
  status: "loading" | "ready" | "missing" | "error";
  plan?: PublishedVisitorPlan;
  error?: string;
};
const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function waitForWorkerSlot(ready: () => boolean, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let stop = noop;
    const abort = () => {
      stop();
      reject(
        signal.reason ??
          new DOMException("Map operation cancelled.", "AbortError"),
      );
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    stop = heavyWorkerSchedule.when(ready, () => {
      signal.removeEventListener("abort", abort);
      resolve();
    });
  });
}
function Camera({
  overview,
  scopeKey,
  three,
  onZoom,
  focus,
  fitVersion,
}: {
  overview: ProgressiveOverview;
  scopeKey: string;
  three: boolean;
  onZoom: (zoom: number) => void;
  focus?: [number, number];
  fitVersion: number;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!mapReady(map, isLoaded)) return;
    const bounds = new LngLatBounds();
    const extend = (coordinates: unknown) => {
      if (!Array.isArray(coordinates)) return;
      if (
        typeof coordinates[0] === "number" &&
        typeof coordinates[1] === "number"
      )
        bounds.extend(coordinates as [number, number]);
      else for (const part of coordinates) extend(part);
    };
    for (const f of overview.geometry.features)
      if ("coordinates" in f.geometry) extend(f.geometry.coordinates);
    if (!bounds.isEmpty())
      map.fitBounds(bounds, { padding: 40, maxZoom: 17.4, duration: 0 });
    const changed = () => onZoom(map.getZoom());
    map.on("zoomend", changed);
    changed();
    return () => {
      map.off("zoomend", changed);
    };
    // A decoded detail asset does not move the camera back to overview zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, scopeKey, onZoom, fitVersion]);
  useEffect(() => {
    if (mapReady(map, isLoaded))
      map.easeTo({ pitch: three ? 55 : 0, duration: 300 });
  }, [map, isLoaded, three]);
  useEffect(() => {
    if (mapReady(map, isLoaded) && focus)
      map.easeTo({ center: focus, zoom: 20, duration: 300 });
  }, [map, isLoaded, focus]);
  return null;
}
function RouteOverlay({
  data,
  route,
  levels,
  three,
  physicalHeights,
  datumFeet,
}: {
  data: IndoorDataset;
  route: ProjectRoute | null;
  levels: number[];
  three: boolean;
  physicalHeights: boolean;
  datumFeet: number;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!mapReady(map, isLoaded)) return;
    const id = "project-visitor-route";
    if (three && physicalHeights && route) {
      // Reuse the established round ribbon and source endpoint heights. This
      // route-only dataset carries no ramp bodies and confers no route policy.
      const layer = nativeRampLayer(
        data,
        levels,
        "all",
        true,
        false,
        route,
        false,
        true,
        { physicalHeights: true, datumFeet },
      );
      const routeId = `${id}-3d`;
      map.addLayer({ ...layer, id: routeId });
      return () => {
        if (map.getStyle() && map.getLayer(routeId)) map.removeLayer(routeId);
      };
    }
    const geometry: FeatureCollection<Geometry> = {
      type: "FeatureCollection",
      features: (route?.paths ?? [])
        .filter((p) => p.levelIds.some((id) => levels.includes(id)))
        .map((path) => ({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: path.pointsFeet.map((point) =>
              geographicPoint(data, point),
            ),
          },
        })),
    };
    const existing = map.getSource(id) as GeoJSONSource | undefined;
    if (existing) existing.setData(geometry);
    else {
      map.addSource(id, { type: "geojson", data: geometry, tolerance: 0 });
      map.addLayer({
        id,
        type: "line",
        source: id,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#38b5eb", "line-width": 5 },
      });
    }
    map.moveLayer(id);
    return () => {
      if (!map.getStyle()) return;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, isLoaded, data, route, levels, three, physicalHeights, datumFeet]);
  return null;
}
function DetailedLayers({
  shell,
  current,
  relative,
  three,
  selected,
  onPick,
}: {
  shell: ProgressiveShell;
  current: VisitorScopeView;
  relative: boolean;
  three: boolean;
  selected: string;
  onPick: (key: string) => void;
}) {
  const basemapVisibility = useRef(new Map<string, string>());
  const { map } = useMap();
  useEffect(
    () => () => {
      if (map?.getStyle())
        emptyPreparedFloorSources(map, {
          type: "FeatureCollection",
          features: [],
        });
    },
    [map],
  );
  const display = current.display!;
  const nativeDisplay =
    shell.display.nativeIndoorEnvelopes ||
    display.nativeFaces.regions.length > 0;
  const data = useMemo<IndoorDataset>(
    () => ({
      format: "reviter-indoor",
      version: 1,
      generator: "reviter/indoor-pipeline-1",
      source: shell.source,
      alignment: shell.alignment,
      floors: shell.floors,
      nativeLevels: shell.nativeLevels,
      records: display.preparedFloor.presentation.display.records,
      nodes: current.context?.rampNodes ?? [],
      edges: current.context?.rampEdges ?? [],
      rampDisplay: current.context?.rampDisplay,
      walls: [],
      issues: [],
      report: shell.report,
    }),
    [shell, display, current.context],
  );
  const context = useMemo(
    () => ({
      ...shell.display,
      ...current.context!,
      visitorLabels: three
        ? display.preparedFloor.presentation.display.labels
        : current.context!.visitorLabels,
    }),
    [shell.display, current.context, display, three],
  );
  useMemo(
    () =>
      registerVerifiedPreparedDisplay(
        display.preparedFloor,
        display.nativeFaces,
        current.overview,
      ),
    [display, current.overview],
  );
  const ready = useCallback(() => {}, []);
  const pick = useCallback(
    (_: "area" | "edge", key: string) => onPick(key),
    [onPick],
  );
  const nativeFloorLevels = useMemo(
    () => (!three && nativeDisplay ? current.scope.levelIds : []),
    [three, nativeDisplay, current.scope.levelIds],
  );
  return (
    <>
      <PreparedProjectMapLayers
        prepared={display.preparedFloor}
        visitorContext={context}
        basemapVisibility={basemapVisibility}
        data={data}
        levelIds={current.scope.levelIds}
        building={current.scope.building}
        nativeFloorLevels={nativeFloorLevels}
        circulationOnly={false}
        network={false}
        roomThree={three}
        relativeHeights={relative}
        showPillars
        showPassThroughPlaces={false}
        showVestibuleDoors={false}
        showStructures={false}
        simplifyGeometry={false}
        labelSettings={DEFAULT_LABEL_SETTINGS}
        review={false}
        route={null}
        selected={selected}
        onPick={pick}
        onFitReady={ready}
      />
      {!three && nativeDisplay && (
        <NativeExploreLayer
          visitorOnly
          data={data}
          levelIds={current.scope.levelIds}
          building={current.scope.building}
          selected={selected}
          onPick={onPick}
          usePreparedDisplay
          preparedDisplay={display.nativeFaces}
        />
      )}
    </>
  );
}

export default function ProgressiveVisitorPage() {
  const [params] = useSearchParams();
  const configuredMap = !!params.get("manifest");
  const [url, setUrl] = useState(params.get("manifest") ?? "");
  const [client, setClient] = useState<ProgressiveVisitorClient>();
  const [current, setCurrent] = useState<VisitorScopeView>();
  const [scopeId, setScopeId] = useState("");
  const [zoom, setZoom] = useState(17);
  const [fitVersion, setFitVersion] = useState(0);
  const [requestedDetailScope, setRequestedDetailScope] = useState("");
  const [locked, setLocked] = useState(loadBuildingOverview);
  const [mode, setMode] = useState("2d");
  const [planState, setPlanState] = useState<PlanState>();
  const [planRetry, setPlanRetry] = useState(0);
  const [mapChoices, setMapChoices] = useState<string[]>([]);
  const [mapNotice, setMapNotice] = useState("");
  const [street, setStreet] = useState(false);
  const [error, setError] = useState("");
  const [scopeFailure, setScopeFailure] = useState<{
    scopeKey: string;
    detail: boolean;
    message: string;
  }>();
  const [scopeRetry, setScopeRetry] = useState(0);
  const [storageError, setStorageError] = useState("");
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState<VisitorOfflineProgress>();
  const [downloading, setDownloading] = useState(false);
  const offlineController = useRef<AbortController>();
  const openController = useRef<AbortController>();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [focus, setFocus] = useState<[number, number]>();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const directionsRef = useRef<HTMLDetailsElement>(null);
  const journeyRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const instructionRef = useRef<HTMLElement>(null);
  const startRef = useRef<HTMLSelectElement>(null);
  const endRef = useRef<HTMLSelectElement>(null);
  const [profile, setProfile] = useState<"public" | "accessible">("public");
  const [calculating, setCalculating] = useState(false);
  const [route, setRoute] = useState<ProjectRoute | null>(null);
  const [steps, setSteps] = useState<ProjectStep[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [routeSummary, setRouteSummary] = useState<ProgressiveRouteSummary>({
    transitPlaces: [],
  });
  const [routeMessage, setRouteMessage] = useState("");
  const routes = useMemo(
    () =>
      new ProgressiveRouteClient(() => {
        const name = heavyWorkerName("progressive-route");
        return trackedHeavyWorker(
          heavyWorkerSchedule,
          name,
          new Worker(
            new URL(
              "../indoor-project/progressive-route.worker.ts",
              import.meta.url,
            ),
            { type: "module", name },
          ),
        );
      }),
    [],
  );
  const routeWaiting = useRef<AbortController>();
  const scopeSequence = useRef(0);
  const mapEpoch = useRef(0);
  const routeEpoch = useRef(0);
  const resetDirections = useCallback(() => {
    if (journeyRef.current) journeyRef.current.open = true;
    routeEpoch.current++;
    routeWaiting.current?.abort();
    routes.cancelPending();
    setCalculating(false);
    setRoute(null);
    setSteps([]);
    setActiveStep(0);
    setRouteSummary({ transitPlaces: [] });
    setRouteMessage("");
    setMapNotice("");
  }, [routes]);
  const load = useCallback(
    async (manifestUrl: string, offlineOnly = false) => {
      mapEpoch.current++;
      resetDirections();
      offlineController.current?.abort();
      setDownloading(false);
      setClient(undefined);
      openController.current?.abort();
      const controller = new AbortController();
      openController.current = controller;
      setLoading(true);
      setError("");
      setScopeFailure(undefined);
      setCurrent(undefined);
      setPlanState(undefined);
      setMapChoices([]);
      setRoute(null);
      setSteps([]);
      setRouteSummary({ transitPlaces: [] });
      setOffline(undefined);
      routes.dispose();
      try {
        const next = await ProgressiveVisitorClient.open(manifestUrl, {
          signal: controller.signal,
          floorWorkerFactory: () => {
            const name = heavyWorkerName("progressive-floor");
            return trackedHeavyWorker(
              heavyWorkerSchedule,
              name,
              new Worker(
                new URL(
                  "../indoor-project/progressive-floor.worker.ts",
                  import.meta.url,
                ),
                { type: "module", name },
              ),
            );
          },
          offline: offlineOnly,
          onStorageError: (error) => setStorageError(message(error)),
        });
        if (controller.signal.aborted) {
          next.close();
          return;
        }
        setClient((old) => {
          old?.close();
          return next;
        });
        const scope = next.manifest.scopes.find(
          (entry) => entry.id === next.manifest.defaultScopeId,
        )!;
        setScopeId(scope.id);
        setCurrent({ scope, overview: next.initialOverview });
        setZoom(17);
        const link = new URLSearchParams(routeSearch());
        const endpoint = (name: string) => {
          const key = link.get(name) ?? "";
          const place = next.shell.records.find((record) => record.key === key);
          return place && !visitorEndpointUnavailableReason(place) ? key : "";
        };
        const linkedStart = endpoint("from");
        const linkedEnd = endpoint("to");
        setStart(linkedStart);
        setEnd(linkedEnd);
        setProfile(
          link.get("profile") === "accessible" || link.get("accessible") === "1"
            ? "accessible"
            : "public",
        );
        if (
          (link.get("from") && !linkedStart) ||
          (link.get("to") && !linkedEnd)
        )
          setRouteMessage(
            "A place in this directions link is unavailable. Choose a start and destination on this map.",
          );
        setSelected("");
        setFocus(undefined);
      } catch (error) {
        if (!isAbort(error)) setError(message(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [routes, resetDirections],
  );
  useEffect(() => {
    const initial = params.get("manifest");
    if (initial) void load(initial);
  }, [params, load]);
  useEffect(() => {
    if (!client) return;
    const link = new URLSearchParams(routeSearch());
    if ((link.has("from") || link.has("to")) && directionsRef.current)
      directionsRef.current.open = true;
  }, [client]);
  useEffect(() => {
    if (!client) return;
    const next = new URL(
      projectRouteLinkUrl({ start, end, mode: profile }, location.href),
    );
    const search = new URLSearchParams(routeSearch(next.href));
    search.set("manifest", client.manifestUrl);
    if (next.hash.startsWith("#/"))
      next.hash = `${next.hash.split("?")[0]}?${search}`;
    else next.search = search.toString();
    if (next.href !== location.href)
      history.replaceState(history.state, "", next.href);
  }, [client, start, end, profile]);
  useEffect(
    () => () => {
      client?.close();
    },
    [client],
  );
  useEffect(
    () => () => {
      mapEpoch.current++;
      routeEpoch.current++;
      routeWaiting.current?.abort();
      openController.current?.abort();
      offlineController.current?.abort();
      routes.dispose();
    },
    [routes],
  );
  const detail = !locked && zoom >= ROOM_DETAIL_START;
  const scopeKey = `${client?.manifest.revisionSha256 ?? ""}:${scopeId}`;
  useEffect(() => {
    setMapChoices([]);
    setMapNotice("");
  }, [scopeKey, mode, locked]);
  const selectedScope = client?.manifest.scopes.find(
    (scope) => scope.id === scopeId,
  );
  const planWanted =
    !locked &&
    mode === "2d" &&
    !!client &&
    !!selectedScope &&
    !!publishedVisitorPlanReceipt(client.manifest, selectedScope);
  const currentPlan = planState?.scopeKey === scopeKey ? planState : undefined;
  const visiblePlan =
    planWanted && currentPlan?.status === "ready"
      ? currentPlan.plan
      : undefined;
  const loadingPlan =
    planWanted && (!currentPlan || currentPlan.status === "loading");
  const showLegacyDetail =
    !visiblePlan &&
    !locked &&
    !!current?.display &&
    !!current.context &&
    (!planWanted || currentPlan?.status === "missing");
  useEffect(() => {
    if (!client || !selectedScope || !planWanted) return;
    const controller = new AbortController();
    setPlanState({ scopeKey, status: "loading" });
    void loadPublishedVisitorPlan(client.manifest, selectedScope, {
      manifestUrl: client.manifestUrl,
      signal: controller.signal,
      offline: client.offlineOnly,
      deferCacheWrite: true,
    })
      .then((plan) => {
        if (controller.signal.aborted) return;
        setPlanState({ scopeKey, status: plan ? "ready" : "missing", plan });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbort(error))
          setPlanState({ scopeKey, status: "error", error: message(error) });
      });
    return () => controller.abort();
  }, [client, selectedScope, planWanted, scopeKey, planRetry]);
  useEffect(() => {
    if (!visiblePlan) return;
    // An explicit visit to 3D may have decoded the large floor. Returning to
    // its checked 2D drawing releases that UI reference, retaining the route.
    setCurrent((old) =>
      old?.scope.id === visiblePlan.scopeId && old.display
        ? { scope: old.scope, overview: old.overview }
        : old,
    );
  }, [visiblePlan]);
  // Zooming out changes presentation, not the lifetime of an active floor.
  // Large floors cannot fit the bounded LRU; keep only the currently selected
  // floor in current, and do not restart its worker on threshold crossings.
  const requestDetail =
    !locked &&
    (detail || requestedDetailScope === scopeKey) &&
    (!planWanted || currentPlan?.status === "missing");
  const currentScopeFailure =
    scopeFailure?.scopeKey === scopeKey && scopeFailure.detail === requestDetail
      ? scopeFailure
      : undefined;
  useEffect(() => {
    if (detail) setRequestedDetailScope(scopeKey);
  }, [detail, scopeKey]);
  const shownCurrent = useMemo(
    () =>
      current && !showLegacyDetail && current.display
        ? { scope: current.scope, overview: current.overview }
        : current,
    [current, showLegacyDetail],
  );
  useEffect(() => {
    if (!client || !scopeId) return;
    const wanted = client.manifest.scopes.find((scope) => scope.id === scopeId);
    const sameScope =
      current?.scope.id === scopeId &&
      current.scope.display.descriptor.bindingSha256 ===
        wanted?.display.descriptor.bindingSha256;
    if (sameScope && (requestDetail ? !!current?.display : true)) {
      setLoading(false);
      return;
    }
    if (calculating) {
      setCurrent((old) => (old?.scope.id === scopeId ? old : undefined));
      return;
    }
    const controller = new AbortController();
    const sequence = ++scopeSequence.current;
    let release: (() => void) | undefined;
    setLoading(true);
    setError("");
    setScopeFailure(undefined);
    setCurrent((old) => (old?.scope.id === scopeId ? old : undefined));
    const run = async () => {
      if (requestDetail) {
        // Idle exact route graphs occupy GB-scale heaps. Retain the visible
        // route result, release its worker, and wait for actual teardown.
        routes.dispose();
        await waitForWorkerSlot(
          floorPreparationReady(heavyWorkerSchedule, true),
          controller.signal,
        );
        release = heavyWorkerSchedule.begin("floor");
      }
      return client.selectScope(scopeId, {
        detail: requestDetail,
        signal: controller.signal,
      });
    };
    run()
      .then((next) => {
        if (!controller.signal.aborted && sequence === scopeSequence.current)
          setCurrent(next);
      })
      .catch((error) => {
        if (
          !controller.signal.aborted &&
          sequence === scopeSequence.current &&
          !isAbort(error)
        )
          setScopeFailure({
            scopeKey,
            detail: requestDetail,
            message: message(error),
          });
      })
      .finally(() => {
        release?.();
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // Current is the result of this effect, not a trigger for a second request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, scopeId, requestDetail, calculating, routes, scopeRetry]);
  const matches = client
    ? progressivePlaceSearchMatches(client.shell.records, client.shell, search)
    : [];
  const selectedPlace = client?.shell.records.find(
    (record) => record.key === selected,
  );
  const startPlace = client?.shell.records.find(
    (record) => record.key === start,
  );
  const endPlace = client?.shell.records.find((record) => record.key === end);
  const unknownAccessEndpointRoles = [
    ...(startPlace?.access === "unknown" ? ["starting place"] : []),
    ...(endPlace?.access === "unknown" ? ["destination"] : []),
  ];
  let offlineDownloadLabel = "Download complete map for offline use";
  let offlineStatusText = "";
  if (downloading) {
    if (offline && offline.completedAssets >= offline.totalAssets) {
      offlineDownloadLabel = "Finishing offline setup…";
      offlineStatusText =
        "Finishing offline setup. Keep this page open until the map and app are saved.";
    } else {
      offlineDownloadLabel = "Downloading map…";
      offlineStatusText = "Downloading map…";
      if (offline)
        offlineStatusText = `Downloading map: ${offline.completedAssets} / ${offline.totalAssets} map files saved.`;
    }
  } else if (offline?.complete) {
    let directionsStatus =
      "You can request directions offline; the first route may take longer to prepare.";
    if (offline.directionsCache === "saved")
      directionsStatus = "Directions are saved for offline use.";
    offlineStatusText = `Complete map and app saved for offline use. ${directionsStatus}`;
  } else if (offline) {
    offlineDownloadLabel = "Resume map download";
    offlineStatusText = `Download paused. ${offline.completedAssets} / ${offline.totalAssets} map files saved. Resume to finish offline setup.`;
  }
  const mapChoicePlaces = (client?.shell.records ?? []).filter((record) =>
    mapChoices.includes(record.key),
  );
  const pickPlanPlaces = useCallback(
    (keys: string[]) => {
      setMapNotice("");
      const places = keys.filter((key) =>
        client?.shell.records.some(
          (record) => record.key === key && !isVisitorHallway(record),
        ),
      );
      if (places.length === 1) {
        setSelected(places[0]);
        setMapChoices([]);
      } else setMapChoices(places);
    },
    [client],
  );
  const selectedUnavailable = selectedPlace
    ? visitorEndpointUnavailableReason(selectedPlace)
    : undefined;
  const endpointPlaces = useMemo(
    () =>
      client?.shell.records.filter(
        (record) => !visitorEndpointUnavailableReason(record),
      ) ?? [],
    [client],
  );
  const selectEndpoint = (target: "start" | "end") => {
    if (!selectedPlace || selectedUnavailable) return;
    resetDirections();
    if (target === "start") setStart(selectedPlace.key);
    else setEnd(selectedPlace.key);
    if (directionsRef.current) directionsRef.current.open = true;
    (target === "start" ? endRef : startRef).current?.focus();
  };
  const scopeForPlace = (levelId: number, building: string) => {
    return progressivePlaceScope(
      client?.manifest.scopes ?? [],
      scopeId,
      levelId,
      building,
    );
  };
  const focusInstruction = (step: ProjectStep) => {
    const preview = progressiveInstructionPreview(
      client?.manifest.scopes ?? [],
      scopeId,
      step,
    );
    if (!preview) {
      setMapNotice(
        "The floor for this instruction is not available in this map publication.",
      );
      setFocus(undefined);
      return;
    }
    setMapNotice("");
    if (preview.scope.id !== scopeId) setScopeId(preview.scope.id);
    setFocus(preview.position);
  };
  const previewStep = (index: number) => {
    const step = steps[index];
    if (!step) return;
    setActiveStep(index);
    focusInstruction(step);
  };
  const locate = (key: string) => {
    const record = client?.shell.records.find((entry) => entry.key === key);
    if (!record || !client) return;
    const scope = scopeForPlace(record.levelId, record.building);
    if (!scope) {
      setError("This floor is not available in this map publication.");
      return;
    }
    setScopeId(scope.id);
    setMapNotice("");
    setSelected(key);
    setMapChoices([]);
    setFocus(
      record.geographic
        ? [record.geographic[0], record.geographic[1]]
        : undefined,
    );
    setSearch("");
  };
  const calculate = async () => {
    if (!client || !start || !end) return;
    if (sameRoutePlace(start, end)) {
      resetDirections();
      setRouteMessage(
        "Departure and destination are the same place. Choose another destination.",
      );
      return;
    }
    const requestEpoch = ++routeEpoch.current;
    const requestedMap = mapEpoch.current;
    const controller = new AbortController();
    routeWaiting.current = controller;
    let release: (() => void) | undefined;
    setCalculating(true);
    setRoute(null);
    setSteps([]);
    setActiveStep(0);
    setRouteSummary({ transitPlaces: [] });
    setMapNotice("");
    setRouteMessage("Loading and checking directions…");
    try {
      await waitForWorkerSlot(
        routeRequestReady(heavyWorkerSchedule, true),
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        requestEpoch !== routeEpoch.current ||
        requestedMap !== mapEpoch.current
      )
        return;
      release = heavyWorkerSchedule.begin("route");
      const result = await routes.request(
        client.manifestUrl,
        client.manifest,
        start,
        end,
        profile,
        {
          preferHttpBrotli: client.httpBrotliEnabled,
          offline: client.offlineOnly,
        },
      ).promise;
      if (
        requestEpoch !== routeEpoch.current ||
        requestedMap !== mapEpoch.current
      )
        return;
      setRoute(result.value.route);
      setSteps(result.steps);
      setActiveStep(0);
      setRouteSummary(result.summary);
      setRouteMessage(
        result.value.route
          ? `${Math.round(result.value.route.distanceMetres)} m`
          : visitorRouteFailureMessage(result.value.diagnostic, profile, false),
      );
      if (result.value.route) {
        if (journeyRef.current) journeyRef.current.open = false;
        locate(start);
        if (result.steps[0]) focusInstruction(result.steps[0]);
      }
    } catch (error) {
      if (
        !isAbort(error) &&
        requestEpoch === routeEpoch.current &&
        requestedMap === mapEpoch.current
      )
        setRouteMessage(message(error));
    } finally {
      release?.();
      if (
        requestEpoch === routeEpoch.current &&
        requestedMap === mapEpoch.current
      )
        setCalculating(false);
    }
  };
  const fullDownload = async () => {
    if (!client) return;
    const controller = new AbortController();
    offlineController.current = controller;
    const requestedMap = mapEpoch.current;
    setDownloading(true);
    setError("");
    try {
      const completeMap = await client.downloadOffline((progress) => {
        if (requestedMap === mapEpoch.current)
          setOffline({ ...progress, complete: false });
      }, controller.signal);
      for (const scope of client.manifest.scopes) {
        if (!publishedVisitorPlanReceipt(client.manifest, scope)) continue;
        const plan = await loadPublishedVisitorPlan(client.manifest, scope, {
          manifestUrl: client.manifestUrl,
          signal: controller.signal,
        });
        if (!plan)
          throw new Error(
            "A floor could not be saved. Retry the map download.",
          );
        const saved = await loadPublishedVisitorPlan(client.manifest, scope, {
          manifestUrl: client.manifestUrl,
          signal: controller.signal,
          offline: true,
        });
        if (!saved)
          throw new Error("A floor could not be verified in offline storage.");
      }
      await prepareVisitorOfflineShell({
        signal: controller.signal,
      });
      await client.verifyOfflineInventory(controller.signal);
      // Confirm coexistence after all other assets have consumed storage.
      for (const scope of client.manifest.scopes) {
        if (!publishedVisitorPlanReceipt(client.manifest, scope)) continue;
        const saved = await loadPublishedVisitorPlan(client.manifest, scope, {
          manifestUrl: client.manifestUrl,
          signal: controller.signal,
          offline: true,
        });
        if (!saved)
          throw new Error("A floor could not be verified in offline storage.");
      }
      if (requestedMap === mapEpoch.current) {
        setOffline(completeMap);
      }
    } catch (error) {
      if (!isAbort(error) && requestedMap === mapEpoch.current)
        setError(message(error));
    } finally {
      if (requestedMap === mapEpoch.current) setDownloading(false);
    }
  };
  const shell = client?.shell;
  const routeData = useMemo<IndoorDataset | undefined>(
    () =>
      shell
        ? {
            format: "reviter-indoor",
            version: 1,
            generator: "reviter/indoor-pipeline-1",
            source: shell.source,
            alignment: shell.alignment,
            floors: shell.floors,
            nativeLevels: shell.nativeLevels,
            records: [],
            nodes: [],
            edges: [],
            walls: [],
            issues: [],
            report: shell.report,
          }
        : undefined,
    [shell],
  );
  const legacyLoadingMessage = current
    ? "Preparing interactive room details… You can keep zooming."
    : "Loading map…";
  const instruction = steps[activeStep];
  const instructionPreview = instruction
    ? progressiveInstructionPreview(
        client?.manifest.scopes ?? [],
        scopeId,
        instruction,
      )
    : undefined;
  let instructionWarning =
    "Check permission to pass through rooms on this route.";
  if (route && route.unknownAccessAreas.length > 0)
    instructionWarning = "Public access is unknown for parts of this route.";
  else if (route && route.unknownAccessibilityEdges > 0)
    instructionWarning =
      "Step-free access is unconfirmed for parts of this route.";

  useEffect(() => {
    if (!route || steps.length === 0) return;
    if (directionsRef.current) directionsRef.current.open = true;
    const panel = panelRef.current;
    const instruction = instructionRef.current;
    if (panel && instruction)
      panel.scrollTop +=
        instruction.getBoundingClientRect().top -
        panel.getBoundingClientRect().top -
        panel.clientTop;
  }, [route, steps.length]);

  return (
    <main className="progressive-visitor">
      <header>
        <h1>UNBC campus map</h1>
        {configuredMap && (
          <button
            onClick={() => void load(url, true)}
            disabled={!url || loading}
          >
            Open saved map
          </button>
        )}
        <details
          className="visitor-map-tools"
          open={configuredMap ? undefined : true}
        >
          <summary>Map tools</summary>
          <div className="visitor-map-tool-content">
            <Link to="/projects/indoor">Indoor maps</Link>
            <a
              href={`${import.meta.env.BASE_URL}index.html#/projects/indoor?package=%2Fdata%2Funbc-full%2Fproject.json&manifest=%2Fdata%2Funbc%2Fmanifest.json&view=2d`}
            >
              Full OpenIndoorMaps
            </a>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void load(url);
              }}
            >
              <label>
                Map manifest URL
                <input
                  aria-label="Map manifest URL"
                  type="url"
                  required
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://…/manifest.json"
                />
              </label>
              <button type="submit">Open map</button>
              {!configuredMap && (
                <button
                  type="button"
                  onClick={() => void load(url, true)}
                  disabled={!url}
                >
                  Open saved map
                </button>
              )}
            </form>
          </div>
        </details>
      </header>
      {(error || currentScopeFailure) && (
        <div role="alert">
          {error && <p>{error}</p>}
          {currentScopeFailure && <p>{currentScopeFailure.message}</p>}
          {!client && (
            <button onClick={() => void load(url)} disabled={loading || !url}>
              Retry loading map
            </button>
          )}
          {currentScopeFailure && (
            <button
              onClick={() => setScopeRetry((value) => value + 1)}
              disabled={loading}
            >
              Retry selected floor
            </button>
          )}
        </div>
      )}
      {storageError && (
        <p role="status">Offline storage is unavailable: {storageError}</p>
      )}
      {client && (
        <div className="visitor-layout">
          <aside ref={panelRef} className="visitor-panel">
            {client.manifest.unavailableScopes.length > 0 && (
              <p role="status">
                Some floors are unavailable in this publication. Only the listed
                floors can be viewed; a complete offline map is unavailable.
              </p>
            )}
            <label>
              Floor
              <select
                aria-label="Floor"
                value={scopeId}
                onChange={(event) => {
                  setScopeId(event.target.value);
                  setSelected("");
                  setMapChoices([]);
                  setFocus(undefined);
                }}
              >
                {client.manifest.scopes.map((scope) => (
                  <option value={scope.id} key={scope.id}>
                    {scope.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Map view
              <select
                aria-label="Map view"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value);
                  if (event.target.value !== "2d")
                    setRequestedDetailScope(scopeKey);
                }}
              >
                <option value="2d">2D</option>
                <option value="3d">3D</option>
                <option value="relative">Native heights 3D</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={!locked}
                onChange={(event) => {
                  setLocked(!event.target.checked);
                  saveBuildingOverview(!event.target.checked);
                }}
              />{" "}
              Reveal rooms when zooming in
            </label>
            <label>
              <input
                type="checkbox"
                checked={street}
                onChange={(event) => setStreet(event.target.checked)}
              />{" "}
              Street basemap (online)
            </label>
            <label>
              Find a place
              <input
                aria-label="Find a place"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Room, name, building or floor"
              />
            </label>
            {search.trim() && (
              <ul className="visitor-search">
                {matches.length === 0 && <li>No matching places.</li>}
                {matches.map((record) => (
                  <li key={record.key}>
                    <button onClick={() => locate(record.key)}>
                      {progressivePlaceLabel(record, client.shell)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedPlace && (
              <section
                className="visitor-place-card"
                aria-label="Selected place"
              >
                <p
                  data-testid="selected-place"
                  data-place-key={selectedPlace.key}
                >
                  <strong>
                    {selectedPlace.number} {selectedPlace.name}
                  </strong>
                </p>
                <p
                  className="visitor-place-context"
                  data-testid="selected-place-context"
                >
                  {progressivePlaceContext(selectedPlace, client.shell)}
                </p>
                {selectedUnavailable ? (
                  <p>{selectedUnavailable}</p>
                ) : (
                  <div className="visitor-place-actions">
                    <button onClick={() => selectEndpoint("start")}>
                      Start here
                    </button>
                    <button onClick={() => selectEndpoint("end")}>
                      Directions to here
                    </button>
                  </div>
                )}
              </section>
            )}
            {mapChoicePlaces.length > 1 && (
              <section
                className="visitor-map-choices"
                aria-label="Choose a place"
              >
                <p>Choose the place you mean:</p>
                <ul>
                  {mapChoicePlaces.map((record) => (
                    <li key={record.key}>
                      <button onClick={() => locate(record.key)}>
                        {progressivePlaceLabel(record, client.shell)}
                      </button>
                    </li>
                  ))}
                </ul>
                <button onClick={() => setMapChoices([])}>Close choices</button>
              </section>
            )}
            <details ref={directionsRef}>
              <summary>Directions</summary>
              {instruction && routeData && (
                <section
                  ref={instructionRef}
                  className="visitor-instruction"
                  aria-label="Current direction"
                >
                  <div aria-live="polite" aria-atomic="true">
                    <p
                      className="visitor-step-progress"
                      data-testid="route-step-progress"
                    >
                      Step {activeStep + 1} of {steps.length}
                    </p>
                    <p
                      className="visitor-step-context"
                      data-testid="route-step-context"
                      data-level-id={instruction.levelId}
                      data-building={instruction.building}
                    >
                      {progressivePlaceContext(instruction, client.shell)}
                    </p>
                    <div className="visitor-current-instruction">
                      <span aria-hidden="true">
                        <HospitalInstructionIcon instruction={instruction} />
                      </span>
                      <h2 data-testid="current-instruction">
                        {instruction.message}
                      </h2>
                    </div>
                  </div>
                  {!instructionPreview && (
                    <p
                      role="status"
                      data-testid="instruction-floor-unavailable"
                    >
                      The floor for this instruction is not available in this
                      map publication. The map remains on the previous floor.
                    </p>
                  )}
                  <p className="visitor-manual-preview">
                    Manual preview. Your position is not tracked.
                  </p>
                  <div className="visitor-step-controls">
                    <button
                      aria-label="Previous step"
                      disabled={activeStep === 0}
                      onClick={() => previewStep(activeStep - 1)}
                    >
                      Previous
                    </button>
                    <button
                      aria-label="Next step"
                      disabled={activeStep >= steps.length - 1}
                      onClick={() => previewStep(activeStep + 1)}
                    >
                      Next
                    </button>
                  </div>
                  {route &&
                    (route.unknownAccessAreas.length > 0 ||
                      route.unknownAccessibilityEdges > 0 ||
                      routeSummary.transitPlaces.length > 0) && (
                      <p
                        className="visitor-preview-warning"
                        data-testid="instruction-warning-notice"
                      >
                        {instructionWarning} Review the warnings below.
                      </p>
                    )}
                  <details
                    className="visitor-all-steps"
                    data-testid="visitor-all-steps"
                  >
                    <summary>All steps</summary>
                    <ol aria-label="All directions steps">
                      {steps.map((step, index) => (
                        <li key={index}>
                          <button
                            aria-current={
                              index === activeStep ? "step" : undefined
                            }
                            onClick={() => previewStep(index)}
                          >
                            {step.message}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </details>
                </section>
              )}
              <details ref={journeyRef} open data-testid="visitor-journey">
                <summary>{route ? "Change journey" : "Choose journey"}</summary>
                <p>
                  Choose a room or entrance you can identify as your starting
                  place. Your position is not tracked; you advance the
                  directions yourself.
                </p>
                <p>
                  Use Find a place above, then choose Start here or Directions
                  to here.
                </p>
                <label>
                  From
                  <select
                    ref={startRef}
                    aria-label="From"
                    value={start}
                    onChange={(event) => {
                      resetDirections();
                      setStart(event.target.value);
                    }}
                  >
                    {<option value="">Choose starting place</option>}
                    {endpointPlaces.map((record) => (
                      <option key={record.key} value={record.key}>
                        {progressivePlaceLabel(record, client.shell)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="visitor-endpoint-focus"
                  disabled={!startPlace?.geographic || loading}
                  onClick={() => locate(start)}
                >
                  Show start on map
                </button>
                <label>
                  To
                  <select
                    ref={endRef}
                    aria-label="To"
                    value={end}
                    onChange={(event) => {
                      resetDirections();
                      setEnd(event.target.value);
                    }}
                  >
                    <option value="">Choose destination</option>
                    {endpointPlaces.map((record) => (
                      <option key={record.key} value={record.key}>
                        {progressivePlaceLabel(record, client.shell)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="visitor-endpoint-focus"
                  disabled={!endPlace?.geographic || loading}
                  onClick={() => locate(end)}
                >
                  Show destination on map
                </button>
                {unknownAccessEndpointRoles.length > 0 && (
                  <p
                    className="project-access-note"
                    role="status"
                    data-testid="journey-unknown-endpoint-access"
                  >
                    Public access has not been confirmed for your{" "}
                    {unknownAccessEndpointRoles.join(" and ")}. Check with the
                    venue before following these directions.
                  </p>
                )}
                {profile === "accessible" && (
                  <p>
                    Uses confirmed step-free connections. Some places may have
                    no available route.
                  </p>
                )}
                <button
                  disabled={!start && !end}
                  onClick={() => {
                    resetDirections();
                    setStart(end);
                    setEnd(start);
                  }}
                >
                  Swap places
                </button>
                <label>
                  Route preference
                  <select
                    aria-label="Route preference"
                    value={profile}
                    onChange={(event) => {
                      resetDirections();
                      setProfile(event.target.value as "public" | "accessible");
                    }}
                  >
                    <option value="public">Walking</option>
                    <option value="accessible">Step-free</option>
                  </select>
                </label>
                <button
                  onClick={() => void calculate()}
                  disabled={!start || !end || calculating || loading}
                >
                  Get directions
                </button>
                {calculating && (
                  <button
                    onClick={() => {
                      resetDirections();
                      setRouteMessage("Directions cancelled.");
                    }}
                  >
                    Cancel directions
                  </button>
                )}
              </details>
              <p role="status" aria-live="polite" data-testid="route-status">
                {routeMessage}
              </p>
              {route && route.unknownAccessAreas.length > 0 && (
                <p
                  className="project-access-note"
                  data-testid="route-unknown-access"
                >
                  Public access is unknown for {route.unknownAccessAreas.length}{" "}
                  areas.
                </p>
              )}
              {route && route.unknownAccessibilityEdges > 0 && (
                <p
                  className="project-access-note"
                  data-testid="route-unknown-accessibility"
                >
                  Step-free access is unconfirmed for{" "}
                  {route.unknownAccessibilityEdges}{" "}
                  {route.unknownAccessibilityEdges === 1
                    ? "connection"
                    : "connections"}
                  .
                </p>
              )}
              {route && routeSummary.transitPlaces.length > 0 && (
                <p
                  className="project-access-note"
                  data-testid="route-transit-places"
                >
                  This route passes through{" "}
                  {routeSummary.transitPlaces
                    .map((place) => place.label)
                    .join(", ")}
                  . Check that these rooms permit passage.
                </p>
              )}
            </details>
            <button
              onClick={() => void fullDownload()}
              disabled={
                downloading || client.manifest.unavailableScopes.length > 0
              }
            >
              {offlineDownloadLabel}
            </button>
            {downloading && (
              <button onClick={() => offlineController.current?.abort()}>
                Pause download
              </button>
            )}
            {(downloading || offline) && (
              <p role="status" data-testid="offline-status">
                {offlineStatusText}
              </p>
            )}
            {client.fromCachedManifest && <p>Using the saved map revision.</p>}
          </aside>
          <section
            className="visitor-map"
            aria-label="Campus map"
            data-floor-detail={String(!!visiblePlan || !!shownCurrent?.display)}
            data-floor-plan={String(!!visiblePlan)}
            data-zoom={zoom.toFixed(2)}
            data-detail-requested={String(requestDetail)}
          >
            {current && (
              <MapProvider
                key={`${client.manifest.revisionSha256}:${current.scope.id}`}
                options={{
                  center: shell!.alignment.originGeographic,
                  zoom: 17,
                  maxZoom: 23,
                  canvasContextAttributes: { antialias: true },
                }}
                styles={street ? streetStyles : blankStyles}
              >
                <MapCanvas>
                  {visiblePlan && (
                    <PublishedVisitorPlanLayer
                      plan={visiblePlan}
                      selected={selected}
                      onPick={pickPlanPlaces}
                      onUnavailableConnector={setMapNotice}
                    />
                  )}
                  {showLegacyDetail && (
                    <DetailedLayers
                      shell={shell!}
                      current={current}
                      three={mode !== "2d"}
                      relative={mode === "relative"}
                      selected={selected}
                      onPick={setSelected}
                    />
                  )}
                  {!visiblePlan && !showLegacyDetail && (
                    <OverviewLayers
                      overview={current.overview}
                      origin={shell!.alignment.originGeographic}
                      revealRooms={!locked}
                      shell={shell}
                    />
                  )}
                  <Camera
                    overview={current.overview}
                    scopeKey={current.scope.id}
                    three={mode !== "2d"}
                    onZoom={setZoom}
                    focus={focus}
                    fitVersion={fitVersion}
                  />
                  <RouteOverlay
                    key={String(!!shownCurrent?.display)}
                    data={routeData!}
                    route={route}
                    levels={current.scope.levelIds}
                    three={mode !== "2d"}
                    physicalHeights={
                      shell!.display.nativeIndoorEnvelopes ||
                      mode === "relative"
                    }
                    datumFeet={
                      current.context?.floorDatumFeet ??
                      Math.min(
                        ...shell!.nativeLevels
                          .filter((level) =>
                            current.scope.levelIds.includes(level.id),
                          )
                          .map((level) => level.elevationFeet),
                      )
                    }
                  />
                  <VisitorRenderStatus
                    current={shownCurrent!}
                    plan={visiblePlan}
                    mode={mode}
                    assetLoading={loading || loadingPlan}
                  />
                  <MapControls position="top-right" />
                  <div className="visitor-camera-tools">
                    <button
                      type="button"
                      onClick={() => setFitVersion((value) => value + 1)}
                    >
                      Fit campus
                    </button>
                  </div>
                </MapCanvas>
              </MapProvider>
            )}
            {(loading || loadingPlan) && (
              <div role="status" className="visitor-loading">
                {loadingPlan ? "Loading floor…" : legacyLoadingMessage}
              </div>
            )}
            {planWanted && currentPlan?.status === "error" && (
              <div role="alert" className="visitor-loading">
                <p>The floor could not be loaded: {currentPlan.error}</p>
                <button onClick={() => setPlanRetry((value) => value + 1)}>
                  Retry floor
                </button>
              </div>
            )}
            {mapNotice && (
              <div role="status" className="visitor-loading visitor-map-notice">
                <p>{mapNotice}</p>
                <button onClick={() => setMapNotice("")}>Close notice</button>
              </div>
            )}
            {!current && !loading && <p>Choose a published map to begin.</p>}
          </section>
        </div>
      )}
      {!client && loading && <p role="status">Loading map overview…</p>}
    </main>
  );
}
