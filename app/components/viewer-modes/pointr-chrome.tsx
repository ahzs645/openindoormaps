import { Compass, Globe, X } from "lucide-react";
import { useState } from "react";
import DiscoveryPanel from "../discovery-panel/discovery-panel";
import type { LocationConfig } from "~/types/location";
import { Button } from "../ui/button";
import FloorStack from "./floor-stack";

interface PointrChromeProps {
  location: LocationConfig;
  availableFloors: number[];
}

export default function PointrChrome({
  location,
  availableFloors,
}: PointrChromeProps) {
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      {welcomeOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-card">
            <button
              type="button"
              aria-label="Close"
              onClick={() => setWelcomeOpen(false)}
              className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-[#1b2f9e] text-white">
              <Compass className="size-5" />
            </span>
            <h2 className="mb-1 text-2xl font-bold text-[#1b2f9e] dark:text-[#8fa0ff]">
              Start Navigating {location.name}
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Find your way to essential areas, amenities, and services wherever
              you are.
            </p>

            <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">
              EXPLORE
            </p>
            <div className="mb-6 flex flex-col divide-y divide-border">
              {location.data.topLocations.map((topLocation) => (
                <button
                  key={topLocation.name}
                  type="button"
                  onClick={() => {
                    setWelcomeOpen(false);
                    setPanelOpen(true);
                  }}
                  className="flex items-center gap-3 py-2.5 text-left text-sm font-medium transition-colors hover:text-[#1b2f9e] dark:hover:text-[#8fa0ff]"
                >
                  <topLocation.icon className="size-4 text-muted-foreground" />
                  {topLocation.name}
                </button>
              ))}
            </div>

            <Button
              className="w-full bg-[#1b2f9e] text-white hover:bg-[#16267f]"
              onClick={() => {
                setWelcomeOpen(false);
                setPanelOpen(true);
              }}
            >
              Get started
            </Button>
          </div>
        </div>
      )}

      {!welcomeOpen && panelOpen && (
        <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(22rem,calc(100%-5.5rem))] flex-col overflow-hidden rounded-2xl bg-white/95 shadow-xl backdrop-blur dark:bg-card/95">
          <div className="min-h-0 flex-1">
            <DiscoveryPanel location={location} />
          </div>
        </div>
      )}

      {!welcomeOpen && !panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors hover:bg-white dark:bg-card/95 dark:hover:bg-card"
        >
          <Compass className="size-4 text-[#1b2f9e] dark:text-[#8fa0ff]" />
          Explore {location.name}
        </button>
      )}

      <FloorStack
        availableFloors={availableFloors}
        variant="mappedin"
        className="absolute right-3 top-3 z-20"
      />

      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur dark:bg-card/95">
        <Globe className="size-3.5 text-muted-foreground" />
        English (US)
      </div>
    </>
  );
}
