import { floorDisplayName } from "./floor-display-name";
import { useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, X, ArrowLeft } from "lucide-react";
import type { IndoorDataset } from "./contract";
import { projectBuildingName } from "./visitor-metadata";

export function floorBadge(floor: IndoorDataset["floors"][number] | undefined) {
  if (!floor) return "";
  if (/^basement$/i.test(floor.name)) return "B";
  const number = floor.name.match(/(?:floor|level)\s*([\d.-]+)/i)?.[1];
  if (number) return `L${number}`;
  return Math.abs(floor.elevationFeet) < 0.1 ? "G" : "L";
}

export function ProjectFloorSelector({
  data,
  floorId,
  building,
  onChange,
}: {
  data: IndoorDataset;
  floorId: string;
  building: string;
  onChange: (floorId: string, building: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [changingBuilding, setChangingBuilding] = useState(false);
  const [query, setQuery] = useState("");
  const buildings = [...new Set(data.records.map((r) => r.building))].sort();
  const floorsFor = (value: string) =>
    data.floors.filter(
      (floor) =>
        value === "all" ||
        data.records.some(
          (room) =>
            room.building === value && floor.levelIds.includes(room.levelId),
        ),
    );
  const floor = data.floors.find((f) => f.id === floorId);
  const buildingName =
    building === "all"
      ? "Campus · All buildings"
      : projectBuildingName(data, building);
  const changeBuilding = (value: string) => {
    const floors = floorsFor(value);
    const next = floors.find((f) => f.id === floorId) ?? floors[0];
    if (next) onChange(next.id, value);
    setChangingBuilding(false);
    setQuery("");
  };
  return (
    <Menu.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setChangingBuilding(false);
          setQuery("");
        }
      }}
      modal={false}
    >
      <Menu.Trigger asChild>
        <button
          className="project-level-trigger"
          aria-label="Open level selector"
          data-floor-id={floorId}
          title={buildingName}
        >
          <span className="project-level-badge">{floorBadge(floor)}</span>
          <span>
            <strong>{floor ? floorDisplayName(floor.name) : ""}</strong>
            <small>{buildingName}</small>
          </span>
          <ChevronsUpDown size={17} />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="project-level-menu"
          aria-label={
            changingBuilding ? "Available buildings" : "Available levels"
          }
        >
          <div className="project-level-heading">
            <Menu.Label>
              {changingBuilding ? "Explore map" : "Building"}
            </Menu.Label>
            <Menu.Item
              aria-label="Close floor selector"
              onSelect={() => setOpen(false)}
            >
              <X size={18} />
            </Menu.Item>
          </div>
          {!changingBuilding && (
            <>
              <Menu.Item
                className="project-building-choice"
                aria-label="Change the currently selected building"
                onSelect={(event) => {
                  event.preventDefault();
                  setChangingBuilding(true);
                }}
              >
                <strong>{buildingName}</strong>
                <span>Change</span>
              </Menu.Item>
              <Menu.Label className="project-level-heading">Floor</Menu.Label>
              <Menu.RadioGroup
                value={floorId}
                onValueChange={(value) => onChange(value, building)}
              >
                {[...floorsFor(building)]
                  .sort((a, b) => b.elevationFeet - a.elevationFeet)
                  .map((entry) => (
                    <Menu.RadioItem
                      key={entry.id}
                      value={entry.id}
                      aria-label={floorDisplayName(entry.name)}
                      className="project-level-row"
                    >
                      <span className="project-level-badge">
                        {floorBadge(entry)}
                      </span>
                      {floorDisplayName(entry.name)}
                    </Menu.RadioItem>
                  ))}
              </Menu.RadioGroup>
            </>
          )}
          {changingBuilding && (
            <>
              <Menu.Item
                onSelect={(event) => {
                  event.preventDefault();
                  setChangingBuilding(false);
                }}
              >
                <ArrowLeft size={16} /> Back to levels
              </Menu.Item>
              <input
                className="project-building-search"
                aria-label="Search buildings"
                placeholder="Search buildings…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" && event.key !== "Tab")
                    event.stopPropagation();
                }}
              />
              <Menu.Item
                className="project-level-row"
                onSelect={(event) => {
                  event.preventDefault();
                  changeBuilding("all");
                }}
              >
                Campus · All buildings
              </Menu.Item>
              {buildings
                .filter((value) =>
                  projectBuildingName(data, value)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((value) => (
                  <Menu.Item
                    key={value}
                    aria-label={projectBuildingName(data, value)}
                    className="project-level-row"
                    onSelect={(event) => {
                      event.preventDefault();
                      changeBuilding(value);
                    }}
                  >
                    <span className="project-level-badge">
                      {data.visitor?.buildings[value]?.shortName ?? value}
                    </span>
                    {projectBuildingName(data, value)}
                  </Menu.Item>
                ))}
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
