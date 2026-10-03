import {
  NativeStairReview,
  NativeStairInspector,
} from "../indoor-project/native-stair-review";
import { sourceStairId } from "../indoor-project/source-stairs";
import { hasReviewedThroughNavigation } from "../indoor-project/through-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapProvider,
  MapCanvas,
  MapControls,
  useMap,
} from "~/components/map/map";
import {
  ProjectMapLayers,
  ProjectRouteFocus,
} from "~/indoor-project/map-layers";
import {
  resolveRouteArrival,
  loadArrivalMode,
  saveArrivalMode,
} from "~/indoor-project/route-arrival";
import { ProjectRouteArrivalMenu } from "~/indoor-project/route-arrival-menu";
import { ProjectNavigation } from "~/indoor-project/project-navigation";
import { isProjectDestination } from "~/indoor-project/routing-graph";
import {
  loadLabelSettings,
  saveLabelSettings,
} from "~/indoor-project/label-settings";
import {
  floorBadge,
  ProjectFloorSelector,
} from "~/indoor-project/floor-selector";
import { sourceConnectorReview } from "~/indoor-project/connector-review";
import { ConnectorEditor } from "~/indoor-project/connector-editor";
import { CampusFloorEditor } from "~/indoor-project/campus-floor-editor";
import { VisitorMetadataEditor } from "~/indoor-project/visitor-metadata-editor";
import { ProjectModelLayer } from "~/indoor-project/model-layer";
import { geographicPoint, findProjectRoute } from "~/indoor-project/routing";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
  isViewerProject,
  persistProject,
  restoreProject,
  reviewArea,
  reviewEdge,
  type IndoorProject,
} from "~/indoor-project/package";
import { MapEditorPanel } from "~/indoor-project/map-editor-panel";
import {
  MapAnnotationLayer,
  type AnnotationTool,
} from "~/indoor-project/map-annotation-layer";
import {
  moveMapAnnotation,
  setMapAnnotations,
  setMapLocations,
  locationAnnotations,
  editorVisitorDataset,
  setBasemapBuildings,
  type EditPoint,
} from "~/indoor-project/map-edits";
import {
  WallReviewLayer,
  type WallCapture,
} from "~/indoor-project/wall-review-layer";
import { WallReviewControls } from "~/indoor-project/wall-review-controls";
import { WallReviewPanel } from "~/indoor-project/wall-review-panel";
import { wallReviewContext } from "~/indoor-project/wall-review";
import { ReviewPinLayer } from "~/indoor-project/review-pin-layer";
import { NativeRampReview } from "~/indoor-project/native-ramp-review";
import {
  ReviewPinControls,
  ReviewPinPanel,
} from "~/indoor-project/review-pin-panel";
import {
  nearbyPinWall,
  preserveReviewPins,
  setReviewPins,
  type ReviewPin,
} from "~/indoor-project/review-pins";
import {
  connectionName,
  connectionAreaName,
  connectionLevelChange,
  rampSourceSlope,
} from "~/indoor-project/connection-presentation";
import {
  defaultEditorAppearance,
  type EditorAppearance,
} from "~/indoor-project/editor-options";
import { LocationDetails } from "~/indoor-project/location-details";
import {
  defaultBasemapBuildings,
  type BasemapBuildingSettings,
  type BasemapAreaShape,
} from "~/indoor-project/basemap-buildings";
import {
  BasemapBuildingLayer,
  BasemapAreaDrawing,
} from "~/indoor-project/basemap-building-layer";
import { routeSearch } from "~/utils/deep-link";
import "./indoor-project.css";

const noPins: ReviewPin[] = [];
const noAnnotations: NonNullable<
  IndoorProject["rooms"]["mapEdits"]
>["annotations"] = [];

