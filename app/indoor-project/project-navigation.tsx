import type { ProjectRouteDiagnostic } from "./route-diagnostics";
import { useEffect, useMemo, useState } from "react";
import { LngLatBounds } from "maplibre-gl";
import {
  ArrowLeft,
  ArrowDownUp,
  Building2,
  Coffee,
  GraduationCap,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
  DoorOpen,
  LockKeyhole,
} from "lucide-react";
import { useMap } from "../components/map/map";
import HospitalRoutePreview from "../components/discovery-panel/hospital-route-preview";
import { summarizeRoute } from "../utils/route-summary";
import { hospitalFollowPadding } from "../utils/hospital-follow-padding";
import { fitProjectPlaceBounds } from "./place-camera";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { geographicPoint, type ProjectRoute } from "./routing";
import { projectFloorName, projectNavigationSteps } from "./navigation-steps";
import { ProjectPlaceSearch } from "./place-search";
import {
  isNamedOpenPlace,
  isPlaceSearchCandidate,
  isVisitorHallway,
} from "./place-discovery";
import {
  projectBuildingName,
  projectPlaceDisplayName,
  projectPlaceMetadata,
  projectPlaceCategory,
} from "./visitor-metadata";
import { connectorSvg } from "./connector-markers";
import { ProjectRouteArrivalMenu } from "./route-arrival-menu";
import type { ProjectArrivalMode } from "./route-arrival";
import { ProjectRouteProfileMenu } from "./route-profile-menu";
import { routeTransitRooms } from "./route-review-summary";
import { isProjectDestination } from "./routing-graph";

import type { MapLocation } from "./map-edits";
import { LocationDetails } from "./location-details";
import {
  isPassThroughPlace,
  isRestrictedArea,
  RESTRICTED_AREA_COLOR,
} from "./display-passages";
import { LabelSettingsPanel } from "./label-settings-panel";
import { BasemapSettingsPanel } from "./basemap-settings-panel";
import type {
  BasemapBuildingSettings,
  BasemapAreaShape,
} from "./basemap-buildings";
import type { LabelSettings } from "./label-settings";

const categories = [
  {
    name: "Study & Teaching",
    Icon: GraduationCap,
    category: "study",
  },
  {
    name: "Food & Coffee",
    Icon: Coffee,
    category: "food",
  },
  { name: "Washroom", Icon: Users, category: "washroom" },
  { name: "Departments", Icon: Building2, category: "department" },
  {
    name: "Stairs & Entrances",
    Icon: ArrowDownUp,
    category: "entrance",
  },
  { name: "See All", Icon: MapPin, category: "all" },
];
const placeName = (data: IndoorDataset, r: IndoorRecord | undefined) =>
  r
    ? [r.number, projectPlaceDisplayName(data, r)].filter(Boolean).join(" · ")
    : "Selected area";
