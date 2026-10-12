import MaplibreInspect from "@maplibre/maplibre-gl-inspect";
import "@maplibre/maplibre-gl-inspect/dist/maplibre-gl-inspect.css";
import {
  Compass,
  Loader2,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import maplibregl, {
  type MapOptions,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "~/hooks/use-theme";
import { mapCameraSnapshot, type MapCameraSnapshot } from "./map-camera";
export { mapCameraSnapshot, type MapCameraSnapshot } from "./map-camera";
import { cn } from "~/lib/utils";
import "~/maplibre.css";
import { registerBasemapSymbolImages } from "~/utils/basemap-symbol-images";

type MapStyleOption = string | StyleSpecification;

type MapStyles = {
  light: MapStyleOption;
  dark: MapStyleOption;
};

type MapContextValue = {
  map: maplibregl.Map | null;
  isLoaded: boolean;
  setContainerElement: (element: HTMLDivElement | null) => void;
  /** Replace the MapLibre instance, keeping the camera (see useMapRecreate). */
  recreate: () => boolean;
};

const MapContext = createContext<MapContextValue | null>(null);

export function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useMap must be used within a MapProvider");
  }

  return {
    map: context.map,
    isLoaded: context.isLoaded,
  };
}

/** Recreate the map instance (camera preserved). Removing the last map
 * terminates MapLibre's tile-worker pool, releasing every GeoJSON source copy
 * and tile index it held; children stay mounted and re-add their layers.
 * Intended only for full-screen loading states, never normal interaction. */
export function useMapRecreate() {
  return useContext(MapContext)?.recreate;
}

function useMapInternal() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("MapCanvas must be used within a MapProvider");
  }

  return context;
}

interface MapProviderProps {
  children: ReactNode;
  options: Omit<MapOptions, "container" | "style">;
  styles: MapStyles;
}

export function MapProvider({ children, options, styles }: MapProviderProps) {
  const [theme] = useTheme();
  const [containerElement, setContainerElement] =
    useState<HTMLDivElement | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasLoadedStyle, setHasLoadedStyle] = useState(false);
  const currentStyleRef = useRef<MapStyleOption | null>(null);
  const mapOptionsRef = useRef(options);
  const styleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [generation, setGeneration] = useState(0);
  const cameraRef = useRef<MapCameraSnapshot | null>(null);

  const clearStyleTimeout = useCallback(() => {
    if (!styleTimeoutRef.current) return;
    clearTimeout(styleTimeoutRef.current);
    styleTimeoutRef.current = null;
  }, []);

  const getStyleForTheme = useCallback(
    () => (theme === "dark" ? styles.dark : styles.light),
    [styles.dark, styles.light, theme],
  );

  useEffect(() => {
    if (!containerElement) return;

    const initialStyle = getStyleForTheme();
    currentStyleRef.current = initialStyle;

    const map = new maplibregl.Map({
      ...mapOptionsRef.current,
      ...(cameraRef.current ?? {}),
      container: containerElement,
      style: initialStyle,
    });
    const unregisterBasemapSymbols = registerBasemapSymbolImages(map);

    const handleLoad = () => {
      setHasLoaded(true);
      if (map.isStyleLoaded()) {
        setHasLoadedStyle(true);
      }
    };

    const handleStyleData = () => {
      clearStyleTimeout();
      styleTimeoutRef.current = setTimeout(() => {
        setHasLoadedStyle(true);
      }, 100);
    };

    map.on("load", handleLoad);
    map.on("styledata", handleStyleData);
    setMapInstance(map);

    return () => {
      clearStyleTimeout();
      unregisterBasemapSymbols();
      map.off("load", handleLoad);
      map.off("styledata", handleStyleData);
      map.remove();
      setHasLoaded(false);
      setHasLoadedStyle(false);
      setMapInstance(null);
    };
    // The MapLibre instance is created once per container and generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerElement, generation]);
  const recreate = useCallback(() => {
    if (!mapInstance) return false;
    cameraRef.current = mapCameraSnapshot(mapInstance);
    setGeneration((value) => value + 1);
    return true;
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;

    const nextStyle = getStyleForTheme();
    if (currentStyleRef.current === nextStyle) return;

    clearStyleTimeout();
    currentStyleRef.current = nextStyle;
    setHasLoadedStyle(false);
    mapInstance.setStyle(nextStyle, { diff: true });
  }, [clearStyleTimeout, getStyleForTheme, mapInstance]);

  const contextValue = useMemo(
    () => ({
      map: mapInstance,
      isLoaded: Boolean(mapInstance && hasLoaded && hasLoadedStyle),
      setContainerElement,
      recreate,
    }),
    [hasLoaded, hasLoadedStyle, mapInstance, recreate],
  );

  return (
    <MapContext.Provider value={contextValue}>{children}</MapContext.Provider>
  );
}

interface MapCanvasProps {
  children?: ReactNode;
  className?: string;
}

export function MapCanvas({ children, className }: MapCanvasProps) {
  const { isLoaded, map, setContainerElement } = useMapInternal();
  const handleContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      setContainerElement(element);
    },
    [setContainerElement],
  );

  return (
    <div
      className={cn("relative size-full overflow-hidden", className)}
      data-testid="map-canvas-root"
    >
      <div ref={handleContainerRef} className="absolute inset-0" />
      {!isLoaded && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading map
          </div>
        </div>
      )}
      {map && children}
    </div>
  );
}