const mapStyles = {
  light: "https://tiles.openfreemap.org/styles/bright",
  dark: "https://tiles.openfreemap.org/styles/bright",
};
function ViewPitch({ three }: { three: boolean }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!isLoaded) return;
    const pitch = three ? 55 : 0;
    if (map && Math.abs(map.getPitch() - pitch) > 0.1)
      map.easeTo({ pitch, duration: 600 });
  }, [map, three, isLoaded]);
  return null;
}
function EditorFocus({
  data,
  focus,
}: {
  data: IndoorProject["dataset"];
  focus: {
    point: EditPoint;
    nonce: number;
    zoom?: number;
    pitch?: number;
  } | null;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (map && isLoaded && focus)
      map.easeTo({
        center: geographicPoint(data, focus.point),
        zoom: focus.zoom ?? 20.5,
        ...(focus.pitch === undefined ? {} : { pitch: focus.pitch }),
        duration: 450,
      });
  }, [map, isLoaded, focus, data.alignment]);
  return null;
}
export default function IndoorProjectPage() {
  const [review, setReview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [wallMode, setWallMode] = useState(false);
  const [wallId, setWallId] = useState("");
  const [pinId, setPinId] = useState("");
  const [placingPin, setPlacingPin] = useState(false);
  const [movingPin, setMovingPin] = useState(false);
  const [pinLevel, setPinLevel] = useState(0);
  const wallCapture = useRef<WallCapture>();
  const wallFit = useRef<() => void>();
  const pinFit = useRef<() => void>();
  const pinFitReady = useCallback((fit: () => void) => {
    pinFit.current = fit;
  }, []);
  const wallFitReady = useCallback((fit: () => void) => {
    wallFit.current = fit;
  }, []);
  const captureReady = useCallback((capture: WallCapture) => {
    wallCapture.current = capture;
  }, []);
  const [editTool, setEditTool] = useState<AnnotationTool>("select");
  const [annotationId, setAnnotationId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [editorAppearance, setEditorAppearance] = useState<EditorAppearance>(
    defaultEditorAppearance,
  );
  const [editorFocus, setEditorFocus] = useState<{
    point: EditPoint;
    nonce: number;
    zoom?: number;
    pitch?: number;
  } | null>(null);
  const [draftPoints, setDraftPoints] = useState<EditPoint[]>([]);
  const [vertexIndex, setVertexIndex] = useState(0);
  const [past, setPast] = useState<IndoorProject[]>([]);
  const [future, setFuture] = useState<IndoorProject[]>([]);
  const [dirty, setDirty] = useState(false);
  const [drawingBasemapArea, setDrawingBasemapArea] = useState(false);
  const [basemapAreaShape, setBasemapAreaShape] =
    useState<BasemapAreaShape>("rectangle");
  const [arrivalMode, setArrivalMode] = useState(loadArrivalMode);
  useEffect(() => saveArrivalMode(arrivalMode), [arrivalMode]);
  const [labelSettings, setLabelSettings] = useState(loadLabelSettings);
  useEffect(() => saveLabelSettings(labelSettings), [labelSettings]);
  const [project, setProject] = useState<IndoorProject | null>(null),
    [message, setMessage] = useState(
      "Import a prepared Reviter project ZIP to begin.",
    ),
    [busy, setBusy] = useState(false),
    [download, setDownload] = useState<{
      url: string;
      name: string;
      kind?: "viewer";
    } | null>(null),
    [floorId, setFloorId] = useState(""),
    [building, setBuilding] = useState("all"),
    [selected, setSelected] = useState(""),
    [edgeId, setEdgeId] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [routePickTarget, setRoutePickTarget] = useState<"start" | "end" | null>(
      null,
    ),
    [mode, setMode] = useState<"public" | "accessible">("public"),
    [circulation, setCirculation] = useState(false),
    [network, setNetwork] = useState(false),
    [showPillars, setShowPillars] = useState(false),
    [showPassThroughPlaces, setShowPassThroughPlaces] = useState(false),
    [showVestibuleDoors, setShowVestibuleDoors] = useState(false),
    [showStructures, setShowStructures] = useState(false),
    [simplifyGeometry, setSimplifyGeometry] = useState(true),
    [view, setView] = useState<"2d" | "3d" | "relative" | "native">(() =>
      typeof globalThis !== "undefined" &&
      new URLSearchParams(routeSearch()).get("view") === "relative"
        ? "relative"
        : "3d",
    ),
    [modelStatus, setModelStatus] = useState(""),
    [search, setSearch] = useState(""),
    [name, setName] = useState(""),
    [notes, setNotes] = useState(""),
    [access, setAccess] = useState<"public" | "staff" | "unknown">("unknown"),
    [walkable, setWalkable] = useState(true),
    [throughNavigation, setThroughNavigation] = useState(false),
    [enabled, setEnabled] = useState(true),
    [accessible, setAccessible] = useState<"yes" | "no" | "unknown">("unknown");
  const latestProject = useRef(project);
  latestProject.current = project;
  const routePickState = useRef({ target: routePickTarget, start, end });
  routePickState.current = { target: routePickTarget, start, end };
  const input = useRef<HTMLInputElement>(null),
    fit = useRef<(includeSelection?: boolean) => void>(),
    fitSelection = useRef(true),
    fitted = useRef(false);
  const accept = useCallback((p: IndoorProject) => {
    setDrawingBasemapArea(false);
    setDownload(null);
    setPast([]);
    setFuture([]);
    setDirty(false);
    setAnnotationId("");
    setLocationId("");
    setEditorFocus(null);
    setEditorAppearance(defaultEditorAppearance);
    setWallId("");
    setWallMode(false);
    setPinId("");
    setPlacingPin(false);
    setMovingPin(false);
    setDraftPoints([]);
    setEditTool("select");
    setView(
      new URLSearchParams(routeSearch()).get("view") === "relative"
        ? "relative"
        : "3d",
    );
    if (isViewerProject(p)) {
      setReview(false);
      setEditing(false);
    }
    setProject(p);
    setFloorId(
      p.dataset.floors.find((f) =>
        /(?:^|\b)(?:floor|level|lvl)\s*1(?:\b|$)/i.test(f.name),
      )?.id ??
        p.dataset.floors[0]?.id ??
        "",
    );
    setBuilding("all");
    setSelected("");
    setEdgeId("");
    setStart("");
    setRoutePickTarget(null);
    setEnd("");
    fitSelection.current = true;
    fitted.current = false;
    setMessage(
      `Loaded ${p.rooms.annotations.filter((r) => r.status !== "deleted").length.toLocaleString()} source areas · ${p.dataset.records.length.toLocaleString()} mapped locations · ${p.dataset.nodes.length.toLocaleString()} graph nodes · ${p.dataset.issues.length.toLocaleString()} review items.`,
    );
  }, []);
  useEffect(() => {
    return () => {
      if (download) URL.revokeObjectURL(download.url);
    };
  }, [download]);
  useEffect(() => {
    let active = true;
    void restoreProject()
      .then(async (bytes) => {
        if (bytes && active) {
          const p = await readIndoorProject(bytes);
          if (active) accept(p);
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            "Saved project could not be restored. Import a prepared ZIP.",
          );
      });
    return () => {
      active = false;
    };
  }, [accept]);
  async function load(file: File) {
    setBusy(true);
    setMessage("Validating package hashes and loading floor maps…");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = await readIndoorProject(bytes);
      const next = preserveReviewPins(loaded, latestProject.current);
      const saved = next === loaded ? bytes : await exportIndoorProject(next);
      accept(next);
      try {
        await persistProject(saved);
      } catch {
        setMessage(
          "Project loaded. Browser storage is unavailable; export reviews to preserve them.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const commit = useCallback(
    (next: IndoorProject) => {
      if (!project) return;
      setPast((history) => [...history.slice(-14), project]);
      setFuture([]);
      setProject(next);
      setDownload(null);
      setDirty(true);
      setMessage(
        "Edits applied. Export reviewed project to save changes and download a backup.",
      );
    },
    [project],
  );
  const basemapBuildings =
    project?.rooms.mapEdits?.basemapBuildings ?? defaultBasemapBuildings;
  const changeBasemapBuildings = useCallback(
    (settings: BasemapBuildingSettings) => {
      if (project) commit(setBasemapBuildings(project, settings));
    },
    [project, commit],
  );
  const finishBasemapArea = useCallback(
    (pointsFeet: EditPoint[]) => {
      const number =
        1 +
        Math.max(
          0,
          ...basemapBuildings.areas.map(
            (a) => Number(a.name.match(/^Area (\d+)$/)?.[1]) || 0,
          ),
        );
      changeBasemapBuildings({
        ...basemapBuildings,
        mode: "areas",
        areas: [
          ...basemapBuildings.areas,
          { id: crypto.randomUUID(), name: `Area ${number}`, pointsFeet },
        ],
      });
      setDrawingBasemapArea(false);
    },
    [basemapBuildings, changeBasemapBuildings],
  );
  const cancelBasemapArea = useCallback(() => setDrawingBasemapArea(false), []);
  async function saveViewer() {
    if (!project || busy) return;
    setBusy(true);
    setMessage("Preparing campus room geometry, places and navigation…");
    try {
      const bytes = await exportCampusViewer(project);
      if (latestProject.current !== project) {
        setMessage(
          "The map changed during export. Export again for the current version.",
        );
        return;
      }
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
          type: "application/zip",
        }),
      );
      setDownload({
        url,
        kind: "viewer",
        name:
          project.manifest.model.fileName.replace(/\.rvt$/i, "") +
          ".campus-viewer.zip",
      });
      setMessage(
        `Campus viewer ready · ${(bytes.length / 1_048_576).toFixed(2)} MiB · 2D + 3D rooms and navigation. The reviewed master remains loaded.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  function cancelDrawing() {
    setEditTool("select");
    setDraftPoints([]);
    setAnnotationId("");
  }
  function undo() {
    if (!project || past.length === 0) return;
    setFuture((history) => [project, ...history]);
    setProject(past.at(-1)!);
    setPast(past.slice(0, -1));
    setDownload(null);
    setDirty(true);
    cancelDrawing();
    setMessage("Edit undone. Export reviewed project to save this version.");
  }
  function redo() {
    if (!project || future.length === 0) return;
    setPast((history) => [...history, project]);
    setProject(future[0]);
    setFuture(future.slice(1));
    setDownload(null);
    setDirty(true);
    cancelDrawing();
    setMessage("Edit restored. Export reviewed project to save this version.");
  }
  useEffect(() => {
    cancelDrawing();
    setDrawingBasemapArea(false);
  }, [floorId]);
  useEffect(() => {
    if (!dirty && draftPoints.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, draftPoints.length]);
  async function save() {
    if (!project || busy) return;
    setBusy(true);
    setMessage("Saving source model, reviews, GIS alignment and navigation…");
    try {
      const bytes = await exportIndoorProject(project);
      if (latestProject.current !== project) {
        setMessage(
          "Edits changed during export. Export again to save the current version.",
        );
        return;
      }
      const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
          type: "application/zip",
        }),
        url = URL.createObjectURL(blob);
      setDownload({
        url,
        name:
          project.manifest.model.fileName.replace(/\.rvt$/i, "") +
          ".indoor-reviewed.reviter.zip",
      });
      try {
        await persistProject(bytes);
        if (latestProject.current === project) setDirty(false);
        setMessage(
          "Reviewed ZIP ready and saved in this browser. Click Download reviewed ZIP for a portable backup.",
        );
      } catch {
        setMessage(
          "Reviewed ZIP ready. Browser storage is unavailable; click Download reviewed ZIP to preserve it.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const connectorReview = useMemo(
    () => (project ? sourceConnectorReview(project) : undefined),
    [project?.rooms.indoorConnectors, project?.dataset.source.modelSha256],
  );
  const presentationKey = JSON.stringify([
    project?.rooms.mapEdits?.locations?.map((p) => [
      p.id,
      p.name,
      p.description,
      p.category,
      p.color,
      p.roomKeys,
    ]),
    project?.rooms.mapEdits?.floorNames,
  ]);
  const displayData = useMemo(
    () => (project ? editorVisitorDataset(project) : undefined),
    [presentationKey, project?.dataset],
  );
  const floor = displayData?.floors.find((f) => f.id === floorId),
    levelIds = useMemo(() => floor?.levelIds ?? [], [floor]),
    data = displayData;
  const pins = project?.rooms.reviewPins?.pins ?? noPins;
  const chosenPin = pins.find(
    (p) => p.id === pinId && levelIds.includes(p.levelId),
  );
  const pinNativeLevel = levelIds.includes(pinLevel)
    ? pinLevel
    : [...levelIds].sort(
        (a, b) =>
          (data?.records.filter((r) => r.levelId === b).length ?? 0) -
          (data?.records.filter((r) => r.levelId === a).length ?? 0),
      )[0];
  const selectPin = useCallback((id: string) => {
    setPinId(id);
    setSelected("");
    setEdgeId("");
    setWallId("");
    setWallMode(false);
    setPlacingPin(false);
    setMovingPin(false);
  }, []);
  const beginPinPlacement = useCallback(() => {
    setPlacingPin(true);
    setMovingPin(false);
    setPinId("");
    setSelected("");
    setEdgeId("");
    setWallMode(false);
    setWallId("");
    setView("2d");
  }, []);
  const cancelPinPlacement = useCallback(() => {
    setPlacingPin(false);
    setMovingPin(false);
  }, []);
  const placePin = useCallback(
    (point: EditPoint) => {
      if (!project || !pinNativeLevel) return;
      const existing = movingPin ? pins.find((p) => p.id === pinId) : undefined;
      const pin: ReviewPin = {
        id: existing?.id ?? `pin-${crypto.randomUUID()}`,
        label: existing?.label ?? `Review pin ${pins.length + 1}`,
        notes: existing?.notes ?? "",
        levelId: pinNativeLevel,
        pointFeet: point,
        wallKey: nearbyPinWall(project.dataset, pinNativeLevel, point),
      };
      commit(
        setReviewPins(
          project,
          existing
            ? pins.map((p) => (p.id === pin.id ? pin : p))
            : [...pins, pin],
        ),
      );
      selectPin(pin.id);
    },
    [project, pinNativeLevel, movingPin, pins, pinId, commit, selectPin],
  );
  const wallContext = useMemo(
    () => (data && wallId ? wallReviewContext(data, wallId) : null),
    [data, wallId],
  );
  const sourceStair = data?.stairDisplay?.sourceFlights?.find(
    (s) => sourceStairId(s.stairElementId) === edgeId,
  );
  const record = data?.records.find((r) => r.key === selected),
    edge = data?.edges.find((e) => e.id === edgeId),
    door = data?.doors?.find((d) => d.id === edgeId);
  const baseRoute = useMemo(
    () =>
      data && start && end ? findProjectRoute(data, start, end, mode) : null,
    [data, start, end, mode],
  );
  const arrivalResult = useMemo(
    () =>
      data
        ? resolveRouteArrival(data, baseRoute, end, arrivalMode)
        : { route: null },
    [data, baseRoute, end, arrivalMode],
  );
  const route = arrivalResult.route;
  const arrivalReasons = useMemo(
    () =>
      data && baseRoute
        ? {
            doorway: resolveRouteArrival(data, baseRoute, end, "doorway")
              .message,
            hallway: resolveRouteArrival(data, baseRoute, end, "hallway")
              .message,
          }
        : {},
    [data, baseRoute, end],
  );
  const destinations = useMemo(
    () =>
      data?.records
        .filter((r) => r.arrivalNodeId)
        .sort((a, b) =>
          (a.number || a.name).localeCompare(b.number || b.name),
        ) ?? [],
    [data],
  );
  const pick = useCallback(
    (kind: "area" | "edge" | "wall", id: string) => {
      if (review && !editing && (placingPin || (wallMode && kind !== "wall")))
        return;
      setPinId("");
      setAnnotationId("");
      setWallId(kind === "wall" ? id : "");
      fitSelection.current = true;
      if (kind === "wall") {
        setSelected("");
        setEdgeId("");
        return;
      }
      if (kind === "area") {
        setSelected(id);
        setEdgeId("");
      } else {
        setEdgeId(id);
        setSelected("");
      }
    },
    [review, wallMode, editing, placingPin],
  );
  // Only actual map picks fill an endpoint; search selections and review picks
  // continue to use the ordinary selection callback.
  const assignRoutePlace = useCallback(
    (id: string) => {
      const { target, start, end } = routePickState.current;
      if (!review && !editing && target) {
        const room = data?.records.find((r) => r.key === id);
        if (!room || !isProjectDestination(room)) return false;
        if (target === "start") {
          setStart(id);
          setRoutePickTarget(end ? null : "end");
        } else {
          setEnd(id);
          setRoutePickTarget(start ? null : "start");
        }
      }
      return true;
    },
    [data, review, editing],
  );
  const pickMapPlace = useCallback(
    (kind: "area" | "edge", id: string) => {
      if (kind === "area" && !assignRoutePlace(id)) return;
      pick(kind, id);
    },
    [assignRoutePlace, pick],
  );
  const pickAnnotation = useCallback(
    (id: string) => {
      if (id.startsWith("location:")) {
        const key = id.split(":")[1];
        setLocationId(key);
        setAnnotationId("");
        setDraftPoints([]);
        setEditTool("select");
        const loc = project?.rooms.mapEdits?.locations?.find(
          (l) => l.id === key,
        );
        setSelected(loc?.roomKeys[0] ?? "");
        if (loc?.roomKeys[0]) assignRoutePlace(loc.roomKeys[0]);
        setEdgeId("");
        return;
      }
      setWallId("");
      setAnnotationId(id);
      setSelected("");
      setEdgeId("");
      setEditTool("select");
      setDraftPoints([]);
    },
    [project?.rooms.mapEdits?.locations, assignRoutePlace],
  );
  const allAnnotations = useMemo(
    () =>
      project
        ? [
            ...(project.rooms.mapEdits?.annotations ?? noAnnotations),
            ...locationAnnotations(project),
          ]
        : noAnnotations,
    [project?.rooms.mapEdits, project?.dataset],
  );
  const placeAnnotationPoint = useCallback(
    (point: EditPoint) => {
      if (!project) return;
      if (editorAppearance.snap)
        point = [Math.round(point[0]), Math.round(point[1])];
      if (editTool === "label") setDraftPoints([point]);
      else if (["rectangle", "circle"].includes(editTool))
        setDraftPoints((points) =>
          points.length >= 2 ? [point] : [...points, point],
        );
      else if (["area", "line", "measure"].includes(editTool))
        setDraftPoints((points) => [...points, point]);
      else if (editTool === "location") {
        try {
          const levelId =
            project.dataset.records.find((r) => r.key === selected)?.levelId ??
            levelIds.reduce(
              (a, b) =>
                project.dataset.records.filter((r) => r.levelId === a).length >=
                project.dataset.records.filter((r) => r.levelId === b).length
                  ? a
                  : b,
              levelIds[0],
            );
          commit(
            setMapLocations(
              project,
              (project.rooms.mapEdits?.locations ?? []).map((l) =>
                l.id === locationId
                  ? { ...l, position: { levelId, pointFeet: point } }
                  : l,
              ),
            ),
          );
          setEditTool("select");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      } else if (editTool === "move" || editTool === "vertex") {
        try {
          const annotations = project.rooms.mapEdits?.annotations ?? [];
          commit(
            setMapAnnotations(
              project,
              annotations.map((item) => {
                if (item.id !== annotationId) return item;
                return editTool === "move"
                  ? moveMapAnnotation(item, point)
                  : {
                      ...item,
                      pointsFeet: item.pointsFeet.map((p, index) =>
                        index === vertexIndex ? point : p,
                      ),
                    };
              }),
            ),
          );
          setEditTool("select");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    },
    [
      project,
      editTool,
      annotationId,
      vertexIndex,
      commit,
      editorAppearance.snap,
      selected,
      levelIds,
      locationId,
    ],
  );
  const ready = useCallback((fn: (includeSelection?: boolean) => void) => {
    fit.current = fn;
    if (!fitted.current) {
      fitted.current = true;
      fn(fitSelection.current);
    }
  }, []);
  useEffect(() => {
    if (record) {
      setName(record.name);
      setAccess(record.access);
      setWalkable(record.walkable);
      setThroughNavigation(
        hasReviewedThroughNavigation(
          record,
          project!.dataset.source.modelSha256,
        ),
      );
      setNotes(project?.rooms.indoorReviews?.records[record.key]?.notes ?? "");
    }
  }, [record, project]);
  useEffect(() => {
    if (edge) {
      setEnabled(edge.enabled);
      setAccessible(edge.accessible);
      setNotes(edge.notes ?? "");
    }
  }, [edge]);
  const chooseLevel = useCallback(
    (levelId: number) => {
      const next = data?.floors.find((f) => f.levelIds.includes(levelId));
      if (next) setFloorId(next.id);
      setBuilding("all");
    },
    [data],
  );
  const apply = () => {
    if (!project) return;
    try {
      commit(
        record
          ? reviewArea(project, record.key, {
              name,
              notes,
              access,
              walkable,
              throughNavigation,
            })
          : reviewEdge(project, edgeId, { notes, enabled, accessible }),
      );
      setDownload(null);
      setMessage(
        "Review applied; routes recalculated. Export reviewed project to preserve changes.",
      );
    } catch (error) {
      setMessage(String(error));
    }
  };
  return (
    <main
      className={`indoor-project ${review || !project ? "project-review" : "project-explore"}`}
    >
      <header>
        <div>
          <span className="project-kicker">REPLICABLE INDOOR PIPELINE</span>
          <h1>Indoor project workspace</h1>
        </div>
        <nav>
          {project && !isViewerProject(project) && (
            <button
              aria-pressed={editing}
              disabled={busy}
              onClick={() => {
                setEditing((value) => !value);
                setReview(true);
                setView("2d");
                cancelDrawing();
              }}
            >
              {editing ? "Close editor" : "Edit map"}
            </button>
          )}
          {project && !isViewerProject(project) && (
            <button
              onClick={() => {
                setReview((r) => !r);
                setEditing(false);
                cancelDrawing();
              }}
            >
              {review ? "Explore map" : "Review project"}
            </button>
          )}
          {project && isViewerProject(project) && (
            <button disabled={busy} onClick={() => input.current?.click()}>
              Import project ZIP
            </button>
          )}
          {(review || !project) && (
            <>
              <Link to="/">Venue maps</Link>
              <button disabled={busy} onClick={() => input.current?.click()}>
                Import project ZIP
              </button>
              {!project || !isViewerProject(project) ? (
                <button
                  disabled={!project || busy || draftPoints.length > 0}
                  onClick={() => void save()}
                >
                  Export reviewed project
                </button>
              ) : null}
              {project && (
                <button
                  disabled={busy || draftPoints.length > 0}
                  onClick={() => void saveViewer()}
                >
                  Export campus viewer
                </button>
              )}
              {download && (
                <a href={download.url} download={download.name}>
                  {download.kind === "viewer"
                    ? "Download campus viewer ZIP"
                    : "Download reviewed ZIP"}
                </a>
              )}
            </>
          )}
        </nav>
        <input
          ref={input}
          hidden
          type="file"
          accept=".zip"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void load(file);
            event.target.value = "";
          }}
        />
      </header>
      <p className="project-status" role="status">
        {dirty && <strong>Unsaved edits · </strong>}
        {message}
      </p>
      {!project || !data ? (
        <section className="project-intro">
          <h2>One package, from source model to tested routes</h2>
          <p>
            In Reviter, load the model and room reviews, save GIS reference
            points, then choose <strong>Prepare OpenIndoorMaps project</strong>.
            Import that ZIP here. You can also select your finalized master
            Reviter ZIP. The package is processed in this browser; keep exported
            ZIPs as backups.
          </p>
          <ol>
            <li>Check buildings and campus floors.</li>
            <li>
              Select areas and door or stair markers to inspect source metadata.
            </li>
            <li>
              Choose start and destination; inspect each floor of the route.
            </li>
            <li>
              Review public access and step-free connections, then export the
              reviewed package.
            </li>
          </ol>
          <p>
            Original RVT bytes, floor boundaries, source identities and GIS
            references remain in the package.
          </p>
        </section>
      ) : (
        <div
          className={`project-layout ${editing ? "project-edit-layout" : ""} ${editing && !record && !edge && !door ? "project-content-only" : ""}`}
        >
          {editing && (
            <aside className="project-sidebar">
              <MapEditorPanel
                project={project}
                selectedRoom={selected}
                locationId={locationId}
                onLocation={(id) => {
                  setLocationId(id);
                  setAnnotationId("");
                  setDraftPoints([]);
                  setEditTool("select");
                }}
                onPlaceLocation={(id) => {
                  setLocationId(id);
                  setAnnotationId("");
                  setDraftPoints([]);
                  setEditTool("location");
                }}
                onLocate={(levelId, point) => {
                  chooseLevel(levelId);
                  setEditorFocus({ point, nonce: Date.now() });
                }}
                appearance={editorAppearance}
                onAppearance={setEditorAppearance}
                levelIds={levelIds}
                tool={editTool}
                onTool={setEditTool}
                selectedId={annotationId}
                onSelect={pickAnnotation}
                draft={draftPoints}
                onDraft={setDraftPoints}
                onApply={commit}
                onUndo={undo}
                onRedo={redo}
                canUndo={past.length > 0}
                canRedo={future.length > 0}
                onVertex={(index) => {
                  setVertexIndex(index);
                  setEditTool("vertex");
                }}
              />
            </aside>
          )}
          {review && !editing && (
            <aside className="project-sidebar">
              <ReviewPinControls
                data={data}
                pins={pins}
                levelIds={levelIds}
                levelId={pinNativeLevel}
                placing={placingPin}
                onLevel={setPinLevel}
                onPlace={beginPinPlacement}
                onCancel={cancelPinPlacement}
                onSelect={selectPin}
              />
              <NativeStairReview
                data={data}
                onLocate={(stair) => {
                  const lower =
                    data.floors.find((f) =>
                      f.levelIds.includes(stair.levelIds[0]),
                    ) ??
                    data.floors.find((f) =>
                      f.levelIds.some((id) => stair.levelIds.includes(id)),
                    );
                  if (lower) setFloorId(lower.id);
                  setBuilding("all");
                  setView("relative");
                  setSelected("");
                  setEdgeId(sourceStairId(stair.stairElementId));
                  setPinId("");
                  const points = stair.treads.flatMap((t) => t.ringFeet);
                  setEditorFocus({
                    point: [
                      (Math.min(...points.map((p) => p[0])) +
                        Math.max(...points.map((p) => p[0]))) /
                        2,
                      (Math.min(...points.map((p) => p[1])) +
                        Math.max(...points.map((p) => p[1]))) /
                        2,
                    ],
                    nonce: Date.now(),
                    zoom:
                      21 -
                      Math.log2(
                        Math.max(
                          1,
                          Math.max(
                            Math.max(...points.map((p) => p[0])) -
                              Math.min(...points.map((p) => p[0])),
                            Math.max(...points.map((p) => p[1])) -
                              Math.min(...points.map((p) => p[1])),
                          ) / 32,
                        ),
                      ),
                    pitch: 45,
                  });
                  fitted.current = true;
                }}
              />
              <NativeRampReview
                data={data}
                onLocate={(ramp) => {
                  const target =
                    data.floors.find((f) =>
                      ramp.levelIds.every((id) => f.levelIds.includes(id)),
                    ) ??
                    data.floors.find((f) =>
                      f.levelIds.some((id) => ramp.levelIds.includes(id)),
                    );
                  if (target) setFloorId(target.id);
                  setBuilding("all");
                  setView("relative");
                  setSelected("");
                  setEdgeId("");
                  setPinId("");
                  const points = ramp.trianglesFeet.flat();
                  setEditorFocus({
                    point: [
                      (Math.min(...points.map((p) => p[0])) +
                        Math.max(...points.map((p) => p[0]))) /
                        2,
                      (Math.min(...points.map((p) => p[1])) +
                        Math.max(...points.map((p) => p[1]))) /
                        2,
                    ],
                    nonce: Date.now(),
                    zoom: 21.5,
                    pitch: 45,
                  });
                  fitted.current = true;
                }}
              />
              <WallReviewControls
                data={data}
                levelIds={levelIds}
                building={building}
                active={wallMode}
                onActive={(active) => {
                  setWallMode(active);
                  setPinId("");
                  setPlacingPin(false);
                  setMovingPin(false);
                  setWallId("");
                  setSelected("");
                  setEdgeId("");
                }}
                onPick={pick}
              />
              <ConnectorEditor
                project={project}
                onApply={(next) => {
                  commit(next);
                  setDownload(null);
                  setMessage(
                    "Elevator review saved. Export the reviewed ZIP and regenerate in Reviter to validate and connect its served entrances.",
                  );
                }}
              />
              <section>
                <h2>Campus floors</h2>
                <CampusFloorEditor
                  project={project}
                  floorId={floorId}
                  onChange={(next, id) => {
                    commit(next);
                    setFloorId(id);
                    setBuilding("all");
                    fitted.current = false;
                  }}
                />
                <p>
                  Unlabelled structures are source walls without mapped room
                  coverage. They remain visible here for review.
                </p>
                <label>
                  Floor
                  <select
                    aria-label="Project floor"
                    value={floorId}
                    onChange={(e) => {
                      setFloorId(e.target.value);
                      setPlacingPin(false);
                      setMovingPin(false);
                      setPinId("");
                      setWallId("");
                      fitSelection.current = false;
                      fitted.current = false;
                    }}
                  >
                    {data.floors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ·{" "}
                        {f.levelIds.map((id) => "#" + id).join(" + ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Building
                  <select
                    aria-label="Project building"
                    value={building}
                    onChange={(e) => {
                      setBuilding(e.target.value);
                      setWallId("");
                      fitSelection.current = false;
                      fitted.current = false;
                    }}
                  >
                    <option value="all">All buildings</option>
                    {[
                      ...new Set(
                        data.records
                          .filter((r) => levelIds.includes(r.levelId))
                          .map((r) => r.building),
                      ),
                    ]
                      .sort()
                      .map((b) => (
                        <option key={b} value={b}>
                          Building {b}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="project-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={circulation}
                      onChange={(e) => setCirculation(e.target.checked)}
                    />
                    Circulation only · retain outlines
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={network}
                      onChange={(e) => setNetwork(e.target.checked)}
                    />
                    Show routing network
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showPillars}
                      disabled={
                        view === "native" ||
                        !data.walls.some((w) => w.kind === "column")
                      }
                      onChange={(e) => setShowPillars(e.target.checked)}
                    />
                    Show pillars
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showPassThroughPlaces}
                      onChange={(e) =>
                        setShowPassThroughPlaces(e.target.checked)
                      }
                    />
                    Show pass-through places
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showVestibuleDoors}
                      onChange={(e) => setShowVestibuleDoors(e.target.checked)}
                    />
                    Show vestibule doors
                  </label>
                </div>
                {!data.walls.some((w) => w.kind) && (
                  <p>
                    Regenerate this ZIP in Reviter to distinguish pillars from
                    walls.
                  </p>
                )}
                <button onClick={() => fit.current?.(false)}>
                  Whole floor
                </button>
                <p>
                  {view === "native"
                    ? modelStatus
                    : `Native levels ${levelIds.map((id) => "#" + id).join(", ")} · elevations preserved`}
                </p>
              </section>
              <section>
                <h2>Route test</h2>
                <label>
                  Start
                  <select
                    aria-label="Route start"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  >
                    <option value="">Choose an area</option>
                    {destinations.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.number} · {r.name} · {r.building} / #{r.levelId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Destination
                  <select
                    aria-label="Route destination"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  >
                    <option value="">Choose an area</option>
                    {destinations.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.number} · {r.name} · {r.building} / #{r.levelId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Route profile
                  <select
                    aria-label="Route profile"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                  >
                    <option value="public">
                      Public review · exclude staff
                    </option>
                    <option value="accessible">
                      Wheelchair / step-free · reviewed edges only
                    </option>
                  </select>
                </label>
                <ProjectRouteArrivalMenu
                  mode={arrivalMode}
                  onChange={setArrivalMode}
                  reasons={arrivalReasons}
                />
                {start &&
                  end &&
                  (route ? (
                    <div
                      className="project-route"
                      data-testid="project-route-result"
                    >
                      <strong>
                        {route.distanceMetres.toFixed(1)} m ·{" "}
                        {
                          route.edges.filter(
                            (e) =>
                              e.kind === "stairs" || e.kind === "local-steps",
                          ).length
                        }{" "}
                        step/stair transitions
                      </strong>
                      <p>
                        {route.unknownAccessAreas.length} areas with unconfirmed
                        public access · {route.unknownAccessibilityEdges} edges
                        with unconfirmed accessibility.
                      </p>
                      <div>
                        {data.floors
                          .filter((f) =>
                            route.nodeIds.some((id) =>
                              data.nodes.some(
                                (n) =>
                                  n.id === id && f.levelIds.includes(n.levelId),
                              ),
                            ),
                          )
                          .map((f) => (
                            <button
                              key={f.id}
                              onClick={() => {
                                setFloorId(f.id);
                                setBuilding("all");
                                fitted.current = false;
                              }}
                            >
                              {f.name}
                            </button>
                          ))}
                      </div>
                      <details>
                        <summary>Door and stair instructions</summary>
                        {route.edges
                          .filter((e) => e.kind !== "walk")
                          .map((e) => (
                            <button
                              key={e.id}
                              onClick={() => pick("edge", e.id)}
                            >
                              {e.kind} ·{" "}
                              {e.nativeElementId
                                ? "#" + e.nativeElementId
                                : e.id}
                            </button>
                          ))}
                      </details>
                    </div>
                  ) : (
                    <p
                      className="project-warning"
                      data-testid="project-route-result"
                    >
                      {arrivalResult.message ??
                        "No verified route for this profile. Check disconnected entrances, area restrictions and unconfirmed step-free edges."}
                    </p>
                  ))}
              </section>
              <section>
                <h2>Find an area</h2>
                <input
                  aria-label="Find project area"
                  placeholder="Room number, name or building"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search &&
                  data.records
                    .filter((r) =>
                      `${r.number} ${r.name} ${r.building}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .slice(0, 15)
                    .map((r) => (
                      <button
                        className="project-search-item"
                        key={r.key}
                        onClick={() => {
                          pick("area", r.key);
                          setFloorId(
                            data.floors.find((f) =>
                              f.levelIds.includes(r.levelId),
                            )!.id,
                          );
                          setBuilding("all");
                          fitted.current = false;
                        }}
                      >
                        {r.number} · {r.name} · #{r.levelId}
                      </button>
                    ))}
              </section>
              <section>
                <h2>Validation and review</h2>
                <p>
                  {data.report.routableArrivals}/{data.report.recordCount}{" "}
                  arrivals in the graph · {data.report.components} components ·{" "}
                  {data.report.largestComponentArrivals} arrivals in the largest
                  component.
                </p>
                <p>
                  {data.report.unmatchedDoors} unmatched doors ·{" "}
                  {data.report.omittedSourceLabels} omitted source labels ·{" "}
                  {data.alignment.referenceCount} GIS points, RMS{" "}
                  {data.alignment.rmsMetres.toFixed(2)} m.
                </p>
                {data.presentation && (
                  <details>
                    <summary>
                      Room boundaries · {data.presentation.rooms.length}{" "}
                      prepared · {data.presentation.diagnostics.length}{" "}
                      unresolved
                    </summary>
                    <p>
                      Prepared blocks use native wall enclosures. Navigation
                      continues to use reviewed source interiors.
                    </p>
                    {data.presentation.diagnostics
                      .filter((item) => levelIds.includes(item.levelId))
                      .slice(0, 80)
                      .map((item) => (
                        <button
                          key={item.roomKey}
                          onClick={() => pick("area", item.roomKey)}
                        >
                          {
                            data.records.find((r) => r.key === item.roomKey)
                              ?.number
                          }{" "}
                          · {item.code}: {item.message}
                        </button>
                      ))}
                  </details>
                )}
                <details>
                  <summary>Review queue · {data.issues.length} items</summary>
                  {data.issues
                    .filter((i) => !i.levelId || levelIds.includes(i.levelId))
                    .slice(0, 80)
                    .map((i) => (
                      <button
                        key={i.id}
                        onClick={() => {
                          if (i.roomKey) pick("area", i.roomKey);
                        }}
                      >
                        {i.code}: {i.message}
                      </button>
                    ))}
                </details>
              </section>
            </aside>
          )}
          <section className="project-map" aria-label="Indoor campus map">
            <div className="project-map-toolbar">
              {review && !editing && (
                <div
                  className="project-pin-shortcut"
                  style={{ top: route ? 58 : 0 }}
                >
                  <button
                    disabled={busy}
                    aria-pressed={placingPin}
                    onClick={
                      placingPin ? cancelPinPlacement : beginPinPlacement
                    }
                  >
                    <span aria-hidden="true">●</span>{" "}
                    {placingPin ? "Cancel pin" : "Drop pin"}
                  </button>
                  {placingPin && (
                    <p aria-live="polite">
                      Click or tap anywhere on the floor plan.
                    </p>
                  )}
                </div>
              )}
              <div
                className="project-view-switch"
                role="group"
                aria-label="Map presentation"
              >
                <button
                  aria-pressed={view === "2d"}
                  onClick={() => setView("2d")}
                >
                  2D rooms
                </button>
                <button
                  aria-pressed={view === "3d"}
                  onClick={() => setView("3d")}
                >
                  3D rooms
                </button>
                <button
                  aria-pressed={view === "relative"}
                  title="Keep source height differences within the campus floor"
                  onClick={() => setView("relative")}
                >
                  3D relative heights
                </button>
                {project.scene && (
                  <button
                    aria-pressed={view === "native"}
                    onClick={() => setView("native")}
                  >
                    Source model
                  </button>
                )}
              </div>
              {review ? (
                <label className="project-floor-picker">
                  <span>{floorBadge(floor)}</span>
                  <select
                    aria-label="Map floor"
                    value={floorId}
                    onChange={(e) => {
                      setFloorId(e.target.value);
                      setPlacingPin(false);
                      setMovingPin(false);
                      setPinId("");
                      setWallId("");
                      fitSelection.current = false;
                      fitted.current = false;
                    }}
                  >
                    {data.floors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="project-building-level-picker">
                  <ProjectFloorSelector
                    data={data}
                    floorId={floorId}
                    building={building}
                    onChange={(nextFloor, nextBuilding) => {
                      setFloorId(nextFloor);
                      setBuilding(nextBuilding);
                      // Keep the selected place, but fit the floor/building
                      // when browsing levels instead of returning to its bounds.
                      fitSelection.current = false;
                      fitted.current = false;
                    }}
                  />
                </div>
              )}
            </div>
            <MapProvider
              options={{
                center: data.alignment.originGeographic,
                zoom: 17,
                pitch: view === "2d" ? 0 : 55,
                maxZoom: 23,
              }}
              styles={mapStyles}
            >
              <MapCanvas>
                <ProjectMapLayers
                  data={data}
                  geometryOpacity={editing ? editorAppearance.geometry : 1}
                  labelsVisible={!editing || editorAppearance.labels}
                  basemapVisible={!editing || editorAppearance.basemap}
                  levelIds={levelIds}
                  building={building}
                  circulationOnly={circulation}
                  network={network}
                  roomThree={view === "3d" || view === "relative"}
                  nativeModel={view === "native"}
                  relativeHeights={view === "relative"}
                  showPillars={review ? showPillars : !simplifyGeometry}
                  simplifyGeometry={simplifyGeometry}
                  labelSettings={labelSettings}
                  showPassThroughPlaces={showPassThroughPlaces}
                  showVestibuleDoors={showVestibuleDoors}
                  showStructures={showStructures}
                  connectorReview={connectorReview}
                  review={review}
                  route={route}
                  selected={selected}
                  onPick={pickMapPlace}
                  pickEnabled={
                    !drawingBasemapArea &&
                    !(review && (wallMode || placingPin) && !editing) &&
                    (!editing || editTool === "select")
                  }
                  onFitReady={ready}
                />
                <BasemapBuildingLayer data={data} settings={basemapBuildings} />
                <BasemapAreaDrawing
                  data={data}
                  active={drawingBasemapArea}
                  shape={basemapAreaShape}
                  onFinish={finishBasemapArea}
                  onCancel={cancelBasemapArea}
                />
                <WallReviewLayer
                  data={data}
                  levelIds={levelIds}
                  building={building}
                  active={review && wallMode && !editing}
                  selected={wallId}
                  three={view === "3d" || view === "relative"}
                  relativeHeights={view === "relative"}
                  onPick={pick}
                  onCaptureReady={captureReady}
                  onFitReady={wallFitReady}
                />
                <ReviewPinLayer
                  relativeHeights={view === "relative"}
                  data={data}
                  pins={pins}
                  levelIds={levelIds}
                  visible={review && !editing}
                  placing={review && placingPin && !editing}
                  selected={pinId}
                  onPlace={placePin}
                  onSelect={selectPin}
                  onFitReady={pinFitReady}
                />
                <MapAnnotationLayer
                  data={data}
                  annotations={allAnnotations}
                  opacity={editing ? editorAppearance.annotations : 1}
                  levelIds={levelIds}
                  editing={editing}
                  tool={editTool}
                  selectedId={annotationId}
                  draft={draftPoints}
                  onPick={pickAnnotation}
                  onPoint={placeAnnotationPoint}
                />
                <EditorFocus data={data} focus={editorFocus} />
                {view === "native" && project.scene && (
                  <ProjectModelLayer
                    data={data}
                    bytes={project.scene}
                    levelIds={levelIds}
                    onStatus={setModelStatus}
                  />
                )}
                {!review && (
                  <ProjectNavigation
                    managedLocations={project.rooms.mapEdits?.locations}
                    showStructures={showStructures}
                    simplifyGeometry={simplifyGeometry}
                    onSimplifyGeometry={setSimplifyGeometry}
                    labelSettings={labelSettings}
                    onLabelSettings={setLabelSettings}
                    basemapBuildings={basemapBuildings}
                    onBasemapBuildings={changeBasemapBuildings}
                    onDrawBasemapArea={(shape) => {
                      setBasemapAreaShape(shape);
                      setDrawingBasemapArea(true);
                    }}
                    onStructures={setShowStructures}
                    roomThree={view === "3d" || view === "relative"}
                    data={data}
                    route={route}
                    start={start}
                    end={end}
                    mode={mode}
                    arrivalMode={arrivalMode}
                    onArrivalMode={setArrivalMode}
                    arrivalMessage={arrivalResult.message}
                    arrivalReasons={arrivalReasons}
                    selected={selected}
                    onStart={setStart}
                    onEnd={setEnd}
                    pickTarget={routePickTarget}
                    onPickTarget={setRoutePickTarget}
                    onMode={setMode}
                    onPick={pick}
                    onFloor={chooseLevel}
                    onReview={() => setReview(true)}
                    showPassThroughPlaces={showPassThroughPlaces}
                    onPassThroughPlaces={setShowPassThroughPlaces}
                    showVestibuleDoors={showVestibuleDoors}
                    onVestibuleDoors={setShowVestibuleDoors}
                  />
                )}
                <ProjectRouteFocus data={data} route={route} />
                <ViewPitch three={view !== "2d"} />
                <MapControls />
              </MapCanvas>
            </MapProvider>
            {!review && sourceStair && (
              <aside
                className="project-point-location-card"
                aria-label="Source staircase"
              >
                <button
                  aria-label="Close source staircase"
                  onClick={() => setEdgeId("")}
                >
                  ×
                </button>
                <NativeStairInspector data={data} stair={sourceStair} />
              </aside>
            )}
            {!review &&
              locationId &&
              !selected &&
              project.rooms.mapEdits?.locations?.some(
                (l) => l.id === locationId,
              ) &&
              (() => {
                const location = project.rooms.mapEdits!.locations!.find(
                  (l) => l.id === locationId,
                )!;
                return (
                  <aside
                    className="project-point-location-card"
                    aria-label="Point location"
                  >
                    <button
                      aria-label="Close point location"
                      onClick={() => setLocationId("")}
                    >
                      ×
                    </button>
                    <h3>{location.name}</h3>
                    <p>{location.description}</p>
                    <LocationDetails location={location} />
                    <small>
                      Map marker · select an attached room for directions.
                    </small>
                  </aside>
                );
              })()}
            {editing && (
              <div className="project-editor-hint" role="status">
                {editTool === "label"
                  ? "Click to place label"
                  : editTool === "location"
                    ? "Click to position location marker"
                    : ["rectangle", "circle", "line", "measure"].includes(
                          editTool,
                        )
                      ? `Click to draw ${editTool} · ${draftPoints.length} points`
                      : editTool === "area"
                        ? `Click to draw area · ${draftPoints.length} corners`
                        : editTool === "move" || editTool === "vertex"
                          ? "Click a new position"
                          : "Select a room or annotation"}
              </div>
            )}
            <div className="project-map-legend">
              Blue-grey corridors · blue entrances · blue-grey stairs · blue
              route · orange doors need review
              {!data.doors && (
                <span>
                  {" "}
                  · Import a regenerated ZIP for native door openings.
                </span>
              )}
            </div>
          </section>
          {review && (!editing || record || edge || door) && (
            <aside className="project-inspector">
              <h2>
                {chosenPin && !editing
                  ? "Selected reference pin"
                  : wallContext && wallMode && !editing
                    ? "Selected wall area"
                    : record
                      ? "Selected area"
                      : edge
                        ? "Selected connection"
                        : door
                          ? "Entrance review"
                          : "Map inspector"}
              </h2>
              {sourceStair ? (
                <NativeStairInspector
                  data={data}
                  stair={sourceStair}
                  onSelectConnection={setEdgeId}
                />
              ) : chosenPin && !editing ? (
                <ReviewPinPanel
                  key={chosenPin.id + ":" + chosenPin.pointFeet.join(",")}
                  pin={chosenPin}
                  data={data}
                  onLocate={() => pinFit.current?.()}
                  onSave={(pin) =>
                    commit(
                      setReviewPins(
                        project,
                        pins.map((p) => (p.id === pin.id ? pin : p)),
                      ),
                    )
                  }
                  onMove={() => {
                    setPinLevel(chosenPin.levelId);
                    setMovingPin(true);
                    setPlacingPin(true);
                    setView("2d");
                  }}
                  onRemove={() => {
                    commit(
                      setReviewPins(
                        project,
                        pins.filter((p) => p.id !== chosenPin.id),
                      ),
                    );
                    setPinId("");
                    setPlacingPin(false);
                    setMovingPin(false);
                  }}
                  capture={() =>
                    wallCapture.current
                      ? wallCapture.current()
                      : Promise.reject(new Error("Map is not ready yet."))
                  }
                />
              ) : wallContext && wallMode && !editing ? (
                <WallReviewPanel
                  onFit={() => wallFit.current?.()}
                  key={wallId}
                  context={wallContext}
                  capture={() => {
                    if (!wallCapture.current)
                      return Promise.reject(new Error("Map is not ready yet."));
                    return wallCapture.current();
                  }}
                />
              ) : record ? (
                <>
                  <h3>
                    {record.number} · {record.name}
                  </h3>
                  <dl>
                    <dt>Building / native level</dt>
                    <dd>
                      {record.building} · #{record.levelId} ·{" "}
                      {record.elevationFeet.toFixed(2)} ft
                    </dd>
                    <dt>Surface evidence</dt>
                    <dd>{record.elevationEvidence}</dd>
                    <dt>Source ID</dt>
                    <dd>{record.key}</dd>
                    <dt>Room boundary</dt>
                    <dd>
                      {project.rooms.annotations.find(
                        (r) => r.key === record.key,
                      )?.semanticInteriorProvenance
                        ? "Imported Revit Finish boundary · navigation regenerated"
                        : project.rooms.annotations.find(
                              (r) => r.key === record.key,
                            )?.nativeInteriorProvenance
                          ? "Recovered native wall interior · navigation regenerated"
                          : data.presentation?.rooms.some(
                                (r) => r.roomKey === record.key,
                              )
                            ? "Prepared native display block · original navigation interior"
                            : "Source outline · boundary review needed"}
                    </dd>
                    <dt>Arrival</dt>
                    <dd>
                      {record.arrivalNodeId
                        ? "Supported graph anchor"
                        : "Needs boundary / entrance review"}
                    </dd>
                    {data.stairDisplay?.flights.some(
                      (f) => f.roomKey === record.key,
                    ) && (
                      <>
                        <dt>Stair area / landing selection</dt>
                        <dd>
                          This outline selects the source floor area at{" "}
                          {record.elevationFeet.toFixed(2)} ft beneath or beside
                          the elevated flight. It is not the shape of the steps.
                          {data.stairDisplay.flights
                            .filter((f) => f.roomKey === record.key)
                            .map((f) => (
                              <p key={f.stairElementId}>
                                Stair #{f.stairElementId}: tread surfaces{" "}
                                {Math.min(
                                  ...f.treads.map((t) => t.elevationFeet),
                                ).toFixed(2)}
                                –
                                {Math.max(
                                  ...f.treads.map((t) => t.elevationFeet),
                                ).toFixed(2)}{" "}
                                ft.
                                {data.stairDisplay?.sourceFlights?.some(
                                  (s) => s.stairElementId === f.stairElementId,
                                ) && (
                                  <button
                                    onClick={() => {
                                      setSelected("");
                                      setEdgeId(
                                        sourceStairId(f.stairElementId),
                                      );
                                    }}
                                  >
                                    Inspect physical staircase #
                                    {f.stairElementId}
                                  </button>
                                )}
                              </p>
                            ))}
                          A graph anchor for this area does not confirm access
                          to every flight above it. Stair directions require
                          reviewed landing connections; wheelchair routes
                          exclude stairs.
                        </dd>
                      </>
                    )}
                  </dl>
                  <div className="project-actions">
                    <button
                      disabled={!record.arrivalNodeId}
                      onClick={() => setStart(record.key)}
                    >
                      Use as start
                    </button>
                    <button
                      disabled={!record.arrivalNodeId}
                      onClick={() => setEnd(record.key)}
                    >
                      Use as destination
                    </button>
                  </div>
                  <label>
                    Area name
                    <input
                      aria-label="Area name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Public access
                    <select
                      aria-label="Area access"
                      value={access}
                      onChange={(e) =>
                        setAccess(e.target.value as typeof access)
                      }
                    >
                      <option value="unknown">Needs review</option>
                      <option value="public">Public · user reviewed</option>
                      <option value="staff">Staff only · user reviewed</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={walkable}
                      onChange={(e) => setWalkable(e.target.checked)}
                    />
                    Walkable floor
                  </label>
                  {!record.circulation && !record.stair && (
                    <>
                      <label>
                        <input
                          type="checkbox"
                          checked={throughNavigation}
                          disabled={!walkable || access === "staff"}
                          onChange={(e) =>
                            setThroughNavigation(e.target.checked)
                          }
                        />
                        Prefer as a through passage
                      </label>
                      <p className="project-help">
                        Connected walkable rooms are usable automatically, with
                        a preference for corridors. Confirming this passage
                        removes the room penalty. Add the evidence in Review
                        notes; entrances and access rules still apply.
                      </p>
                    </>
                  )}
                  <details>
                    <summary>Preserved model relationships</summary>
                    <pre>{JSON.stringify(record.properties, null, 2)}</pre>
                  </details>
                  <VisitorMetadataEditor
                    project={project}
                    room={record}
                    onApply={(next) => {
                      commit(next);
                      setDownload(null);
                      setMessage(
                        "Visitor details applied. Export the reviewed project to preserve them in Reviter.",
                      );
                    }}
                  />
                </>
              ) : edge ? (
                <>
                  <h3>
                    {connectionName(edge)}{" "}
                    {edge.nativeElementId ? "#" + edge.nativeElementId : ""}
                  </h3>
                  <dl>
                    <dt>Movement</dt>
                    <dd>{connectionLevelChange(data, edge)}</dd>
                    {edge.kind === "ramp" && (
                      <>
                        <dt>Maximum source slope</dt>
                        <dd>
                          {rampSourceSlope(edge)!.toFixed(1)}% · native geometry
                        </dd>
                      </>
                    )}
                    <dt>Evidence</dt>
                    <dd>{edge.evidence}</dd>
                    <dt>Source areas</dt>
                    <dd>
                      {edge.roomKeys
                        .map((k) => connectionAreaName(data, k))
                        .join(" ↔ ")}
                    </dd>
                    <dt>Endpoints</dt>
                    <dd>
                      {[edge.from, edge.to]
                        .map((id) => {
                          const n = data.nodes.find((x) => x.id === id)!;
                          return `${n.building} · #${n.levelId} · ${n.pointFeet[2].toFixed(2)} ft`;
                        })
                        .join(" ↔ ")}
                    </dd>
                    <dt>Connection ID</dt>
                    <dd>{edge.id}</dd>
                  </dl>
                  <label>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                    />
                    Enabled for routing
                  </label>
                  <label>
                    Step-free verification
                    <select
                      aria-label="Connection accessibility"
                      value={accessible}
                      onChange={(e) =>
                        setAccessible(e.target.value as typeof accessible)
                      }
                    >
                      <option value="unknown">Needs review</option>
                      <option value="no">Has steps / not accessible</option>
                      <option value="yes">Step-free · user verified</option>
                    </select>
                  </label>
                  <p>
                    Confirm clearance, threshold and access before assigning
                    step-free use. Endpoint or boundary changes require
                    regeneration in Reviter.
                  </p>
                </>
              ) : door ? (
                <>
                  <h3>Door #{door.nativeElementId}</h3>
                  <p>
                    Native level #{door.levelId} · {door.state}
                  </p>
                  <p>
                    This source entrance has no usable route connection. Correct
                    its room or door relationships in Reviter and regenerate the
                    project.
                  </p>
                  <p>
                    {door.footprintFeet
                      ? "Recovered oriented footprint"
                      : "Source position only; opening shape needs review"}
                  </p>
                </>
              ) : (
                <p>
                  Click an area or a door/stair marker. Source IDs, elevations,
                  evidence and review controls appear here.
                </p>
              )}
              {(record || edge) && (
                <>
                  <label>
                    Review notes
                    <textarea
                      aria-label="Review notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  <button onClick={apply}>Apply review</button>
                </>
              )}
              <p className="project-note">
                This is a review workspace. Unknown access is shown in public
                route tests; step-free tests require confirmed edges. Original
                source geometry stays in the archive.
              </p>
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
