import { useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, X } from "lucide-react";
import useFloorStore from "~/stores/floor-store";
import type { VenueFloorStack } from "~/types/location";
import { useMap } from "./map";

function Badge({ children }: { children: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00629d] text-xs font-semibold text-white">
      {children}
    </span>
  );
}

export function BuildingFloorSelector({
  stacks,
}: {
  stacks: VenueFloorStack[];
}) {
  const {
    currentFloor,
    currentBuildingId,
    setCurrentFloor,
    setCurrentBuildingId,
  } = useFloorStore();
  const { map } = useMap();
  const [open, setOpen] = useState(false);
  const [showBuildings, setShowBuildings] = useState(false);
  const building =
    stacks.find((stack) => stack.id === currentBuildingId) ??
    stacks.find((stack) => stack.id === "bcc") ??
    stacks[0];
  const floor = building.floors.find((entry) => entry.level === currentFloor);
  const outdoors = currentFloor === -100;
  const rows =
    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-sm outline-none focus:bg-slate-100";

  function chooseBuilding(stack: VenueFloorStack) {
    setCurrentBuildingId(stack.id);
    setCurrentFloor(stack.defaultFloor);
    setShowBuildings(false);
    const bounds = stack.floors.find(
      (entry) => entry.level === stack.defaultFloor,
    )?.bounds;
    if (bounds)
      map?.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        {
          padding:
            globalThis.innerWidth >= 900
              ? { top: 100, bottom: 80, left: 400, right: 390 }
              : 70,
          maxZoom: 19,
          duration: 900,
        },
      );
  }

  return (
    <Menu.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setShowBuildings(outdoors);
      }}
      modal={false}
    >
      <Menu.Trigger asChild>
        <button
          aria-label={
            outdoors ? "Open building selector" : "Open level selector"
          }
          data-current-floor={currentFloor}
          title={building.name}
          className="flex min-h-14 min-w-48 items-center gap-3 rounded-2xl bg-white p-3 text-left text-sm font-medium text-slate-700 shadow-md"
        >
          <Badge>
            {outdoors
              ? building.shortName
              : (floor?.shortName ?? `L${currentFloor + 1}`)}
          </Badge>
          <span className="max-w-44 flex-1">
            {outdoors
              ? building.name
              : (floor?.name.trim() ?? `Level ${currentFloor + 1}`)}
          </span>
          <ChevronsUpDown className="size-4 text-slate-500" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          aria-label={
            showBuildings ? "Available buildings" : "Available levels"
          }
          className="z-50 max-h-[calc(100dvh-110px)] w-[min(360px,calc(100vw-24px))] overflow-y-auto rounded-2xl bg-white p-4 text-[#305d94] shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <Menu.Label className="text-lg font-semibold">
              {showBuildings ? "Explore Map" : "Building"}
            </Menu.Label>
            <Menu.Item
              aria-label="Close floor selector"
              onSelect={() => setOpen(false)}
              className="cursor-pointer rounded p-1 outline-none focus:bg-slate-100"
            >
              <X className="size-5" />
            </Menu.Item>
          </div>
          {!showBuildings && (
            <>
              <Menu.Item
                className={rows + " border border-slate-200"}
                onSelect={(event) => {
                  event.preventDefault();
                  setShowBuildings(true);
                }}
                aria-label="Change the currently selected building"
              >
                <Badge>{building.shortName}</Badge>
                <span className="flex-1 font-medium">{building.name}</span>
                <span className="text-xs underline">Change</span>
              </Menu.Item>
              <Menu.Label className="mb-1 mt-5 text-lg font-semibold">
                Level
              </Menu.Label>
              <Menu.RadioGroup
                value={String(currentFloor)}
                onValueChange={(value) => setCurrentFloor(Number(value))}
              >
                {[...building.floors]
                  .sort((a, b) => b.level - a.level)
                  .map((entry) => (
                    <Menu.RadioItem
                      key={entry.id}
                      value={String(entry.level)}
                      aria-label={entry.name.trim()}
                      className={
                        rows +
                        " data-[state=checked]:bg-[#d98a2c] data-[state=checked]:text-white"
                      }
                    >
                      <Badge>{entry.shortName}</Badge>
                      <span>{entry.name.trim()}</span>
                    </Menu.RadioItem>
                  ))}
              </Menu.RadioGroup>
            </>
          )}
          {showBuildings && (
            <>
              <Menu.Label className="mb-1 text-sm">
                Available buildings
              </Menu.Label>
              {stacks.map((stack) => (
                <Menu.Item
                  key={stack.id}
                  className={rows}
                  aria-label={stack.name}
                  onSelect={(event) => {
                    event.preventDefault();
                    chooseBuilding(stack);
                  }}
                >
                  <Badge>{stack.shortName}</Badge>
                  <span>{stack.name}</span>
                </Menu.Item>
              ))}
            </>
          )}
          <Menu.Separator className="my-2 h-px bg-slate-200" />
          <Menu.Item className={rows} onSelect={() => setCurrentFloor(-100)}>
            Campus outdoors
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
