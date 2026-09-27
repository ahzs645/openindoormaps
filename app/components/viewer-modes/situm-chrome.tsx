import { Building2, LocateFixed, Minus, Plus } from "lucide-react";
import DiscoveryPanel from "../discovery-panel/discovery-panel";
import { useMap } from "../map/map";
import type { LocationConfig } from "~/types/location";
import FloorStack from "./floor-stack";

interface SitumChromeProps {
  location: LocationConfig;
  availableFloors: number[];
}

export default function SitumChrome({
  location,
  availableFloors,
}: SitumChromeProps) {
  const { map } = useMap();

  return (
    <>
      <div className="absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(21rem,calc(100%-5.5rem))] flex-col overflow-hidden rounded-xl bg-white/95 shadow-lg backdrop-blur dark:bg-card/95">
        <div className="min-h-0 flex-1">
          <DiscoveryPanel location={location} />
        </div>
      </div>

      <div className="absolute right-16 top-3 z-20 flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:bg-card/95">
        <span className="flex size-6 items-center justify-center rounded bg-[#283389] text-white">
          <Building2 className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{location.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {availableFloors.length}{" "}
            {availableFloors.length === 1 ? "floor" : "floors"}
          </p>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-20 flex flex-col items-center gap-2">
        <button
          type="button"
          aria-label="Locate me"
          className="flex size-9 items-center justify-center rounded-full bg-[#283389] text-white shadow-lg transition-colors hover:bg-[#1f2a6e]"
        >
          <LocateFixed className="size-4" />
        </button>
        <div className="flex flex-col overflow-hidden rounded-md bg-[#283389] text-white shadow-lg">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => map?.zoomIn()}
            className="flex size-9 items-center justify-center transition-colors hover:bg-white/10"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => map?.zoomOut()}
            className="flex size-9 items-center justify-center border-t border-white/20 transition-colors hover:bg-white/10"
          >
            <Minus className="size-4" />
          </button>
        </div>
        <FloorStack availableFloors={availableFloors} variant="situm" />
      </div>
    </>
  );
}
