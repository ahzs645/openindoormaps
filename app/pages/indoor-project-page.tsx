import type { NativeExploreResult } from "../indoor-project/native-explore";
import type { PatchComparisonView } from "../indoor-project/patch-comparison-controls";
import {
  nativePhysicalDisplayPlanes,
  nativePhysicalDisplayPlaneLevelIds,
  nativePhysicalDisplayPlaneForLevel,
} from "../indoor-project/native-display-planes";
import { NativeExploreLayer } from "../indoor-project/native-explore-layer";
import { registerPreparedDisplayArchive } from "../indoor-project/prepared-display-registry";
import {
  hasNativeExploreGeometry,
  initialMapPresentation,
} from "../indoor-project/native-explore";
import { PinComparisonLayer } from "../indoor-project/pin-comparison-layer";
import type {
  PinComparisonMode,
  PinComparisonResult,
} from "../indoor-project/pin-comparison";
import {
  pinRecommendations,
  type PinRecommendation,
} from "../indoor-project/pin-recommendations";
import { readPinPatchDecisions } from "../indoor-project/pin-patch-decisions";
import { PinRecommendationsPanel } from "../indoor-project/pin-recommendations-panel";
import { NativeGapScanLayer } from "../indoor-project/native-gap-scan-layer";
import type { GapScanPreview } from "../indoor-project/native-gap-scan";
import type { WindowExportMode } from "../indoor-project/native-window-display";
import { projectBoundaryEvidence } from "../indoor-project/boundary-evidence";
import { EnclosureReviewPanel } from "../indoor-project/enclosure-review-panel";
import { BoundaryProposalPreviewLayer } from "../indoor-project/boundary-proposal-preview-layer";
import {
  assertBoundaryPatchPreviewResult,
  assertProposalDisplayPreviewPlan,
  type BoundaryPatchPreviewPlan,
  type ProposalDisplayPreviewPlan,
} from "../indoor-project/enclosure-proposals";
import { ReviewBundlePanel } from "../indoor-project/review-bundle-panel";
import { NativeAreaPanel } from "../indoor-project/native-area-panel";
import { NativeAreaLayer } from "../indoor-project/native-area-layer";
import type { NativeAreaResult } from "../indoor-project/native-area-review";
import {
  NativeStairReview,
  NativeStairInspector,
} from "../indoor-project/native-stair-review";
import { sourceStairId } from "../indoor-project/source-stairs";
import {
  ConnectorFloorLinks,
  connectorFloorSelectionId,
} from "../indoor-project/connector-floor-links";
import { ConnectorDetails } from "../indoor-project/connector-details";
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
import { geographicPoint } from "~/indoor-project/routing";
import { useProjectRoute } from "~/indoor-project/use-project-route";
import {
  readIndoorProject,
  readProjectFolder,
  exportIndoorProject,
  exportCampusViewer,
} from "~/indoor-project/project-package-client";
import {
  PROJECT_IMPORT_STAGES,
  type ProjectImportProgress,
} from "~/indoor-project/project-import-progress";
import {
  isViewerProject,
  persistProject,
  clearProject,
  restoreProjectSnapshot,
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
  setReviewPins,
  type ReviewPin,
} from "~/indoor-project/review-pins";
import { preserveReviewPinsOnImport } from "~/indoor-project/import-review-pins";
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
function ViewPitch({
  three,
  selectionOwnsCamera = false,
}: {
  three: boolean;
  selectionOwnsCamera?: boolean;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    // Room review fits the selected bounds and requested pitch together. A
    // separate pitch animation would cancel that fit before its zoom arrives.
    if (!isLoaded || selectionOwnsCamera) return;
    const pitch = three ? 55 : 0;
    if (map && Math.abs(map.getPitch() - pitch) > 0.1)
      map.easeTo({ pitch, duration: 600 });
  }, [map, three, isLoaded, selectionOwnsCamera]);
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
    connector?: boolean;
  } | null;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (map && isLoaded && focus) {
      const container = map.getContainer();
      const card =
        focus.connector &&
        container
          .closest(".project-map")
          ?.querySelector('[aria-label="Selected connector"]')
          ?.getBoundingClientRect();
      const padding = card
        ? container.clientWidth <= 650
          ? {
              left: 24,
              right: 24,
              top: 130,
              bottom: Math.min(card.height + 28, container.clientHeight * 0.55),
            }
          : { left: 50, right: card.width + 40, top: 90, bottom: 60 }
        : undefined;
      map.easeTo({
        center: geographicPoint(data, focus.point),
        zoom: focus.zoom ?? 20.5,
        ...(focus.pitch === undefined ? {} : { pitch: focus.pitch }),
        ...(padding ? { padding, retainPadding: false } : {}),
        duration: 450,
      });
    }
  }, [map, isLoaded, focus, data.alignment]);
  return null;
}
export default function IndoorProjectPage() {
  const [windowMode, setWindowMode] = useState<WindowExportMode | undefined>();
  const [review, setReview] = useState(false);
  const [roomReview, setRoomReview] = useState(false);
  const [roomWindowPreview, setRoomWindowPreview] = useState(false);
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
    connector?: boolean;
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
    [nativePlaneId, setNativePlaneId] = useState("main"),
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
    [showDoorwayRecesses, setShowDoorwayRecesses] = useState(false),
    [showDoorLocations, setShowDoorLocations] = useState(false),
    [showStructures, setShowStructures] = useState(false),
    [simplifyGeometry, setSimplifyGeometry] = useState(false),
    [view, setView] = useState<"2d" | "3d" | "relative" | "native">(() =>
      typeof globalThis !== "undefined" &&
      new URLSearchParams(routeSearch()).get("view") === "relative"
        ? "relative"
        : "3d",
    ),
    [modelStatus, setModelStatus] = useState(""),
    [fullSourceContext, setFullSourceContext] = useState(false),
    [showSourcePatches, setShowSourcePatches] = useState(true),
    [search, setSearch] = useState(""),
    [name, setName] = useState(""),
    [notes, setNotes] = useState(""),
    [access, setAccess] = useState<"public" | "staff" | "unknown">("unknown"),
    [walkable, setWalkable] = useState(true),
    [throughNavigation, setThroughNavigation] = useState(false),
    [enabled, setEnabled] = useState(true),
    [accessible, setAccessible] = useState<"yes" | "no" | "unknown">("unknown");
  const [preparedNativeDisplay, setPreparedNativeDisplay] = useState<{
    data: IndoorProject["dataset"];
    levelIds: number[];
    building: string;
    result?: NativeExploreResult;
    error?: string;
    retry: () => void;
  }>();
  const receivePreparedNativeDisplay = useCallback(
    (snapshot: NonNullable<typeof preparedNativeDisplay>) =>
      setPreparedNativeDisplay(snapshot),
    [],
  );
  const latestProject = useRef(project);
  latestProject.current = project;
  // An explicit import owns this page from the moment the file is selected.
  // A slow startup restore or an earlier ZIP must never replace it afterwards.
  const projectLoad = useRef(0);
  const packageLoadController = useRef<AbortController>();
  const [importNotice, setImportNotice] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    fileName: string;
    startedAt: number;
    progress?: ProjectImportProgress;
  } | null>(null);
  const [importElapsed, setImportElapsed] = useState(0);
  const importStartedAt = importProgress?.startedAt;
  useEffect(() => {
    if (importStartedAt === undefined) return;
    const update = () =>
      setImportElapsed(
        Math.floor((performance.now() - importStartedAt) / 1000),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [importStartedAt]);
  const [packageInfo, setPackageInfo] = useState<{
    fileName: string;
    restored: boolean;
  } | null>(null);
  const routePickState = useRef({ target: routePickTarget, start, end });
  routePickState.current = { target: routePickTarget, start, end };
  const input = useRef<HTMLInputElement>(null),
    fit = useRef<(includeSelection?: boolean) => void>(),
    fitSelection = useRef(true),
    fitted = useRef(false);
  const [placeFitRequest, setPlaceFitRequest] = useState(0);
  const folderInput = useRef<HTMLInputElement>(null);
  const [folderChoosing, setFolderChoosing] = useState(false);
  useEffect(() => {
    if (!folderChoosing || !folderInput.current) return;
    const el = folderInput.current;
    const cancel = () => setFolderChoosing(false);
    el.addEventListener("cancel", cancel);
    el.click();
    return () => el.removeEventListener("cancel", cancel);
  }, [folderChoosing]);
  const [pinReview, setPinReview] = useState(false);
  const [pinRecommendation, setPinRecommendation] =
    useState<PinRecommendation>();
  const [pinComparisonMode, setPinComparisonMode] =
    useState<PinComparisonMode>("map");
  const [pinAcceptedView, setPinAcceptedView] = useState(false);
  const [pinPatchId, setPinPatchId] = useState<string>();
  const [pinComparison, setPinComparison] = useState<PinComparisonResult>();
  const [pinComparisonStatus, setPinComparisonStatus] = useState("");
  const [pinCurrentOutline, setPinCurrentOutline] = useState(true);
  const pinModelPatches = useMemo(
    () =>
      pinReview
        ? {
            version: 1 as const,
            patches: (
              project?.rooms.nativeBoundaryPatches?.patches ?? []
            ).filter(
              (p) =>
                p.status === "applied" ||
                (!!pinComparison &&
                  (pinComparisonMode === "patch" ||
                    pinComparisonMode === "updated-selection") &&
                  pinComparison?.patches.some(
                    (preview) => preview.id === p.id,
                  )),
            ),
          }
        : project?.rooms.nativeBoundaryPatches,
    [
      pinReview,
      project?.rooms.nativeBoundaryPatches,
      pinComparisonMode,
      pinRecommendation,
      pinComparison,
      pinPatchId,
    ],
  );
  useEffect(() => {
    setPinComparison(undefined);
    setPinComparisonStatus("");
    if (!pinReview || !pinRecommendation || !project) return;
    const pin = project.rooms.reviewPins?.pins.find(
      (p) => p.id === pinRecommendation.pinId,
    );
    if (!pin) return;
    const patchIds =
      !pinAcceptedView && pinPatchId
        ? [pinPatchId]
        : pinRecommendation.patchIds;
    if (patchIds.some((id) => !pinRecommendation.patchIds.includes(id))) return;
    const patches = patchIds.map((id) =>
      project.rooms.nativeBoundaryPatches?.patches.find((p) => p.id === id),
    );
    if (patches.some((p) => !p)) {
      setPinComparisonStatus(
        "A saved patch is missing. Refresh this recommendation before previewing it.",
      );
      return;
    }
    setPinComparisonStatus("Tracing current and proposed native boundaries…");
    const worker = new Worker(
      new URL("../indoor-project/pin-comparison.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({
      data: response,
    }: MessageEvent<{ result?: PinComparisonResult; error?: string }>) => {
      setPinComparison(response.result);
      setPinComparisonStatus(
        response.error ??
          "Comparison ready. Preview only; current geometry and directions remain unchanged.",
      );
    };
    worker.onerror = () =>
      setPinComparisonStatus(
        "Boundary comparison failed. Select another pin or reopen the review to retry.",
      );
    const entry = pinRecommendations(project).find(
      (e) => e.recommendation.id === pinRecommendation.id,
    );
    worker.postMessage({
      data: project.dataset,
      levelId: pin.levelId,
      point: pin.pointFeet,
      patches,
      accepted:
        pinAcceptedView && entry
          ? {
              decisions: readPinPatchDecisions(project),
              recommendationId: pinRecommendation.id,
              evidenceSha256: entry.evidenceSha256,
            }
          : undefined,
    });
    return () => worker.terminate();
  }, [
    pinReview,
    pinRecommendation,
    project?.dataset,
    project?.rooms.nativeBoundaryPatches,
    pinPatchId,
    pinAcceptedView,
    pinAcceptedView ? project?.rooms.reviewBundle : undefined,
  ]);
  const [nativePatchComparison, setNativePatchComparison] =
    useState<PatchComparisonView>();
  const [connectionPreview, setConnectionPreview] = useState<GapScanPreview>();
  const [nativeExploreEnabled, setNativeExploreEnabled] = useState(true);
  const [nativeAreas, setNativeAreas] = useState(false);
  const [boundaryPreview, setBoundaryPreview] =
    useState<BoundaryPatchPreviewPlan>();
  const [boundaryComparison, setBoundaryComparison] =
    useState<PinComparisonResult>();
  const [boundaryAfter, setBoundaryAfter] = useState(true);
  const [boundaryPreviewResult, setBoundaryPreviewResult] =
    useState<NativeAreaResult>();
  const [boundaryPreviewStatus, setBoundaryPreviewStatus] = useState("");
  const [displayPreview, setDisplayPreview] =
    useState<ProposalDisplayPreviewPlan>();
  const [displayPreviewStatus, setDisplayPreviewStatus] = useState("");
  const [verifiedDisplayPreview, setVerifiedDisplayPreview] = useState<{
    plan: ProposalDisplayPreviewPlan;
    data: IndoorProject["dataset"];
  }>();
  const [nativeAreaLevel, setNativeAreaLevel] = useState<number>();
  const [nativeAreaResult, setNativeAreaResult] = useState<NativeAreaResult>();
  const [nativeAreaError, setNativeAreaError] = useState("");
  const [nativeAreaSelection, setNativeAreaSelection] = useState<string[]>([]);
  const [nativeAreaAdd, setNativeAreaAdd] = useState(false);
  const [nativeAreaOptions, setNativeAreaOptions] = useState<
    import("../indoor-project/native-area-review").NativeAreaOptions
  >({});
  const [nativeHallways, setNativeHallways] = useState(true);
  const [nativeDrawing, setNativeDrawing] = useState<
    "wall" | "outdoor" | "partition"
  >();
  const [nativeDraft, setNativeDraft] = useState<[number, number][]>([]);
  useEffect(() => {
    setNativeDrawing(undefined);
    setNativeDraft([]);
    setPlacingPin(false);
    setMovingPin(false);
  }, [nativeAreaLevel, nativeAreas]);
  const nativeAreaAnchorKey = useRef<string>();
  const accept = useCallback(
    (p: IndoorProject, fileName?: string, restored = false) => {
      latestProject.current = p;
      setImportNotice(false);
      setPackageInfo({
        fileName: fileName ?? p.manifest.model.fileName,
        restored,
      });
      setDrawingBasemapArea(false);
      setRoomReview(false);
      setPinReview(false);
      setPinRecommendation(undefined);
      setPinComparisonMode("map");
      setNativeAreas(false);
      setNativeAreaSelection([]);
      setDownload(null);
      setWindowMode(undefined);
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
      setFullSourceContext(false);
      setNativePlaneId("main");
      const presentation = initialMapPresentation(
        p.dataset,
        new URLSearchParams(routeSearch()).get("view"),
        !restored,
      );
      setView(presentation.view);
      setNativeExploreEnabled(presentation.nativeFloor);
      setReview(false);
      setEditing(false);
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
    },
    [],
  );
  useEffect(() => {
    return () => {
      if (download) URL.revokeObjectURL(download.url);
    };
  }, [download]);
  useEffect(() => {
    let active = true;
    const loads = projectLoad;
    const request = loads.current;
    const current = () => active && loads.current === request;
    const controller = new AbortController();
    packageLoadController.current = controller;
    void restoreProjectSnapshot()
      .then(async (snapshot) => {
        if (snapshot && current()) {
          setImportProgress({
            fileName: snapshot.fileName ?? "Saved project",
            startedAt: performance.now(),
          });
          const p = await readIndoorProject(
            snapshot.bytes,
            (progress) => {
              if (current())
                setImportProgress((previous) =>
                  previous ? { ...previous, progress } : previous,
                );
            },
            controller.signal,
          );
          if (current()) {
            accept(p, snapshot.fileName, true);
            setImportProgress(null);
          }
        }
      })
      .catch(() => {
        if (current()) {
          setImportProgress(null);
          setMessage(
            "Saved project could not be restored. Import a prepared ZIP.",
          );
        }
      });
    return () => {
      active = false;
      controller.abort();
      loads.current++;
    };
  }, [accept]);
  async function load(file: File, folderFiles?: File[]) {
    const request = ++projectLoad.current;
    packageLoadController.current?.abort();
    const controller = new AbortController();
    packageLoadController.current = controller;
    const current = () => projectLoad.current === request;
    setBusy(true);
    setImportNotice(true);
    const startedAt = performance.now();
    setImportProgress(folderFiles ? null : { fileName: file.name, startedAt });
    setMessage(
      folderFiles
        ? "Checking the master folder, companion hashes and floor maps…"
        : `Validating ${file.name} and loading floor maps…`,
    );
    try {
      const folder = folderFiles
        ? await readProjectFolder(folderFiles, controller.signal)
        : undefined;
      const bytes = folder
        ? await exportIndoorProject(folder.project)
        : new Uint8Array(await file.arrayBuffer());
      if (!current()) return;
      const loaded =
        folder?.project ??
        (await readIndoorProject(
          bytes,
          (progress) => {
            if (current())
              setImportProgress({ fileName: file.name, startedAt, progress });
          },
          controller.signal,
        ));
      if (!current()) return;
      const next = preserveReviewPinsOnImport(loaded, latestProject.current);
      const saved = next === loaded ? bytes : await exportIndoorProject(next);
      if (!current()) return;
      // Queue the write before making the map available for navigation away.
      const writing = persistProject(saved, folder?.fileName ?? file.name);
      accept(next, folder?.fileName ?? file.name);
      setImportProgress(null);
      try {
        await writing;
      } catch {
        if (current()) {
          setImportNotice(true);
          setMessage(
            "Project loaded. Browser storage is unavailable; export reviews to preserve them.",
          );
        }
      }
    } catch (error) {
      if (current()) {
        setImportNotice(true);
        setMessage(
          `Could not import ${folderFiles ? "master folder" : file.name}: ${error instanceof Error ? error.message : String(error)}${latestProject.current ? " Previous map remains loaded." : ""}`,
        );
      }
    } finally {
      if (current()) {
        setImportProgress(null);
        setBusy(false);
      }
    }
  }
  async function clearMap() {
    const request = ++projectLoad.current;
    packageLoadController.current?.abort();
    setImportProgress(null);
    // Queue deletion before allowing a fresh import or a page remount.
    const clearing = clearProject();
    latestProject.current = null;
    setProject(null);
    setPackageInfo(null);
    setReview(true);
    setRoomReview(false);
    setNativeAreas(false);
    setNativeAreaSelection([]);
    setEditing(false);
    setPast([]);
    setFuture([]);
    setDirty(false);
    setDownload(null);
    setDraftPoints([]);
    setSelected("");
    setStart("");
    setEnd("");
    setBusy(true);
    setImportNotice(false);
    setMessage("Clearing the current map and saved project…");
    try {
      await clearing;
      if (projectLoad.current === request)
        setMessage(
          "Map cleared, including the saved ZIP in this browser. Import a project ZIP to start fresh.",
        );
    } catch {
      if (projectLoad.current === request)
        setMessage(
          "Current map cleared. Browser storage could not be cleared; an older saved ZIP may return after reload. Import a new ZIP to replace it.",
        );
    } finally {
      if (projectLoad.current === request) setBusy(false);
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
    const request = projectLoad.current;
    const current = () => projectLoad.current === request;
    setBusy(true);
    setMessage("Preparing campus room geometry, places and navigation…");
    try {
      const windows =
        windowMode ?? project.dataset.windowDisplay?.mode ?? "simplified";
      const bytes = await exportCampusViewer(project, { windows });
      if (!current()) return;
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
          `.windows-${windows}.campus-viewer.zip`,
      });
      setMessage(
        `Campus viewer ready · ${windows === "native" ? "Preserved native windows" : "Current simplified windows"} · ${(bytes.length / 1_048_576).toFixed(2)} MiB. Rooms and routing are unchanged; the reviewed master remains loaded.`,
      );
    } catch (error) {
      if (current())
        setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (current()) setBusy(false);
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
    const request = projectLoad.current;
    const current = () => projectLoad.current === request;
    setBusy(true);
    setMessage("Saving source model, reviews, GIS alignment and navigation…");
    try {
      const bytes = await exportIndoorProject(project);
      if (!current()) return;
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
        if (!current()) return;
        if (latestProject.current === project) setDirty(false);
        setMessage(
          "Reviewed ZIP ready and saved in this browser. Click Download reviewed ZIP for a portable backup.",
        );
      } catch {
        if (current())
          setMessage(
            "Reviewed ZIP ready. Browser storage is unavailable; click Download reviewed ZIP to preserve it.",
          );
      }
    } catch (error) {
      if (current())
        setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (current()) setBusy(false);
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
  const displayData = useMemo(() => {
    if (!project) return undefined;
    const data = editorVisitorDataset(project);
    const previewMode = roomReview && roomWindowPreview ? "native" : windowMode;
    const display =
      data.windowDisplay && previewMode
        ? {
            ...data,
            windowDisplay: { ...data.windowDisplay, mode: previewMode },
          }
        : data;
    registerPreparedDisplayArchive(display, project.preparedDisplay);
    return display;
  }, [
    presentationKey,
    project?.dataset,
    windowMode,
    roomReview,
    roomWindowPreview,
  ]);
  useEffect(
    () => setRoomWindowPreview(false),
    [project?.dataset.source.roomsSha256, roomReview],
  );
  const floor = displayData?.floors.find((f) => f.id === floorId),
    levelIds = useMemo(
      () =>
        nativeAreas && nativeAreaLevel !== undefined
          ? [nativeAreaLevel]
          : displayData?.nativeIndoorEnvelopes && !review && view === "2d"
            ? nativePhysicalDisplayPlaneLevelIds(
                displayData,
                floorId,
                nativePlaneId,
              )
            : (floor?.levelIds ?? []),
      [
        floor,
        nativeAreas,
        nativeAreaLevel,
        displayData,
        floorId,
        nativePlaneId,
        review,
        view,
      ],
    ),
    data = displayData;
  const physicalPlanes = useMemo(
    () =>
      data?.nativeIndoorEnvelopes
        ? nativePhysicalDisplayPlanes(data, floorId)
        : [],
    [data, floorId],
  );
  const nativeExplore =
    !!data &&
    !review &&
    view === "2d" &&
    nativeExploreEnabled &&
    hasNativeExploreGeometry(data);
  // Native mode owns the requested floor immediately. Loading or a failed
  // trace must not flash old prepared outlines as if they were native faces.
  const nativeFloorLevels = useMemo(
    () => (nativeExplore ? levelIds : []),
    [nativeExplore, levelIds],
  );
  const displayPreviewReady =
    verifiedDisplayPreview?.plan === displayPreview &&
    verifiedDisplayPreview?.data === data;

  useEffect(() => {
    setNativeAreaResult(undefined);
    setNativeAreaSelection([]);
    setNativeAreaError("");
    if (!nativeAreas || !data || nativeAreaLevel === undefined) return;
    const worker = new Worker(
      new URL(
        "../indoor-project/native-area-review.worker.ts",
        import.meta.url,
      ),
      { type: "module" },
    );
    worker.onmessage = ({
      data: response,
    }: MessageEvent<{ result?: NativeAreaResult; error?: string }>) => {
      setNativeAreaResult(response.result);
      if (response.result) {
        if (nativeAreaOptions.cropPolygonFeet) {
          fitted.current = true;
          setNativeAreaSelection(response.result.regions.map((r) => r.id));
        } else {
          const key = nativeAreaOptions.roomKey ?? nativeAreaAnchorKey.current;
          const found = response.result.regions.filter(
            (r) => key && r.roomKeys.includes(key),
          );
          if (found.length) {
            fitted.current = true;
            setNativeAreaSelection(found.map((r) => r.id));
          }
        }
      }
      setNativeAreaError(response.error ?? "");
    };
    worker.onerror = () =>
      setNativeAreaError(
        "Native boundary tracing failed. Choose another level to retry.",
      );
    worker.postMessage({
      data,
      levelId: nativeAreaLevel,
      options: nativeAreaOptions,
    });
    return () => worker.terminate();
  }, [nativeAreas, data, nativeAreaLevel, nativeAreaOptions]);
  useEffect(() => {
    setBoundaryPreviewResult(undefined);
    setBoundaryComparison(undefined);
    setBoundaryAfter(true);
    setBoundaryPreviewStatus("");
    if (
      !boundaryPreview ||
      !data ||
      !roomReview ||
      selected !== boundaryPreview.roomKey
    ) {
      setBoundaryPreview(undefined);
      return;
    }
    let active = true;
    const worker = new Worker(
      new URL(
        "../indoor-project/boundary-proposal-preview.worker.ts",
        import.meta.url,
      ),
      { type: "module" },
    );
    setBoundaryPreviewStatus("Tracing the proposed boundary…");
    worker.onmessage = ({
      data: response,
    }: MessageEvent<{
      result?: NativeAreaResult;
      comparison?: PinComparisonResult;
      error?: string;
    }>) => {
      if (!active) return;
      try {
        if (!response.result)
          throw new Error(response.error ?? "Could not trace the proposal.");
        assertBoundaryPatchPreviewResult(
          project!,
          boundaryPreview,
          response.result,
        );
        setBoundaryPreviewResult(response.result);
        setBoundaryComparison(response.comparison);
        const regions = response.result.regions.filter((r) =>
          r.roomKeys.includes(boundaryPreview.roomKey),
        );
        const labels = new Set(regions.flatMap((r) => r.roomKeys));
        setBoundaryPreviewStatus(
          `Boundary preview ready · ${regions.length} matching regions · ${labels.size} place labels. Each color shows a connected native area; magenta shows the wall extension. This is a boundary comparison, not an applied room or route repair.`,
        );
      } catch (error) {
        setBoundaryPreviewStatus(
          error instanceof Error ? error.message : String(error),
        );
      }
      worker.terminate();
    };
    worker.onerror = () => {
      if (active)
        setBoundaryPreviewStatus(
          "The proposal could not be traced. Show original and retry.",
        );
      worker.terminate();
    };
    worker.postMessage({
      data,
      roomKey: boundaryPreview.roomKey,
      levelId: boundaryPreview.patch.levelId,
      options: boundaryPreview.options,
      ...(boundaryPreview.patches
        ? { patches: boundaryPreview.patches }
        : boundaryPreview.patch.manualPointsFeet
          ? {}
          : { patch: boundaryPreview.patch }),
    });
    return () => {
      active = false;
      worker.terminate();
    };
  }, [
    boundaryPreview,
    data,
    roomReview,
    selected,
    project?.rooms.nativeBoundaryPatches,
  ]);
  useEffect(() => {
    setVerifiedDisplayPreview(undefined);
    if (!displayPreview) return;
    if (
      !project ||
      !data ||
      !roomReview ||
      selected !== displayPreview.roomKey
    ) {
      setDisplayPreview(undefined);
      setDisplayPreviewStatus("");
      return;
    }
    try {
      assertProposalDisplayPreviewPlan(project, displayPreview);
    } catch (error) {
      setDisplayPreview(undefined);
      setDisplayPreviewStatus(
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    if (displayPreview.kind === "slab-supported-walkway") {
      setVerifiedDisplayPreview({
        plan: displayPreview,
        data,
      });
      setDisplayPreviewStatus(
        "Blue shows the source outline cropped to native slab support. This is a display comparison; access and directions are unchanged.",
      );
      return;
    }
    let active = true;
    const worker = new Worker(
      new URL(
        "../indoor-project/walkway-proposal-preview.worker.ts",
        import.meta.url,
      ),
      { type: "module" },
    );
    setDisplayPreviewStatus(
      displayPreview.nativeRegion?.passThroughDoorIds?.length
        ? "Tracing native floor continuity through the reviewed thresholds…"
        : "Tracing the full native enclosure from inside wall faces and closed doorway thresholds…",
    );
    worker.onmessage = ({
      data: response,
    }: MessageEvent<{ verified?: boolean; error?: string }>) => {
      if (!active) return;
      if (response.verified) {
        setVerifiedDisplayPreview({
          plan: displayPreview,
          data,
        });
        const preview = displayPreview.nativeRegion!;
        const bypasses = preview.diagnostics.doorChecks.filter(
          (d) =>
            d.status === "same-region" &&
            !preview.passThroughDoorIds?.includes(d.nativeElementId),
        ).length;
        setDisplayPreviewStatus(
          preview.previewPurpose === "boundary-investigation"
            ? `Full native boundary traced · ${preview.diagnostics.roomKeys.length} place labels · ${bypasses} doorway bypasses. Amber shows the connected area that still needs wall-join investigation. ${preview.passThroughDoorIds?.length ? `${preview.passThroughDoorIds.length} pass-through thresholds are included in the floor preview; physical doors remain recorded. ` : ""}The old outline identifies the seed only; walls, columns and floor openings remain excluded. Access and directions are unchanged.`
            : "Blue shows the full native enclosure, bounded by inside wall faces and closed doorway thresholds. The old outline identifies the seed only; walls, columns and openings remain excluded. Access and directions are unchanged.",
        );
      } else
        setDisplayPreviewStatus(
          response.error ?? "The native boundary could not be verified.",
        );
      worker.terminate();
    };
    worker.onerror = () => {
      if (active)
        setDisplayPreviewStatus(
          "The native boundary could not be traced. Show original and retry.",
        );
      worker.terminate();
    };
    // Scene/model bytes are not needed for polygon tracing or evidence validation.
    worker.postMessage({
      project: { dataset: project.dataset, rooms: project.rooms },
      plan: displayPreview,
    });
    return () => {
      active = false;
      worker.terminate();
    };
  }, [
    displayPreview,
    data,
    roomReview,
    selected,
    project?.rooms.nativeBoundaryPatches,
  ]);
  const selectNativeArea = useCallback(
    (id: string, additive: boolean) => {
      nativeAreaAnchorKey.current = nativeAreaResult?.regions.find(
        (r) => r.id === id,
      )?.roomKeys[0];
      // Native selection owns the camera even if prepared floor layers arrive
      // later; their whole-floor fit must not replace the selected boundary.
      fitted.current = true;
      setNativeAreaSelection((old) =>
        additive
          ? old.includes(id)
            ? old.filter((k) => k !== id)
            : [...old, id]
          : [id],
      );
    },
    [nativeAreaResult],
  );
  const boundaryEvidence = useMemo(
    () =>
      data && project
        ? projectBoundaryEvidence(data, project.rooms)
        : new Map<string, string>(),
    [data, project],
  );
  const pins = project?.rooms.reviewPins?.pins ?? noPins;
  const chosenPin = pins.find(
    (p) => p.id === pinId && levelIds.includes(p.levelId),
  );
  const pinNativeLevel =
    nativeAreas && nativeAreaLevel !== undefined
      ? nativeAreaLevel
      : levelIds.includes(pinLevel)
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
    setNativeDrawing(undefined);
    setNativeDraft([]);
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
  // Large datasets build the route graph on visitor intent, not at import.
  const routeCalculation = useProjectRoute(
    data,
    start,
    end,
    mode,
    routePickTarget !== null || !!start || !!end,
  );
  const baseRoute = routeCalculation.route;
  const arrivalResult = useMemo(
    () =>
      arrivalMode === "inside"
        ? { route: baseRoute }
        : (routeCalculation.arrivals?.[arrivalMode] ?? { route: null }),
    [baseRoute, arrivalMode, routeCalculation.arrivals],
  );
  const route = arrivalResult.route;
  const arrivalReasons = useMemo(
    () =>
      baseRoute
        ? {
            doorway: routeCalculation.arrivals?.doorway?.message,
            hallway: routeCalculation.arrivals?.hallway?.message,
          }
        : {},
    [baseRoute, routeCalculation.arrivals],
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
      if (
        kind === "area" &&
        !data?.records.some((r) => r.key === id && r.stair) &&
        !assignRoutePlace(id)
      )
        return;
      pick(kind, id);
    },
    [assignRoutePlace, pick, data],
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
  const changeView = (nextView: typeof view) => {
    if (displayPreview?.kind === "native-enclosure-walkway") {
      fitted.current = true;
    } else if (roomReview && selected) {
      fitSelection.current = true;
      if (nextView === view) fit.current?.(true);
      else fitted.current = false;
    }
    if (nextView === "native" && nextView !== view)
      setModelStatus("Loading the prepared 3D scene…");
    setView(nextView);
  };
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
      if (next && data) {
        setFloorId(next.id);
        setNativePlaneId(
          nativePhysicalDisplayPlaneForLevel(data, next.id, levelId),
        );
      }
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
      className={`indoor-project ${review || !project ? "project-review" : "project-explore"} ${roomReview || nativeAreas || pinReview ? "project-enclosure-review" : ""} ${pinReview ? "project-pin-review" : ""}`}
    >
      <header>
        <div>
          <span className="project-kicker">
            {roomReview ? "ROOM EVIDENCE REVIEW" : "REPLICABLE INDOOR PIPELINE"}
          </span>
          <h1>
            {roomReview ? "Review room enclosures" : "Indoor project workspace"}
          </h1>
        </div>
        <nav>
          <button disabled={busy} onClick={() => void clearMap()}>
            Clear map
          </button>
          {project && (
            <button
              disabled={busy}
              aria-pressed={roomReview}
              onClick={() => {
                setRoomReview((open) => !open);
                setPinReview(false);
                setNativeAreas(false);
                setReview(!roomReview);
                setEditing(false);
                setWallMode(false);
                setWallId("");
                setPinId("");
                setPlacingPin(false);
                setMovingPin(false);
                cancelDrawing();
                setStart("");
                setEnd("");
                setRoutePickTarget(null);
                setCirculation(false);
                setSimplifyGeometry(false);
                setShowPillars(false);
                setShowStructures(true);
                setShowPassThroughPlaces(true);
                setShowVestibuleDoors(false);
              }}
            >
              {roomReview ? "Close room review" : "Room review"}
            </button>
          )}
          {project && !isViewerProject(project) && (
            <button
              disabled={busy}
              aria-pressed={nativeAreas}
              onClick={() => {
                setNativeAreas((open) => !open);
                setPinReview(false);
                setRoomReview(false);
                setEditing(false);
                setReview(true);
                setView("2d");
                setBuilding("all");
                setWallMode(false);
                setPlacingPin(false);
                setMovingPin(false);
                setSelected("");
                setStart("");
                setEnd("");
                setRoutePickTarget(null);
                cancelDrawing();
                fitted.current = false;
                fitSelection.current = false;
                setEditorFocus(null);
                setNativeAreaLevel(
                  levelIds[0] ?? project.dataset.nativeLevels[0]?.id,
                );
              }}
            >
              {nativeAreas ? "Close native areas" : "Native areas"}
            </button>
          )}
          {project && !isViewerProject(project) && (
            <button
              disabled={busy}
              aria-pressed={pinReview}
              onClick={() => {
                setPinReview((open) => !open);
                setReview(true);
                setRoomReview(false);
                setNativeAreas(false);
                setEditing(false);
                setWallMode(false);
                setPlacingPin(false);
                setMovingPin(false);
                cancelDrawing();
                setStart("");
                setEnd("");
                setRoutePickTarget(null);
              }}
            >
              {pinReview ? "Close pin review" : "Pin review"}
            </button>
          )}
          {project && packageInfo && (
            <details className="project-package" data-testid="project-package">
              <summary>Loaded map</summary>
              <div>
                <strong>{packageInfo.fileName}</strong>
                <span>
                  {packageInfo.restored
                    ? "Restored from this browser"
                    : "Imported from ZIP"}
                </span>
                <span>
                  Package exported{" "}
                  {new Date(project.manifest.createdAt).toLocaleString()}
                </span>
                <span>
                  Imported map revision{" "}
                  <code>{project.manifest.indoor.sha256.slice(0, 12)}</code>
                </span>
                {dirty && <span>Contains unsaved edits</span>}
              </div>
            </details>
          )}
          {project && !isViewerProject(project) && (
            <button
              aria-pressed={editing}
              disabled={busy}
              onClick={() => {
                setEditing((value) => !value);
                setPinReview(false);
                setNativeAreas(false);
                setRoomReview(false);
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
                if (
                  review &&
                  nativeExploreEnabled &&
                  hasNativeExploreGeometry(project.dataset)
                )
                  setView("2d");
                setReview((r) => !r);
                setPinReview(false);
                setNativeAreas(false);
                setRoomReview(false);
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
              <button disabled={busy} onClick={() => setFolderChoosing(true)}>
                Import master folder
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
                <label className="project-window-export">
                  Window detail
                  <select
                    aria-label="Window detail"
                    value={
                      windowMode ??
                      project.dataset.windowDisplay?.mode ??
                      "simplified"
                    }
                    onChange={(e) =>
                      setWindowMode(e.target.value as WindowExportMode)
                    }
                    disabled={busy}
                  >
                    <option value="simplified">
                      Current simplified windows
                    </option>
                    <option
                      value="native"
                      disabled={!project.dataset.windowDisplay?.elements.length}
                    >
                      Preserve native windows
                    </option>
                  </select>
                  <span>Preview and viewer export · same rooms and routes</span>
                </label>
              )}
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
        {folderChoosing && (
          <input
            ref={folderInput}
            hidden
            type="file"
            multiple
            {...{ webkitdirectory: "", directory: "" }}
            aria-label="Import master folder files"
            onChange={async (event) => {
              const element = event.currentTarget;
              const files = Array.from(element.files ?? []);
              if (files.length) await load(files[0], files);
              element.value = "";
              setFolderChoosing(false);
            }}
          />
        )}
      </header>
      <p
        className={`project-status${importNotice ? "project-import-notice" : ""}`}
        role="status"
      >
        {dirty && <strong>Unsaved edits · </strong>}
        {importProgress
          ? `${importProgress.fileName} · ${importProgress.progress ? PROJECT_IMPORT_STAGES[importProgress.progress.stage] : "Reading ZIP"}… · ${importElapsed}s elapsed`
          : message}
      </p>
      {project && review && !pinReview && (
        <ReviewBundlePanel bundle={project.rooms.reviewBundle} />
      )}
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
          className={`project-layout ${roomReview || nativeAreas ? "project-room-review-layout" : ""} ${editing ? "project-edit-layout" : ""} ${pinReview ? "project-pin-review-layout" : ""} ${editing && !record && !edge && !door ? "project-content-only" : ""}`}
        >
          {pinReview && (
            <aside
              className="project-sidebar pin-review-sidebar"
              aria-label="Pin review sidebar"
            >
              <PinRecommendationsPanel
                project={project}
                locked={busy}
                onApply={(next) => {
                  commit(next);
                  setMessage(
                    "Review decisions saved in this browser. Export reviewed project to retain them. Geometry and directions are unchanged.",
                  );
                }}
                activeId={pinRecommendation?.id}
                onSelect={(recommendation) => {
                  setPinRecommendation(recommendation);
                  setPinAcceptedView(false);
                  setPinPatchId(recommendation.patchIds[0]);
                  setPinComparisonMode("map");
                  const pin = project.rooms.reviewPins?.pins.find(
                    (p) => p.id === recommendation.pinId,
                  );
                  if (pin) {
                    selectPin(pin.id);
                    chooseLevel(pin.levelId);
                    fitted.current = true;
                    setEditorFocus({
                      point: pin.pointFeet,
                      nonce: Date.now(),
                      zoom: 22,
                      pitch: view === "2d" ? 0 : 45,
                    });
                  }
                }}
                onLocate={(id) => {
                  const pin = project.rooms.reviewPins?.pins.find(
                    (p) => p.id === id,
                  );
                  if (!pin) return;
                  selectPin(id);
                  chooseLevel(pin.levelId);
                  fitted.current = true;
                  setEditorFocus({
                    point: pin.pointFeet,
                    nonce: Date.now(),
                    zoom: 22,
                    pitch: view === "2d" ? 0 : 45,
                  });
                }}
                onCompare={(mode) => {
                  setPinComparisonMode(mode);
                  if (
                    mode === "current-selection" ||
                    mode === "updated-selection"
                  ) {
                    fitted.current = true;
                    changeView("2d");
                  }
                }}
                acceptedView={pinAcceptedView}
                onAccepted={() => {
                  if (!pinAcceptedView) setPinComparison(undefined);
                  setPinAcceptedView(true);
                  setPinComparisonMode("updated-selection");
                  fitted.current = true;
                  changeView("2d");
                }}
                selectedPatchId={pinPatchId}
                onPatchSelect={(id) => {
                  setPinAcceptedView(false);
                  setPinPatchId(id);
                  setPinComparison(undefined);
                  setPinComparisonStatus(
                    "Tracing this patch’s effect on the native boundary…",
                  );
                  if (pinComparisonMode === "map")
                    setPinComparisonMode("patch");
                  const patch =
                    project.rooms.nativeBoundaryPatches?.patches.find(
                      (p) => p.id === id,
                    );
                  const pin = project.rooms.reviewPins?.pins.find(
                    (p) => p.id === pinRecommendation?.pinId,
                  );
                  if (pin) {
                    const ring = patch?.ringsFeet[0];
                    const point: [number, number] = ring
                      ? [
                          ring.reduce((s, p) => s + p[0], 0) / ring.length,
                          ring.reduce((s, p) => s + p[1], 0) / ring.length,
                        ]
                      : pin.pointFeet;
                    chooseLevel(pin.levelId);
                    fitted.current = true;
                    setEditorFocus({
                      point,
                      nonce: Date.now(),
                      zoom: 22,
                      pitch: view === "2d" ? 0 : 45,
                    });
                  }
                }}
                mode={pinComparisonMode}
                comparison={pinComparison}
                comparisonStatus={pinComparisonStatus}
              />
              {pinComparisonMode !== "map" && (
                <label>
                  <input
                    type="checkbox"
                    checked={pinCurrentOutline}
                    onChange={(e) => setPinCurrentOutline(e.target.checked)}
                  />
                  Compare before-patch outline (dashed orange)
                </label>
              )}
              <ReviewBundlePanel bundle={project.rooms.reviewBundle} />
            </aside>
          )}
          {nativeAreas && nativeAreaLevel !== undefined && (
            <aside className="project-sidebar">
              <details open={placingPin || !!chosenPin}>
                <summary>Reference pins</summary>
                <ReviewPinControls
                  data={data}
                  pins={pins}
                  levelIds={[nativeAreaLevel]}
                  levelId={nativeAreaLevel}
                  placing={placingPin}
                  onLevel={setPinLevel}
                  onPlace={beginPinPlacement}
                  onCancel={cancelPinPlacement}
                  onSelect={selectPin}
                />
                {chosenPin && (
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
                      setNativeDrawing(undefined);
                      setNativeDraft([]);
                      setMovingPin(true);
                      setPlacingPin(true);
                    }}
                    onRemove={() => {
                      commit(
                        setReviewPins(
                          project,
                          pins.filter((p) => p.id !== chosenPin.id),
                        ),
                      );
                      setPinId("");
                      cancelPinPlacement();
                    }}
                    capture={() =>
                      wallCapture.current
                        ? wallCapture.current()
                        : Promise.reject(new Error("Map is not ready yet."))
                    }
                  />
                )}
              </details>
              <NativeAreaPanel
                project={project}
                levelId={nativeAreaLevel}
                onLevel={(id) => {
                  setNativeAreaLevel(id);
                  nativeAreaAnchorKey.current = undefined;
                  setNativeAreaOptions((old) => ({
                    maxGapFeet: old.maxGapFeet,
                    mode: old.mode,
                  }));
                  chooseLevel(id);
                  fitted.current = false;
                  fitSelection.current = false;
                }}
                onConnectionPreview={setConnectionPreview}
                onPatchComparison={setNativePatchComparison}
                result={nativeAreaResult}
                error={nativeAreaError}
                selected={nativeAreaSelection}
                additive={nativeAreaAdd}
                onAdditive={setNativeAreaAdd}
                onSelect={selectNativeArea}
                locked={busy}
                onUndo={undo}
                canUndo={past.length > 0}
                onClear={() => {
                  nativeAreaAnchorKey.current = undefined;
                  setNativeAreaSelection([]);
                }}
                onApply={commit}
                options={nativeAreaOptions}
                drawing={nativeDrawing}
                draft={nativeDraft}
                onDrawing={(tool) => {
                  cancelPinPlacement();
                  setNativeDrawing(tool);
                  setNativeDraft([]);
                }}
                onPartitionDraft={setNativeDraft}
                onFinishOutdoor={() => {
                  nativeAreaAnchorKey.current = undefined;
                  setNativeAreaOptions((old) => ({
                    ...old,
                    roomKey: undefined,
                    mode: "connected",
                    cropPolygonFeet: nativeDraft,
                    manualGapPoints: undefined,
                    previewGapIds: [],
                  }));
                  setNativeDrawing(undefined);
                }}
                onOptions={(next) => {
                  if (next.nativeFloorId !== nativeAreaOptions.nativeFloorId) {
                    nativeAreaAnchorKey.current = undefined;
                    setNativeAreaSelection([]);
                  }
                  if (
                    JSON.stringify(next.cropPolygonFeet) !==
                    JSON.stringify(nativeAreaOptions.cropPolygonFeet)
                  )
                    nativeAreaAnchorKey.current = undefined;
                  setNativeAreaOptions(next);
                }}
                showHallways={nativeHallways}
                onShowHallways={setNativeHallways}
                onLocateDoor={(point) => {
                  fitted.current = true;
                  setEditorFocus({
                    point,
                    nonce: Date.now(),
                    zoom: 22,
                    pitch: 0,
                  });
                }}
              />
            </aside>
          )}
          {roomReview && (
            <aside className="project-sidebar">
              <EnclosureReviewPanel
                project={project}
                selected={selected}
                view={view}
                onView={changeView}
                sourceStatus={modelStatus}
                onApply={commit}
                onPreviewBoundary={(plan) => {
                  setDisplayPreview(undefined);
                  setDisplayPreviewStatus("");
                  setBoundaryPreview(plan);
                }}
                previewBoundaryPatchId={boundaryPreview?.patch.id}
                onExitBoundaryPreview={() => setBoundaryPreview(undefined)}
                boundaryPreviewStatus={boundaryPreviewStatus}
                boundaryComparison={boundaryComparison}
                boundaryAfter={boundaryAfter}
                onBoundaryAfter={setBoundaryAfter}
                onPreviewWindows={() => setRoomWindowPreview(true)}
                onExitWindowPreview={() => setRoomWindowPreview(false)}
                previewingWindows={roomWindowPreview}
                onPreviewDisplay={(plan) => {
                  fitted.current = true;
                  setBoundaryPreview(undefined);
                  setDisplayPreview(plan);
                }}
                previewDisplayRoomKey={displayPreview?.roomKey}
                onExitDisplayPreview={() => {
                  setDisplayPreview(undefined);
                  setDisplayPreviewStatus("");
                }}
                displayPreviewStatus={displayPreviewStatus}
                onLocate={(key) => {
                  const room = data.records.find((r) => r.key === key);
                  if (!room) return;
                  chooseLevel(room.levelId);
                  setBuilding("all");
                  setEditorFocus(null);
                  fitted.current = false;
                  pick("area", key);
                }}
              />
            </aside>
          )}
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
          {review && !editing && !roomReview && !nativeAreas && !pinReview && (
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
                  const points = [
                    ...stair.treads.flatMap((t) => t.ringFeet),
                    ...(stair.landings ?? []).flatMap((l) =>
                      l.ringsFeet.flat(),
                    ),
                  ];
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
                  {project.dataset.windowDisplay?.elements.length ? (
                    <label>
                      Preview window detail
                      <select
                        aria-label="Preview window detail"
                        value={windowMode ?? project.dataset.windowDisplay.mode}
                        onChange={(e) =>
                          setWindowMode(e.target.value as WindowExportMode)
                        }
                      >
                        <option value="simplified">
                          Current simplified windows
                        </option>
                        <option value="native">Preserve native windows</option>
                      </select>
                    </label>
                  ) : null}
                  <label>
                    <input
                      type="checkbox"
                      checked={showDoorwayRecesses}
                      onChange={(e) => setShowDoorwayRecesses(e.target.checked)}
                    />
                    Show doorway recesses
                  </label>
                  <p>
                    Room fills close measured doorway recesses when this is off.
                    Door locations and directions stay available.
                  </p>
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
                {routeCalculation.preparing && (
                  <p role="status" data-testid="project-route-preparing">
                    Preparing indoor routes…
                  </p>
                )}
                {start &&
                  end &&
                  (routeCalculation.calculating ? (
                    <p role="status" data-testid="project-route-calculating">
                      {routeCalculation.preparing
                        ? "Your selected directions will run when preparation finishes."
                        : "Calculating directions…"}
                    </p>
                  ) : route ? (
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
                      {routeCalculation.error ??
                        arrivalResult.message ??
                        routeCalculation.diagnostic?.message ??
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
                          chooseLevel(r.levelId);
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
              {review && !editing && !roomReview && (
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
                      {nativeAreas &&
                        ` Native level #${nativeAreaLevel}; region selection is paused while placing the pin.`}
                    </p>
                  )}
                </div>
              )}
              <div
                className="project-view-switch"
                hidden={nativeAreas}
                role="group"
                aria-label="Map presentation"
              >
                <button
                  aria-pressed={
                    view === "2d" &&
                    (!nativeExplore || !!data.nativeIndoorEnvelopes)
                  }
                  onClick={() => {
                    if (!review)
                      setNativeExploreEnabled(!!data.nativeIndoorEnvelopes);
                    changeView("2d");
                  }}
                >
                  {data.nativeIndoorEnvelopes ? "2D floor map" : "2D rooms"}
                </button>
                {!review &&
                  !data.nativeIndoorEnvelopes &&
                  hasNativeExploreGeometry(data) && (
                    <button
                      aria-pressed={nativeExplore}
                      onClick={() => {
                        setNativeExploreEnabled(true);
                        changeView("2d");
                      }}
                    >
                      Native floor map
                    </button>
                  )}
                <button
                  aria-pressed={view === "3d"}
                  onClick={() => changeView("3d")}
                >
                  3D rooms
                </button>
                <button
                  aria-pressed={view === "relative"}
                  title="Keep source height differences within the campus floor"
                  onClick={() => changeView("relative")}
                >
                  3D relative heights
                </button>
                {project.scene && (
                  <button
                    aria-pressed={view === "native"}
                    onClick={() => changeView("native")}
                  >
                    Source model
                  </button>
                )}
                {project.scene && view === "native" && (
                  <button
                    aria-pressed={fullSourceContext}
                    title="Reveal all source walls, glazing and roofs above and below this floor"
                    onClick={() => {
                      setModelStatus("Loading the prepared 3D scene…");
                      setFullSourceContext((value) => !value);
                    }}
                  >
                    Full model context
                  </button>
                )}
                {project.scene &&
                  view === "native" &&
                  !!project.rooms.nativeBoundaryPatches?.patches.length && (
                    <button
                      aria-pressed={showSourcePatches}
                      title="Applied footprints are magenta, proposals orange. Original model bytes are preserved; wall heights are not inferred."
                      onClick={() => setShowSourcePatches((value) => !value)}
                    >
                      Show geometry patches
                    </button>
                  )}
              </div>
              {nativeAreas ? (
                <span className="native-area-map-level">
                  Native level #{nativeAreaLevel}
                </span>
              ) : review && !roomReview ? (
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
                      if (nextFloor !== floorId) setNativePlaneId("main");
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
              {nativeExplore && physicalPlanes.length > 1 && (
                <label className="project-physical-plane-picker">
                  Level detail
                  <select
                    aria-label="Physical level detail"
                    value={
                      physicalPlanes.some((p) => p.id === nativePlaneId)
                        ? nativePlaneId
                        : "main"
                    }
                    onChange={(e) => {
                      setNativePlaneId(e.target.value);
                      setBuilding("all");
                      setSelected("");
                      setEdgeId("");
                      fitSelection.current = false;
                      fitted.current = false;
                    }}
                  >
                    {physicalPlanes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                  onNativeDisplay={receivePreparedNativeDisplay}
                  data={data}
                  nativeFloorLevels={nativeFloorLevels}
                  geometryOpacity={
                    nativeAreas ? 0.4 : editing ? editorAppearance.geometry : 1
                  }
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
                  showDoorwayRecesses={showDoorwayRecesses}
                  showDoorLocations={showDoorLocations}
                  connectorReview={connectorReview}
                  review={review && !roomReview}
                  route={route}
                  selected={selected}
                  onPick={pickMapPlace}
                  pickEnabled={
                    !nativeAreas &&
                    !drawingBasemapArea &&
                    !(review && (wallMode || placingPin) && !editing) &&
                    (!editing || editTool === "select")
                  }
                  onFitReady={ready}
                  selectionPadding={roomReview ? 40 : undefined}
                />
                {nativeExplore && (
                  <NativeExploreLayer
                    usePreparedDisplay={!!data.nativeIndoorEnvelopes}
                    onRetryPreparedDisplay={
                      preparedNativeDisplay?.data === data &&
                      preparedNativeDisplay.building === building &&
                      preparedNativeDisplay.levelIds.join(",") ===
                        levelIds.join(",")
                        ? preparedNativeDisplay.retry
                        : undefined
                    }
                    preparedDisplay={
                      preparedNativeDisplay?.data === data &&
                      preparedNativeDisplay.building === building &&
                      preparedNativeDisplay.levelIds.join(",") ===
                        levelIds.join(",")
                        ? preparedNativeDisplay.result
                        : undefined
                    }
                    preparedDisplayError={
                      preparedNativeDisplay?.data === data &&
                      preparedNativeDisplay.building === building &&
                      preparedNativeDisplay.levelIds.join(",") ===
                        levelIds.join(",")
                        ? preparedNativeDisplay.error
                        : undefined
                    }
                    data={data}
                    levelIds={levelIds}
                    building={building}
                    selected={selected}
                    onPick={(key) => pickMapPlace("area", key)}
                    onFitReady={ready}
                    fitRequest={placeFitRequest}
                  />
                )}
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
                {roomReview &&
                  ((boundaryPreview && boundaryPreviewResult) ||
                    (displayPreview && displayPreviewReady)) && (
                    <BoundaryProposalPreviewLayer
                      data={data}
                      plan={boundaryPreview}
                      result={boundaryPreviewResult}
                      comparison={boundaryComparison}
                      after={boundaryAfter}
                      displayPlan={
                        displayPreviewReady ? displayPreview : undefined
                      }
                    />
                  )}
                {nativeAreas && (
                  <NativeAreaLayer
                    data={data}
                    result={nativeAreaResult}
                    selected={nativeAreaSelection}
                    showHallways={nativeHallways}
                    interactive={!placingPin && !nativePatchComparison}
                    drawing={nativeDrawing}
                    draft={nativeDraft}
                    onPoint={(point) => {
                      if (
                        nativeDrawing === "partition" &&
                        nativeDraft.length >= 2
                      )
                        return;
                      const points = [...nativeDraft, point];
                      setNativeDraft(points);
                      if (nativeDrawing === "wall" && points.length === 2) {
                        nativeAreaAnchorKey.current = undefined;
                        setNativeAreaOptions((old) => ({
                          ...old,
                          manualGapPoints: points as [
                            [number, number],
                            [number, number],
                          ],
                          previewGapIds: [],
                        }));
                        setNativeDrawing(undefined);
                      }
                    }}
                    decisions={project.rooms.nativeAreaReviews?.decisions ?? []}
                    onSelect={(id, additive) =>
                      selectNativeArea(id, additive || nativeAreaAdd)
                    }
                  />
                )}
                {pinReview &&
                  pinComparison &&
                  levelIds.includes(
                    project.rooms.reviewPins?.pins.find(
                      (p) => p.id === pinRecommendation?.pinId,
                    )?.levelId ?? -1,
                  ) &&
                  pinComparisonMode !== "map" && (
                    <PinComparisonLayer
                      data={data}
                      result={pinComparison}
                      mode={pinComparisonMode}
                      showCurrent={pinCurrentOutline}
                    />
                  )}
                {nativeAreas &&
                  nativePatchComparison?.data === data &&
                  nativePatchComparison.result.patches.every(
                    (p) => p.levelId === nativeAreaLevel,
                  ) && (
                    <PinComparisonLayer
                      data={data}
                      result={nativePatchComparison.result}
                      mode={nativePatchComparison.mode}
                      showCurrent={false}
                    />
                  )}
                {nativeAreas && connectionPreview && (
                  <NativeGapScanLayer data={data} preview={connectionPreview} />
                )}
                {view === "native" && project.scene && (
                  <ProjectModelLayer
                    data={data}
                    bytes={project.scene}
                    levelIds={levelIds}
                    sectionLevelId={record?.levelId}
                    fullContext={fullSourceContext}
                    boundaryPatches={pinModelPatches}
                    showPatches={showSourcePatches}
                    onStatus={setModelStatus}
                  />
                )}
                {!review && (
                  <ProjectNavigation
                    onWindowDetail={setWindowMode}
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
                    calculating={routeCalculation.calculating}
                    preparingRoutes={routeCalculation.preparing}
                    reachable={routeCalculation.reachable}
                    calculationError={routeCalculation.error}
                    routeDiagnostic={routeCalculation.diagnostic}
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
                    onLocate={
                      nativeExplore
                        ? (key) => {
                            const room = data.records.find(
                              (r) => r.key === key,
                            );
                            if (!room) return;
                            fitted.current = false;
                            fitSelection.current = true;
                            setPlaceFitRequest((request) => request + 1);
                            chooseLevel(room.levelId);
                            pick("area", key);
                          }
                        : undefined
                    }
                    onFloor={chooseLevel}
                    onReview={() => {
                      setPinReview(false);
                      setRoomReview(false);
                      setNativeAreas(false);
                      setEditing(false);
                      setPlacingPin(false);
                      setWallMode(false);
                      setReview(true);
                    }}
                    showPassThroughPlaces={showPassThroughPlaces}
                    onPassThroughPlaces={setShowPassThroughPlaces}
                    showVestibuleDoors={showVestibuleDoors}
                    onVestibuleDoors={setShowVestibuleDoors}
                    showDoorwayRecesses={showDoorwayRecesses}
                    onDoorwayRecesses={setShowDoorwayRecesses}
                    showDoorLocations={showDoorLocations}
                    onDoorLocations={setShowDoorLocations}
                  />
                )}
                <ProjectRouteFocus data={data} route={route} />
                <ViewPitch
                  three={view !== "2d"}
                  selectionOwnsCamera={roomReview && !!selected}
                />
                <MapControls />
              </MapCanvas>
            </MapProvider>
            {!review &&
              (sourceStair ||
                record?.stair ||
                (edge &&
                  [
                    "stairs",
                    "local-steps",
                    "ramp",
                    "elevator",
                    "escalator",
                  ].includes(edge.kind))) && (
                <aside
                  className="project-point-location-card"
                  aria-label="Selected connector"
                >
                  <button
                    aria-label="Close selected connector"
                    onClick={() => {
                      setEdgeId("");
                      setSelected("");
                    }}
                  >
                    ×
                  </button>
                  <ConnectorFloorLinks
                    data={data}
                    room={record?.stair ? record : undefined}
                    edge={edge}
                    nativeElementId={sourceStair?.stairElementId}
                    onNavigate={(target) => {
                      setFloorId(target.floorId);
                      setNativePlaneId(
                        nativePhysicalDisplayPlaneForLevel(
                          data,
                          target.floorId,
                          target.node.levelId,
                        ),
                      );
                      setBuilding("all");
                      setSelected("");
                      setEdgeId(connectorFloorSelectionId(data, target));
                      setEditorFocus({
                        point: [
                          target.node.pointFeet[0],
                          target.node.pointFeet[1],
                        ],
                        nonce: Date.now(),
                        zoom: 20,
                        connector: true,
                      });
                    }}
                  />
                  {sourceStair ? (
                    <NativeStairInspector data={data} stair={sourceStair} />
                  ) : (
                    <ConnectorDetails
                      data={data}
                      room={record?.stair ? record : undefined}
                      edge={edge}
                    />
                  )}
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
              Light green walkways and stairs · grey overview buildings · blue
              entrances · blue route · orange doors need review
              {!data.doors && (
                <span>
                  {" "}
                  · Import a regenerated ZIP for native door openings.
                </span>
              )}
            </div>
          </section>
          {review && !pinReview && (!editing || record || edge || door) && (
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
              <ConnectorFloorLinks
                data={data}
                room={record?.stair ? record : undefined}
                edge={edge}
                nativeElementId={sourceStair?.stairElementId}
                onNavigate={(target) => {
                  setFloorId(target.floorId);
                  setNativePlaneId(
                    nativePhysicalDisplayPlaneForLevel(
                      data,
                      target.floorId,
                      target.node.levelId,
                    ),
                  );
                  if (nativeAreas) setNativeAreaLevel(target.node.levelId);
                  setBuilding("all");
                  setSelected("");
                  setEdgeId(connectorFloorSelectionId(data, target));
                  setEditorFocus({
                    point: [target.node.pointFeet[0], target.node.pointFeet[1]],
                    nonce: Date.now(),
                    zoom: 20,
                    connector: true,
                  });
                }}
              />
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
                  onInspectStair={(stair) => {
                    // The native-flight focus takes precedence over a pending
                    // whole-floor fit from asynchronous floor preparation.
                    fitted.current = true;
                    setSelected("");
                    setEdgeId(sourceStairId(stair.stairElementId));
                    setPinId("");
                    const points = [
                      ...stair.treads.flatMap((t) => t.ringFeet),
                      ...(stair.landings ?? []).flatMap((l) =>
                        l.ringsFeet.flat(),
                      ),
                    ];
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
                      zoom: 20,
                    });
                  }}
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
                    <dd>{boundaryEvidence.get(record.key)}</dd>
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
