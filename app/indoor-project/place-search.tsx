import { useEffect, useId, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import type { IndoorDataset, IndoorRecord } from "./contract";
import { projectFloorName } from "./navigation-steps";
import {
  projectBuildingName,
  projectPlaceDisplayName,
  projectPlaceMetadata,
} from "./visitor-metadata";

export const projectPlaceName = (room: IndoorRecord, data?: IndoorDataset) =>
  [room.number, data ? projectPlaceDisplayName(data, room) : room.name]
    .filter(Boolean)
    .join(" · ");

export function ProjectPlaceSearch({
  data,
  places,
  label,
  placeholder,
  value,
  onChange,
  reachable,
  searchTags,
  onActivate,
  mapActive = false,
  mode = "public",
}: {
  data: IndoorDataset;
  searchTags?: Record<string, string>;
  places: IndoorRecord[];
  label: string;
  placeholder: string;
  value: string;
  onChange: (key: string) => void;
  reachable?: Set<string>;
  mode?: "public" | "accessible";
  onActivate?: () => void;
  mapActive?: boolean;
}) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = places.find((room) => room.key === value);
  let inputValue = selected ? projectPlaceName(selected, data) : "";
  if (open) inputValue = query;
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = places
    .filter((room) => {
      const text =
        `${room.name} ${projectPlaceName(room, data)} ${projectPlaceMetadata(data, room.key)?.department ?? ""} ${projectBuildingName(data, room.building)} ${projectFloorName(data, room.levelId)} ${searchTags?.[room.key] ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .slice(0, 30);
  useEffect(() => {
    if (open)
      list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active, query]);
  const connectionNote = (room: IndoorRecord) => {
    if (!room.arrivalNodeId) return "Entrance needs review";
    if (reachable && !reachable.has(room.key))
      return mode === "accessible"
        ? "Step-free connection unverified"
        : "Connection needs review";
    return "";
  };
  const choose = (room: IndoorRecord) => {
    onChange(room.key);
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  return (
    <div
      className="project-place-search"
      data-map-active={mapActive || undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div className="project-place-input">
        <MapPin size={18} aria-hidden="true" />
        <input
          role="combobox"
          type="text"
          inputMode="search"
          aria-label={label}
          aria-expanded={open}
          aria-controls={`${id}-results`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[active] ? `${id}-${active}` : undefined
          }
          autoComplete="off"
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => {
            onActivate?.();
            setOpen(true);
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
            onChange("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(
                    results.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (event.key === "Enter" && open && results[active]) {
              event.preventDefault();
              choose(results[active]);
            }
          }}
        />
        {(selected || query) && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              onActivate?.();
              onChange("");
              setQuery("");
              setOpen(false);
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {selected && !open && (
        <small>
          {projectBuildingName(data, selected.building)} ·{" "}
          {projectFloorName(data, selected.levelId)}
        </small>
      )}
      {open && (
        <ul
          ref={list}
          id={`${id}-results`}
          role="listbox"
          aria-label={`${label} results`}
        >
          {results.map((room, index) => (
            <li
              id={`${id}-${index}`}
              key={room.key}
              role="option"
              tabIndex={-1}
              aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onClick={() => choose(room)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") choose(room);
              }}
            >
              <strong>{projectPlaceName(room, data)}</strong>
              <small>
                {projectBuildingName(data, room.building)} ·{" "}
                {projectFloorName(data, room.levelId)}
              </small>
              {connectionNote(room) && (
                <small className="project-connection-note">
                  {connectionNote(room)}
                </small>
              )}
            </li>
          ))}
          {results.length === 0 && (
            <li role="presentation">No matching locations</li>
          )}
        </ul>
      )}
    </div>
  );
}
