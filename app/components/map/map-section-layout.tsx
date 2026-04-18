import { ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";

type MobileSheetState = "collapsed" | "half" | "full";

interface MapSectionLayoutProps {
  children: ReactNode;
  className?: string;
  desktopPanelPlacement?: "overlay" | "sidebar";
  desktopSidebarWidth?: number;
  onToggleDesktopSidebar: () => void;
  showDesktopSidebar: boolean;
  sidebar: ReactNode;
}

const SPRING = "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)";

function getSnapPositions() {
  const viewportHeight = globalThis.innerHeight;

  return {
    collapsed: viewportHeight - 192,
    full: 12,
    half: Math.round(viewportHeight * 0.42),
  };
}

function resolveSnap(y: number, velocityPxMs: number): MobileSheetState {
  const snaps = getSnapPositions();
  const projected = y + velocityPxMs * 200;
  const entries: [MobileSheetState, number][] = [
    ["full", snaps.full],
    ["half", snaps.half],
    ["collapsed", snaps.collapsed],
  ];
  let best: MobileSheetState = "half";
  let bestDistance = Infinity;

  for (const [state, snapY] of entries) {
    const distance = Math.abs(projected - snapY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = state;
    }
  }

  return best;
}

function stateFromTranslate(y: number): MobileSheetState {
  const snaps = getSnapPositions();
  const entries: [MobileSheetState, number][] = [
    ["full", snaps.full],
    ["half", snaps.half],
    ["collapsed", snaps.collapsed],
  ];
  let best: MobileSheetState = "collapsed";
  let bestDistance = Infinity;

  for (const [state, snapY] of entries) {
    const distance = Math.abs(y - snapY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = state;
    }
  }

  return best;
}

function nextSheetState(state: MobileSheetState): MobileSheetState {
  if (state === "collapsed") return "half";
  if (state === "half") return "full";
  return "collapsed";
}

export function MapSectionLayout({
  children,
  className,
  desktopPanelPlacement = "sidebar",
  desktopSidebarWidth = 376,
  onToggleDesktopSidebar,
  showDesktopSidebar,
  sidebar,
}: MapSectionLayoutProps) {
  const isOverlayPanel = desktopPanelPlacement === "overlay";
  const [mobileSheetState, setMobileSheetState] =
    useState<MobileSheetState>("collapsed");
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const startTranslate = useRef(0);
  const currentY = useRef(0);
  const previousTouchY = useRef(0);
  const previousTouchTime = useRef(0);
  const velocity = useRef(0);
  const startedFromHandle = useRef(false);
  const hasDecidedDirection = useRef(false);

  const applyTransform = useCallback((y: number, animate: boolean) => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    sheet.style.transition = animate ? SPRING : "none";
    sheet.style.transform = `translateY(${y}px)`;
    currentY.current = y;
    rootRef.current?.style.setProperty(
      "--map-sheet-clearance",
      `${Math.max(0, globalThis.innerHeight - y)}px`,
    );

    const snaps = getSnapPositions();
    const range = snaps.collapsed - snaps.full;
    const progress = Math.max(0, Math.min(1, 1 - (y - snaps.full) / range));

    if (scrimRef.current) {
      scrimRef.current.style.opacity = String(progress * 0.4);
      scrimRef.current.style.pointerEvents = progress > 0.05 ? "auto" : "none";
      scrimRef.current.style.transition = animate
        ? "opacity 0.35s ease"
        : "none";
    }
  }, []);

  const snapTo = useCallback(
    (state: MobileSheetState) => {
      setMobileSheetState(state);
      applyTransform(getSnapPositions()[state], true);
    },
    [applyTransform],
  );

  useLayoutEffect(() => {
    if (globalThis.innerWidth >= 768) return;

    const y = getSnapPositions().collapsed;
    rootRef.current?.style.setProperty(
      "--map-sheet-clearance",
      `${Math.max(0, globalThis.innerHeight - y)}px`,
    );
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${y}px)`;
      sheetRef.current.style.transition = "none";
    }
    currentY.current = y;

    if (scrimRef.current) {
      scrimRef.current.style.opacity = "0";
      scrimRef.current.style.pointerEvents = "none";
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (globalThis.innerWidth >= 768) {
        rootRef.current?.style.setProperty("--map-sheet-clearance", "0px");
        if (sheetRef.current) {
          sheetRef.current.style.transform = "";
          sheetRef.current.style.transition = "";
        }
        if (scrimRef.current) {
          scrimRef.current.style.opacity = "0";
          scrimRef.current.style.pointerEvents = "none";
        }
        return;
      }

      if (!dragging.current) {
        const state =
          currentY.current <= 0
            ? "collapsed"
            : stateFromTranslate(currentY.current);
        applyTransform(getSnapPositions()[state], false);
      }
    };

    const handleOrientationChange = () => setTimeout(handleResize, 150);

    globalThis.addEventListener("resize", handleResize);
    globalThis.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      globalThis.removeEventListener("resize", handleResize);
      globalThis.removeEventListener(
        "orientationchange",
        handleOrientationChange,
      );
    };
  }, [applyTransform]);

  useEffect(() => {
    const sheet = sheetRef.current;
    const handle = handleRef.current;
    if (!sheet || !handle) return;
    const sheetElement = sheet;
    const handleElement = handle;

    function findScrollable(element: HTMLElement | null): HTMLElement | null {
      while (element && element !== sheetElement) {
        if (element.scrollHeight > element.clientHeight + 1) {
          const overflowY = getComputedStyle(element).overflowY;
          if (overflowY === "auto" || overflowY === "scroll") return element;
        }
        element = element.parentElement;
      }

      return null;
    }

    function onTouchStart(event: TouchEvent) {
      if (globalThis.innerWidth >= 768) return;

      const touch = event.touches[0];
      const isHandle = handleElement.contains(event.target as Node);
      startY.current = touch.clientY;
      startX.current = touch.clientX;
      startTranslate.current = currentY.current;
      previousTouchY.current = touch.clientY;
      previousTouchTime.current = performance.now();
      velocity.current = 0;
      startedFromHandle.current = isHandle;
      hasDecidedDirection.current = false;

      if (isHandle) {
        dragging.current = true;
        hasDecidedDirection.current = true;
        sheetElement.style.transition = "none";
        sheetElement.style.willChange = "transform";
        event.preventDefault();
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (globalThis.innerWidth >= 768) return;

      const touch = event.touches[0];
      const now = performance.now();
      const deltaTime = now - previousTouchTime.current;
      if (deltaTime > 0) {
        velocity.current = (touch.clientY - previousTouchY.current) / deltaTime;
      }
      previousTouchY.current = touch.clientY;
      previousTouchTime.current = now;

      if (dragging.current) {
        event.preventDefault();
        const delta = touch.clientY - startY.current;
        const snaps = getSnapPositions();
        let nextY = startTranslate.current + delta;

        if (nextY < snaps.full) {
          nextY = snaps.full - (snaps.full - nextY) * 0.25;
        }
        if (nextY > snaps.collapsed) {
          nextY = snaps.collapsed + (nextY - snaps.collapsed) * 0.25;
        }

        applyTransform(nextY, false);
        return;
      }

      if (hasDecidedDirection.current) return;

      const deltaX = Math.abs(touch.clientX - startX.current);
      const deltaY = Math.abs(touch.clientY - startY.current);
      if (deltaX + deltaY < 10) return;

      hasDecidedDirection.current = true;
      if (deltaX > deltaY) return;

      const state = stateFromTranslate(currentY.current);
      const goingDown = touch.clientY > startY.current;

      if (state !== "full") {
        dragging.current = true;
        startY.current = touch.clientY;
        startTranslate.current = currentY.current;
        sheetElement.style.transition = "none";
        sheetElement.style.willChange = "transform";
        event.preventDefault();
        return;
      }

      if (!goingDown) return;

      const scrollable = findScrollable(event.target as HTMLElement);
      if (!scrollable || scrollable.scrollTop <= 0) {
        dragging.current = true;
        startY.current = touch.clientY;
        startTranslate.current = currentY.current;
        sheetElement.style.transition = "none";
        sheetElement.style.willChange = "transform";
        event.preventDefault();
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (globalThis.innerWidth >= 768) return;
      sheetElement.style.willChange = "";

      if (!dragging.current) return;
      dragging.current = false;

      if (startedFromHandle.current && event.changedTouches.length > 0) {
        const touch = event.changedTouches[0];
        const moved =
          Math.abs(touch.clientY - startY.current) +
          Math.abs(touch.clientX - startX.current);
        if (moved < 10) {
          snapTo(nextSheetState(stateFromTranslate(currentY.current)));
          return;
        }
      }

      snapTo(resolveSnap(currentY.current, velocity.current));
    }

    sheetElement.addEventListener("touchstart", onTouchStart, {
      passive: false,
    });
    sheetElement.addEventListener("touchmove", onTouchMove, {
      passive: false,
    });
    sheetElement.addEventListener("touchend", onTouchEnd);
    sheetElement.addEventListener("touchcancel", onTouchEnd);

    return () => {
      sheetElement.removeEventListener("touchstart", onTouchStart);
      sheetElement.removeEventListener("touchmove", onTouchMove);
      sheetElement.removeEventListener("touchend", onTouchEnd);
      sheetElement.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyTransform, snapTo]);

  let desktopPanelVisibilityClass = "md:hidden";
  if (showDesktopSidebar && isOverlayPanel) {
    desktopPanelVisibilityClass = "md:block";
  } else if (showDesktopSidebar) {
    desktopPanelVisibilityClass =
      "md:block md:w-[var(--desktop-sidebar-width)]";
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative flex size-full bg-background", className)}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-30",
          isOverlayPanel
            ? "md:absolute md:inset-0 md:z-30 md:block"
            : "md:pointer-events-auto md:relative md:inset-auto md:z-10 md:h-full md:shrink-0",
          desktopPanelVisibilityClass,
        )}
        style={
          {
            "--desktop-sidebar-width": `${desktopSidebarWidth}px`,
          } as CSSProperties
        }
      >
        <button
          ref={scrimRef}
          type="button"
          className="absolute inset-0 bg-black md:hidden"
          style={{ opacity: 0, pointerEvents: "none" }}
          aria-label="Collapse map panel"
          onClick={() => snapTo("collapsed")}
        />

        <div
          ref={sheetRef}
          className={cn(
            "pointer-events-auto absolute inset-x-0 bottom-0 flex h-full max-h-full flex-col overflow-hidden rounded-t-lg border border-b-0 bg-background/95 shadow-2xl backdrop-blur",
            isOverlayPanel
              ? "md:absolute md:left-4 md:top-4 md:h-auto md:max-h-[calc(100%-2rem)] md:w-[var(--desktop-sidebar-width)] md:rounded-lg md:border md:bg-card/95 md:text-card-foreground md:shadow-lg md:backdrop-blur"
              : "md:relative md:inset-auto md:h-full md:rounded-none md:border-y-0 md:border-l-0 md:bg-background md:shadow-none md:backdrop-blur-none",
          )}
        >
          <div
            ref={handleRef}
            className="flex shrink-0 cursor-grab touch-none select-none items-center justify-center py-3 active:cursor-grabbing md:hidden"
            role="separator"
            aria-label="Drag to resize map panel"
          >
            <div className="h-1 w-10 rounded-full bg-muted-foreground/40" />
          </div>

          <div
            className={cn(
              "min-h-0 flex-1 overscroll-y-contain md:h-full md:touch-auto",
              mobileSheetState === "full" ? "touch-auto" : "touch-none",
            )}
          >
            {sidebar}
          </div>
        </div>
      </div>

      {!isOverlayPanel && (
        <button
          type="button"
          aria-label={showDesktopSidebar ? "Hide sidebar" : "Show sidebar"}
          className="absolute top-6 z-20 hidden h-10 w-8 items-center justify-center rounded-r-md border border-l-0 bg-background text-foreground shadow-sm transition-[left,background-color,color,border-color] hover:bg-accent md:flex"
          style={{ left: showDesktopSidebar ? desktopSidebarWidth : 0 }}
          onClick={onToggleDesktopSidebar}
        >
          {showDesktopSidebar ? (
            <ChevronsLeft className="size-4" />
          ) : (
            <ChevronsRight className="size-4" />
          )}
        </button>
      )}

      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  );
}
