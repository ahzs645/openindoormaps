import { Building2 } from "lucide-react";
import DiscoveryPanel from "../discovery-panel/discovery-panel";
import type { LocationConfig } from "~/types/location";
import FloorStack from "./floor-stack";

interface MappedinChromeProps {
  location: LocationConfig;
  availableFloors: number[];
}

export default function MappedinChrome({
  location,
  availableFloors,
}: MappedinChromeProps) {
  return (
    <>
      <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(24rem,calc(100%-5.5rem))] flex-col overflow-hidden rounded-2xl bg-white/95 shadow-xl backdrop-blur dark:bg-card/95">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex size-7 items-center justify-center rounded-md bg-[#2e4bff] text-white">
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{location.name}</p>
            <p className="text-xs text-muted-foreground">Indoor map</p>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <DiscoveryPanel location={location} />
        </div>
      </div>

      <FloorStack
        availableFloors={availableFloors}
        variant="mappedin"
        className="absolute right-3 top-3 z-20"
      />
    </>
  );
}