const categoryIcons = {
  study: GraduationCap,
  food: Coffee,
  washroom: Users,
  department: Building2,
  entrance: DoorOpen,
  other: MapPin,
};
export function ProjectNavigation({
  data,
  route,
  calculating,
  preparingRoutes = false,
  calculationError,
  routeDiagnostic,
  reachable,
  start,
  end,
  mode,
  arrivalMode,
  onArrivalMode,
  arrivalMessage,
  arrivalReasons,
  selected,
  onStart,
  onEnd,
  pickTarget,
  onPickTarget,
  onMode,
  onPick,
  onLocate,
  onFloor,
  onReview,
  roomThree,
  managedLocations,
  showPassThroughPlaces,
  onPassThroughPlaces,
  onWindowDetail,
  showDoorwayRecesses,
  onDoorwayRecesses,
  showDoorLocations,
  onDoorLocations,
  showVestibuleDoors,
  onVestibuleDoors,
  showStructures,
  onStructures,
  simplifyGeometry,
  onSimplifyGeometry,
  labelSettings,
  onLabelSettings,
  basemapBuildings,
  onBasemapBuildings,
  onDrawBasemapArea,
}: {
  data: IndoorDataset;
  managedLocations?: MapLocation[];
  route: ProjectRoute | null;
  calculating: boolean;
  /** The route graph is still being built (first route on a large map). */
  preparingRoutes?: boolean;
  calculationError?: string;
  routeDiagnostic?: ProjectRouteDiagnostic;
  reachable?: Set<string>;
  start: string;
  end: string;
  mode: "public" | "accessible";
  arrivalMode: ProjectArrivalMode;
  onArrivalMode: (mode: ProjectArrivalMode) => void;
  arrivalMessage?: string;
  arrivalReasons: Partial<Record<ProjectArrivalMode, string>>;
  selected: string;
  onStart: (key: string) => void;
  onEnd: (key: string) => void;
  pickTarget: "start" | "end" | null;
  onPickTarget: (target: "start" | "end" | null) => void;
  onMode: (mode: "public" | "accessible") => void;
  onPick: (kind: "area" | "edge", key: string) => void;
  /** Native mode waits for its current scoped faces and selected card layout. */
  onLocate?: (key: string) => void;
  onFloor: (levelId: number) => void;
  onReview: () => void;
  roomThree: boolean;
  showPassThroughPlaces: boolean;
  onPassThroughPlaces: (show: boolean) => void;
  onWindowDetail?: (mode: "native" | "simplified") => void;
  showDoorwayRecesses: boolean;
  onDoorwayRecesses: (show: boolean) => void;
  showDoorLocations: boolean;
  onDoorLocations: (show: boolean) => void;
  showVestibuleDoors: boolean;
  onVestibuleDoors: (show: boolean) => void;
  showStructures: boolean;
  onStructures: (show: boolean) => void;
  simplifyGeometry: boolean;
  onSimplifyGeometry: (simple: boolean) => void;
  labelSettings: LabelSettings;
  onLabelSettings: (settings: LabelSettings) => void;
  basemapBuildings: BasemapBuildingSettings;
  onBasemapBuildings: (settings: BasemapBuildingSettings) => void;
  onDrawBasemapArea: (shape: BasemapAreaShape) => void;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => () => onPickTarget(null), [onPickTarget]);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [settings, setSettings] = useState(false),
    [directions, setDirections] = useState(false),
    [following, setFollowing] = useState(false),
    [activeStep, setActiveStep] = useState(0),
    [focusVersion, setFocusVersion] = useState(0),
    [playing, setPlaying] = useState(false);
  const record = data.records.find((r) => r.key === selected),
    departure = data.records.find((r) => r.key === start),
    destination = data.records.find((r) => r.key === end);
  const managedLocation = managedLocations?.find(
    (p) => record && p.roomKeys.includes(record.key),
  );
  const tagsFor = (key: string) =>
    managedLocations?.find((p) => p.roomKeys.includes(key))?.tags.join(" ") ??
    "";
  const PlaceIcon = record
    ? categoryIcons[projectPlaceCategory(data, record)]
    : MapPin;
  const placeMetadata = record
    ? projectPlaceMetadata(data, record.key)
    : undefined;
  const steps = useMemo(
    () =>
      route
        ? projectNavigationSteps(
            data,
            route,
            placeName(data, departure),
            placeName(data, destination),
          )
        : [],
    [data, route, departure, destination],
  );
  const summary = useMemo(() => summarizeRoute(steps), [steps]);
  const transitRooms = useMemo(
    () => (route ? routeTransitRooms(data, route, start, end) : []),
    [data, route, start, end],
  );
  const failure = routeDiagnostic;
  const destinations = useMemo(
    () =>
      data.records
        .filter(
          (room) =>
            isProjectDestination(room) &&
            !isVisitorHallway(room) &&
            (showPassThroughPlaces ||
              !isPassThroughPlace(room) ||
              room.key === start ||
              room.key === end),
        )
        .sort((a, b) => placeName(data, a).localeCompare(placeName(data, b))),
    [data, showPassThroughPlaces, start, end],
  );
  const matches = useMemo(
    () =>
      data.records
        .filter(
          (r) =>
            isPlaceSearchCandidate(r, query, showPassThroughPlaces) &&
            (!r.circulation ||
              isNamedOpenPlace(r) ||
              !!query ||
              category === "See All" ||
              category === "Stairs & Entrances") &&
            r.access !== "staff" &&
            (!query ||
              `${r.number} ${r.name} ${projectPlaceDisplayName(data, r)} ${projectBuildingName(data, r.building)} ${projectPlaceMetadata(data, r.key)?.department ?? ""} ${tagsFor(r.key)}`
                .toLowerCase()
                .includes(query.toLowerCase())) &&
            (!category ||
              category === "See All" ||
              categories.find((c) => c.name === category)?.category ===
                projectPlaceCategory(data, r)),
        )
        .slice(0, 35),
    [data, query, category, showPassThroughPlaces, managedLocations],
  );
  useEffect(() => {
    if (
      data.records.some((room) => room.key === start && isVisitorHallway(room))
    )
      onStart("");
    if (data.records.some((room) => room.key === end && isVisitorHallway(room)))
      onEnd("");
  }, [data, start, end, onStart, onEnd]);
  useEffect(() => {
    if (
      record &&
      !record.stair &&
      !isRestrictedArea(record) &&
      (isVisitorHallway(record) ||
        (!showPassThroughPlaces && isPassThroughPlace(record)))
    )
      onPick("area", "");
  }, [showPassThroughPlaces, record, onPick]);
  useEffect(() => {
    setFollowing(false);
    setPlaying(false);
    setActiveStep(0);
  }, [route]);
  useEffect(() => {
    if (!playing || !following) return;
    if (activeStep >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setActiveStep((i) => i + 1), 3500);
    return () => clearTimeout(timer);
  }, [playing, following, activeStep, steps.length]);
  useEffect(() => {
    if (!following || !map || !isLoaded || !steps[activeStep]) return;
    const step = steps[activeStep];
    onFloor(step.levelId);
    const bounds = new LngLatBounds();
    for (const p of step.pointsFeet) bounds.extend(geographicPoint(data, p));
    if (!bounds.isEmpty())
      map.fitBounds(bounds, {
        padding: hospitalFollowPadding(map.getContainer()),
        maxZoom: 21,
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        duration: 600,
      });
  }, [
    following,
    activeStep,
    steps,
    map,
    isLoaded,
    data,
    onFloor,
    focusVersion,
  ]);
  useEffect(() => {
    if (!map || !following) return;
    const container = map.getContainer();
    const card = container.querySelector('[aria-label="Current direction"]');
    const root = container.parentElement;
    if (!card || !root) return;
    const update = () =>
      root.style.setProperty(
        "--project-mobile-follow-top",
        `${card.getBoundingClientRect().height + 12}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(card);
    update();
    return () => {
      observer.disconnect();
      root.style.removeProperty("--project-mobile-follow-top");
    };
  }, [following, map]);
  const choose = (r: IndoorRecord) => {
    if (onLocate) {
      onLocate(r.key);
      return;
    }
    onPick("area", r.key);
    const arrival = data.nodes.find((n) => n.id === r.arrivalNodeId);
    onFloor(
      data.nativeIndoorEnvelopes && arrival ? arrival.levelId : r.levelId,
    );
    if (map) {
      const bounds = new LngLatBounds();
      const points = data.nativeIndoorEnvelopes
        ? arrival
          ? [arrival.pointFeet]
          : []
        : r.ringsFeet[0];
      for (const p of points) bounds.extend(geographicPoint(data, p));
      if (bounds.isEmpty()) return;
      fitProjectPlaceBounds(map, bounds, {
        maxZoom: 21,
        // A room selection can interrupt the view-mode camera animation.
        // Use the requested mode instead of freezing its intermediate pitch.
        pitch: roomThree ? 55 : 0,
        bearing: map.getBearing(),
        duration: 600,
      });
    }
  };
  const close = () => {
    setFollowing(false);
    setPlaying(false);
    setDirections(true);
    onPickTarget(start ? "end" : "start");
  };
  return (
    <div
      className={`project-visitor-ui ${following ? "project-following" : ""} ${directions ? "project-directions" : ""}`}
      data-testid="project-navigation"
    >
      {following && steps.length > 0 ? (
        <HospitalRoutePreview
          instructions={steps}
          activeStep={activeStep}
          summary={summary}
          departure={placeName(data, departure)}
          destination={placeName(data, destination)}
          building={projectBuildingName(data, steps[activeStep].building)}
          floor={projectFloorName(data, steps[activeStep].levelId)}
          isPreviewing={playing}
          onBack={close}
          onStep={(index) => {
            setActiveStep(index);
            setPlaying(false);
            setFocusVersion((v) => v + 1);
          }}
          onPreview={() => setPlaying((p) => !p)}
        />
      ) : (
        <>
          {directions ? (
            <>
              <div className="project-directions-header">
                <button
                  className="project-back"
                  onClick={() => {
                    setDirections(false);
                    onPickTarget(null);
                  }}
                >
                  <ArrowLeft size={20} /> Back
                </button>
                <button
                  className="project-swap"
                  aria-label="Swap start and destination"
                  onClick={() => {
                    onStart(end);
                    onEnd(start);
                  }}
                >
                  <ArrowDownUp size={18} />
                </button>
              </div>
              <h2>Directions</h2>
              <p className="project-field-label">From</p>
              <ProjectPlaceSearch
                data={data}
                places={destinations}
                searchTags={Object.fromEntries(
                  (managedLocations ?? []).flatMap((p) =>
                    p.roomKeys.map((k) => [k, p.tags.join(" ")]),
                  ),
                )}
                label="Route start"
                placeholder="Choose departure"
                value={start}
                mapActive={pickTarget === "start"}
                onActivate={() => onPickTarget("start")}
                onChange={(key) => {
                  onStart(key);
                  const room = destinations.find((r) => r.key === key);
                  if (room) {
                    choose(room);
                    onPickTarget(end ? null : "end");
                  }
                }}
              />
              <p className="project-field-label">To</p>
              <ProjectPlaceSearch
                data={data}
                places={destinations}
                searchTags={Object.fromEntries(
                  (managedLocations ?? []).flatMap((p) =>
                    p.roomKeys.map((k) => [k, p.tags.join(" ")]),
                  ),
                )}
                label="Route destination"
                placeholder="Choose destination"
                value={end}
                mapActive={pickTarget === "end"}
                onActivate={() => onPickTarget("end")}
                reachable={reachable}
                mode={mode}
                onChange={(key) => {
                  onEnd(key);
                  const room = destinations.find((r) => r.key === key);
                  if (room) {
                    choose(room);
                    onPickTarget(start ? null : "start");
                  }
                }}
              />
              <p className="project-map-pick-hint" aria-live="polite">
                {start && end
                  ? pickTarget === "end"
                    ? "Choose another destination or click a place on the map."
                    : pickTarget === "start"
                      ? "Choose another departure or click a place on the map."
                      : "Select From or To to change a location."
                  : pickTarget === "end" || start
                    ? "Type a destination or click a place on the map."
                    : "Type a departure or click a place on the map."}
              </p>
              <ProjectRouteProfileMenu mode={mode} onChange={onMode} />
              <ProjectRouteArrivalMenu
                mode={arrivalMode}
                onChange={onArrivalMode}
                reasons={arrivalReasons}
              />
              {start &&
                end &&
                (calculating ? (
                  <p
                    className="project-nav-result"
                    role="status"
                    data-testid="project-route-calculating"
                  >
                    {preparingRoutes
                      ? "Preparing directions…"
                      : "Calculating directions…"}
                  </p>
                ) : route ? (
                  <div
                    className="project-nav-result"
                    data-testid="project-route-result"
                  >
                    <strong>
                      {route.distanceMetres.toFixed(1)} m ·{" "}
                      {Math.max(1, Math.round(summary.durationSeconds / 60))}{" "}
                      min
                    </strong>
                    <p>
                      {steps.filter((s) => s.type === "floor-change").length}{" "}
                      {steps.filter((s) => s.type === "floor-change").length ===
                      1
                        ? "floor change"
                        : "floor changes"}{" "}
                      · {steps.filter((s) => s.type === "turn").length}{" "}
                      {steps.filter((s) => s.type === "turn").length === 1
                        ? "turn"
                        : "turns"}
                    </p>
                    {route.unknownAccessAreas.length > 0 && (
                      <p className="project-access-note">
                        Public access is unknown for{" "}
                        {route.unknownAccessAreas.length} areas.
                      </p>
                    )}
                    {route.unknownAccessibilityEdges > 0 && (
                      <p className="project-access-note">
                        Step-free access is unconfirmed for{" "}
                        {route.unknownAccessibilityEdges}{" "}
                        {route.unknownAccessibilityEdges === 1
                          ? "connection"
                          : "connections"}
                        .
                      </p>
                    )}
                    {transitRooms.length > 0 && (
                      <p className="project-access-note">
                        This route passes through{" "}
                        {transitRooms
                          .map((room) => placeName(data, room))
                          .join(", ")}
                        . Check that these rooms permit passage.
                      </p>
                    )}
                    <button
                      className="project-primary"
                      // Keep the search field's blur from moving this button
                      // between mouse-down and click when suggestions are open.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setActiveStep(0);
                        onPickTarget(null);
                        setFollowing(true);
                      }}
                    >
                      Preview directions
                    </button>
                  </div>
                ) : (
                  <div
                    data-testid="project-route-result"
                    className="project-warning"
                  >
                    <p>
                      {calculationError ?? arrivalMessage ?? failure?.message}
                    </p>
                    {!calculationError && !arrivalMessage && (
                      <button
                        onClick={() => {
                          const target =
                            data.records.find(
                              (r) => r.key === failure?.reviewRoomKey,
                            ) ?? departure;
                          if (target) {
                            if (failure?.reviewEdgeId)
                              onPick("edge", failure.reviewEdgeId);
                            else onPick("area", target.key);
                            onFloor(target.levelId);
                          }
                          onReview();
                        }}
                      >
                        Review connection
                      </button>
                    )}
                  </div>
                ))}
            </>
          ) : (
            <>
              <div className="project-search-row">
                <Search size={18} />
                <input
                  aria-label="Search indoor map"
                  placeholder="Search rooms and places…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    onPick("area", "");
                  }}
                />
                <button
                  aria-label="Map preferences"
                  onClick={() => setSettings((s) => !s)}
                >
                  <SlidersHorizontal size={19} />
                </button>
              </div>
              {settings && (
                <div className="project-map-preferences">
                  <BasemapSettingsPanel
                    settings={basemapBuildings}
                    onChange={onBasemapBuildings}
                    onDraw={(shape) => {
                      setSettings(false);
                      onDrawBasemapArea(shape);
                    }}
                  />
                  <LabelSettingsPanel
                    settings={labelSettings}
                    onChange={onLabelSettings}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={simplifyGeometry}
                      onChange={(e) => onSimplifyGeometry(e.target.checked)}
                    />
                    Simplify map geometry
                  </label>
                  <p>
                    Use clean room blocks where doors, neighbours and floor
                    openings allow it. Turn off to see the detailed layout.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={showPassThroughPlaces}
                      onChange={(e) => onPassThroughPlaces(e.target.checked)}
                    />
                    Show pass-through places
                  </label>
                  {data.windowDisplay?.elements.length && onWindowDetail ? (
                    <label>
                      Preview window detail
                      <select
                        aria-label="Preview window detail"
                        value={data.windowDisplay.mode}
                        onChange={(e) =>
                          onWindowDetail(
                            e.target.value as "native" | "simplified",
                          )
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
                      onChange={(e) => onDoorwayRecesses(e.target.checked)}
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
                      checked={showDoorLocations}
                      onChange={(e) => onDoorLocations(e.target.checked)}
                    />
                    Show door locations
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showVestibuleDoors}
                      onChange={(e) => onVestibuleDoors(e.target.checked)}
                    />
                    Show vestibule doors
                  </label>
                  <ProjectRouteProfileMenu
                    label="Navigation preference"
                    mode={mode}
                    onChange={onMode}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={showStructures}
                      onChange={(e) => onStructures(e.target.checked)}
                    />{" "}
                    Show unmapped structures
                  </label>
                  <p>
                    Source walls without room coverage and broad approximate
                    wall envelopes. Review project shows all source geometry.
                  </p>
                </div>
              )}
              {record &&
                (isRestrictedArea(record) ||
                  !isPassThroughPlace(record) ||
                  showPassThroughPlaces) && (
                  <div className="project-place-card">
                    <button
                      className="project-back"
                      onClick={() => onPick("area", "")}
                    >
                      <ArrowLeft size={18} /> All places
                    </button>
                    <div className="project-place-icon">
                      {record.stair ? (
                        <svg
                          width="26"
                          height="26"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          dangerouslySetInnerHTML={{
                            __html: connectorSvg("stairs"),
                          }}
                        />
                      ) : (
                        <PlaceIcon size={26} />
                      )}
                    </div>
                    <h2>{projectPlaceDisplayName(data, record)}</h2>
                    <p>
                      {record.number} ·{" "}
                      {projectBuildingName(data, record.building)}
                    </p>
                    <p>{projectFloorName(data, record.levelId)}</p>
                    {placeMetadata?.department && (
                      <p>{placeMetadata.department}</p>
                    )}
                    {placeMetadata?.description && (
                      <p className="project-place-description">
                        {placeMetadata.description}
                      </p>
                    )}
                    {isRestrictedArea(record) ? (
                      <p className="project-restricted-note">
                        <span
                          className="project-restricted-swatch"
                          style={{ backgroundColor: RESTRICTED_AREA_COLOR }}
                        />
                        <LockKeyhole size={16} aria-hidden="true" />
                        Off limits · Staff only
                      </p>
                    ) : (
                      !record.arrivalNodeId && (
                        <p className="project-access-note">
                          Entrance needs review before directions are available.
                        </p>
                      )
                    )}
                    {managedLocation && (
                      <LocationDetails location={managedLocation} />
                    )}
                    <div className="project-place-actions">
                      <button
                        disabled={record.access === "staff" || !record.walkable}
                        onClick={() => {
                          onStart(record.key);
                          onPickTarget("end");
                          setDirections(true);
                        }}
                      >
                        From here
                      </button>
                      <button
                        className="project-primary"
                        disabled={record.access === "staff" || !record.walkable}
                        onClick={() => {
                          onEnd(record.key);
                          onPickTarget("start");
                          setDirections(true);
                        }}
                      >
                        Directions
                      </button>
                    </div>
                  </div>
                )}
              {!record && (query || category) && (
                <>
                  <button
                    className="project-back"
                    onClick={() => {
                      setQuery("");
                      setCategory("");
                    }}
                  >
                    <ArrowLeft size={18} />
                    {category || "Search results"}
                  </button>
                  <div className="project-place-list">
                    {matches.length === 0 && <p>No matching places.</p>}
                    {matches.map((r) => (
                      <button key={r.key} onClick={() => choose(r)}>
                        <MapPin size={18} />
                        <span>
                          <strong>{placeName(data, r)}</strong>
                          <small>
                            {projectBuildingName(data, r.building)} ·{" "}
                            {projectFloorName(data, r.levelId)}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!record && !query && !category && (
                <div className="project-category-grid">
                  {categories.map(({ name, Icon }) => (
                    <button key={name} onClick={() => setCategory(name)}>
                      <Icon size={19} />
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                className="project-directions-entry"
                onClick={() => {
                  setDirections(true);
                  onPickTarget(start ? "end" : "start");
                }}
              >
                <ArrowDownUp size={18} /> Get directions
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
