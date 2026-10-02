import {
  Accessibility,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  ArrowUpLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  CornerUpRight,
  DoorOpen,
  Dot,
  Flag,
  MapPin,
  MoveVertical,
  Play,
  Square,
  Undo2,
} from "lucide-react";
import { LngLatBounds } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useMap } from "~/components/map/map";
import IndoorDirections from "~/indoor-directions/directions/main";
import type { RouteInstruction } from "~/indoor-directions/types";
import { cn } from "~/lib/utils";
import useFloorStore from "~/stores/floor-store";
import { POI } from "~/types/poi";
import { buildDeepLinkUrl } from "~/utils/deep-link";
import type { FloorNames } from "~/utils/floor";
import { IndoorGeocoder } from "~/utils/indoor-geocoder";
import { hospitalFollowPadding } from "~/utils/hospital-follow-padding";
import {
  formatArrivalTime,
  formatDistance,
  formatDuration,
  summarizeRoute,
} from "~/utils/route-summary";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Toggle } from "../ui/toggle";
import ShareMenu from "./share-menu";
import HospitalRoutePreview from "./hospital-route-preview";
import SuggestionsList from "./suggestions-list";

function InstructionIcon({ instruction }: { instruction: RouteInstruction }) {
  switch (instruction.type) {
    case "depart": {
      return <Play size={14} className="text-emerald-600" />;
    }
    case "turn": {
      if (instruction.turnKind === "around") {
        return <Undo2 size={14} className="text-sky-600" />;
      }
      if (instruction.turnKind === "slight") {
        return instruction.turnDirection === "left" ? (
          <ArrowUpLeft size={14} className="text-sky-600" />
        ) : (
          <ArrowUpRight size={14} className="text-sky-600" />
        );
      }
      return instruction.turnDirection === "left" ? (
        <CornerUpLeft size={14} className="text-sky-600" />
      ) : (
        <CornerUpRight size={14} className="text-sky-600" />
      );
    }
    case "floor-change": {
      return <MoveVertical size={14} className="text-violet-600" />;
    }
    case "building-change": {
      return <DoorOpen size={14} className="text-amber-600" />;
    }
    case "arrive": {
      return <Flag size={14} className="text-rose-600" />;
    }
    default: {
      return <ArrowUp size={14} className="text-muted-foreground" />;
    }
  }
}

/** Camera padding that keeps the route clear of the desktop side panel. */
function routePadding() {
  const wide = globalThis.innerWidth >= 768;
  return { top: 100, bottom: 100, right: 100, left: wide ? 440 : 60 };
}

/**
 * A route endpoint: the text in the input plus the POI it was picked from.
 * Keeping the POI avoids re-geocoding by name, which picks the wrong feature
 * when names repeat (Harrods concessions, ATMs, restrooms).
 */
interface Endpoint {
  text: string;
  poi: POI | null;
}

export interface RouteState {
  from: POI | null;
  to: POI | null;
  accessible: boolean;
}

interface NavigationViewProps {
  onPresentationChange?: (active: boolean) => void;
  floorStacks?: import("~/types/location").VenueFloorStack[];
  hospitalStyle?: boolean;
  routeTiming?: import("~/utils/route-summary").RouteTiming;
  handleBackClick: () => void;
  selectedPOI: POI | null;
  indoorGeocoder: IndoorGeocoder;
  indoorDirections: IndoorDirections | null;
  initialDeparture?: string;
  initialDeparturePOI?: POI | null;
  initialAccessible?: boolean;
  floorNames?: FloorNames;
  onRouteChange?: (route: RouteState) => void;
}