type MapControlsProps = {
  className?: string;
  position?: "bottom-right" | "top-right";
  showCompass?: boolean;
  showFullscreen?: boolean;
  showPitchReset?: boolean;
  showZoom?: boolean;
};

const controlPositionClasses = {
  "bottom-right":
    "bottom-[calc(var(--map-sheet-clearance,0px)+1rem)] right-3 md:bottom-6",
  "top-right": "right-3 top-3",
};

function ControlGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border bg-background shadow-sm">
      {children}
    </div>
  );
}

interface ControlButtonProps {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

function ControlButton({
  children,
  disabled = false,
  label,
  onClick,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex size-9 items-center justify-center border-b text-foreground transition-colors last:border-b-0 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MapControls({
  className,
  position = "bottom-right",
  showCompass = true,
  showFullscreen = true,
  showPitchReset = true,
  showZoom = true,
}: MapControlsProps) {
  const { isLoaded, map } = useMap();

  const handleZoomIn = useCallback(() => {
    map?.zoomTo(map.getZoom() + 1, { duration: 250 });
  }, [map]);

  const handleZoomOut = useCallback(() => {
    map?.zoomTo(map.getZoom() - 1, { duration: 250 });
  }, [map]);

  const handleResetNorth = useCallback(() => {
    map?.resetNorth({ duration: 250 });
  }, [map]);

  const handleResetPitch = useCallback(() => {
    if (!map) return;
    map.easeTo({ pitch: 0, duration: 250 });
  }, [map]);

  const handleFullscreen = useCallback(() => {
    const container = map?.getContainer().parentElement ?? map?.getContainer();
    if (!container) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void container.requestFullscreen();
  }, [map]);

  if (!isLoaded) return null;

  return (
    <div
      className={cn(
        "absolute z-20 flex flex-col gap-2",
        controlPositionClasses[position],
        className,
      )}
    >
      {showZoom && (
        <ControlGroup>
          <ControlButton label="Zoom in" onClick={handleZoomIn}>
            <Plus className="size-4" />
          </ControlButton>
          <ControlButton label="Zoom out" onClick={handleZoomOut}>
            <Minus className="size-4" />
          </ControlButton>
        </ControlGroup>
      )}
      {(showCompass || showPitchReset || showFullscreen) && (
        <ControlGroup>
          {showCompass && (
            <ControlButton label="Reset north" onClick={handleResetNorth}>
              <Compass className="size-4" />
            </ControlButton>
          )}
          {showPitchReset && (
            <ControlButton label="Reset pitch" onClick={handleResetPitch}>
              <RotateCcw className="size-4" />
            </ControlButton>
          )}
          {showFullscreen && (
            <ControlButton label="Toggle fullscreen" onClick={handleFullscreen}>
              <Maximize className="size-4" />
            </ControlButton>
          )}
        </ControlGroup>
      )}
    </div>
  );
}

export function MapInspectControl() {
  const { isLoaded, map } = useMap();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!isLoaded || !map) return;

    const inspectControl = new MaplibreInspect({
      blockHoverPopupOnClick: true,
      popup: new maplibregl.Popup({
        closeOnClick: false,
      }),
    });

    map.addControl(inspectControl, "bottom-left");

    return () => {
      map.removeControl(inspectControl);
    };
  }, [isLoaded, map]);

  return null;
}