export default function NavigationView({
  handleBackClick,
  onPresentationChange,
  hospitalStyle = false,
  floorStacks,
  selectedPOI,
  indoorGeocoder,
  indoorDirections,
  initialDeparture,
  initialDeparturePOI,
  initialAccessible = false,
  floorNames,
  routeTiming,
  onRouteChange,
}: NavigationViewProps) {
  const [activeInput, setActiveInput] = useState<
    "departure" | "destination" | null
  >(null);
  const [departure, setDeparture] = useState<Endpoint>({
    text: initialDeparturePOI?.name ?? initialDeparture ?? "",
    poi: initialDeparturePOI ?? null,
  });
  const [destination, setDestination] = useState<Endpoint>({
    text: selectedPOI?.name ?? "",
    poi: selectedPOI,
  });
  const didAutoRouteRef = useRef(false);
  const previewRunRef = useRef(0);
  const [suggestions, setSuggestions] = useState<POI[]>([]);
  const [isAccessibleRoute, setIsAccessibleRoute] = useState(initialAccessible);
  const [instructions, setInstructions] = useState<RouteInstruction[]>([]);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routedPOIs, setRoutedPOIs] = useState<RouteState | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [started, setStarted] = useState(false);
  const setCurrentFloor = useFloorStore((state) => state.setCurrentFloor);
  const setCurrentBuildingId = useFloorStore(
    (state) => state.setCurrentBuildingId,
  );
  const { map } = useMap();
  const currentFloor = useFloorStore((state) => state.currentFloor);
  const currentBuildingId = useFloorStore((state) => state.currentBuildingId);

  useEffect(() => {
    onPresentationChange?.(hospitalStyle && started);
  }, [onPresentationChange, hospitalStyle, started]);
  useEffect(() => () => onPresentationChange?.(false), [onPresentationChange]);

  const activeQuery =
    activeInput === "departure" ? departure.text : destination.text;

  useEffect(() => {
    if (activeInput && activeQuery) {
      const newSuggestions = indoorGeocoder.getAutocompleteResults(activeQuery);
      setSuggestions(newSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [activeInput, activeQuery, indoorGeocoder]);

  useEffect(() => {
    if (didAutoRouteRef.current) return;
    if (!indoorDirections) return;
    if (!departure.text || !destination.text) return;
    didAutoRouteRef.current = true;
    handleRouting(departure, destination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indoorDirections]);

  function resolveEndpoint(endpoint: Endpoint): POI | null {
    if (endpoint.poi && endpoint.poi.name === endpoint.text)
      return endpoint.poi;
    try {
      return indoorGeocoder.indoorGeocodeInput(endpoint.text);
    } catch {
      return null;
    }
  }

  const handleSuggestionClick = (suggestion: POI) => {
    const picked: Endpoint = { text: suggestion.name, poi: suggestion };
    const newDeparture = activeInput === "departure" ? picked : departure;
    const newDestination = activeInput === "destination" ? picked : destination;

    setDeparture(newDeparture);
    setDestination(newDestination);
    setSuggestions([]);
    setActiveInput(null);

    handleRouting(newDeparture, newDestination);
  };

  function handleRouting(
    departureValue: Endpoint,
    destinationValue: Endpoint,
    accessibleOnly: boolean = isAccessibleRoute,
  ) {
    if (!departureValue.text || !destinationValue.text || !indoorDirections) {
      return;
    }
    previewRunRef.current += 1;
    setActiveStep(null);
    setStarted(false);
    setIsPreviewing(false);

    const departurePOI = resolveEndpoint(departureValue);
    const destinationPOI = resolveEndpoint(destinationValue);
    if (!departurePOI || !destinationPOI) {
      const missing = departurePOI
        ? destinationValue.text
        : departureValue.text;
      setRouteError(`Couldn't find "${missing}".`);
      setInstructions([]);
      indoorDirections.clear();
      return;
    }

    try {
      indoorDirections.setLevelNames(floorNames);
      indoorDirections.setPathfindingOptions({ accessibleOnly });
      indoorDirections.setWaypoints(
        [
          departurePOI.coordinates as [number, number],
          destinationPOI.coordinates as [number, number],
        ],
        [departurePOI.floor ?? null, destinationPOI.floor ?? null],
        [departurePOI.name, destinationPOI.name],
      );

      const routelineFeatures = indoorDirections.routelinesCoordinates[0];
      const coordinates = (routelineFeatures ?? []).flatMap(
        (feature) => feature.geometry.coordinates as [number, number][],
      );
      if (coordinates.length === 0) {
        throw new Error("No route found");
      }

      setRouteError(null);
      setInstructions(indoorDirections.routeInstructions);
      const route = {
        from: departurePOI,
        to: destinationPOI,
        accessible: accessibleOnly,
      };
      setRoutedPOIs(route);
      onRouteChange?.(route);

      if (hospitalStyle) setCurrentBuildingId(departurePOI.buildingId ?? null);
      if (departurePOI.floor !== undefined) {
        setCurrentFloor(departurePOI.floor);
      }

      let bounds = new LngLatBounds(coordinates[0], coordinates[0]);
      for (const coord of coordinates) {
        bounds = bounds.extend(coord);
      }

      map?.fitBounds(bounds, {
        padding: routePadding(),
        speed: 0.5,
      });
    } catch (error) {
      console.error("Error during routing:", error);
      setInstructions([]);
      setRoutedPOIs(null);
      setRouteError(
        accessibleOnly
          ? "No accessible route found. Try turning off the accessible-route option."
          : "No route found between these locations.",
      );
    }
  }

  function handleSwapLocations() {
    setDeparture(destination);
    setDestination(departure);
    handleRouting(destination, departure);
  }

  useEffect(() => () => indoorDirections?.cancelPreview(), [indoorDirections]);

  async function togglePreview() {
    if (!indoorDirections) return;
    const previewRun = ++previewRunRef.current;
    if (isPreviewing) {
      indoorDirections.cancelPreview();
      setIsPreviewing(false);
      return;
    }
    if (!hospitalStyle) setActiveStep(null);
    setIsPreviewing(true);
    await indoorDirections.previewRoute({
      onFloorChange: setCurrentFloor,
      ...(hospitalStyle && {
        onInstructionChange: (index: number) => {
          setActiveStep(index);
          syncStepBuilding(index);
          indoorDirections.setInstructionFocus(index);
        },
      }),
      padding:
        hospitalStyle && map
          ? hospitalFollowPadding(map.getContainer())
          : routePadding(),
    });
    if (previewRun === previewRunRef.current) setIsPreviewing(false);
  }

  function syncStepBuilding(index: number) {
    if (hospitalStyle) {
      const change = instructions
        .slice(0, index + 1)
        .reverse()
        .find(
          (step) =>
            step.type === "building-change" || Boolean(step.buildingName),
        );
      const buildingId = change
        ? floorStacks?.find((stack) => stack.name === change.buildingName)?.id
        : routedPOIs?.from?.buildingId;
      setCurrentBuildingId(buildingId ?? null);
    }
  }

  function focusStep(index: number) {
    const instruction = instructions[index];
    if (!instruction) return;
    if (isPreviewing) {
      previewRunRef.current += 1;
      indoorDirections?.cancelPreview();
      setIsPreviewing(false);
    }
    setActiveStep(index);
    syncStepBuilding(index);
    // Hospital preview follows the reference onto the floor reached by a ride.
    // Other venues retain their boarding-floor connector preview.
    const level =
      instruction.type === "floor-change" && !hospitalStyle
        ? instruction.fromLevel
        : instruction.toLevel;
    if (typeof level === "number") setCurrentFloor(level);
    if (instruction.position && !hospitalStyle) {
      map?.flyTo({
        center: instruction.position as [number, number],
        zoom: 20,
        duration: 900,
      });
    }
  }

  useEffect(() => {
    if (
      !hospitalStyle ||
      !started ||
      activeStep === null ||
      isPreviewing ||
      !map ||
      !indoorDirections
    )
      return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      // Read the cards after React has updated their text and responsive size.
      frame = requestAnimationFrame(() => {
        const view = indoorDirections.setInstructionFocus(activeStep, true);
        if (!view?.coordinates.length) return;
        const bounds = new LngLatBounds();
        for (const coordinate of view.coordinates)
          bounds.extend(coordinate as [number, number]);
        map.fitBounds(bounds, {
          padding: hospitalFollowPadding(map.getContainer()),
          linear: true,
          bearing: map.getBearing(),
          pitch: map.getPitch(),
          maxZoom: 20.5,
          duration: 800,
        });
      });
    };
    follow();
    // MapLibre's resize event fires after its internal viewport is updated.
    // A window resize can otherwise fit with the previous phone/desktop size.
    map.on("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      map.off("resize", follow);
    };
  }, [activeStep, hospitalStyle, indoorDirections, isPreviewing, map, started]);

  useEffect(() => {
    if (activeStep === null || (hospitalStyle && globalThis.innerWidth < 768))
      return;
    document
      .querySelector('[aria-current="step"]')
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeStep, hospitalStyle]);

  const summary =
    instructions.length > 0 ? summarizeRoute(instructions, routeTiming) : null;
  const shareUrl =
    routedPOIs && globalThis.location !== undefined
      ? buildDeepLinkUrl({
          from: routedPOIs.from?.id,
          to: routedPOIs.to?.id,
          accessible: routedPOIs.accessible,
        })
      : null;

  if (hospitalStyle && started && summary && instructions.length > 0) {
    const building = floorStacks?.find(
      (stack) => stack.id === currentBuildingId,
    );
    return (
      <HospitalRoutePreview
        instructions={instructions}
        activeStep={activeStep ?? 0}
        summary={summary}
        timing={routeTiming}
        departure={routedPOIs?.from?.name ?? departure.text}
        destination={routedPOIs?.to?.name ?? destination.text}
        building={building?.name ?? "Campus outdoors"}
        floor={
          building?.floors
            .find((entry) => entry.level === currentFloor)
            ?.name.trim() ?? "Outdoors"
        }
        isPreviewing={isPreviewing}
        onStep={focusStep}
        onPreview={togglePreview}
        onBack={() => {
          previewRunRef.current += 1;
          indoorDirections?.cancelPreview();
          indoorDirections?.clearInstructionFocus();
          setIsPreviewing(false);
          setStarted(false);
        }}
      />
    );
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={handleBackClick}>
          <ArrowLeft size={20} className="mr-2" />
          {hospitalStyle ? "Directions" : "Back"}
        </Button>
        <Toggle
          variant="outline"
          pressed={isAccessibleRoute}
          size={hospitalStyle ? "sm" : "icon"}
          aria-label="Accessible route"
          title="Accessible route (avoid stairs and escalators)"
          onClick={() => {
            const nextValue = !isAccessibleRoute;
            setIsAccessibleRoute(nextValue);
            handleRouting(departure, destination, nextValue);
          }}
        >
          <Accessibility size={18} />
          {hospitalStyle && <span className="ml-2 text-xs">Use elevators</span>}
        </Toggle>
      </div>
      <div className="flex space-x-2">
        <div className="w-full space-y-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="flex h-full w-4 items-center justify-center">
                <div className="size-3 rounded-full border-2 border-white bg-[#1d9bf0] ring-4 ring-blue-100 dark:ring-0" />
              </div>
              <div className="absolute left-1/2 top-full mt-1 flex -translate-x-1/2 flex-col items-center">
                <Dot size={12} />
                <Dot size={12} />
                <Dot size={12} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {hospitalStyle && (
                <p className="mb-1 text-xs text-muted-foreground">Departure</p>
              )}
              <Input
                type="text"
                placeholder="Choose starting point"
                value={departure.text}
                onChange={(e) =>
                  setDeparture({ text: e.target.value, poi: departure.poi })
                }
                onFocus={() => setActiveInput("departure")}
                onBlur={() => setActiveInput(null)}
              />
              {hospitalStyle && departure.poi && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {departure.poi.metadata?.building_name} ·{" "}
                  {departure.poi.metadata?.floor_name}
                </p>
              )}
            </div>
          </div>
          <div className="mb-2 flex items-center space-x-4">
            <div className="w-4">
              <MapPin size={16} className="text-red-600 dark:text-red-300" />
            </div>
            <div className="min-w-0 flex-1">
              {hospitalStyle && (
                <p className="mb-1 text-xs text-muted-foreground">
                  Destination
                </p>
              )}
              <Input
                type="text"
                placeholder="Choose destination"
                value={destination.text}
                onChange={(e) =>
                  setDestination({ text: e.target.value, poi: destination.poi })
                }
                onFocus={() => setActiveInput("destination")}
                onBlur={() => setActiveInput(null)}
              />
              {hospitalStyle && destination.poi && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {destination.poi.metadata?.building_name} ·{" "}
                  {destination.poi.metadata?.floor_name}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Swap start and destination"
            onClick={handleSwapLocations}
          >
            <ArrowUpDown size={18} />
          </Button>
        </div>
      </div>

      {activeInput && activeQuery && (
        <>
          <div className="mt-4 h-px w-full bg-gray-300 dark:bg-gray-800" />
          <SuggestionsList
            suggestions={suggestions}
            searchQuery={activeQuery}
            onSuggestionClick={handleSuggestionClick}
            floorNames={floorNames}
          />
        </>
      )}

      {!activeInput && routeError && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
        >
          {routeError}
        </p>
      )}

      {!activeInput && summary && instructions.length > 0 && (
        <div className="mt-4">
          <div className="mb-3 h-px w-full bg-gray-300 dark:bg-gray-800" />
          <div data-testid="route-summary" className="mb-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold leading-tight">
                  {formatDuration(summary.durationSeconds)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({formatDistance(summary.distanceMeters)})
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Arrive around {formatArrivalTime(summary.durationSeconds)}
                  {summary.floorChanges > 0 &&
                    ` · ${summary.floorChanges} floor ${summary.floorChanges === 1 ? "change" : "changes"}`}
                </p>
              </div>
              {shareUrl && (
                <ShareMenu
                  url={shareUrl}
                  title={`Directions to ${routedPOIs?.to?.name ?? "destination"}`}
                  label="Share"
                />
              )}
            </div>
            {hospitalStyle && !started && (
              <Button
                variant="primary"
                className="w-full rounded-full"
                onClick={() => {
                  setStarted(true);
                  focusStep(0);
                }}
              >
                <Play size={16} className="mr-2" />
                Start
              </Button>
            )}
            {(!hospitalStyle || started) && (
              <Button
                variant="outline"
                size="sm"
                aria-label={isPreviewing ? "Stop preview" : "Preview route"}
                onClick={togglePreview}
                className="w-full rounded-full"
              >
                {isPreviewing ? <Square size={14} /> : <Play size={14} />}
                {isPreviewing ? "Stop preview" : "Preview route"}
              </Button>
            )}
          </div>

          {(!hospitalStyle || started) && (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Previous step"
                  disabled={activeStep === null || activeStep <= 0}
                  onClick={() => focusStep((activeStep ?? 0) - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {activeStep === null
                    ? `${instructions.length} steps`
                    : `Step ${activeStep + 1} of ${instructions.length}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={activeStep === null ? "Start steps" : "Next step"}
                  disabled={
                    activeStep !== null && activeStep >= instructions.length - 1
                  }
                  onClick={() =>
                    focusStep(activeStep === null ? 0 : activeStep + 1)
                  }
                >
                  <ChevronRight size={16} />
                </Button>
              </div>

              <ol className="flex flex-col">
                {instructions.map((instruction, index) => (
                  <li
                    key={index}
                    className="border-b border-border last:border-0"
                  >
                    <button
                      type="button"
                      aria-current={activeStep === index ? "step" : undefined}
                      onClick={() => focusStep(index)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-secondary",
                        activeStep === index &&
                          (hospitalStyle
                            ? "bg-orange-50 text-orange-900"
                            : "bg-blue-50 dark:bg-blue-950/40"),
                      )}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                        <InstructionIcon instruction={instruction} />
                      </span>
                      <span className="flex-1 text-sm">
                        {instruction.message}
                      </span>
                      {instruction.distanceMeters > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {instruction.distanceMeters} m
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </>
  );
}
